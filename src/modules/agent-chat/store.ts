import { Channel, invoke } from "@tauri-apps/api/core";
import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { createTurnAdapter } from "./adapters";
import { transcriptFromHistory } from "./history";
import {
  ACCESS_LABEL,
  type AgentInfo,
  appendLocal,
  applyChatEvent,
  beginTurn,
  type ChatAccess,
  type ChatAgentId,
  type ChatEvent,
  CHAT_AGENT_LABEL,
  EMPTY_TRANSCRIPT,
  ZERO_TOTALS,
  retryPrompt,
  type Transcript,
  type UsageWindow,
} from "./model";
import {
  type ChatEffort,
  effectiveEffort,
  effortsFor,
  isEffort,
  loadAgentModels,
} from "./effort";

/** Mirrors `ChatStreamEvent` in src-tauri/src/modules/agent_chat.rs. */
type StreamEvent =
  | { kind: "line"; line: string }
  | { kind: "dropped"; bytes: number }
  | { kind: "exit"; code: number | null; cancelled: boolean; stderr: string };

export type ChatSession = {
  agent: ChatAgentId;
  cwd: string;
  access: ChatAccess;
  model?: string;
  /** Estate: effort level; unset is the agent's default. */
  effort?: ChatEffort;
  transcript: Transcript;
  running: boolean;
  /** Loaded from disk (or confirmed new), so saving can't clobber history. */
  loaded: boolean;
};

/** Latest account usage limits an agent reported (shared by its chats). */
export type AgentLimits = { windows: UsageWindow[]; at: number };

type State = {
  chats: Record<string, ChatSession>;
  limits: Partial<Record<ChatAgentId, AgentLimits>>;
  /** Slash commands each agent reported, for the composer's menu. */
  commands: Partial<Record<ChatAgentId, string[]>>;
  /** What each agent last reported about itself at startup (`/status`). */
  info: Partial<Record<ChatAgentId, AgentInfo>>;
  /** Shows a command Estate answered itself; nothing is sent to the agent. */
  showLocal: (id: string, command: string, markdown: string) => void;
  setModel: (id: string, model: string | undefined) => void;
  setEffort: (id: string, effort: ChatEffort | undefined) => void;
  /** Starts a fresh agent session in this chat (like /clear). */
  newSession: (id: string) => void;
  /** Shows a saved agent session in this chat and continues it. */
  openSession: (id: string, sessionId: string) => Promise<void>;
  /** Creates the chat in memory (if new) and loads its saved transcript. */
  open: (id: string, init: { agent: ChatAgentId; cwd: string }) => void;
  send: (id: string, text: string) => Promise<void>;
  cancel: (id: string) => void;
  setAccess: (id: string, access: ChatAccess) => void;
  /** Raises access and asks the agent to retry what was blocked. */
  retryWithAccess: (id: string, access: ChatAccess) => Promise<void>;
};

// ---- Persistence ----------------------------------------------------------

const disk = new LazyStore("estate-agent-chats.json", {
  defaults: {},
  autoSave: 1000,
});
type Saved = Pick<
  ChatSession,
  "agent" | "cwd" | "access" | "model" | "effort"
> & {
  transcript: Pick<Transcript, "items" | "sessionId" | "model" | "totals">;
};

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Chats whose Stop was pressed during the current turn (see `send`). */
const stopRequested = new Set<string>();
function scheduleSave(id: string) {
  const prev = saveTimers.get(id);
  if (prev) clearTimeout(prev);
  saveTimers.set(
    id,
    setTimeout(() => {
      saveTimers.delete(id);
      const c = useAgentChatStore.getState().chats[id];
      if (!c?.loaded) return;
      const saved: Saved = {
        agent: c.agent,
        cwd: c.cwd,
        access: c.access,
        model: c.model,
        effort: c.effort,
        transcript: {
          items: c.transcript.items,
          sessionId: c.transcript.sessionId,
          model: c.transcript.model,
          totals: c.transcript.totals,
        },
      };
      void disk.set(id, saved).catch(() => {});
    }, 1500),
  );
}

