/**
 * Agent chat mode: the agent-neutral model.
 *
 * Each agent's headless output is turned into ChatEvents by its adapter
 * (adapters/*.ts), and `applyChatEvent` folds events into the transcript.
 * Everything here is pure.
 */

export type ChatAgentId = "claude" | "codex" | "gemini" | "opencode";
export type ChatAccess = "read" | "edit" | "full";

export const CHAT_AGENTS: readonly ChatAgentId[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
];

export const CHAT_AGENT_LABEL: Record<ChatAgentId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};

/** A chat tab's title when it has no name of its own. */
export function chatTabDefaultTitle(
  agent: ChatAgentId,
  role?: "orchestrator",
): string {
  return role === "orchestrator" ? "Orchestrator" : CHAT_AGENT_LABEL[agent];
}

export const ACCESS_LABEL: Record<ChatAccess, string> = {
  read: "Read only",
  edit: "Edit files",
  full: "Full access",
};

export const ACCESS_HINT: Record<ChatAccess, string> = {
  read: "Reads and searches. Edits and commands that change things are refused.",
  edit: "Can edit files in this folder. Other commands stay restricted.",
  full: "Can edit files and run any command, without a sandbox.",
};

export type ToolStatus = "running" | "done" | "error";

/** What adapters emit. */
export type ChatEvent =
  | {
      type: "session";
      id: string;
      model?: string;
      /** Slash commands the agent accepts in headless mode. */
      commands?: string[];
    }
  /** Tokens currently in the model's context (Claude Code reports this). */
  | { type: "context"; tokens: number }
  /** Account usage windows (Claude Code's 5-hour and 7-day limits). */
  | { type: "limits"; windows: UsageWindow[] }
  /** Assistant text: `final` replaces the streamed text for the same id. */
  | { type: "text"; id: string; text: string; final: boolean }
  | {
      type: "tool";
      id: string;
      name: string;
      title: string;
      detail?: string;
      status: ToolStatus;
      output?: string;
    }
  /** Tool calls the agent's access level refused. */
  | { type: "denied"; tools: { name: string; title: string }[] }
  | {
      type: "usage";
      costUsd?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  | { type: "error"; message: string }
  /** A neutral note in the transcript (e.g. "Access raised"). */
  | { type: "info"; message: string }
  | { type: "done"; ok: boolean };

export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | {
      kind: "tool";
      id: string;
      name: string;
      title: string;
      detail?: string;
      status: ToolStatus;
      output?: string;
    }
  | {
      kind: "notice";
      id: string;
      tone: "denied" | "error" | "info";
      text: string;
      tools?: { name: string; title: string }[];
    };

/** Per-turn result the UI shows under the reply. */
export type TurnStats = {
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
};

/** One rolling usage limit: how much is used, and when it resets. */
export type UsageWindow = {
  id: "five_hour" | "seven_day";
  /** 0..1 of the window used. */
  utilization: number;
  /** Unix seconds. */
  resetsAt?: number;
};

/** Running totals for the whole chat. */
export type ChatTotals = {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  turns: number;
};

export const ZERO_TOTALS: ChatTotals = {
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  turns: 0,
};

export type Transcript = {
  items: ChatItem[];
  sessionId?: string;
  /** Model the agent reported using. */
  model?: string;
  /** Tokens in the model's context after the latest reply, when known. */
  contextTokens?: number;
  totals: ChatTotals;
  /** Usage of the latest turn. */
  stats?: TurnStats;
  /** The latest turn had refused tool calls. */
  denied: boolean;
};

export const EMPTY_TRANSCRIPT: Transcript = {
  items: [],
  denied: false,
  totals: ZERO_TOTALS,
};

/** Tool output kept per call: enough to read, bounded for long sessions. */
export const MAX_TOOL_OUTPUT = 8 * 1024;
/** Items kept per chat (oldest dropped first). */
export const MAX_ITEMS = 400;

export function clip(text: string, max = MAX_TOOL_OUTPUT): string {
  return text.length <= max
    ? text
    : `${text.slice(0, max)}\n… (${text.length - max} more characters)`;
}

function upsert(items: ChatItem[], item: ChatItem): ChatItem[] {
  const i = items.findIndex((x) => x.kind === item.kind && x.id === item.id);
  if (i < 0) return [...items, item];
  const next = items.slice();
  next[i] = item;
  return next;
}

function cap(items: ChatItem[]): ChatItem[] {
  return items.length > MAX_ITEMS
    ? items.slice(items.length - MAX_ITEMS)
    : items;
}

export function applyChatEvent(t: Transcript, e: ChatEvent): Transcript {
  switch (e.type) {
    case "session":
      return t.sessionId === e.id && (!e.model || t.model === e.model)
        ? t
        : { ...t, sessionId: e.id, model: e.model ?? t.model };
    case "context":
      return t.contextTokens === e.tokens
        ? t
        : { ...t, contextTokens: e.tokens };
    case "text": {
      if (!e.text && !e.final) return t;
      const prev = t.items.find(
        (x): x is Extract<ChatItem, { kind: "assistant" }> =>
          x.kind === "assistant" && x.id === e.id,
      );
      // Streamed deltas append; the final text replaces them.
      const text = e.final ? e.text : (prev?.text ?? "") + e.text;
      if (!text) return t;
      return {
        ...t,
        items: cap(
          upsert(t.items, {
            kind: "assistant",
            id: e.id,
            text,
            streaming: !e.final,
          }),
        ),
      };
    }
    case "tool": {
      const prev = t.items.find(
        (x): x is Extract<ChatItem, { kind: "tool" }> =>
          x.kind === "tool" && x.id === e.id,
      );
      return {
        ...t,
        items: cap(
          upsert(t.items, {
            kind: "tool",
            id: e.id,
            name: e.name || prev?.name || "tool",
            title: e.title || prev?.title || e.name,
            detail: e.detail ?? prev?.detail,
            status: e.status,
            output: e.output !== undefined ? clip(e.output) : prev?.output,
          }),
        ),
      };
    }
    case "denied": {
      if (e.tools.length === 0) return t;
      return {
        ...t,
        denied: true,
        items: cap([
          ...t.items,
          {
            kind: "notice",
            id: `denied-${t.items.length}`,
            tone: "denied",
            text:
              e.tools.length === 1
                ? "1 action was blocked by this chat's access level."
                : `${e.tools.length} actions were blocked by this chat's access level.`,
            tools: e.tools,
          },
        ]),
      };
    }
    case "usage":
      return {
        ...t,
        stats: {
          costUsd: e.costUsd,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
        },
        totals: {
          ...t.totals,
          costUsd: t.totals.costUsd + (e.costUsd ?? 0),
          inputTokens: t.totals.inputTokens + (e.inputTokens ?? 0),
          outputTokens: t.totals.outputTokens + (e.outputTokens ?? 0),
        },
      };
    case "info":
      return {
        ...t,
        items: cap([
          ...t.items,
          {
            kind: "notice",
            id: `info-${t.items.length}`,
            tone: "info",
            text: e.message,
          },
        ]),
      };
    case "error":
      return {
        ...t,
        items: cap([
          ...t.items,
          {
            kind: "notice",
            id: `error-${t.items.length}`,
            tone: "error",
            text: e.message,
          },
        ]),
      };
    case "done":
      // A turn ends: nothing is streaming any more, and unfinished tools stop.
      return {
        ...t,
        totals: { ...t.totals, turns: t.totals.turns + 1 },
        items: t.items.map((x) =>
          x.kind === "assistant" && x.streaming
            ? { ...x, streaming: false }
            : x.kind === "tool" && x.status === "running"
              ? { ...x, status: e.ok ? "done" : "error" }
              : x,
        ),
      };
    default:
      return t;
  }
}

/** Starts a turn: records the user's message and clears last turn's flags. */
export function beginTurn(t: Transcript, id: string, text: string): Transcript {
  return {
    ...t,
    denied: false,
    stats: undefined,
    items: cap([...t.items, { kind: "user", id, text }]),
  };
}

/** Prompt used to retry after access was raised. */
export function retryPrompt(access: ChatAccess): string {
  return `Your access was raised to "${ACCESS_LABEL[access]}". Please retry the actions that were blocked and continue.`;
}

/** Shortens a shell wrapper like `/bin/bash -lc 'ls -la'` to `ls -la`. */
export function unwrapShell(command: string): string {
  const m =
    /^(?:\/(?:usr\/)?bin\/)?(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1$/.exec(
      command.trim(),
    );
  return m ? m[2] : command;
}

export function oneLine(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Turns a tool's input into a short title and a detail line. */
export function describeTool(
  name: string,
  input: unknown,
): { title: string; detail?: string } {
  const o = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const str = (k: string) =>
    typeof o[k] === "string" ? (o[k] as string) : undefined;
  const lower = name.toLowerCase();
  const command = str("command") ?? str("cmd");
  if (command)
    return {
      title: str("description") ?? "Ran a command",
      detail: unwrapShell(command),
    };
  const path =
    str("file_path") ?? str("filePath") ?? str("path") ?? str("absolute_path");
  if (path) {
    const verb = /write|create/.test(lower)
      ? "Wrote"
      : /edit|replace|patch/.test(lower)
        ? "Edited"
        : /read|view|cat/.test(lower)
          ? "Read"
          : name;
    return { title: `${verb} ${basename(path)}`, detail: path };
  }
  const pattern = str("pattern") ?? str("query");
  if (pattern) return { title: `${name}: ${oneLine(pattern, 60)}` };
  const url = str("url");
  if (url) return { title: `${name}: ${oneLine(url, 80)}` };
  return { title: name };
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
