//! Estate: chat mode for terminal coding agents.
//!
//! A chat turn runs the agent's own headless mode (Claude Code `-p` with
//! stream-json, `codex exec --json`, Gemini CLI stream-json, `opencode run
//! --format json`) as one process per turn, and later turns resume the agent's
//! session by id. Output lines stream to the webview unparsed; the per-agent
//! adapters in `src/modules/agent-chat` turn them into chat messages.
//!
//! Invariants (locked by tests):
//! - The webview never supplies a program or free-form arguments: the program
//!   is fixed per agent and every argument comes from typed, validated input.
//! - No shell: the binary is resolved on the user's login PATH and spawned
//!   directly. The prompt goes over stdin, or as a single `--flag=value` /
//!   after `--` where an agent can't read it from stdin, so it is never parsed
//!   as an option.
//! - The working directory must already be an authorized workspace root.
//! - Cancel and app exit kill the agent's whole process group.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use shared_child::SharedChild;
use tauri::ipc::Channel;

use crate::modules::workspace::{authorize_spawn_cwd, WorkspaceEnv, WorkspaceRegistry};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatAgent {
    Claude,
    Codex,
    Gemini,
    Opencode,
}

/// What the agent may do without asking, mapped to each agent's own flags.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatAccess {
    /// Read and search; edits and state-changing commands are refused.
    Read,
    /// File edits inside the workspace are allowed.
    Edit,
    /// Everything, including commands, without a sandbox.
    Full,
}

/// Estate: how hard the agent thinks. Claude Code takes all five; Codex takes
/// the ones its model lists.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatEffort {
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

impl ChatEffort {
    pub fn as_str(self) -> &'static str {
        match self {
            ChatEffort::Low => "low",
            ChatEffort::Medium => "medium",
            ChatEffort::High => "high",
            ChatEffort::Xhigh => "xhigh",
            ChatEffort::Max => "max",
        }
    }
}

/// Adds the effort level for agents that take one (Claude Code, Codex); the
/// others run at their default. Pure.
pub fn with_effort(
    mut inv: Invocation,
    agent: ChatAgent,
    effort: Option<ChatEffort>,
) -> Invocation {
    let Some(effort) = effort else {
        return inv;
    };
    match agent {
        ChatAgent::Claude => {
            inv.args
                .extend(["--effort".to_string(), effort.as_str().to_string()]);
        }
        ChatAgent::Codex => {
            // Before the trailing `-` (prompt on stdin), which must stay last.
            let at = inv.args.len().saturating_sub(1);
            inv.args.splice(
                at..at,
                [
                    "-c".to_string(),
                    format!("model_reasoning_effort=\"{}\"", effort.as_str()),
                ],
            );
        }
        ChatAgent::Gemini | ChatAgent::Opencode => {}
    }
    inv
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invocation {
    pub program: &'static str,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    /// Written to the agent's stdin, then stdin is closed.
    pub stdin: Option<String>,
}

const MAX_PROMPT_BYTES: usize = 256 * 1024;
/// A single output line bigger than this is dropped (and reported), never buffered.
const MAX_LINE_BYTES: usize = 8 * 1024 * 1024;
const STDERR_TAIL_BYTES: usize = 8 * 1024;

fn valid_token(value: &str, max: usize, extra: &[char]) -> bool {
    !value.is_empty()
        && value.len() <= max
        && !value.starts_with('-')
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || extra.contains(&c))
}

fn validate_session(session: Option<&str>) -> Result<Option<&str>, String> {
    match session.map(str::trim).filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(s) if valid_token(s, 128, &[]) => Ok(Some(s)),
        Some(_) => Err("agent chat: invalid session id".into()),
    }
}

fn validate_model(model: Option<&str>) -> Result<Option<&str>, String> {
    match model.map(str::trim).filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(m) if valid_token(m, 100, &['.', ':', '/', '[', ']']) => Ok(Some(m)),
        Some(_) => Err("agent chat: invalid model name".into()),
    }
}

/// Builds the agent's headless command line. Pure: no I/O.
pub fn build_invocation(
    agent: ChatAgent,
    access: ChatAccess,
    session: Option<&str>,
    model: Option<&str>,
    prompt: &str,
) -> Result<Invocation, String> {
    let session = validate_session(session)?;
    let model = validate_model(model)?;
    if prompt.trim().is_empty() {
        return Err("agent chat: empty message".into());
    }
    if prompt.len() > MAX_PROMPT_BYTES {
        return Err("agent chat: message is too long".into());
    }
    let s = |v: &str| v.to_string();
    let mut env = Vec::new();
    let (program, args, stdin) = match agent {
        ChatAgent::Claude => {
            let mode = match access {
                ChatAccess::Read => "default",
                ChatAccess::Edit => "acceptEdits",
                ChatAccess::Full => "bypassPermissions",
            };
            let mut args = vec![
                s("-p"),
                s("--output-format"),
                s("stream-json"),
                s("--verbose"),
                s("--include-partial-messages"),
                s("--permission-mode"),
                s(mode),
            ];
            if let Some(id) = session {
                args.extend([s("--resume"), s(id)]);
            }
            if let Some(m) = model {
                args.extend([s("--model"), s(m)]);
            }
            ("claude", args, Some(prompt.to_string()))
        }
        ChatAgent::Codex => {
            let sandbox = match access {
                ChatAccess::Read => "read-only",
                ChatAccess::Edit => "workspace-write",
                ChatAccess::Full => "danger-full-access",
            };
            let mut args = vec![s("exec")];
            match session {
                // `exec resume` takes no --sandbox flag; the config key does the same.
                Some(id) => args.extend([
                    s("resume"),
                    s(id),
                    s("-c"),
                    format!("sandbox_mode=\"{sandbox}\""),
                ]),
                None => args.extend([s("--sandbox"), s(sandbox)]),
            }
            args.extend([s("--json"), s("--skip-git-repo-check")]);
            if let Some(m) = model {
                args.extend([s("--model"), s(m)]);
            }
            // `-` reads the prompt from stdin.
            args.push(s("-"));
            ("codex", args, Some(prompt.to_string()))
        }
        ChatAgent::Gemini => {
            let mode = match access {
                ChatAccess::Read => "default",
                ChatAccess::Edit => "auto_edit",
                ChatAccess::Full => "yolo",
            };
            let mut args = vec![
                s("--output-format"),
                s("stream-json"),
                s("--approval-mode"),
                s(mode),
            ];
            if let Some(id) = session {
                args.extend([s("--resume"), s(id)]);
            }
            if let Some(m) = model {
                args.extend([s("--model"), s(m)]);
            }
            // One argv element: the value can't be read as another option.
            args.push(format!("--prompt={prompt}"));
            ("gemini", args, None)
        }
        ChatAgent::Opencode => {
            let permission = match access {
                ChatAccess::Read => r#"{"permission":{"edit":"deny","bash":"deny"}}"#,
                ChatAccess::Edit => r#"{"permission":{"edit":"allow","bash":"deny"}}"#,
                ChatAccess::Full => r#"{"permission":{"edit":"allow","bash":"allow"}}"#,
            };
            env.push((s("OPENCODE_CONFIG_CONTENT"), s(permission)));
            let mut args = vec![s("run"), s("--format"), s("json")];
            if let Some(id) = session {
                args.extend([s("--session"), s(id)]);
            }
            if let Some(m) = model {
                args.extend([s("--model"), s(m)]);
            }
            args.extend([s("--"), s(prompt)]);
            ("opencode", args, None)
        }
    };
    Ok(Invocation {
        program,
        args,
        env,
        stdin,
    })
}

