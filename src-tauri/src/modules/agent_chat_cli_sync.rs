//! Estate: makes agent chat sessions show up in Claude Code's own resume list.
//!
//! A chat turn runs `claude -p`, and Claude Code tags every line of a headless
//! session `"entrypoint":"sdk-cli"`. Its `/resume` picker hides sessions with
//! that tag (it treats them as SDK sessions), so chats started in Estate never
//! appear in a normal terminal. Syncing rewrites the tag to `"cli"`, which is
//! what an interactive session records, and the picker lists the session.
//!
//! Invariants (locked by tests):
//! - The file keeps its length and every other byte: the 8 bytes `sdk-cli"`
//!   become `cli"    ` (JSON allows whitespace after a value). Patching in
//!   place means an agent appending to the file at the same time loses nothing,
//!   which a rewrite-and-rename could not promise.
//! - Only the top-level `entrypoint` key of a line is touched, never the same
//!   text inside a message, a tool input or a nested object.
//! - Only complete lines (ending in `\n`) are patched, so a line the agent is
//!   still writing is left for the next sync.
//! - Each patch re-reads its bytes first and skips them if they changed.
//! - The file must be a regular file, not a symlink.

use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use memchr::memmem;
use serde::Serialize;

const FROM: &[u8; 8] = b"sdk-cli\"";
const TO: &[u8; 8] = b"cli\"    ";
const KEY: &[u8] = b"entrypoint";

/// How many bytes before a scan mark are remembered to recognise the file.
const MARK_TAIL: u64 = 64;

/// Where a session file was last scanned to, with the bytes just before that
/// point: if they differ next time, the file was replaced and is scanned again
/// from the start.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ScanMark {
    pub offset: u64,
    tail: Vec<u8>,
}

/// Each synced session file's scan mark, so a sync after a turn reads only
/// what the turn appended. Lost on restart, which only costs one full scan.
#[derive(Default)]
pub struct CliSyncState {
    scanned: Mutex<HashMap<PathBuf, ScanMark>>,
    /// The title Estate last wrote to each file (this run).
    titles: Mutex<HashMap<PathBuf, String>>,
}

/// The `MARK_TAIL` bytes before `offset` (fewer near the start).
fn read_tail(file: &mut File, offset: u64) -> std::io::Result<Vec<u8>> {
    let start = offset.saturating_sub(MARK_TAIL);
    let mut tail = vec![0u8; (offset - start) as usize];
    file.seek(SeekFrom::Start(start))?;
    file.read_exact(&mut tail)?;
    Ok(tail)
}

