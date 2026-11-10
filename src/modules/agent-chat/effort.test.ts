import { describe, expect, it } from "vitest";
import {
  type AgentModel,
  EFFORTS,
  effectiveEffort,
  effortsFor,
} from "./effort";

const listed: AgentModel[] = [
  {
    id: "gpt-a",
    label: "GPT A",
    efforts: ["low", "medium"],
    defaultEffort: "low",
  },
];

describe("effortsFor", () => {
  it("offers every level for Claude Code, none on Haiku", () => {
    expect(effortsFor("claude", undefined, [])).toEqual(EFFORTS);
    expect(effortsFor("claude", "opus", [])).toEqual(EFFORTS);
    expect(effortsFor("claude", "haiku", [])).toEqual([]);
    expect(effortsFor("claude", "claude-haiku-4-5", [])).toEqual([]);
  });

  it("uses a listed Codex model's levels, else all", () => {
    expect(effortsFor("codex", "gpt-a", listed)).toEqual(["low", "medium"]);
    const unlisted = ["low", "medium", "high", "xhigh"];
    expect(effortsFor("codex", undefined, listed)).toEqual(unlisted);
    expect(effortsFor("codex", "gpt-other", listed)).toEqual(unlisted);
  });

  it("offers none for agents without an effort setting", () => {
    expect(effortsFor("gemini", undefined, [])).toEqual([]);
    expect(effortsFor("opencode", "x", [])).toEqual([]);
  });
});

describe("effectiveEffort", () => {
  it("drops a level the model doesn't take", () => {
    expect(effectiveEffort("high", ["low", "high"])).toBe("high");
    expect(effectiveEffort("max", ["low", "medium"])).toBeUndefined();
    expect(effectiveEffort(undefined, EFFORTS)).toBeUndefined();
  });
});
