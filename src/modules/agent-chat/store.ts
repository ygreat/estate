import { Channel, invoke } from "@tauri-apps/api/core";
import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { createTurnAdapter } from "./adapters";
import {
  ACCESS_LABEL,
  applyChatEvent,
  beginTurn,
  type ChatAccess,
  type ChatAgentId,
  type ChatEvent,
  CHAT_AGENT_LABEL,
  EMPTY_TRANSCRIPT,
  retryPrompt,
  type Transcript,
} from "./model";

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
  transcript: Transcript;
  running: boolean;
  /** Loaded from disk (or confirmed new), so saving can't clobber history. */
  loaded: boolean;
};

type State = {
  chats: Record<string, ChatSession>;
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
type Saved = Pick<ChatSession, "agent" | "cwd" | "access" | "model"> & {
  transcript: Pick<Transcript, "items" | "sessionId">;
};

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
        transcript: {
          items: c.transcript.items,
          sessionId: c.transcript.sessionId,
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

function applyEvents(id: string, events: ChatEvent[]) {
  if (events.length === 0) return;
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

  open(id, init) {
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
                transcript: {
                  ...EMPTY_TRANSCRIPT,
                  items: Array.isArray(saved.transcript?.items)
                    ? saved.transcript.items
                    : [],
                  sessionId: saved.transcript?.sessionId,
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

    try {
      await invoke("agent_chat_run", {
        request: {
          chatId: id,
          agent: chat.agent,
          access: get().chats[id]?.access ?? chat.access,
          sessionId: chat.transcript.sessionId ?? null,
          model: chat.model ?? null,
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
    void invoke("agent_chat_cancel", { chatId: id }).catch(() => {});
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
