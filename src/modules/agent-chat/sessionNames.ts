// Estate file; not part of Terax.
/**
 * Names the user gives agent sessions, by renaming a chat tab or a session in
 * the sidebar. One name per session, shared by every tab that shows it.
 * Kept in local storage; the agent's own session files are never touched.
 */
import { create } from "zustand";
import type { ChatAgentId } from "./model";

const KEY = "estate:agent-session-names";
/** Oldest names drop first past this, so the map stays small. */
export const MAX_NAMES = 500;
const MAX_LENGTH = 120;

export function sessionKey(agent: ChatAgentId, sessionId: string): string {
  return `${agent}:${sessionId}`;
}

/** The map with `key` set to `name` ("" removes it), newest last. */
export function withName(
  names: Readonly<Record<string, string>>,
  key: string,
  name: string,
  max = MAX_NAMES,
): Record<string, string> {
  const next = { ...names };
  delete next[key];
  const clean = name.trim().slice(0, MAX_LENGTH);
  if (clean) next[key] = clean;
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) delete next[k];
  return next;
}

function read(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

type State = {
  names: Record<string, string>;
  setName: (agent: ChatAgentId, sessionId: string, name: string) => void;
};

export const useSessionNames = create<State>((set, get) => ({
  names: read(),
  setName(agent, sessionId, name) {
    const names = withName(get().names, sessionKey(agent, sessionId), name);
    set({ names });
    try {
      localStorage.setItem(KEY, JSON.stringify(names));
    } catch {
      // Storage off: the name lasts until restart.
    }
  },
}));

export function useSessionName(
  agent: ChatAgentId,
  sessionId: string | undefined,
): string | undefined {
  return useSessionNames((s) =>
    sessionId ? s.names[sessionKey(agent, sessionId)] : undefined,
  );
}

export type TitleState = {
  /** The session the tab shows (undefined before its first turn). */
  sessionId: string | undefined;
  title: string;
  /** The session's saved name. */
  name: string | undefined;
};

/**
 * Keeps a chat tab's title and its session's name the same. `prev` is the
 * last state seen (null on the first). Returns the tab title to set and/or
 * the name to save ("" deletes it).
 */
export function syncChatTitle(
  prev: TitleState | null,
  cur: TitleState,
  defaultTitle: string,
): { setTitle?: string; saveName?: string } {
  const { sessionId, title, name } = cur;
  const adopt = () =>
    name !== undefined && name !== title ? { setTitle: name } : {};
  const reset = () =>
    title !== defaultTitle ? { setTitle: defaultTitle } : {};

  // First look, or the tab's first session: the session's name wins; a name
  // given to the tab beforehand becomes the session's.
  if (!prev || (prev.sessionId === undefined && sessionId !== undefined)) {
    if (sessionId === undefined) return {};
    if (name !== undefined) return adopt();
    return title !== defaultTitle ? { saveName: title } : {};
  }
  if (prev.sessionId !== sessionId) {
    // New session, or another session opened: the tab takes its name.
    if (sessionId === undefined) return reset();
    return name !== undefined ? adopt() : reset();
  }
  if (sessionId === undefined) return {};
  if (title !== prev.title) {
    // The tab was renamed; clearing it back to the default clears the name.
    if (title === defaultTitle)
      return name !== undefined ? { saveName: "" } : {};
    return title !== name ? { saveName: title } : {};
  }
  if (name !== prev.name) {
    // The session was renamed (sidebar or another tab).
    return name !== undefined ? adopt() : reset();
  }
  return {};
}