/// Where to resume scanning: the mark's offset if the file still holds the
/// same bytes before it, else the start.
fn resume_offset(file: &mut File, len: u64, mark: Option<&ScanMark>) -> u64 {
    match mark {
        Some(m) if m.offset <= len && read_tail(file, m.offset).ok().as_ref() == Some(&m.tail) => {
            m.offset
        }
        _ => 0,
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CliSyncOutcome {
    /// Lines whose tag was rewritten by this sync.
    pub patched: u32,
    /// The session already showed in Claude Code (nothing left to rewrite).
    pub already: bool,
    /// The chat's name was written as the session's title.
    pub titled: bool,
}

// ---- Session title ------------------------------------------------------------
//
// A headless session has no title, so the resume list shows a prompt instead.
// Claude Code names a session with a `custom-title` line (what its own rename
// writes) and reads the last one from the final 64 KiB of the file. Estate
// appends one with the chat's name when the end of the file doesn't carry it.

/// How far from the end a title counts as present: half of what Claude Code
/// reads, so a title Estate finds is one Claude Code finds too.
const TITLE_TAIL: u64 = 32 * 1024;
const MAX_TITLE_CHARS: usize = 120;

/// The name as a title: one line, collapsed whitespace, at most 120 characters.
pub fn clean_title(title: &str) -> Option<String> {
    let one_line: String = title
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let t: String = one_line
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(MAX_TITLE_CHARS)
        .collect();
    (!t.is_empty()).then_some(t)
}

/// The last `custom-title` in `tail`; a cut first line just fails to parse.
pub fn last_custom_title(tail: &str) -> Option<String> {
    // Newest first; only lines that mention a title are parsed.
    tail.lines()
        .rev()
        .filter(|l| l.contains("\"custom-title\""))
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .filter(|v| v.get("type").and_then(|t| t.as_str()) == Some("custom-title"))
        .find_map(|v| v.get("customTitle")?.as_str().map(str::to_string))
}

/// The line Claude Code's own rename writes, in its key order.
pub fn title_line(session_id: &str, title: &str) -> String {
    format!(
        "{{\"type\":\"custom-title\",\"customTitle\":{},\"sessionId\":{}}}\n",
        serde_json::Value::from(title),
        serde_json::Value::from(session_id)
    )
}

/// Whether to write `title`, given the file's current title and the one
/// Estate last wrote. A title someone else set since (a rename in the CLI)
/// stays until the chat's name changes in Estate.
pub fn should_write_title(title: &str, current: Option<&str>, last_written: Option<&str>) -> bool {
    match current {
        None => true,
        Some(c) if c == title => false,
        Some(_) => last_written != Some(title),
    }
}

/// Appends the title line if needed. Only when the file ends with a complete
/// line, and with O_APPEND, so it never lands inside a line being written.
fn apply_title(
    path: &Path,
    session_id: &str,
    title: &str,
    last_written: Option<&str>,
) -> std::io::Result<bool> {
    let mut file = open_session(path)?;
    let len = file.metadata()?.len();
    if len == 0 {
        return Ok(false);
    }
    let start = len.saturating_sub(TITLE_TAIL);
    let mut tail = vec![0u8; (len - start) as usize];
    file.seek(SeekFrom::Start(start))?;
    file.read_exact(&mut tail)?;
    if tail.last() != Some(&b'\n') {
        return Ok(false);
    }
    let current = last_custom_title(&String::from_utf8_lossy(&tail));
    if !should_write_title(title, current.as_deref(), last_written) {
        return Ok(false);
    }
    drop(file);
    let mut append = OpenOptions::new().append(true).open(path)?;
    append.write_all(title_line(session_id, title).as_bytes())?;
    Ok(true)
}

fn skip_ws(line: &[u8], mut i: usize) -> usize {
    while matches!(line.get(i), Some(b' ' | b'\t' | b'\r' | b'\n')) {
        i += 1;
    }
    i
}

/// Index of the closing quote of the string whose opening quote is at `open`.
fn string_end(line: &[u8], open: usize) -> Option<usize> {
    let mut i = open + 1;
    loop {
        match *line.get(i)? {
            b'\\' => i += 2,
            b'"' => return Some(i),
            _ => i += 1,
        }
    }
}

/// Index just past the JSON value that starts at `i`.
fn value_end(line: &[u8], i: usize) -> Option<usize> {
    match *line.get(i)? {
        b'"' => string_end(line, i).map(|e| e + 1),
        b'{' | b'[' => {
            let mut depth = 0usize;
            let mut j = i;
            loop {
                match *line.get(j)? {
                    b'"' => j = string_end(line, j)?,
                    b'{' | b'[' => depth += 1,
                    b'}' | b']' => {
                        depth -= 1;
                        if depth == 0 {
                            return Some(j + 1);
                        }
                    }
                    _ => {}
                }
                j += 1;
            }
        }
        _ => {
            let mut j = i;
            while !matches!(
                line.get(j),
                None | Some(b',' | b'}' | b']' | b' ' | b'\t' | b'\r' | b'\n')
            ) {
                j += 1;
            }
            (j > i).then_some(j)
        }
    }
}

/// Offsets, within `line`, of every top-level `"entrypoint":"sdk-cli"` value
/// (the `s` after its opening quote). Empty for anything that isn't a JSON
/// object or doesn't carry the tag.
pub fn sdk_entrypoints(line: &[u8]) -> Vec<usize> {
    let mut found = Vec::new();
    if memmem::find(line, FROM).is_none() {
        return found;
    }
    let mut i = skip_ws(line, 0);
    if line.get(i) != Some(&b'{') {
        return found;
    }
    i += 1;
    loop {
        i = skip_ws(line, i);
        if line.get(i) != Some(&b'"') {
            return found;
        }
        let Some(key_end) = string_end(line, i) else {
            return found;
        };
        let key = &line[i + 1..key_end];
        i = skip_ws(line, key_end + 1);
        if line.get(i) != Some(&b':') {
            return found;
        }
        i = skip_ws(line, i + 1);
        if key == KEY && line[i..].starts_with(b"\"sdk-cli\"") {
            found.push(i + 1);
        }
        let Some(end) = value_end(line, i) else {
            return found;
        };
        i = skip_ws(line, end);
        match line.get(i) {
            Some(b',') => i += 1,
            _ => return found,
        }
    }
}

/// Patch offsets (absolute, from `base`) in the complete lines of `data`, and
/// where the last complete line ends.
pub fn plan_patches(data: &[u8], base: u64) -> (Vec<u64>, u64) {
    let mut patches = Vec::new();
    let mut start = 0usize;
    while let Some(nl) = memchr::memchr(b'\n', &data[start..]) {
        let line = &data[start..start + nl];
        patches.extend(
            sdk_entrypoints(line)
                .into_iter()
                .map(|o| base + (start + o) as u64),
        );
        start += nl + 1;
    }
    (patches, base + start as u64)
}

/// Opens a session file for patching: a regular file only, never a symlink.
fn open_session(path: &Path) -> std::io::Result<File> {
    let meta = std::fs::symlink_metadata(path)?;
    if !meta.file_type().is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "not a regular file",
        ));
    }
    OpenOptions::new().read(true).write(true).open(path)
}

