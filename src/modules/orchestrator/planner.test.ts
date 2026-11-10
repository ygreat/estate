import { describe, expect, it } from "vitest";
import type { AgentAuth } from "@/modules/agent-chat/auth";
import { resolvePlanner } from "./planner";

const state = (s: AgentAuth["state"]): AgentAuth => ({
  state: s,
  method: null,
  loginCommand: "",
});

describe("resolvePlanner", () => {
  it("uses the set agent even when it is not signed in", () => {
    expect(
      resolvePlanner("gemini", {
        claude: state("signed-in"),
        gemini: state("signed-out"),
      }),
    ).toBe("gemini");
  });

  it("takes the first signed-in agent when automatic", () => {
    expect(
      resolvePlanner("ask", {
        claude: state("signed-out"),
        codex: state("signed-in"),
        opencode: state("signed-in"),
      }),
    ).toBe("codex");
  });

  it("falls back to Claude Code when none is signed in or known", () => {
    expect(resolvePlanner("ask", {})).toBe("claude");
    expect(resolvePlanner("ask", { codex: state("missing") })).toBe("claude");
  });
});
