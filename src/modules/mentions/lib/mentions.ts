/**
 * File mentions in chat text: `@path`, or `@"path with spaces"`. The text a
 * chat sends is exactly what the composer shows; the agent reads the file
 * itself. Pure, so both composers share and test it.
 */

export type Mention = {
  /** Index of the `@`. */
  start: number;
  /** Index just past the token (closing quote included). */
  end: number;
  /** The path as written, unquoted. */
  path: string;
};

/** Sentence punctuation that ends an unquoted mention rather than its path. */
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Every mention in `text`: an `@` at the start or after whitespace. */
export function parseMentions(text: string): Mention[] {
  const out: Mention[] = [];
  const re = /(^|\s)@(?:"((?:[^"\\\n]|\\.)+)"|([^\s"]+))/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[1].length;
    if (m[2] !== undefined) {
      out.push({
        start,
        end: m.index + m[0].length,
        path: m[2].replace(/\\(.)/g, "$1"),
      });
      continue;
    }
    const raw = m[3];
    const path = raw.replace(TRAILING, "");
    if (!path) continue;
    out.push({ start, end: start + 1 + path.length, path });
  }
  return out;
}

/** `path` as mention text, quoted when it has whitespace or quotes. */
export function formatMention(path: string): string {
  return /[\s"]/.test(path)
    ? `@"${path.replace(/["\\]/g, "\\$&")}"`
    : `@${path}`;
}

export type MentionTrigger = { start: number; end: number; query: string };

/** The `@query` being typed at the caret, if any. */
export function mentionTrigger(
  value: string,
  caret: number,
): MentionTrigger | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "@") {
      if (i > 0 && !/\s/.test(value[i - 1])) return null;
      const query = value.slice(i + 1, caret);
      if (query.startsWith('"')) return null;
      return { start: i, end: caret, query };
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

/**
 * `insert` over value[start, end), with a space before it where it would touch
 * a word and one after it unless whitespace follows. Returns the caret too.
 */
export function spliceMention(
  value: string,
  start: number,
  end: number,
  insert: string,
): { value: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && /^\s/.test(after) ? "" : " ";
  const text = `${lead}${insert}${trail}`;
  return {
    value: `${before}${text}${after}`,
    caret: before.length + text.length,
  };
}

/**
 * Backspace right after a chip (or after the one space that follows it)
 * removes the whole chip. Returns null when the key should act normally.
 */
export function backspaceMention(
  value: string,
  caret: number,
  chips: readonly Mention[],
): { value: string; caret: number } | null {
  const hit = chips.find(
    (m) => m.end === caret || (m.end === caret - 1 && value[m.end] === " "),
  );
  if (!hit) return null;
  return {
    value: value.slice(0, hit.start) + value.slice(caret),
    caret: hit.start,
  };
}

/** `path` relative to `base`, or null when it is outside it. */
export function pathInside(path: string, base: string): string | null {
  const root = base.replace(/\/+$/, "");
  if (!root || !path.startsWith(`${root}/`)) return null;
  const rel = path.slice(root.length + 1).replace(/\/+$/, "");
  return rel || null;
}

/** A mentioned path made absolute against the chat's folder. */
export function resolveMention(path: string, base: string): string {
  if (path.startsWith("/")) return path;
  const rel = path.replace(/^\.\//, "");
  return `${base.replace(/\/+$/, "")}/${rel}`;
}
