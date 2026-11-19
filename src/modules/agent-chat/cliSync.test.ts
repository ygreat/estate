import { describe, expect, it } from "vitest";
import { cliSyncMessage, cliSyncTarget } from "./cliSync";

describe("cliSyncTarget", () => {
  it("returns the session of a Claude chat", () => {
    expect(
      cliSyncTarget({
        agent: "claude",
        cwd: "/w",
        transcript: { sessionId: "abc-1" },
      }),
    ).toEqual({ cwd: "/w", sessionId: "abc-1" });
  });

  it("skips other agents, chats without a session and non-chats", () => {
    expect(
      cliSyncTarget({
        agent: "codex",
        cwd: "/w",
        transcript: { sessionId: "x" },
      }),
    ).toBeNull();
    expect(
      cliSyncTarget({ agent: "claude", cwd: "/w", transcript: {} }),
    ).toBeNull();
    expect(
      cliSyncTarget({
        agent: "claude",
        cwd: "",
        transcript: { sessionId: "x" },
      }),
    ).toBeNull();
    expect(cliSyncTarget(null)).toBeNull();
    expect(cliSyncTarget(undefined)).toBeNull();
    // Saved-store entries that aren't chats (limits, commands, info).
    expect(
      cliSyncTarget({ windows: [] } as unknown as Parameters<
        typeof cliSyncTarget
      >[0]),
    ).toBeNull();
  });
});

describe("cliSyncTarget title", () => {
  const chat = {
    agent: "claude" as const,
    cwd: "/w",
    transcript: { sessionId: "abc-1" },
  };

  it("takes the chat's session name as the title", () => {
    expect(
      cliSyncTarget(chat, { "claude:abc-1": "Landing Page Design" }),
    ).toEqual({ cwd: "/w", sessionId: "abc-1", title: "Landing Page Design" });
  });

  it("has no title for an unnamed session or another agent's name", () => {
    expect(cliSyncTarget(chat, {})).toEqual({ cwd: "/w", sessionId: "abc-1" });
    expect(cliSyncTarget(chat, { "codex:abc-1": "Other" })).toEqual({
      cwd: "/w",
      sessionId: "abc-1",
    });
  });
});

describe("cliSyncMessage", () => {
  it("tells a fresh sync from one with nothing left to do", () => {
    expect(
      cliSyncMessage({ patched: 3, already: false, titled: false }),
    ).toContain("now");
    expect(
      cliSyncMessage({ patched: 0, already: true, titled: false }),
    ).toContain("already");
  });

  it("names the session, and a new title counts as a change", () => {
    expect(
      cliSyncMessage({ patched: 0, already: true, titled: true }, "Pricing"),
    ).toBe("This session now shows in claude --resume as “Pricing”.");
  });
});
