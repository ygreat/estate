import { describe, expect, it } from "vitest";
import { parseTuning } from "./accountTuning";

describe("parseTuning", () => {
  it("keeps valid effort levels and Codex model", () => {
    expect(
      parseTuning(
        '{"effort":{"claude":"high","codex":"low"},"codexModel":"gpt-6-sol"}',
      ),
    ).toEqual({
      effort: { claude: "high", codex: "low" },
      codexModel: "gpt-6-sol",
    });
  });

  it("drops invalid values and bad JSON", () => {
    expect(
      parseTuning('{"effort":{"claude":"ultra","x":"low"},"codexModel":"a b"}'),
    ).toEqual({ effort: {} });
    expect(parseTuning("nope")).toEqual({ effort: {} });
    expect(parseTuning(null)).toEqual({ effort: {} });
  });
});
