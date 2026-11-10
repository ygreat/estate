import { describe, expect, it, vi } from "vitest";
import {
  anyAgentHasSession,
  projectHasSession,
  workTabCount,
} from "./projectSession";

describe("projectHasSession", () => {
  it("counts work tabs without reading the folder", async () => {
    const hasSessions = vi.fn(async () => false);
    await expect(
      projectHasSession({ workTabs: 2, root: "/p", hasSessions }),
    ).resolves.toBe(true);
    expect(hasSessions).not.toHaveBeenCalled();
  });

  it("counts agent sessions in the folder", async () => {
    await expect(
      projectHasSession({
        workTabs: 0,
        root: "/p",
        hasSessions: async () => true,
      }),
    ).resolves.toBe(true);
  });

  it("is fresh with no work tabs and no sessions", async () => {
    await expect(
      projectHasSession({
        workTabs: 0,
        root: "/p",
        hasSessions: async () => false,
      }),
    ).resolves.toBe(false);
  });

  it("is fresh without a folder", async () => {
    const hasSessions = vi.fn(async () => true);
    await expect(
      projectHasSession({ workTabs: 0, root: null, hasSessions }),
    ).resolves.toBe(false);
    expect(hasSessions).not.toHaveBeenCalled();
  });

  it("treats a failed session check as none", async () => {
    await expect(
      projectHasSession({
        workTabs: 0,
        root: "/p",
        hasSessions: async () => {
          throw new Error("not authorized");
        },
      }),
    ).resolves.toBe(false);
  });
});

describe("workTabCount", () => {
  it("ignores terminals, which opening a project adds", () => {
    const tabs = [
      { kind: "terminal", spaceId: "a" },
      { kind: "terminal", spaceId: "a" },
    ];
    expect(workTabCount(tabs, "a")).toBe(0);
  });

  it("counts the project's other tabs only", () => {
    const tabs = [
      { kind: "terminal", spaceId: "a" },
      { kind: "agent-chat", spaceId: "a" },
      { kind: "editor", spaceId: "a" },
      { kind: "editor", spaceId: "b" },
      { kind: "editor" },
    ];
    expect(workTabCount(tabs, "a")).toBe(2);
  });
});

describe("anyAgentHasSession", () => {
  it("stops at the first agent with a session", async () => {
    const count = vi.fn(async (a: string) => (a === "b" ? 1 : 0));
    await expect(anyAgentHasSession(["a", "b", "c"], count)).resolves.toBe(
      true,
    );
    expect(count).toHaveBeenCalledTimes(2);
  });

  it("is false when no agent has one, and skips failures", async () => {
    const count = vi.fn(async (a: string) => {
      if (a === "a") throw new Error("boom");
      return 0;
    });
    await expect(anyAgentHasSession(["a", "b"], count)).resolves.toBe(false);
    expect(count).toHaveBeenCalledTimes(2);
  });
});
