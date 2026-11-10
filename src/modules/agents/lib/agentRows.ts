/**
 * Estate: the rows of the Agents sidebar panel. Pure.
 *
 * Every CLI agent the user has going: terminal agents (from the agent store,
 * fed by hooks and OSC 133) and agent chats (from the chat tabs and their
 * running state), with a state the panel colours.
 */
import type { Tab } from "@/modules/tabs/lib/useTabs";
import { labelFor } from "@/modules/tabs/lib/tabLabel";
import type { AgentSession } from "./types";

export type AgentRowState =
  | "attention"
  | "blocked"
  | "working"
  | "idle"
  | "ready";

export type AgentRow = {
  key: string;
  kind: "terminal" | "chat";
  /** Agent name as detected ("claude", "codex"...). */
  agent: string;
  title: string;
  folder: string | null;
  spaceId: string;
  state: AgentRowState;
  /** When the state last changed, if known (ms). */
  since: number | null;
  tabId: number;
  leafId: number | null;
};

/** What the panel needs to know about a chat. */
export type ChatActivity = {
  running: boolean;
  hasMessages: boolean;
  /** Its last turn had actions refused by the chat's access level. */
  blocked?: boolean;
};

const ORDER: Record<AgentRowState, number> = {
  attention: 0,
  blocked: 1,
  working: 2,
  idle: 3,
  ready: 4,
};

export const AGENT_STATE_LABEL: Record<AgentRowState, string> = {
  attention: "Needs you",
  blocked: "Blocked",
  working: "Working",
  idle: "Idle",
  ready: "Ready",
};

function basename(path: string | undefined): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function buildAgentRows(
  tabs: readonly Tab[],
  sessions: Readonly<Record<number, AgentSession>>,
  chats: Readonly<Record<string, ChatActivity>>,
): AgentRow[] {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const rows: AgentRow[] = [];

  for (const s of Object.values(sessions)) {
    const tab = byId.get(s.tabId);
    if (!tab) continue;
    const state: AgentRowState =
      s.status === "working"
        ? "working"
        : s.waitingReason === "finished"
          ? "idle"
          : "attention";
    rows.push({
      key: `terminal:${s.leafId}`,
      kind: "terminal",
      agent: s.agent,
      title: labelFor(tab),
      folder: tab.kind === "terminal" ? basename(tab.cwd) : null,
      spaceId: tab.spaceId,
      state,
      since:
        state === "working"
          ? s.lastActivityAt
          : (s.attentionSince ?? s.lastActivityAt),
      tabId: tab.id,
      leafId: s.leafId,
    });
  }

  for (const tab of tabs) {
    if (tab.kind !== "agent-chat") continue;
    const chat = chats[tab.chatId];
    // Estate: a chat whose last turn was refused waits for more access.
    const state: AgentRowState = chat?.running
      ? "working"
      : chat?.blocked
        ? "blocked"
        : chat?.hasMessages
          ? "idle"
          : "ready";
    rows.push({
      key: `chat:${tab.chatId}`,
      kind: "chat",
      agent: tab.agent,
      title: labelFor(tab),
      folder: basename(tab.cwd),
      spaceId: tab.spaceId,
      state,
      since: null,
      tabId: tab.id,
      leafId: null,
    });
  }

  return rows.sort(
    (a, b) =>
      ORDER[a.state] - ORDER[b.state] || (b.since ?? 0) - (a.since ?? 0),
  );
}

/** How many agents are waiting on the user (the rail badge). */
export function attentionCount(rows: readonly AgentRow[]): number {
  return rows.filter((r) => r.state === "attention").length;
}