/** Forgets a chat's saved transcript (when its tab closes). */
export function deleteSavedChat(id: string): void {
  useAgentChatStore.getState().cancel(id);
  void disk.delete(id).catch(() => {});
  useAgentChatStore.setState((s) => {
    const { [id]: _gone, ...rest } = s.chats;
    return { chats: rest };
  });
}

// ---- Store ------------------------------------------------------------------

function updateChat(id: string, fn: (c: ChatSession) => ChatSession) {
  useAgentChatStore.setState((s) => {
    const c = s.chats[id];
    return c ? { chats: { ...s.chats, [id]: fn(c) } } : s;
  });
}

const LIMITS_KEY = "__limits__";
const COMMANDS_KEY = "__commands__";
const INFO_KEY = "__info__";
let limitsLoaded = false;

/** Loads saved limits once, so a new chat shows them before its first reply. */
function loadLimits() {
  if (limitsLoaded) return;
  limitsLoaded = true;
  void disk
    .get<State["limits"]>(LIMITS_KEY)
    .catch(() => undefined)
    .then((saved) => {
      if (!saved || typeof saved !== "object") return;
      useAgentChatStore.setState((s) => ({
        limits: { ...saved, ...s.limits },
      }));
    });
  void disk
    .get<State["info"]>(INFO_KEY)
    .catch(() => undefined)
    .then((saved) => {
      if (!saved || typeof saved !== "object") return;
      useAgentChatStore.setState((s) => ({ info: { ...saved, ...s.info } }));
    });
  void disk
    .get<State["commands"]>(COMMANDS_KEY)
    .catch(() => undefined)
    .then((saved) => {
      if (!saved || typeof saved !== "object") return;
      useAgentChatStore.setState((s) => ({
        commands: { ...saved, ...s.commands },
      }));
    });
}

function recordCommands(agent: ChatAgentId, events: ChatEvent[]) {
  for (const e of events) {
    if (e.type !== "session" || !e.commands?.length) continue;
    const list = e.commands;
    useAgentChatStore.setState((s) => ({
      commands: { ...s.commands, [agent]: list },
    }));
    void disk
      .set(COMMANDS_KEY, useAgentChatStore.getState().commands)
      .catch(() => {});
  }
}

function recordInfo(agent: ChatAgentId, events: ChatEvent[]) {
  for (const e of events) {
    if (e.type !== "session" || !e.info) continue;
    const info = e.info;
    useAgentChatStore.setState((s) => ({ info: { ...s.info, [agent]: info } }));
    void disk.set(INFO_KEY, useAgentChatStore.getState().info).catch(() => {});
  }
}

function recordLimits(agent: ChatAgentId, events: ChatEvent[]) {
  let windows: UsageWindow[] | undefined;
  for (const e of events) if (e.type === "limits") windows = e.windows;
  if (!windows) return;
  const entry: AgentLimits = { windows, at: Date.now() };
  useAgentChatStore.setState((s) => ({
    limits: { ...s.limits, [agent]: entry },
  }));
  void disk
    .set(LIMITS_KEY, useAgentChatStore.getState().limits)
    .catch(() => {});
}

function applyEvents(id: string, events: ChatEvent[]) {
  if (events.length === 0) return;
  const agent = useAgentChatStore.getState().chats[id]?.agent;
  if (agent) {
    recordLimits(agent, events);
    recordCommands(agent, events);
    recordInfo(agent, events);
  }
  updateChat(id, (c) => ({
    ...c,
    transcript: events.reduce(applyChatEvent, c.transcript),
  }));
}

/** Token deltas arrive many per frame; apply them once per frame. */
function frameBatcher(id: string) {
  let queue: ChatEvent[] = [];
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const events = queue;
    queue = [];
    applyEvents(id, events);
  };
  return {
    add(events: ChatEvent[]) {
      if (events.length === 0) return;
      queue.push(...events);
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    },
    flush,
  };
}