/// Scans `path` (from `mark`, when the file still matches it) and rewrites the
/// tag in place. Returns how many lines changed and the new mark (the end of
/// the last complete line).
pub fn sync_file(path: &Path, mark: Option<&ScanMark>) -> std::io::Result<(u32, ScanMark)> {
    let mut file = open_session(path)?;
    let len = file.metadata()?.len();
    let from = resume_offset(&mut file, len, mark);
    file.seek(SeekFrom::Start(from))?;

    // Line by line: a session can be tens of megabytes, a single line rarely
    // more than a few. Whole lines only, so offsets stay line-aligned.
    let mut patches = Vec::new();
    let mut pos = from;
    {
        let mut reader = BufReader::new(&file);
        let mut line = Vec::new();
        loop {
            line.clear();
            let n = reader.read_until(b'\n', &mut line)?;
            if n == 0 || line.last() != Some(&b'\n') {
                break;
            }
            let (found, end) = plan_patches(&line, pos);
            patches.extend(found);
            pos = end;
        }
    }

    let mut patched = 0u32;
    let mut current = [0u8; 8];
    for offset in patches {
        file.seek(SeekFrom::Start(offset))?;
        if file.read_exact(&mut current).is_err() || &current != FROM {
            continue;
        }
        file.seek(SeekFrom::Start(offset))?;
        file.write_all(TO)?;
        patched += 1;
    }
    if patched > 0 {
        file.flush()?;
    }
    // Read after patching, so the mark matches the file as it now is.
    let tail = read_tail(&mut file, pos)?;
    Ok((patched, ScanMark { offset: pos, tail }))
}

