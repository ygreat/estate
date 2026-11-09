import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { transcriptFromHistory } from "./history";

const lines = readFileSync(
  join(import.meta.dirname, "fixtures", "claude-history.jsonl"),
  "utf8",
)
  .split("\n")
  .filter((l) => l.trim());

describe("transcriptFromHistory (recorded Claude Code session)", () => {
  const t = transcriptFromHistory(
    lines,
    "c4e61347-931f-4e95-845e-e5fabbd94469",
  );

  it("restores prompts, replies and tool calls in order", () => {
    const kinds = t.items.map((i) => i.kind);
    expect(kinds[0]).toBe("user");
    expect(t.items[0]).toMatchObject({
      text: expect.stringContaining("list the files"),
    });
    expect(kinds).toContain("tool");
    expect(kinds).toContain("assistant");
  });

  it("shows slash commands as prompts and skips internal notes", () => {
    const prompts = t.items.flatMap((i) => (i.kind === "user" ? [i.text] : []));
    expect(prompts).toContain("/context");
    expect(prompts.some((p) => p.startsWith("<"))).toBe(false);
  });

  it("keeps the session id and the model, and leaves nothing running", () => {
    expect(t.sessionId).toBe("c4e61347-931f-4e95-845e-e5fabbd94469");
    expect(t.model).toBe("claude-haiku-5-5");
    expect(
      t.items.some((i) => i.kind === "tool" && i.status === "running"),
    ).toBe(false);
    expect(t.items.some((i) => i.kind === "assistant" && i.streaming)).toBe(
      false,
    );
  });

  it("ignores malformed lines", () => {
    expect(() =>
      transcriptFromHistory(["nope", "{}", "[]"], "s"),
    ).not.toThrow();
  });
});