function stderrSummary(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.slice(-4).join("\n");
}

export const useAgentChatStore = create<State>((set, get) => ({
  chats: {},
  limits: {},
  commands: {},
  info: {},

  showLocal(id, command, markdown) {
    updateChat(id, (c) => ({
      ...c,
      transcript: appendLocal(
        c.transcript,
        `local-${Date.now().toString(36)}`,
        command,
        markdown,
      ),
    }));
  },

  open(id, init) {
    loadLimits();
    if (get().chats[id]) return;
    set((s) => ({
      chats: {
        ...s.chats,
        [id]: {
          agent: init.agent,
          cwd: init.cwd,
          access: "read",
          transcript: EMPTY_TRANSCRIPT,
          running: false,
          loaded: false,
        },
      },
    }));
    void disk
      .get<Saved>(id)
      .catch(() => undefined)
      .then((saved) => {
        updateChat(id, (c) =>
          saved && !c.loaded && c.transcript.items.length === 0
            ? {
                ...c,
                access: saved.access ?? c.access,
                model: saved.model,
                effort: isEffort(saved.effort) ? saved.effort : undefined,
                transcript: {
                  ...EMPTY_TRANSCRIPT,
                  items: Array.isArray(saved.transcript?.items)
                    ? saved.transcript.items
                    : [],
                  sessionId: saved.transcript?.sessionId,
                  model: saved.transcript?.model,
                  totals: { ...ZERO_TOTALS, ...saved.transcript?.totals },
                },
                loaded: true,
              }
            : { ...c, loaded: true },
        );
      });
  },

  async send(id, text) {
    const chat = get().chats[id];
    const prompt = text.trim();
    if (!chat || chat.running || !prompt) return;
    stopRequested.delete(id);
    updateChat(id, (c) => ({
      ...c,
      running: true,
      transcript: beginTurn(
        c.transcript,
        `user-${Date.now().toString(36)}`,
        prompt,
      ),
    }));

    const adapter = createTurnAdapter(chat.agent);
    const batch = frameBatcher(id);
    const channel = new Channel<StreamEvent>();
    let failedParse = 0;
    channel.onmessage = (event) => {
      if (event.kind === "line") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.line);
        } catch {
          failedParse += 1;
          return;
        }
        batch.add(adapter.push(parsed));
        return;
      }
      if (event.kind === "dropped") return;
      // exit
      batch.add(adapter.finish());
      batch.flush();
      const current = get().chats[id];
      const hadError = current?.transcript.items.some(
        (i) => i.kind === "notice" && i.tone === "error",
      );
      const extra: ChatEvent[] = [];
      if (event.cancelled) {
        extra.push({ type: "info", message: "Stopped." });
      } else if (event.code !== 0 && event.code !== null && !hadError) {
        const why = stderrSummary(event.stderr);
        extra.push({
          type: "error",
          message: `${CHAT_AGENT_LABEL[chat.agent]} exited with code ${event.code}${why ? `:\n${why}` : "."}`,
        });
      } else if (
        failedParse > 0 &&
        current?.transcript.items[current.transcript.items.length - 1]?.kind ===
          "user"
      ) {
        extra.push({
          type: "error",
          message: `${CHAT_AGENT_LABEL[chat.agent]} returned output Estate couldn't read. This agent version may not support chat mode; try it in a terminal.`,
        });
      }
      applyEvents(id, extra);
      updateChat(id, (c) => ({ ...c, running: false }));
      scheduleSave(id);
    };

    // Estate: an effort level the chosen model doesn't take isn't sent.
    const effort = effectiveEffort(
      chat.effort,
      effortsFor(chat.agent, chat.model, await loadAgentModels(chat.agent)),
    );
    // Stop pressed while the models loaded: the backend had no run to cancel,
    // so don't start one.
    if (stopRequested.delete(id)) {
      applyEvents(id, [
        { type: "info", message: "Stopped." },
        { type: "done", ok: false },
      ]);
      updateChat(id, (c) => ({ ...c, running: false }));
      scheduleSave(id);
      return;
    }

    try {
      await invoke("agent_chat_run", {
        request: {
          chatId: id,
          agent: chat.agent,
          access: get().chats[id]?.access ?? chat.access,
          sessionId: chat.transcript.sessionId ?? null,
          model: chat.model ?? null,
          effort: effort ?? null,
          prompt,
          cwd: chat.cwd,
        },
        onEvent: channel,
      });
    } catch (err) {
      applyEvents(id, [
        { type: "error", message: String(err) },
        { type: "done", ok: false },
      ]);
      updateChat(id, (c) => ({ ...c, running: false }));
      scheduleSave(id);
    }
  },

  cancel(id) {
    if (!get().chats[id]?.running) return;
    // Estate: remembered in case the run hasn't been started yet.
    stopRequested.add(id);
    void invoke("agent_chat_cancel", { chatId: id }).catch(() => {});
  },

  setModel(id, model) {
    const next = model?.trim() || undefined;
    updateChat(id, (c) => (c.model === next ? c : { ...c, model: next }));
    scheduleSave(id);
  },

  setEffort(id, effort) {
    updateChat(id, (c) => (c.effort === effort ? c : { ...c, effort }));
    scheduleSave(id);
  },

  newSession(id) {
    const chat = get().chats[id];
    if (!chat || chat.running) return;
    updateChat(id, (c) => ({
      ...c,
      transcript: {
        ...EMPTY_TRANSCRIPT,
        items: [
          {
            kind: "notice",
            id: `info-new-${Date.now()}`,
            tone: "info",
            text: "New session started.",
          },
        ],
      },
    }));
    scheduleSave(id);
  },

  async openSession(id, sessionId) {
    const chat = get().chats[id];
    if (!chat || chat.running) return;
    if (chat.transcript.sessionId === sessionId) return;
    try {
      const history = await invoke<{ lines: string[]; truncated: boolean }>(
        "agent_chat_session_history",
        { agent: chat.agent, cwd: chat.cwd, sessionId },
      );
      const transcript = transcriptFromHistory(history.lines, sessionId);
      const items = history.truncated
        ? [
            {
              kind: "notice" as const,
              id: "history-truncated",
              tone: "info" as const,
              text: "Earlier messages of this session aren't shown.",
            },
            ...transcript.items,
          ]
        : transcript.items;
      updateChat(id, (c) =>
        c.running ? c : { ...c, transcript: { ...transcript, items } },
      );
      scheduleSave(id);
    } catch (err) {
      applyEvents(id, [{ type: "error", message: String(err) }]);
    }
  },

  setAccess(id, access) {
    updateChat(id, (c) => (c.access === access ? c : { ...c, access }));
    scheduleSave(id);
  },

  async retryWithAccess(id, access) {
    get().setAccess(id, access);
    applyEvents(id, [
      { type: "info", message: `Access raised to ${ACCESS_LABEL[access]}.` },
    ]);
    await get().send(id, retryPrompt(access));
  },
}));

/** Which agents are installed, asked once per app session. */
let available: Promise<ChatAgentId[]> | null = null;
export function availableChatAgents(): Promise<ChatAgentId[]> {
  available ??= invoke<ChatAgentId[]>("agent_chat_available").catch(() => []);
  return available;
}

/** A saved agent session for a folder (from `agent_chat_sessions`). */
export type SessionSummary = {
  id: string;
  title: string | null;
  lastPrompt: string | null;
  branch: string | null;
  modifiedMs: number;
  bytes: number;
};

export function listChatSessions(
  agent: ChatAgentId,
  cwd: string,
  limit?: number,
): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("agent_chat_sessions", { agent, cwd, limit });
}