/// Syncs one session file, scanning only what was added since the last sync
/// unless `full`. Syncs of the same state run one at a time.
pub fn sync_session(
    state: &CliSyncState,
    path: &Path,
    session_id: &str,
    title: Option<&str>,
    full: bool,
) -> Result<CliSyncOutcome, String> {
    let mut scanned = state.scanned.lock().unwrap_or_else(|e| e.into_inner());
    let io_error = |e: std::io::Error| match e.kind() {
        std::io::ErrorKind::NotFound => "Claude Code hasn't saved this session yet".to_string(),
        _ => format!("couldn't update the Claude Code session: {e}"),
    };
    let mark = if full { None } else { scanned.get(path) };
    let (patched, to) = sync_file(path, mark).map_err(io_error)?;
    scanned.insert(path.to_path_buf(), to);

    let mut titled = false;
    if let Some(title) = title.and_then(clean_title) {
        let mut titles = state.titles.lock().unwrap_or_else(|e| e.into_inner());
        let last = titles.get(path).map(String::as_str);
        titled = apply_title(path, session_id, &title, last).map_err(io_error)?;
        if titled {
            titles.insert(path.to_path_buf(), title);
        }
    }
    Ok(CliSyncOutcome {
        patched,
        already: patched == 0,
        titled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch_text(text: &str) -> String {
        let mut bytes = text.as_bytes().to_vec();
        let (patches, _) = plan_patches(&bytes, 0);
        for p in patches {
            let p = p as usize;
            bytes[p..p + 8].copy_from_slice(TO);
        }
        String::from_utf8(bytes).unwrap()
    }

    #[test]
    fn rewrites_top_level_tag_keeping_length_and_json() {
        let line = r#"{"parentUuid":null,"isSidechain":false,"type":"user","entrypoint":"sdk-cli","cwd":"/x"}"#;
        let text = format!("{line}\n");
        let out = patch_text(&text);
        assert_eq!(out.len(), text.len());
        let v: serde_json::Value = serde_json::from_str(out.trim_end()).unwrap();
        assert_eq!(v["entrypoint"], "cli");
        assert_eq!(v["cwd"], "/x");
        assert_eq!(v["type"], "user");
        // Everything outside the 8 patched bytes is unchanged.
        let at = text.find("sdk-cli\"").unwrap();
        assert_eq!(&out[..at], &text[..at]);
        assert_eq!(&out[at + 8..], &text[at + 8..]);
    }

    #[test]
    fn tag_as_last_key_and_with_spaces() {
        let out = patch_text("{ \"a\" : [1,{\"b\":\"}\"}] , \"entrypoint\" : \"sdk-cli\" }\n");
        let v: serde_json::Value = serde_json::from_str(out.trim_end()).unwrap();
        assert_eq!(v["entrypoint"], "cli");
        assert_eq!(v["a"][1]["b"], "}");
    }

    #[test]
    fn leaves_nested_and_quoted_copies_alone() {
        let lines = [
            // Inside a tool input object.
            r#"{"type":"assistant","message":{"input":{"entrypoint":"sdk-cli"}},"entrypoint":"cli"}"#,
            // Inside a string (escaped quotes).
            r#"{"type":"user","message":{"content":"set \"entrypoint\":\"sdk-cli\" here"}}"#,
            // A value that only starts the same.
            r#"{"entrypoint":"sdk-cli-x"}"#,
            // Another key with the value.
            r#"{"mode":"sdk-cli"}"#,
            // Not an object.
            r#"["entrypoint","sdk-cli"]"#,
            r#"garbage "entrypoint":"sdk-cli""#,
        ];
        for line in lines {
            assert!(sdk_entrypoints(line.as_bytes()).is_empty(), "{line}");
        }
    }

    #[test]
    fn escaped_strings_dont_end_early() {
        let line =
            r#"{"text":"a \\\" \"} quote","n":-1.5e3,"ok":true,"z":null,"entrypoint":"sdk-cli"}"#;
        let out = patch_text(&format!("{line}\n"));
        let v: serde_json::Value = serde_json::from_str(out.trim_end()).unwrap();
        assert_eq!(v["entrypoint"], "cli");
        assert_eq!(v["text"], "a \\\" \"} quote");
    }

    #[test]
    fn duplicate_keys_all_rewritten() {
        // JSON.parse keeps the last one, so every copy has to change.
        let line = r#"{"entrypoint":"sdk-cli","x":1,"entrypoint":"sdk-cli"}"#;
        assert_eq!(sdk_entrypoints(line.as_bytes()).len(), 2);
    }

    #[test]
    fn incomplete_last_line_waits() {
        let text = "{\"entrypoint\":\"sdk-cli\"}\n{\"entrypoint\":\"sdk-cli\"";
        let (patches, end) = plan_patches(text.as_bytes(), 100);
        assert_eq!(patches, vec![115]);
        assert_eq!(end, 100 + text.find('\n').unwrap() as u64 + 1);
    }

    #[test]
    fn real_claude_line_shape() {
        let line = r#"{"parentUuid":"73bb","isSidechain":false,"attachment":{"type":"hook_success","stdout":"{}","command":"[ -n \"$ESTATE_CLI\" ] && \"$ESTATE_CLI\" hook claude SessionStart || printf '{}'"},"type":"attachment","uuid":"u","timestamp":"t","userType":"external","entrypoint":"sdk-cli","cwd":"/Users/x/estate","sessionId":"s","version":"2.1.322","gitBranch":"main"}"#;
        let out = patch_text(&format!("{line}\n"));
        assert!(out.contains(r#""entrypoint":"cli"    ,"cwd""#));
        serde_json::from_str::<serde_json::Value>(out.trim_end()).unwrap();
    }

    fn temp_file(name: &str, body: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("estate-cli-sync-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("s.jsonl");
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn sync_file_patches_in_place_and_resumes_from_offset() {
        let first = "{\"type\":\"user\",\"entrypoint\":\"sdk-cli\"}\n{\"type\":\"x\"}\n";
        let path = temp_file("offset", first);
        let state = CliSyncState::default();

        let out = sync_session(&state, &path, "s", None, false).unwrap();
        assert_eq!(
            out,
            CliSyncOutcome {
                patched: 1,
                already: false,
                titled: false
            }
        );
        let after = std::fs::read_to_string(&path).unwrap();
        assert_eq!(after.len(), first.len());
        assert!(after.starts_with("{\"type\":\"user\",\"entrypoint\":\"cli\"    }\n"));

        // Nothing new: nothing to do.
        let out = sync_session(&state, &path, "s", None, false).unwrap();
        assert_eq!(
            out,
            CliSyncOutcome {
                patched: 0,
                already: true,
                titled: false
            }
        );

        // A later turn appends; only the new line is read and patched.
        let mut f = OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(b"{\"entrypoint\":\"sdk-cli\"}\n").unwrap();
        drop(f);
        let out = sync_session(&state, &path, "s", None, false).unwrap();
        assert_eq!(out.patched, 1);
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(!text.contains("sdk-cli"));
        for l in text.lines() {
            serde_json::from_str::<serde_json::Value>(l).unwrap();
        }
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn sync_rescans_a_file_that_shrank() {
        let path = temp_file("shrink", "{\"a\":1}\n{\"a\":2}\n{\"a\":3}\n{\"a\":4}\n");
        let state = CliSyncState::default();
        sync_session(&state, &path, "s", None, false).unwrap();
        std::fs::write(&path, "{\"entrypoint\":\"sdk-cli\"}\n").unwrap();
        assert_eq!(
            sync_session(&state, &path, "s", None, false)
                .unwrap()
                .patched,
            1
        );
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn sync_rescans_a_replaced_file_of_any_length() {
        // Same length and longer than what was scanned: only the bytes before
        // the mark can tell the file was replaced.
        let path = temp_file("replace", "{\"a\":1}\n{\"a\":2}\n{\"a\":3}\n");
        let state = CliSyncState::default();
        sync_session(&state, &path, "s", None, false).unwrap();
        std::fs::write(&path, "{\"entrypoint\":\"sdk-cli\"}\n{\"b\":1}\n").unwrap();
        assert_eq!(
            sync_session(&state, &path, "s", None, false)
                .unwrap()
                .patched,
            1
        );
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn full_sync_rescans_everything() {
        let path = temp_file("full", "{\"a\":1}\n");
        let state = CliSyncState::default();
        sync_session(&state, &path, "s", None, false).unwrap();
        // Changed behind the mark without moving it (same bytes before it).
        let mut f = OpenOptions::new().write(true).open(&path).unwrap();
        f.write_all(b"{\"a\":1}\n{\"entrypoint\":\"sdk-cli\"}\n")
            .unwrap();
        drop(f);
        assert_eq!(
            sync_session(&state, &path, "s", None, true)
                .unwrap()
                .patched,
            1
        );
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn title_is_cleaned_and_written_like_claude_code() {
        assert_eq!(
            clean_title("  Landing\n Page\tDesign "),
            Some("Landing Page Design".into())
        );
        assert_eq!(clean_title(" \n\t"), None);
        assert_eq!(clean_title(&"x".repeat(500)).unwrap().chars().count(), 120);

        let line = title_line("abc-1", "A \"quoted\" \\ name ✓");
        assert!(line.starts_with("{\"type\":\"custom-title\",\"customTitle\":\"A \\\"quoted"));
        assert!(line.ends_with("\"sessionId\":\"abc-1\"}\n"));
        let v: serde_json::Value = serde_json::from_str(line.trim_end()).unwrap();
        assert_eq!(v["customTitle"], "A \"quoted\" \\ name ✓");
        assert_eq!(
            last_custom_title(&line),
            Some("A \"quoted\" \\ name ✓".into())
        );
    }

    #[test]
    fn last_title_wins_and_cut_lines_are_ignored() {
        let tail = "tle\",\"customTitle\":\"cut\"}\n\
            {\"type\":\"custom-title\",\"customTitle\":\"One\",\"sessionId\":\"s\"}\n\
            {\"type\":\"user\",\"message\":{\"content\":\"hi\"}}\n\
            {\"type\":\"custom-title\",\"customTitle\":\"Two\",\"sessionId\":\"s\"}\n";
        assert_eq!(last_custom_title(tail), Some("Two".into()));
        assert_eq!(last_custom_title("{\"type\":\"user\"}\n"), None);
    }

    #[test]
    fn a_rename_elsewhere_is_kept_until_estate_renames() {
        // No title yet, or Estate's name changed: write.
        assert!(should_write_title("A", None, None));
        assert!(should_write_title("B", Some("A"), Some("A")));
        // Already there.
        assert!(!should_write_title("A", Some("A"), Some("A")));
        // Renamed in the CLI after Estate wrote "A": keep the CLI's name.
        assert!(!should_write_title("A", Some("CLI name"), Some("A")));
        // After a restart Estate doesn't know what it wrote: its name wins.
        assert!(should_write_title("A", Some("CLI name"), None));
    }

    #[test]
    fn sync_appends_the_title_once_and_again_after_a_rename() {
        let body = "{\"type\":\"user\",\"entrypoint\":\"sdk-cli\",\"sessionId\":\"s\"}\n";
        let path = temp_file("title", body);
        let state = CliSyncState::default();

        let out = sync_session(&state, &path, "s", Some(" Landing Page "), false).unwrap();
        assert!(out.titled);
        assert_eq!(out.patched, 1);
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.ends_with(
            "{\"type\":\"custom-title\",\"customTitle\":\"Landing Page\",\"sessionId\":\"s\"}\n"
        ));

        // Same name: nothing appended.
        let out = sync_session(&state, &path, "s", Some("Landing Page"), false).unwrap();
        assert!(!out.titled);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), text);

        // Renamed in Estate: a new line, which is now the last title.
        assert!(
            sync_session(&state, &path, "s", Some("Pricing"), false)
                .unwrap()
                .titled
        );
        let tail = std::fs::read_to_string(&path).unwrap();
        assert_eq!(last_custom_title(&tail), Some("Pricing".into()));
        for l in tail.lines() {
            serde_json::from_str::<serde_json::Value>(l).unwrap();
        }
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn title_waits_while_a_line_is_being_written() {
        let path = temp_file("partial", "{\"type\":\"user\"}\n{\"type\":\"assist");
        let state = CliSyncState::default();
        let out = sync_session(&state, &path, "s", Some("Name"), false).unwrap();
        assert!(!out.titled);
        assert!(!std::fs::read_to_string(&path)
            .unwrap()
            .contains("custom-title"));
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn missing_file_is_a_readable_error() {
        let state = CliSyncState::default();
        let err = sync_session(
            &state,
            Path::new("/nonexistent/estate/x.jsonl"),
            "s",
            None,
            true,
        )
        .unwrap_err();
        assert!(err.contains("hasn't saved"));
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinks() {
        let path = temp_file("link", "{\"entrypoint\":\"sdk-cli\"}\n");
        let link = path.with_file_name("link.jsonl");
        std::os::unix::fs::symlink(&path, &link).unwrap();
        assert!(sync_file(&link, None).is_err());
        assert!(std::fs::read_to_string(&path).unwrap().contains("sdk-cli"));
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