/// What the webview receives for a running turn.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChatStreamEvent {
    /// One line of the agent's JSON output, unparsed.
    Line { line: String },
    /// A line too large to forward was dropped.
    Dropped { bytes: usize },
    /// The process ended. `stderr` is the last few KB, for errors.
    Exit {
        code: Option<i32>,
        cancelled: bool,
        stderr: String,
    },
}

struct Running {
    child: Arc<SharedChild>,
    cancelled: Arc<std::sync::atomic::AtomicBool>,
}

type RunningMap = Arc<Mutex<HashMap<String, Running>>>;

#[derive(Default)]
pub struct AgentChatState {
    running: RunningMap,
}

impl Drop for AgentChatState {
    fn drop(&mut self) {
        if let Ok(map) = self.running.lock() {
            for r in map.values() {
                kill_group(&r.child);
            }
        }
    }
}

fn kill_group(child: &SharedChild) {
    #[cfg(unix)]
    {
        let pid = child.id() as libc::pid_t;
        // The child leads its own group (setpgid at spawn), so this reaches the
        // commands the agent started too.
        unsafe {
            libc::killpg(pid, libc::SIGTERM);
        }
        let child_pid = pid;
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            unsafe {
                libc::killpg(child_pid, libc::SIGKILL);
            }
        });
    }
    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }
}

