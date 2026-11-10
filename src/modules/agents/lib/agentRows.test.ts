import { describe, expect, it } from "vitest";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import { attentionCount, buildAgentRows } from "./agentRows";
import type { AgentSession } from "./types";

const term = (id: number, leaf: number, cwd: string): Tab => ({
  id,
  kind: "terminal",
  spaceId: "s1",
  title: "shell",
  cwd,
  paneTree: { kind: "leaf", id: leaf, cwd },
  activeLeafId: leaf,
});

const chat = (id: number, chatId: string): Tab => ({
  id,
  kind: "agent-chat",
  spaceId: "s2",
  title: "Claude Code",
  chatId,
  agent: "claude",
  cwd: "/p/app",
});

const session = (
  leafId: number,
  tabId: number,
  status: AgentSession["status"],
  extra: Partial<AgentSession> = {},
): AgentSession => ({
  leafId,
  tabId,
  agent: "claude",
  status,
  startedAt: 0,
  lastActivityAt: 10,
  attentionSince: null,
  ...extra,
});

describe("buildAgentRows", () => {
  const tabs = [
    term(1, 11, "/p/api"),
    term(2, 22, "/p/web"),
    term(3, 33, "/p/docs"),
    chat(4, "c1"),
    chat(5, "c2"),
  ];
  const sessions = {
    11: session(11, 1, "working", { lastActivityAt: 100 }),
    22: session(22, 2, "waiting", {
      waitingReason: "attention",
      attentionSince: 200,
    }),
    33: session(33, 3, "waiting", {
      waitingReason: "finished",
      attentionSince: 300,
    }),
  };
  const rows = buildAgentRows(tabs, sessions, {
    c1: { running: true, hasMessages: true },
    c2: { running: false, hasMessages: false },
  });

  it("colours terminal agents and chats by state, needs-you first", () => {
    expect(rows.map((r) => [r.key, r.state])).toEqual([
      ["terminal:22", "attention"],
      ["terminal:11", "working"],
      ["chat:c1", "working"],
      ["terminal:33", "idle"],
      ["chat:c2", "ready"],
    ]);
  });

  it("shows a chat refused by its access level as blocked, not idle", () => {
    const state = (c: { running: boolean; blocked: boolean }) =>
      buildAgentRows(tabs, {}, { c1: { ...c, hasMessages: true } }).find(
        (r) => r.key === "chat:c1",
      )?.state;
    expect(state({ running: false, blocked: true })).toBe("blocked");
    // Retrying starts a new turn: working, whatever the last one hit.
    expect(state({ running: true, blocked: true })).toBe("working");
    expect(state({ running: false, blocked: false })).toBe("idle");
  });

  it("names rows by tab and folder, and keeps their space", () => {
    const api = rows.find((r) => r.key === "terminal:11");
    expect(api).toMatchObject({
      title: "api",
      folder: "api",
      spaceId: "s1",
      tabId: 1,
      leafId: 11,
    });
    const c1 = rows.find((r) => r.key === "chat:c1");
    expect(c1).toMatchObject({
      kind: "chat",
      folder: "app",
      spaceId: "s2",
      leafId: null,
    });
  });

  it("treats an older waiting agent without a reason as needing the user", () => {
    const r = buildAgentRows(
      [term(1, 11, "/p")],
      { 11: session(11, 1, "waiting") },
      {},
    );
    expect(r[0].state).toBe("attention");
  });

  it("skips agents whose tab closed and counts who needs you", () => {
    expect(buildAgentRows([], sessions, {})).toEqual([]);
    expect(attentionCount(rows)).toBe(1);
  });
});
