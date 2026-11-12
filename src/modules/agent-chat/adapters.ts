/**
 * Per-agent parsers: one JSON line of headless output in, chat events out.
 * Formats: Claude Code `-p --output-format stream-json --verbose
 * --include-partial-messages`, `codex exec --json`, Gemini CLI
 * `--output-format stream-json`, `opencode run --format json`.
 * Unknown lines and fields are ignored, so newer agent versions degrade to
 * showing less rather than failing.
 */
import {
  type AgentInfo,
  type ChatAgentId,
  type ChatEvent,
  describeTool,
  oneLine,
  unwrapShell,
  type UsageWindow,
} from "./model";

export type TurnAdapter = {
  push: (line: unknown) => ChatEvent[];
  /** Called once when the agent process exits. */
  finish: () => ChatEvent[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  return arr(content)
    .map((b) => str(obj(b).text) ?? "")
    .filter(Boolean)
    .join("\n");
}

// ---- Claude Code ------------------------------------------------------------

export function claudeAdapter(): TurnAdapter {
  // Text blocks are keyed by message id + their order among the message's text
  // blocks, which is the same in the streamed deltas and the final message.
  let streamMsg: string | undefined;
  const streamKeys = new Map<number, string>();
  const streamTextCount = new Map<string, number>();
  const finalTextCount = new Map<string, number>();
  let ended = false;
  // Built-in commands (/context, /cost…) answer only in the result.
  let sawText = false;

  const nextKey = (counts: Map<string, number>, msgId: string) => {
    const n = counts.get(msgId) ?? 0;
    counts.set(msgId, n + 1);
    return `${msgId}:t${n}`;
  };

  return {
    push(line) {
      const o = obj(line);
      // Subagent internals stay out of the chat; their parent tool call shows.
      if (o.parent_tool_use_id) return [];
      switch (o.type) {
        case "system": {
          const id = str(o.session_id);
          return o.subtype === "init" && id
            ? [
                {
                  type: "session",
                  id,
                  model: str(o.model),
                  commands: arr(o.slash_commands)
                    .map(str)
                    .filter(
                      (c): c is string => Boolean(c) && !c?.startsWith("__"),
                    ),
                  info: claudeInfo(o),
                },
              ]
            : [];
        }
        case "stream_event": {
          const e = obj(o.event);
          if (e.type === "message_start") {
            streamMsg = str(obj(e.message).id);
            streamKeys.clear();
            return [];
          }
          if (!streamMsg) return [];
          const index = num(e.index) ?? -1;
          if (
            e.type === "content_block_start" &&
            obj(e.content_block).type === "text"
          ) {
            streamKeys.set(index, nextKey(streamTextCount, streamMsg));
            return [];
          }
          if (e.type === "content_block_delta") {
            const d = obj(e.delta);
            const key = streamKeys.get(index);
            const text = str(d.text);
            if (d.type === "text_delta" && key && text) {
              return [{ type: "text", id: key, text, final: false }];
            }
          }
          return [];
        }
        case "assistant": {
          const m = obj(o.message);
          const msgId = str(m.id) ?? "msg";
          const out: ChatEvent[] = [];
          // Input plus cached input is what the model holds in context.
          const u = obj(m.usage);
          const context =
            (num(u.input_tokens) ?? 0) +
            (num(u.cache_read_input_tokens) ?? 0) +
            (num(u.cache_creation_input_tokens) ?? 0);
          if (context > 0) out.push({ type: "context", tokens: context });
          for (const raw of arr(m.content)) {
            const b = obj(raw);
            if (b.type === "text") {
              const text = str(b.text) ?? "";
              if (text) sawText = true;
              out.push({
                type: "text",
                id: nextKey(finalTextCount, msgId),
                text,
                final: true,
              });
            } else if (b.type === "tool_use") {
              const name = str(b.name) ?? "tool";
              out.push({
                type: "tool",
                id: str(b.id) ?? `${msgId}:tool`,
                name,
                ...describeTool(name, b.input),
                status: "running",
              });
            }
          }
          return out;
        }
        case "user": {
          const out: ChatEvent[] = [];
          for (const raw of arr(obj(o.message).content)) {
            const b = obj(raw);
            if (b.type !== "tool_result") continue;
            out.push({
              type: "tool",
              id: str(b.tool_use_id) ?? "tool",
              name: "",
              title: "",
              status: b.is_error === true ? "error" : "done",
              output: toolResultText(b.content),
            });
          }
          return out;
        }
        case "rate_limit_event": {
          const windows = obj(obj(o.rate_limit_info).unifiedWindows);
          const out: UsageWindow[] = [];
          for (const id of ["five_hour", "seven_day"] as const) {
            const w = obj(windows[id]);
            const utilization = num(w.utilization);
            if (utilization === undefined) continue;
            out.push({ id, utilization, resetsAt: num(w.resetsAt) });
          }
          return out.length ? [{ type: "limits", windows: out }] : [];
        }
        case "result": {
          ended = true;
          const out: ChatEvent[] = [];
          const id = str(o.session_id);
          if (id) out.push({ type: "session", id });
          const denials = arr(o.permission_denials).map((raw) => {
            const d = obj(raw);
            const name = str(d.tool_name) ?? "tool";
            const { title, detail } = describeTool(name, d.tool_input);
            return {
              name,
              title: detail ? `${title}: ${oneLine(detail, 80)}` : title,
            };
          });
          if (denials.length) out.push({ type: "denied", tools: denials });
          const usage = obj(o.usage);
          out.push({
            type: "usage",
            costUsd: num(o.total_cost_usd),
            inputTokens: num(usage.input_tokens),
            outputTokens: num(usage.output_tokens),
          });
          const failed =
            o.is_error === true || (o.subtype && o.subtype !== "success");
          if (failed) {
            out.push({
              type: "error",
              message:
                str(o.result) ||
                `Claude Code stopped: ${str(o.subtype) ?? "error"}`,
            });
          }
          const resultText = str(o.result);
          if (!failed && !sawText && resultText) {
            out.push({
              type: "text",
              // Unique per turn, so a later command's output doesn't replace this one.
              id: `result:${str(o.uuid) ?? Date.now().toString(36)}`,
              text: resultText,
              final: true,
            });
          }
          out.push({ type: "done", ok: !failed });
          return out;
        }
        default:
          return [];
      }
    },
    finish: () => (ended ? [] : [{ type: "done", ok: false }]),
  };
}

// ---- Codex --------------------------------------------------------------------

/**
 * Estate: Codex doesn't report what its sandbox refused. A failed command
 * whose output names the sandbox, an edit it declined, or (most often, as it
 * usually doesn't even try) a reply saying the folder is read-only count as
 * blocked, so the chat offers more access and the Agents panel shows it.
 */
const CODEX_SANDBOX_OUTPUT =
  /operation not permitted|read-only file system|permission denied|sandbox/i;
const CODEX_READ_ONLY_REPLY =
  /\bread-only\b|\bsandbox(?:ed)?\b|(?:don['\u2019]t|do not) have (?:write|edit) (?:access|permission)/i;

export function codexAdapter(): TurnAdapter {
  let ended = false;
  const denied: { name: string; title: string }[] = [];
  let lastReply = "";
  /** The turn's denials, once, before it ends. */
  const takeDenied = (): ChatEvent[] => {
    if (denied.length === 0 && CODEX_READ_ONLY_REPLY.test(lastReply))
      denied.push({
        name: "codex",
        title: "Codex said it can't change files with this access",
      });
    lastReply = "";
    return denied.length ? [{ type: "denied", tools: denied.splice(0) }] : [];
  };
  const itemEvents = (item: Obj, phase: string): ChatEvent[] => {
    const id = str(item.id) ?? "item";
    const status = str(item.status);
    const toolStatus =
      phase !== "item.completed" || status === "in_progress"
        ? "running"
        : status === "failed" || status === "declined"
          ? "error"
          : "done";
    switch (item.type) {
      case "agent_message": {
        const text = str(item.text) ?? "";
        if (text) lastReply = text;
        return text ? [{ type: "text", id, text, final: true }] : [];
      }
      case "command_execution": {
        const command = unwrapShell(str(item.command) ?? "");
        const exit = num(item.exit_code);
        const output = str(item.aggregated_output) ?? "";
        if (
          phase === "item.completed" &&
          (status === "declined" ||
            (exit !== undefined &&
              exit !== 0 &&
              CODEX_SANDBOX_OUTPUT.test(output)))
        )
          denied.push({
            name: "shell",
            title: `Run: ${oneLine(command, 80)}`,
          });
        return [
          {
            type: "tool",
            id,
            name: "shell",
            title: "Ran a command",
            detail: command,
            status:
              toolStatus === "done" && exit !== undefined && exit !== 0
                ? "error"
                : toolStatus,
            output: str(item.aggregated_output) || undefined,
          },
        ];
      }
      case "file_change": {
        const changes = arr(item.changes).map(obj);
        const paths = changes
          .map((c) => str(c.path))
          .filter(Boolean) as string[];
        if (
          phase === "item.completed" &&
          (status === "declined" || status === "failed")
        )
          denied.push({
            name: "file_change",
            title: `Edit: ${oneLine(paths.join(", ") || "files", 80)}`,
          });
        return [
          {
            type: "tool",
            id,
            name: "file_change",
            title:
              paths.length === 1
                ? "Edited a file"
                : `Edited ${paths.length} files`,
            detail: paths.join("\n") || undefined,
            status: toolStatus,
          },
        ];
      }
      case "mcp_tool_call":
        return [
          {
            type: "tool",
            id,
            name: "mcp",
            title: `${str(item.server) ?? "mcp"}: ${str(item.tool) ?? "tool"}`,
            status: toolStatus,
          },
        ];
      case "web_search":
        return [
          {
            type: "tool",
            id,
            name: "web_search",
            title: "Searched the web",
            detail: str(item.query),
            status: toolStatus,
          },
        ];
      case "todo_list": {
        const lines = arr(item.items)
          .map(obj)
          .map((t) => `${t.completed ? "[x]" : "[ ]"} ${str(t.text) ?? ""}`);
        return [
          {
            type: "tool",
            id,
            name: "plan",
            title: "Updated the plan",
            status: "done",
            output: lines.join("\n"),
          },
        ];
      }
      case "error":
        return [
          {
            type: "error",
            message: str(item.message) ?? "Codex reported an error",
          },
        ];
      default:
        return [];
    }
  };

  return {
    push(line) {
      const o = obj(line);
      const type = str(o.type) ?? "";
      if (type === "thread.started") {
        const id = str(o.thread_id);
        return id ? [{ type: "session", id }] : [];
      }
      if (type.startsWith("item.")) return itemEvents(obj(o.item), type);
      if (type === "turn.completed") {
        ended = true;
        const u = obj(o.usage);
        return [
          ...takeDenied(),
          {
            type: "usage",
            inputTokens: num(u.input_tokens),
            outputTokens: num(u.output_tokens),
          },
          { type: "done", ok: true },
        ];
      }
      if (type === "turn.failed") {
        ended = true;
        return [
          ...takeDenied(),
          {
            type: "error",
            message: str(obj(o.error).message) ?? "Codex turn failed",
          },
          { type: "done", ok: false },
        ];
      }
      if (type === "error") {
        return [
          {
            type: "error",
            message: str(o.message) ?? "Codex reported an error",
          },
        ];
      }
      return [];
    },
    finish: () => (ended ? [] : [...takeDenied(), { type: "done", ok: false }]),
  };
}

// ---- Gemini CLI ---------------------------------------------------------------

const DENIED_PATTERN =
  /denied|not allowed|permission|policy|rule which prevents/i;

export function geminiAdapter(): TurnAdapter {
  // Streamed assistant text between tool calls forms one message.
  let segment = 0;
  let ended = false;
  const tools = new Map<string, { name: string; title: string }>();
  const denied: { name: string; title: string }[] = [];

  return {
    push(line) {
      const o = obj(line);
      switch (o.type) {
        case "init": {
          const id = str(o.session_id);
          return id ? [{ type: "session", id, model: str(o.model) }] : [];
        }
        case "message": {
          if (o.role !== "assistant") return [];
          const text = str(o.content) ?? "";
          return [
            {
              type: "text",
              id: `gemini-${segment}`,
              text,
              final: o.delta !== true,
            },
          ];
        }
        case "tool_use": {
          segment += 1;
          const id = str(o.tool_id) ?? `tool-${segment}`;
          const name = str(o.tool_name) ?? "tool";
          const d = describeTool(name, o.parameters);
          tools.set(id, { name, title: d.title });
          return [{ type: "tool", id, name, ...d, status: "running" }];
        }
        case "tool_result": {
          const id = str(o.tool_id) ?? "tool";
          const ok = o.status === "success";
          const err = obj(o.error);
          const message = str(err.message);
          if (
            !ok &&
            DENIED_PATTERN.test(`${str(err.type) ?? ""} ${message ?? ""}`)
          ) {
            denied.push(tools.get(id) ?? { name: "tool", title: "tool" });
          }
          return [
            {
              type: "tool",
              id,
              name: "",
              title: "",
              status: ok ? "done" : "error",
              output: str(o.output) ?? message,
            },
          ];
        }
        case "error":
          return o.severity === "warning"
            ? []
            : [
                {
                  type: "error",
                  message: str(o.message) ?? "Gemini CLI reported an error",
                },
              ];
        case "result": {
          ended = true;
          const s = obj(o.stats);
          const ok = o.status !== "error";
          const out: ChatEvent[] = [];
          if (denied.length)
            out.push({ type: "denied", tools: denied.splice(0) });
          out.push({
            type: "usage",
            inputTokens: num(s.input_tokens),
            outputTokens: num(s.output_tokens),
          });
          if (!ok) {
            out.push({
              type: "error",
              message:
                str(obj(o.error).message) ?? "Gemini CLI stopped with an error",
            });
          }
          out.push({ type: "done", ok });
          return out;
        }
        default:
          return [];
      }
    },
    finish: () => (ended ? [] : [{ type: "done", ok: false }]),
  };
}

// ---- OpenCode -----------------------------------------------------------------

export function opencodeAdapter(): TurnAdapter {
  let session: string | undefined;
  let cost = 0;
  let input = 0;
  let output = 0;
  let sawStep = false;
  const denied: { name: string; title: string }[] = [];

  return {
    push(line) {
      const o = obj(line);
      const out: ChatEvent[] = [];
      const sid = str(o.sessionID);
      if (sid && sid !== session) {
        session = sid;
        out.push({ type: "session", id: sid });
      }
      const part = obj(o.part);
      switch (o.type) {
        case "text": {
          const text = str(part.text) ?? "";
          if (text)
            out.push({
              type: "text",
              id: str(part.id) ?? "text",
              text,
              final: true,
            });
          break;
        }
        case "tool_use": {
          const state = obj(part.state);
          const name = str(part.tool) ?? "tool";
          const d = describeTool(name, state.input);
          const status =
            state.status === "completed"
              ? "done"
              : state.status === "error"
                ? "error"
                : "running";
          const error = str(state.error);
          if (status === "error" && error && DENIED_PATTERN.test(error)) {
            denied.push({ name, title: d.title });
          }
          out.push({
            type: "tool",
            id: str(part.callID) ?? str(part.id) ?? "tool",
            name,
            title: str(state.title) ?? d.title,
            detail: d.detail,
            changes: d.changes,
            status,
            output: str(state.output) ?? error,
          });
          break;
        }
        case "step_finish": {
          sawStep = true;
          const t = obj(part.tokens);
          cost += num(part.cost) ?? 0;
          input += num(t.input) ?? 0;
          output += num(t.output) ?? 0;
          break;
        }
        case "error": {
          const e = obj(o.error);
          out.push({
            type: "error",
            message:
              str(obj(e.data).message) ??
              str(e.name) ??
              "OpenCode reported an error",
          });
          break;
        }
      }
      return out;
    },
    // `opencode run` has no end event; the process exit ends the turn.
    finish() {
      const out: ChatEvent[] = [];
      if (denied.length) out.push({ type: "denied", tools: denied.splice(0) });
      if (sawStep) {
        out.push({
          type: "usage",
          costUsd: cost || undefined,
          inputTokens: input,
          outputTokens: output,
        });
      }
      out.push({ type: "done", ok: true });
      return out;
    },
  };
}

export function createTurnAdapter(agent: ChatAgentId): TurnAdapter {
  switch (agent) {
    case "claude":
      return claudeAdapter();
    case "codex":
      return codexAdapter();
    case "gemini":
      return geminiAdapter();
    case "opencode":
      return opencodeAdapter();
  }
}

/** Names from a list of strings, without Claude Code's internal `__` ones. */
function names(v: unknown): string[] {
  return arr(v)
    .map(str)
    .filter((c): c is string => Boolean(c) && !c?.startsWith("__"));
}

/** What Claude Code's `init` event says about the session it started. */
export function claudeInfo(o: Obj): AgentInfo {
  return {
    version: str(o.claude_code_version),
    model: str(o.model),
    cwd: str(o.cwd),
    permissionMode: str(o.permissionMode),
    outputStyle: str(o.output_style),
    skills: names(o.skills),
    agents: names(o.agents),
    plugins: arr(o.plugins)
      .map((p) => str(obj(p).name))
      .filter((n): n is string => Boolean(n)),
    mcpServers: arr(o.mcp_servers)
      .map((m) => ({ name: str(obj(m).name), status: str(obj(m).status) }))
      .filter((m): m is { name: string; status: string } =>
        Boolean(m.name && m.status),
      ),
    terminalCommands: names(o.terminal_slash_commands),
  };
}