fn valid_chat_id(id: &str) -> bool {
    valid_token(id, 64, &[])
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRunRequest {
    pub chat_id: String,
    pub agent: ChatAgent,
    pub access: ChatAccess,
    pub session_id: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub effort: Option<ChatEffort>,
    pub prompt: String,
    pub cwd: String,
}

/// Starts one chat turn. Returns once the agent is running; output arrives on
/// `on_event`, ending with `Exit`.
#[tauri::command]
pub async fn agent_chat_run(
    state: tauri::State<'_, AgentChatState>,
    registry: tauri::State<'_, WorkspaceRegistry>,
    request: ChatRunRequest,
    on_event: Channel<ChatStreamEvent>,
) -> Result<(), String> {
    if !valid_chat_id(&request.chat_id) {
        return Err("agent chat: invalid chat id".into());
    }
    let cwd = authorize_spawn_cwd(&registry, Some(&request.cwd), &WorkspaceEnv::Local)?
        .ok_or("agent chat: a workspace folder is required")?;
    let inv = with_effort(
        build_invocation(
            request.agent,
            request.access,
            request.session_id.as_deref(),
            request.model.as_deref(),
            &request.prompt,
        )?,
        request.agent,
        request.effort,
    );
    if state.running.lock().unwrap().contains_key(&request.chat_id) {
        return Err("agent chat: a reply is already running".into());
    }

    let spawned = tauri::async_runtime::spawn_blocking(move || spawn_turn(&inv, &cwd))
        .await
        .map_err(|e| e.to_string())??;
    let (child, stdout, stderr, stdin) = spawned;
    let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
    state.running.lock().unwrap().insert(
        request.chat_id.clone(),
        Running {
            child: child.clone(),
            cancelled: cancelled.clone(),
        },
    );

    if let Some((mut pipe, text)) = stdin {
        std::thread::Builder::new()
            .name("estate-chat-stdin".into())
            .spawn(move || {
                let _ = pipe.write_all(text.as_bytes());
                // Dropping the pipe closes stdin, which ends the agent's input.
            })
            .map_err(|e| e.to_string())?;
    }

    let tail = Arc::new(Mutex::new(Vec::<u8>::new()));
    {
        let tail = tail.clone();
        std::thread::Builder::new()
            .name("estate-chat-stderr".into())
            .spawn(move || pump_stderr(stderr, &tail))
            .map_err(|e| e.to_string())?;
    }

    let running = state.running.clone();
    let chat_id = request.chat_id;
    std::thread::Builder::new()
        .name("estate-chat-stdout".into())
        .spawn(move || {
            pump_lines(stdout, &on_event);
            let code = child.wait().ok().and_then(|s| s.code());
            running.lock().unwrap().remove(&chat_id);
            let stderr = String::from_utf8_lossy(&tail.lock().unwrap()).into_owned();
            let _ = on_event.send(ChatStreamEvent::Exit {
                code,
                cancelled: cancelled.load(std::sync::atomic::Ordering::Acquire),
                stderr,
            });
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

type Spawned = (
    Arc<SharedChild>,
    std::process::ChildStdout,
    std::process::ChildStderr,
    Option<(std::process::ChildStdin, String)>,
);

fn spawn_turn(inv: &Invocation, cwd: &std::path::Path) -> Result<Spawned, String> {
    let binary = crate::modules::lsp::env::resolve_binary(inv.program).ok_or_else(|| {
        format!(
            "{} was not found on your PATH. Install it, or open the agent in a terminal instead.",
            inv.program
        )
    })?;
    let mut cmd = Command::new(&binary);
    cmd.args(&inv.args)
        .current_dir(cwd)
        .envs(crate::modules::lsp::env::server_env_overlay())
        .envs(inv.env.iter().map(|(k, v)| (k, v)))
        .stdin(if inv.stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::modules::proc::hide_console(&mut cmd);
    #[cfg(unix)]
    unsafe {
        use std::os::unix::process::CommandExt;
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }
    let child = Arc::new(
        SharedChild::spawn(&mut cmd)
            .map_err(|e| format!("could not start {}: {e}", inv.program))?,
    );
    let fail = |msg: &str| {
        let _ = child.kill();
        msg.to_string()
    };
    let stdout = child.take_stdout().ok_or_else(|| fail("no stdout pipe"))?;
    let stderr = child.take_stderr().ok_or_else(|| fail("no stderr pipe"))?;
    let stdin = match &inv.stdin {
        Some(text) => Some((
            child.take_stdin().ok_or_else(|| fail("no stdin pipe"))?,
            text.clone(),
        )),
        None => None,
    };
    Ok((child, stdout, stderr, stdin))
}

/// Forwards complete lines; a line over the cap is skipped and reported.
fn pump_lines(stdout: impl Read, on_event: &Channel<ChatStreamEvent>) {
    let mut reader = BufReader::with_capacity(64 * 1024, stdout);
    let mut buf = Vec::with_capacity(16 * 1024);
    loop {
        buf.clear();
        match read_capped_line(&mut reader, &mut buf, MAX_LINE_BYTES) {
            Ok(LineRead::Eof) => return,
            Ok(LineRead::TooLong(bytes)) => {
                let _ = on_event.send(ChatStreamEvent::Dropped { bytes });
            }
            Ok(LineRead::Line) => {
                let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                if !line.is_empty() && on_event.send(ChatStreamEvent::Line { line }).is_err() {
                    return;
                }
            }
            Err(_) => return,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum LineRead {
    Line,
    TooLong(usize),
    Eof,
}

/// Reads up to `\n` without ever holding more than `cap` bytes of one line.
fn read_capped_line(
    reader: &mut impl BufRead,
    buf: &mut Vec<u8>,
    cap: usize,
) -> std::io::Result<LineRead> {
    let mut total = 0usize;
    let mut overflowed = false;
    loop {
        let chunk = reader.fill_buf()?;
        if chunk.is_empty() {
            return Ok(if total == 0 {
                LineRead::Eof
            } else if overflowed {
                LineRead::TooLong(total)
            } else {
                LineRead::Line
            });
        }
        let (used, done) = match chunk.iter().position(|&b| b == b'\n') {
            Some(i) => (i + 1, true),
            None => (chunk.len(), false),
        };
        total += used;
        if !overflowed {
            if buf.len() + used > cap {
                overflowed = true;
                buf.clear();
            } else {
                buf.extend_from_slice(&chunk[..used]);
            }
        }
        reader.consume(used);
        if done {
            return Ok(if overflowed {
                LineRead::TooLong(total)
            } else {
                LineRead::Line
            });
        }
    }
}

fn pump_stderr(stderr: impl Read, tail: &Mutex<Vec<u8>>) {
    let mut reader = BufReader::new(stderr);
    let mut chunk = [0u8; 4096];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) | Err(_) => return,
            Ok(n) => {
                let mut t = tail.lock().unwrap();
                t.extend_from_slice(&chunk[..n]);
                if t.len() > STDERR_TAIL_BYTES {
                    let cut = t.len() - STDERR_TAIL_BYTES;
                    t.drain(..cut);
                }
            }
        }
    }
}

/// Stops a running turn (and anything the agent started).
#[tauri::command]
pub fn agent_chat_cancel(
    state: tauri::State<'_, AgentChatState>,
    chat_id: String,
) -> Result<bool, String> {
    let map = state.running.lock().unwrap();
    let Some(r) = map.get(&chat_id) else {
        return Ok(false);
    };
    r.cancelled
        .store(true, std::sync::atomic::Ordering::Release);
    kill_group(&r.child);
    Ok(true)
}

/// Which supported agents are installed (on the user's login PATH).
#[tauri::command]
pub async fn agent_chat_available() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        ["claude", "codex", "gemini", "opencode"]
            .into_iter()
            .filter(|p| crate::modules::lsp::env::resolve_binary(p).is_some())
            .map(str::to_string)
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

// ---- Session history (Claude Code) -------------------------------------------

/// Where Claude Code keeps sessions: `$CLAUDE_CONFIG_DIR` or `~/.claude`, then
/// `projects/<folder with every non-alphanumeric character turned into '-'>`.
fn claude_projects_dir() -> Option<std::path::PathBuf> {
    let overlay = crate::modules::lsp::env::server_env_overlay();
    let config = overlay
        .get("CLAUDE_CONFIG_DIR")
        .cloned()
        .or_else(|| std::env::var("CLAUDE_CONFIG_DIR").ok())
        .filter(|v| !v.trim().is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".claude")))?;
    Some(config.join("projects"))
}

/// Claude Code's folder name for a project directory.
pub fn encode_claude_project(cwd: &std::path::Path) -> String {
    cwd.to_string_lossy()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: Option<String>,
    pub last_prompt: Option<String>,
    pub branch: Option<String>,
    pub modified_ms: u64,
    pub bytes: u64,
}

const SUMMARY_PEEK_BYTES: u64 = 64 * 1024;
const MAX_SESSIONS_LISTED: usize = 100;
const HISTORY_READ_BYTES: u64 = 24 * 1024 * 1024;
const MAX_HISTORY_LINES: usize = 400;

fn json_lines(text: &str) -> impl Iterator<Item = serde_json::Value> + '_ {
    text.lines()
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
}

/// A typed prompt (not a tool result, internal note or command markup).
fn prompt_text(v: &serde_json::Value) -> Option<String> {
    if v.get("type")?.as_str()? != "user" || v.get("isMeta").and_then(|m| m.as_bool()) == Some(true)
    {
        return None;
    }
    let text = v.get("message")?.get("content")?.as_str()?.trim();
    if text.is_empty() || text.starts_with('<') {
        return None;
    }
    Some(text.chars().take(200).collect())
}

/// Title, latest prompt and branch from the start and end of a session file.
pub fn summarize_session(
    head: &str,
    tail: &str,
) -> (Option<String>, Option<String>, Option<String>) {
    let mut title = None;
    let mut last_prompt = None;
    for v in json_lines(tail) {
        match v.get("type").and_then(|t| t.as_str()) {
            Some("ai-title") => {
                if let Some(t) = v.get("aiTitle").and_then(|t| t.as_str()) {
                    title = Some(t.chars().take(120).collect());
                }
            }
            Some("last-prompt") => {
                if let Some(t) = v.get("lastPrompt").and_then(|t| t.as_str()) {
                    last_prompt = Some(t.trim().chars().take(200).collect());
                }
            }
            _ => {}
        }
    }
    let mut branch = None;
    for v in json_lines(head) {
        if title.is_none() && v.get("type").and_then(|t| t.as_str()) == Some("ai-title") {
            title = v
                .get("aiTitle")
                .and_then(|t| t.as_str())
                .map(|t| t.chars().take(120).collect());
        }
        if last_prompt.is_none() {
            last_prompt = prompt_text(&v);
        }
        if branch.is_none() {
            branch = v
                .get("gitBranch")
                .and_then(|b| b.as_str())
                .filter(|b| !b.is_empty())
                .map(str::to_string);
        }
    }
    (title, last_prompt, branch)
}

/// The conversation lines of a session: user and assistant messages from the
/// main thread (subagent internals skipped), the last `MAX_HISTORY_LINES`.
pub fn history_lines(text: &str, starts_mid_line: bool) -> (Vec<String>, bool) {
    let mut lines: Vec<&str> = text.lines().collect();
    if starts_mid_line && !lines.is_empty() {
        lines.remove(0);
    }
    let kept: Vec<String> = lines
        .into_iter()
        .filter(|l| {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(l) else {
                return false;
            };
            let kind = v.get("type").and_then(|t| t.as_str());
            matches!(kind, Some("user") | Some("assistant"))
                && v.get("isSidechain").and_then(|b| b.as_bool()) != Some(true)
        })
        .map(str::to_string)
        .collect();
    let truncated = starts_mid_line || kept.len() > MAX_HISTORY_LINES;
    let start = kept.len().saturating_sub(MAX_HISTORY_LINES);
    (kept[start..].to_vec(), truncated)
}

fn read_range(path: &std::path::Path, from: u64, len: u64) -> std::io::Result<String> {
    use std::io::Seek;
    let mut f = std::fs::File::open(path)?;
    f.seek(std::io::SeekFrom::Start(from))?;
    let mut buf = Vec::with_capacity(len as usize);
    f.take(len).read_to_end(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// How many sessions to summarize: the caller's limit, within the cap.
pub fn sessions_limit(limit: Option<usize>) -> usize {
    limit
        .unwrap_or(MAX_SESSIONS_LISTED)
        .min(MAX_SESSIONS_LISTED)
}

fn session_dir(
    registry: &WorkspaceRegistry,
    agent: ChatAgent,
    cwd: &str,
) -> Result<Option<std::path::PathBuf>, String> {
    if agent != ChatAgent::Claude {
        return Ok(None);
    }
    let cwd = authorize_spawn_cwd(registry, Some(cwd), &WorkspaceEnv::Local)?
        .ok_or("agent chat: a workspace folder is required")?;
    Ok(claude_projects_dir().map(|d| d.join(encode_claude_project(&cwd))))
}

/// Sessions the agent has for this folder, newest first, at most `limit`
/// (capped at `MAX_SESSIONS_LISTED`). Empty for agents whose history Estate
/// doesn't read yet.
#[tauri::command]
pub async fn agent_chat_sessions(
    registry: tauri::State<'_, WorkspaceRegistry>,
    agent: ChatAgent,
    cwd: String,
    limit: Option<usize>,
) -> Result<Vec<SessionSummary>, String> {
    let Some(dir) = session_dir(&registry, agent, &cwd)? else {
        return Ok(Vec::new());
    };
    let limit = sessions_limit(limit);
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            return Vec::new();
        };
        let mut files: Vec<(std::path::PathBuf, String, u64, u64)> = entries
            .filter_map(Result::ok)
            .filter_map(|e| {
                let path = e.path();
                if path.extension().and_then(|x| x.to_str()) != Some("jsonl") {
                    return None;
                }
                let id = path.file_stem()?.to_str()?.to_string();
                if !valid_token(&id, 128, &[]) {
                    return None;
                }
                let meta = e.metadata().ok()?;
                if !meta.is_file() {
                    return None;
                }
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                Some((path, id, modified, meta.len()))
            })
            .collect();
        files.sort_by_key(|f| std::cmp::Reverse(f.2));
        files.truncate(limit);
        files
            .into_iter()
            .map(|(path, id, modified_ms, bytes)| {
                let head = read_range(&path, 0, SUMMARY_PEEK_BYTES).unwrap_or_default();
                let tail_from = bytes.saturating_sub(SUMMARY_PEEK_BYTES);
                let tail = if tail_from == 0 {
                    head.clone()
                } else {
                    read_range(&path, tail_from, SUMMARY_PEEK_BYTES).unwrap_or_default()
                };
                let (title, last_prompt, branch) = summarize_session(&head, &tail);
                SessionSummary {
                    id,
                    title,
                    last_prompt,
                    branch,
                    modified_ms,
                    bytes,
                }
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistory {
    pub lines: Vec<String>,
    /// Older messages were left out.
    pub truncated: bool,
}

/// The recent conversation of one session, as the agent saved it.
#[tauri::command]
pub async fn agent_chat_session_history(
    registry: tauri::State<'_, WorkspaceRegistry>,
    agent: ChatAgent,
    cwd: String,
    session_id: String,
) -> Result<SessionHistory, String> {
    let session_id = validate_session(Some(&session_id))?
        .ok_or("agent chat: invalid session id")?
        .to_string();
    let Some(dir) = session_dir(&registry, agent, &cwd)? else {
        return Ok(SessionHistory {
            lines: Vec::new(),
            truncated: false,
        });
    };
    let path = dir.join(format!("{session_id}.jsonl"));
    tauri::async_runtime::spawn_blocking(move || {
        let len = std::fs::metadata(&path)
            .map_err(|_| "agent chat: session not found".to_string())?
            .len();
        let from = len.saturating_sub(HISTORY_READ_BYTES);
        let text = read_range(&path, from, HISTORY_READ_BYTES).map_err(|e| e.to_string())?;
        let (lines, truncated) = history_lines(&text, from > 0);
        Ok(SessionHistory { lines, truncated })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- Sign-in status ---------------------------------------------------------

/// Whether an agent can be used. Only the state and the sign-in method leave
/// Rust: never the account email, organisation or tokens.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentAuth {
    /// "signed-in", "signed-out", "missing" (not installed) or "unknown".
    pub state: &'static str,
    pub method: Option<String>,
    /// What to run in a terminal to sign in.
    pub login_command: &'static str,
}

fn login_command(agent: ChatAgent) -> &'static str {
    match agent {
        ChatAgent::Claude => "claude auth login",
        ChatAgent::Codex => "codex login",
        // Gemini CLI asks how to sign in on its first interactive run.
        ChatAgent::Gemini => "gemini",
        ChatAgent::Opencode => "opencode auth login",
    }
}

/// `claude auth status --json`: `{"loggedIn": bool, "authMethod": "..."}`.
pub fn parse_claude_auth(stdout: &str) -> (&'static str, Option<String>) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(stdout.trim()) else {
        return ("unknown", None);
    };
    match v.get("loggedIn").and_then(|b| b.as_bool()) {
        Some(true) => (
            "signed-in",
            v.get("authMethod")
                .and_then(|m| m.as_str())
                .map(|m| m.chars().take(40).collect()),
        ),
        Some(false) => ("signed-out", None),
        None => ("unknown", None),
    }
}

/// `codex login status`: "Logged in using ChatGPT" / "Not logged in".
pub fn parse_codex_auth(output: &str, exit: Option<i32>) -> (&'static str, Option<String>) {
    let text = output.trim();
    if text.to_ascii_lowercase().starts_with("not logged in") {
        return ("signed-out", None);
    }
    if let Some(rest) = text.strip_prefix("Logged in") {
        let method = rest
            .trim()
            .strip_prefix("using")
            .map(|m| {
                m.trim()
                    .lines()
                    .next()
                    .unwrap_or("")
                    .chars()
                    .take(40)
                    .collect::<String>()
            })
            .filter(|m| !m.is_empty());
        return ("signed-in", method);
    }
    match exit {
        Some(0) => ("unknown", None),
        Some(_) => ("signed-out", None),
        None => ("unknown", None),
    }
}

fn env_has(keys: &[&str]) -> bool {
    let overlay = crate::modules::lsp::env::server_env_overlay();
    keys.iter().any(|k| {
        overlay
            .get(*k)
            .cloned()
            .or_else(|| std::env::var(k).ok())
            .is_some_and(|v| !v.trim().is_empty())
    })
}

fn non_empty_json_object(path: &std::path::Path) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.as_object().map(|o| !o.is_empty()))
        .unwrap_or(false)
}

fn run_status(
    program: &std::path::Path,
    args: &[&str],
) -> Option<crate::modules::proc::capture::Captured> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .envs(crate::modules::lsp::env::server_env_overlay())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::modules::proc::hide_console(&mut cmd);
    crate::modules::proc::capture::run(
        &mut cmd,
        std::time::Duration::from_secs(10),
        crate::modules::proc::capture::Limits {
            stdout: 64 * 1024,
            stderr: 16 * 1024,
            stop_on_stdout_cap: true,
        },
    )
    .ok()
}

fn check_auth(agent: ChatAgent) -> AgentAuth {
    let program = match agent {
        ChatAgent::Claude => "claude",
        ChatAgent::Codex => "codex",
        ChatAgent::Gemini => "gemini",
        ChatAgent::Opencode => "opencode",
    };
    let login = login_command(agent);
    let Some(binary) = crate::modules::lsp::env::resolve_binary(program) else {
        return AgentAuth {
            state: "missing",
            method: None,
            login_command: login,
        };
    };
    let (state, method) = match agent {
        ChatAgent::Claude => match run_status(&binary, &["auth", "status", "--json"]) {
            Some(out) if !out.timed_out => parse_claude_auth(&String::from_utf8_lossy(&out.stdout)),
            _ => ("unknown", None),
        },
        ChatAgent::Codex => match run_status(&binary, &["login", "status"]) {
            Some(out) if !out.timed_out => {
                // Codex prints the status on stderr in some versions.
                let text = format!(
                    "{}{}",
                    String::from_utf8_lossy(&out.stdout),
                    String::from_utf8_lossy(&out.stderr)
                );
                parse_codex_auth(&text, out.exit_code)
            }
            _ => ("unknown", None),
        },
        ChatAgent::Gemini => {
            let home = dirs::home_dir();
            if env_has(&[
                "GEMINI_API_KEY",
                "GOOGLE_API_KEY",
                "GOOGLE_GENAI_USE_VERTEXAI",
            ]) {
                ("signed-in", Some("API key".into()))
            } else if home
                .is_some_and(|h| non_empty_json_object(&h.join(".gemini/oauth_creds.json")))
            {
                ("signed-in", Some("Google account".into()))
            } else {
                ("signed-out", None)
            }
        }
        ChatAgent::Opencode => {
            let data = std::env::var("XDG_DATA_HOME")
                .ok()
                .map(std::path::PathBuf::from)
                .or_else(|| dirs::home_dir().map(|h| h.join(".local/share")));
            if data.is_some_and(|d| non_empty_json_object(&d.join("opencode/auth.json"))) {
                ("signed-in", None)
            } else if env_has(&[
                "ANTHROPIC_API_KEY",
                "OPENAI_API_KEY",
                "GEMINI_API_KEY",
                "OPENROUTER_API_KEY",
            ]) {
                ("signed-in", Some("API key".into()))
            } else {
                ("signed-out", None)
            }
        }
    };
    AgentAuth {
        state,
        method,
        login_command: login,
    }
}

/// Whether the agent is installed and signed in.
#[tauri::command]
pub async fn agent_chat_auth(agent: ChatAgent) -> Result<AgentAuth, String> {
    tauri::async_runtime::spawn_blocking(move || check_auth(agent))
        .await
        .map_err(|e| e.to_string())
}

/// Estate: a model the agent offers, with the effort levels it takes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModel {
    pub id: String,
    pub label: String,
    pub efforts: Vec<String>,
    pub default_effort: Option<String>,
}

const EFFORTS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];
const MAX_MODELS_CACHE_BYTES: u64 = 4 * 1024 * 1024;

/// The models Codex lists in its picker, from its `models_cache.json`. Hidden
/// models, unusable ids and effort levels Estate doesn't pass are left out.
/// Pure.
pub fn codex_models_from_cache(json: &str) -> Vec<AgentModel> {
    let Ok(root) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let Some(models) = root.get("models").and_then(|m| m.as_array()) else {
        return Vec::new();
    };
    let str_of =
        |v: &serde_json::Value, k: &str| v.get(k).and_then(|x| x.as_str()).map(str::to_string);
    models
        .iter()
        .filter(|m| m.get("visibility").and_then(|v| v.as_str()) == Some("list"))
        .filter_map(|m| {
            let id = str_of(m, "slug")?;
            if !valid_token(&id, 100, &['.', ':', '/', '[', ']']) {
                return None;
            }
            let efforts: Vec<String> = m
                .get("supported_reasoning_levels")
                .and_then(|l| l.as_array())
                .map(|levels| {
                    levels
                        .iter()
                        .filter_map(|l| l.get("effort").and_then(|e| e.as_str()))
                        .filter(|e| EFFORTS.contains(e))
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();
            let default_effort =
                str_of(m, "default_reasoning_level").filter(|e| efforts.contains(e));
            let label = str_of(m, "display_name")
                .filter(|l| !l.trim().is_empty())
                .unwrap_or_else(|| id.clone());
            Some(AgentModel {
                id,
                label: label.chars().take(60).collect(),
                efforts,
                default_effort,
            })
        })
        .take(50)
        .collect()
}

fn codex_home() -> Option<std::path::PathBuf> {
    let overlay = crate::modules::lsp::env::server_env_overlay();
    overlay
        .get("CODEX_HOME")
        .cloned()
        .or_else(|| std::env::var("CODEX_HOME").ok())
        .filter(|v| !v.trim().is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".codex")))
}

/// Models the agent offers, for the chat's model picker. Codex only for now
/// (its local model list); empty for the others and when there is no list.
#[tauri::command]
pub async fn agent_chat_models(agent: ChatAgent) -> Result<Vec<AgentModel>, String> {
    if agent != ChatAgent::Codex {
        return Ok(Vec::new());
    }
    let Some(path) = codex_home().map(|h| h.join("models_cache.json")) else {
        return Ok(Vec::new());
    };
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(file) = std::fs::File::open(&path) else {
            return Vec::new();
        };
        let mut text = String::new();
        if file
            .take(MAX_MODELS_CACHE_BYTES)
            .read_to_string(&mut text)
            .is_err()
        {
            return Vec::new();
        }
        codex_models_from_cache(&text)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROMPT: &str = "--dangerously-skip-permissions; rm -rf ~";

    #[test]
    fn sessions_limit_stays_within_the_cap() {
        assert_eq!(sessions_limit(None), MAX_SESSIONS_LISTED);
        assert_eq!(sessions_limit(Some(1)), 1);
        assert_eq!(sessions_limit(Some(0)), 0);
        assert_eq!(sessions_limit(Some(usize::MAX)), MAX_SESSIONS_LISTED);
    }

    #[test]
    fn effort_goes_where_each_agent_reads_it() {
        let claude = with_effort(
            build_invocation(ChatAgent::Claude, ChatAccess::Read, None, None, "x").unwrap(),
            ChatAgent::Claude,
            Some(ChatEffort::Xhigh),
        );
        assert!(claude.args.windows(2).any(|w| w == ["--effort", "xhigh"]));

        let codex = with_effort(
            build_invocation(
                ChatAgent::Codex,
                ChatAccess::Read,
                Some("abc-123"),
                None,
                "x",
            )
            .unwrap(),
            ChatAgent::Codex,
            Some(ChatEffort::High),
        );
        assert!(codex
            .args
            .windows(2)
            .any(|w| w == ["-c", "model_reasoning_effort=\"high\""]));
        assert_eq!(codex.args.last().map(String::as_str), Some("-"));

        for agent in [ChatAgent::Gemini, ChatAgent::Opencode] {
            let plain = build_invocation(agent, ChatAccess::Read, None, None, "x").unwrap();
            let tuned = with_effort(
                build_invocation(agent, ChatAccess::Read, None, None, "x").unwrap(),
                agent,
                Some(ChatEffort::Max),
            );
            assert_eq!(plain.args, tuned.args);
        }
        let none = with_effort(
            build_invocation(ChatAgent::Claude, ChatAccess::Read, None, None, "x").unwrap(),
            ChatAgent::Claude,
            None,
        );
        assert!(!none.args.iter().any(|a| a == "--effort"));
    }

    #[test]
    fn codex_models_list_only_usable_listed_models() {
        let json = r#"{"models":[
            {"slug":"gpt-a","display_name":"GPT A","visibility":"list",
             "default_reasoning_level":"medium",
             "supported_reasoning_levels":[{"effort":"low"},{"effort":"medium"},{"effort":"ultra"}]},
            {"slug":"gpt-hidden","visibility":"hide","supported_reasoning_levels":[]},
            {"slug":"bad slug; rm","visibility":"list"},
            {"slug":"gpt-b","visibility":"list","default_reasoning_level":"ultra"}
        ]}"#;
        let models = codex_models_from_cache(json);
        assert_eq!(
            models,
            vec![
                AgentModel {
                    id: "gpt-a".into(),
                    label: "GPT A".into(),
                    efforts: vec!["low".into(), "medium".into()],
                    default_effort: Some("medium".into()),
                },
                AgentModel {
                    id: "gpt-b".into(),
                    label: "gpt-b".into(),
                    efforts: vec![],
                    default_effort: None,
                },
            ]
        );
        assert!(codex_models_from_cache("not json").is_empty());
        assert!(codex_models_from_cache("{}").is_empty());
    }

    #[test]
    fn programs_are_fixed_per_agent() {
        for (agent, program) in [
            (ChatAgent::Claude, "claude"),
            (ChatAgent::Codex, "codex"),
            (ChatAgent::Gemini, "gemini"),
            (ChatAgent::Opencode, "opencode"),
        ] {
            let inv = build_invocation(agent, ChatAccess::Read, None, None, "hi").unwrap();
            assert_eq!(inv.program, program);
        }
    }

    #[test]
    fn the_prompt_is_never_a_separate_option_argument() {
        let claude =
            build_invocation(ChatAgent::Claude, ChatAccess::Read, None, None, PROMPT).unwrap();
        assert!(!claude.args.iter().any(|a| a.contains("rm -rf")));
        assert_eq!(claude.stdin.as_deref(), Some(PROMPT));

        let codex =
            build_invocation(ChatAgent::Codex, ChatAccess::Read, None, None, PROMPT).unwrap();
        assert!(!codex.args.iter().any(|a| a.contains("rm -rf")));
        assert_eq!(codex.args.last().map(String::as_str), Some("-"));
        assert_eq!(codex.stdin.as_deref(), Some(PROMPT));

        let gemini =
            build_invocation(ChatAgent::Gemini, ChatAccess::Read, None, None, PROMPT).unwrap();
        assert_eq!(gemini.args.last().unwrap(), &format!("--prompt={PROMPT}"));
        assert_eq!(
            gemini.args.iter().filter(|a| a.contains("rm -rf")).count(),
            1
        );

        let open =
            build_invocation(ChatAgent::Opencode, ChatAccess::Read, None, None, PROMPT).unwrap();
        let n = open.args.len();
        assert_eq!(open.args[n - 2], "--");
        assert_eq!(open.args[n - 1], PROMPT);
    }

    #[test]
    fn access_levels_map_to_each_agents_flags() {
        let claude = |a| {
            build_invocation(ChatAgent::Claude, a, None, None, "x")
                .unwrap()
                .args
        };
        assert!(claude(ChatAccess::Read)
            .windows(2)
            .any(|w| w == ["--permission-mode", "default"]));
        assert!(claude(ChatAccess::Edit)
            .windows(2)
            .any(|w| w == ["--permission-mode", "acceptEdits"]));
        assert!(claude(ChatAccess::Full)
            .windows(2)
            .any(|w| w == ["--permission-mode", "bypassPermissions"]));

        let codex = build_invocation(ChatAgent::Codex, ChatAccess::Read, None, None, "x")
            .unwrap()
            .args;
        assert!(codex.windows(2).any(|w| w == ["--sandbox", "read-only"]));
        let resumed = build_invocation(
            ChatAgent::Codex,
            ChatAccess::Edit,
            Some("abc-123"),
            None,
            "x",
        )
        .unwrap()
        .args;
        assert_eq!(&resumed[..3], ["exec", "resume", "abc-123"]);
        assert!(resumed
            .windows(2)
            .any(|w| w == ["-c", "sandbox_mode=\"workspace-write\""]));
        assert!(!resumed.iter().any(|a| a == "--sandbox"));

        let gemini = build_invocation(ChatAgent::Gemini, ChatAccess::Full, None, None, "x")
            .unwrap()
            .args;
        assert!(gemini.windows(2).any(|w| w == ["--approval-mode", "yolo"]));

        let open =
            build_invocation(ChatAgent::Opencode, ChatAccess::Read, None, None, "x").unwrap();
        assert_eq!(open.env[0].0, "OPENCODE_CONFIG_CONTENT");
        assert!(open.env[0].1.contains(r#""bash":"deny""#));
    }

    #[test]
    fn sessions_resume_and_models_pass_through() {
        let c = build_invocation(
            ChatAgent::Claude,
            ChatAccess::Read,
            Some("c4e6-13"),
            Some("haiku"),
            "x",
        )
        .unwrap()
        .args;
        assert!(c.windows(2).any(|w| w == ["--resume", "c4e6-13"]));
        assert!(c.windows(2).any(|w| w == ["--model", "haiku"]));
    }

    #[test]
    fn rejects_bad_session_ids_models_and_prompts() {
        for bad in ["--resume", "a b", "a;b", "../x", &"x".repeat(200)] {
            assert!(
                build_invocation(ChatAgent::Claude, ChatAccess::Read, Some(bad), None, "x")
                    .is_err(),
                "{bad}"
            );
        }
        for bad in ["-x", "a b", "a;rm"] {
            assert!(
                build_invocation(ChatAgent::Claude, ChatAccess::Read, None, Some(bad), "x")
                    .is_err(),
                "{bad}"
            );
        }
        assert!(build_invocation(
            ChatAgent::Claude,
            ChatAccess::Read,
            None,
            Some("claude-sonnet-5-5[1m]"),
            "x"
        )
        .is_ok());
        assert!(build_invocation(ChatAgent::Claude, ChatAccess::Read, None, None, "   ").is_err());
        let huge = "x".repeat(MAX_PROMPT_BYTES + 1);
        assert!(build_invocation(ChatAgent::Claude, ChatAccess::Read, None, None, &huge).is_err());
    }

    #[cfg(unix)]
    fn temp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "estate-agent-chat-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[cfg(unix)]
    #[test]
    fn spawns_without_a_shell_and_feeds_the_prompt_on_stdin() {
        let inv = Invocation {
            program: "cat",
            args: vec![],
            env: vec![],
            stdin: Some("{\"type\":\"hello\"}\n".into()),
        };
        let (child, stdout, _stderr, stdin) = spawn_turn(&inv, &temp_dir()).unwrap();
        let (mut pipe, text) = stdin.unwrap();
        pipe.write_all(text.as_bytes()).unwrap();
        drop(pipe);
        let mut reader = BufReader::new(stdout);
        let mut buf = Vec::new();
        assert_eq!(
            read_capped_line(&mut reader, &mut buf, 1024).unwrap(),
            LineRead::Line
        );
        assert_eq!(
            String::from_utf8_lossy(&buf).trim_end(),
            "{\"type\":\"hello\"}"
        );
        assert!(child.wait().unwrap().success());
    }

    #[cfg(unix)]
    #[test]
    fn cancel_kills_the_whole_process_group() {
        // `sh` starts a grandchild; killing the group must take it down too.
        let inv = Invocation {
            program: "sh",
            args: vec!["-c".into(), "sleep 30 & wait".into()],
            env: vec![],
            stdin: None,
        };
        let (child, _out, _err, _in) = spawn_turn(&inv, &temp_dir()).unwrap();
        let started = std::time::Instant::now();
        kill_group(&child);
        child.wait().unwrap();
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        let pgid = child.id() as libc::pid_t;
        // After SIGTERM to the group nothing in it may survive (ESRCH).
        std::thread::sleep(std::time::Duration::from_millis(200));
        let alive = unsafe { libc::killpg(pgid, 0) } == 0;
        assert!(!alive, "a process of the agent's group survived cancel");
    }

    #[test]
    fn encodes_project_folders_like_claude_code() {
        assert_eq!(
            encode_claude_project(std::path::Path::new("/Users/me/estate")),
            "-Users-me-estate"
        );
        assert_eq!(
            encode_claude_project(std::path::Path::new("/private/tmp/a_b.c/work")),
            "-private-tmp-a-b-c-work"
        );
    }

    #[test]
    fn summarizes_a_session_from_its_ends() {
        let head = concat!(
            r#"{"type":"user","isMeta":true,"message":{"role":"user","content":"<caveat>"},"gitBranch":"main"}"#,
            "\n",
            r#"{"type":"user","message":{"role":"user","content":"Fix the build"},"gitBranch":"main"}"#,
            "\n",
        );
        let tail = concat!(
            r#"{"type":"ai-title","aiTitle":"Fix the build","sessionId":"s"}"#,
            "\n",
            r#"{"type":"last-prompt","lastPrompt":"Now run the tests","sessionId":"s"}"#,
            "\n",
        );
        assert_eq!(
            summarize_session(head, tail),
            (
                Some("Fix the build".into()),
                Some("Now run the tests".into()),
                Some("main".into())
            )
        );
        let (title, prompt, branch) = summarize_session(head, "");
        assert_eq!(
            (title, prompt, branch),
            (None, Some("Fix the build".into()), Some("main".into()))
        );
    }

    #[test]
    fn history_keeps_main_thread_messages_only() {
        let text = concat!(
            "partial line from the middle\n",
            r#"{"type":"user","message":{"role":"user","content":"hi"}}"#,
            "\n",
            r#"{"type":"assistant","message":{"id":"m","content":[]}}"#,
            "\n",
            r#"{"type":"assistant","isSidechain":true,"message":{"id":"x","content":[]}}"#,
            "\n",
            r#"{"type":"ai-title","aiTitle":"t"}"#,
            "\n",
            "not json\n",
        );
        let (lines, truncated) = history_lines(text, true);
        assert_eq!(lines.len(), 2);
        assert!(truncated);
        let (all, truncated) =
            history_lines(&text["partial line from the middle\n".len()..], false);
        assert_eq!(all.len(), 2);
        assert!(!truncated);
    }

    #[test]
    fn history_is_capped_to_the_most_recent_lines() {
        let line = r#"{"type":"user","message":{"role":"user","content":"x"}}"#;
        let text = vec![line; MAX_HISTORY_LINES + 5].join("\n");
        let (lines, truncated) = history_lines(&text, false);
        assert_eq!(lines.len(), MAX_HISTORY_LINES);
        assert!(truncated);
    }

    #[test]
    fn reads_claude_sign_in_status_without_account_details() {
        let out =
            r#"{"loggedIn":true,"authMethod":"claude.ai","email":"me@example.com","orgName":"Me"}"#;
        assert_eq!(
            parse_claude_auth(out),
            ("signed-in", Some("claude.ai".into()))
        );
        assert_eq!(
            parse_claude_auth(r#"{"loggedIn":false}"#),
            ("signed-out", None)
        );
        assert_eq!(parse_claude_auth("not json"), ("unknown", None));
        assert_eq!(parse_claude_auth("{}"), ("unknown", None));
    }

    #[test]
    fn reads_codex_sign_in_status() {
        assert_eq!(
            parse_codex_auth("Logged in using ChatGPT\n", Some(0)),
            ("signed-in", Some("ChatGPT".into()))
        );
        assert_eq!(
            parse_codex_auth("Logged in using an API key - sk-***", Some(0)).0,
            "signed-in"
        );
        assert_eq!(
            parse_codex_auth("Not logged in", Some(1)),
            ("signed-out", None)
        );
        assert_eq!(parse_codex_auth("", Some(1)), ("signed-out", None));
        assert_eq!(parse_codex_auth("???", Some(0)), ("unknown", None));
    }

    #[test]
    fn login_commands_are_fixed_per_agent() {
        assert_eq!(login_command(ChatAgent::Claude), "claude auth login");
        assert_eq!(login_command(ChatAgent::Codex), "codex login");
        assert_eq!(login_command(ChatAgent::Opencode), "opencode auth login");
    }

    #[test]
    fn chat_ids_are_plain_tokens() {
        assert!(valid_chat_id("chat-12_ab"));
        assert!(!valid_chat_id(""));
        assert!(!valid_chat_id("-x"));
        assert!(!valid_chat_id("a/b"));
    }

    #[test]
    fn capped_line_reader_splits_lines_and_skips_oversized_ones() {
        let data = b"one\n"
            .iter()
            .chain(&[b'y'; 40])
            .chain(b"\ntwo\nlast")
            .copied()
            .collect::<Vec<u8>>();
        let mut reader = BufReader::with_capacity(8, &data[..]);
        let mut buf = Vec::new();
        let mut got = Vec::new();
        loop {
            buf.clear();
            match read_capped_line(&mut reader, &mut buf, 16).unwrap() {
                LineRead::Eof => break,
                LineRead::TooLong(n) => got.push(format!("dropped:{n}")),
                LineRead::Line => got.push(String::from_utf8_lossy(&buf).trim_end().to_string()),
            }
        }
        assert_eq!(got, ["one", "dropped:41", "two", "last"]);
    }
}
