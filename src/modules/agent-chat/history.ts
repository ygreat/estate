/**
 * Turns a saved Claude Code session (its JSONL lines) into a chat transcript.
 * Assistant messages and tool results have the same shape as the live stream,
 * so they go through the Claude adapter; typed prompts and slash commands only
 * appear in saved sessions and are handled here. Pure.
 */
import { claudeAdapter } from "./adapters";
import {
  applyChatEvent,
  type ChatEvent,
  EMPTY_TRANSCRIPT,
  type Transcript,
} from "./model";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};

/** `<command-name>/context</command-name>` and similar markup. */
function tagged(text: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text);
  return m ? m[1].trim() : undefined;
}

/** What a saved `user` line contributes, besides tool results. */
function userTurn(line: Obj): { prompt?: string; output?: string } {
  if (line.isMeta === true) return {};
  const content = obj(line.message).content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map(obj)
            .filter((b) => b.type === "text")
            .map((b) => (typeof b.text === "string" ? b.text : ""))
            .join("\n")
        : "";
  const trimmed = text.trim();
  if (!trimmed) return {};
  const command = tagged(trimmed, "command-name");
  if (command) {
    const args = tagged(trimmed, "command-args");
    return { prompt: args ? `${command} ${args}` : command };
  }
  const stdout = tagged(trimmed, "local-command-stdout");
  if (stdout !== undefined) return stdout ? { output: stdout } : {};
  // Other markup is Claude Code's own bookkeeping (reminders, caveats).
  if (trimmed.startsWith("<")) return {};
  return { prompt: trimmed };
}

export function transcriptFromHistory(
  lines: readonly string[],
  sessionId: string,
): Transcript {
  const adapter = claudeAdapter();
  let t: Transcript = { ...EMPTY_TRANSCRIPT, sessionId };
  let model: string | undefined;
  lines.forEach((raw, i) => {
    let line: Obj;
    try {
      line = obj(JSON.parse(raw));
    } catch {
      return;
    }
    const events: ChatEvent[] = [];
    if (line.type === "user") {
      const { prompt, output } = userTurn(line);
      if (prompt) {
        t = {
          ...t,
          items: [
            ...t.items,
            { kind: "user", id: `h-user-${i}`, text: prompt },
          ],
        };
      }
      if (output) {
        events.push({
          type: "text",
          id: `h-out-${i}`,
          text: output,
          final: true,
        });
      }
    }
    if (line.type === "assistant") {
      const m = obj(line.message);
      if (typeof m.model === "string" && !m.model.startsWith("<"))
        model = m.model;
    }
    events.push(...adapter.push(line));
    for (const e of events) {
      // Saved sessions carry their own id; ignore context/limits from old turns.
      if (e.type === "session" || e.type === "limits") continue;
      t = applyChatEvent(t, e);
    }
  });
  t = applyChatEvent(t, { type: "done", ok: true });
  return {
    ...t,
    sessionId,
    model: model ?? t.model,
    totals: EMPTY_TRANSCRIPT.totals,
  };
}
