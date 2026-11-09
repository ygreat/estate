import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTurnAdapter } from "./adapters";
import {
  applyChatEvent,
  beginTurn,
  type ChatAgentId,
  type ChatItem,
  EMPTY_TRANSCRIPT,
  type Transcript,
} from "./model";

const FIXTURES = join(import.meta.dirname, "fixtures");

/** Runs a recorded turn through the adapter and reducer, like the store does. */
function replay(
  agent: ChatAgentId,
  file: string,
  start = EMPTY_TRANSCRIPT,
): Transcript {
  const adapter = createTurnAdapter(agent);
  let t = beginTurn(start, "u1", "prompt");
  for (const line of readFileSync(join(FIXTURES, file), "utf8").split("\n")) {
    if (!line.trim()) continue;
    for (const e of adapter.push(JSON.parse(line))) t = applyChatEvent(t, e);
  }
  for (const e of adapter.finish()) t = applyChatEvent(t, e);
  return t;
}

const of = <K extends ChatItem["kind"]>(t: Transcript, kind: K) =>
  t.items.filter((i): i is Extract<ChatItem, { kind: K }> => i.kind === kind);

describe("Claude Code adapter (recorded)", () => {
  it("shows the reply, the tool call with its output, and the session", () => {
    const t = replay("claude", "claude-read.jsonl");
    expect(t.sessionId).toBe("c4e61347-931f-4e95-845e-e5fabbd94469");
    const [tool] = of(t, "tool");
    expect(tool).toMatchObject({
      name: "Bash",
      status: "done",
      detail: "ls -la /work",
    });
    expect(tool.output).toContain("notes.txt");
    const replies = of(t, "assistant");
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toBe(
      "The directory contains one file, `notes.txt`.",
    );
    expect(replies[0].streaming).toBe(false);
    expect(t.stats?.costUsd).toBeGreaterThan(0);
    expect(t.denied).toBe(false);
  });

  it("streams text before the final message replaces it", () => {
    const adapter = createTurnAdapter("claude");
    let t = EMPTY_TRANSCRIPT;
    let sawStreaming = false;
    for (const line of readFileSync(
      join(FIXTURES, "claude-read.jsonl"),
      "utf8",
    ).split("\n")) {
      if (!line.trim()) continue;
      for (const e of adapter.push(JSON.parse(line))) t = applyChatEvent(t, e);
      if (of(t, "assistant").some((a) => a.streaming && a.text.length > 0))
        sawStreaming = true;
    }
    expect(sawStreaming).toBe(true);
    expect(of(t, "assistant").every((a) => !a.streaming)).toBe(true);
  });

  it("reports tools refused by the access level", () => {
    const t = replay("claude", "claude-denied.jsonl");
    expect(t.denied).toBe(true);
    const notice = of(t, "notice").find((n) => n.tone === "denied");
    expect(notice?.tools?.map((x) => x.name)).toEqual(["Bash", "Write"]);
    expect(of(t, "tool").every((x) => x.status === "error")).toBe(true);
  });
});

describe("Codex adapter (recorded)", () => {
  it("shows messages, the command with its exit status, and usage", () => {
    const t = replay("codex", "codex-read.jsonl");
    expect(t.sessionId).toBe("01a1c0f6-36f0-7fb3-9afc-d6350040807f");
    expect(of(t, "assistant").map((a) => a.text)).toEqual([
      "I’ll list the files in the current directory.",
      "The current directory contains one file: `notes.txt`.",
    ]);
    expect(of(t, "tool")[0]).toMatchObject({
      detail: "ls -la",
      status: "done",
    });
    expect(t.stats?.outputTokens).toBe(67);
  });

  it("keeps the thread id across a resumed turn", () => {
    const first = replay("codex", "codex-read.jsonl");
    const second = replay("codex", "codex-write.jsonl", first);
    expect(second.sessionId).toBe(first.sessionId);
    expect(of(second, "user")).toHaveLength(2);
    expect(of(second, "tool").slice(-1)[0]).toMatchObject({
      detail: "printf hi > hello.txt",
      status: "done",
    });
  });
});

describe("Gemini CLI adapter (from the documented format)", () => {
  it("joins streamed text, shows tools, and reports a refused tool", () => {
    const t = replay("gemini", "gemini-synthetic.jsonl");
    expect(t.sessionId).toBe("8b0d1d4e-5f1a-4c1e-9d43-2f6f0f6f7a10");
    const texts = of(t, "assistant").map((a) => a.text);
    expect(texts[0]).toBe("I'll list the files.");
    expect(texts[texts.length - 1]).toBe("The directory contains `notes.txt`.");
    expect(of(t, "tool").map((x) => x.status)).toEqual(["done", "error"]);
    expect(t.denied).toBe(true);
    expect(t.stats?.inputTokens).toBe(1100);
  });
});

describe("OpenCode adapter (from the documented format)", () => {
  it("shows text and tools, reports refusals, and ends on exit", () => {
    const t = replay("opencode", "opencode-synthetic.jsonl");
    expect(t.sessionId).toBe("ses_4f2a9c1e8b7d");
    expect(of(t, "assistant")[0].text).toBe(
      "The directory contains `notes.txt`.",
    );
    expect(of(t, "tool").map((x) => x.status)).toEqual(["done", "error"]);
    expect(t.denied).toBe(true);
    expect(t.stats?.costUsd).toBeCloseTo(0.0012);
  });
});

describe("robustness", () => {
  it("ignores unknown and malformed lines", () => {
    for (const agent of ["claude", "codex", "gemini", "opencode"] as const) {
      const a = createTurnAdapter(agent);
      for (const line of [
        null,
        1,
        "x",
        [],
        {},
        { type: "mystery" },
        { type: "assistant" },
      ]) {
        expect(() => a.push(line)).not.toThrow();
      }
    }
  });

  it("ends the turn as failed when the process exits early", () => {
    const a = createTurnAdapter("claude");
    expect(a.finish()).toEqual([{ type: "done", ok: false }]);
  });
});

describe("status line data", () => {
  it("records the model, totals across turns, and Claude's context", () => {
    const first = replay("claude", "claude-read.jsonl");
    expect(first.model).toBe("claude-haiku-5-5");
    expect(first.totals.turns).toBe(1);
    const second = replay("claude", "claude-denied.jsonl", first);
    expect(second.totals.turns).toBe(2);
    expect(second.totals.costUsd).toBeGreaterThan(first.totals.costUsd);
  });

  it("adds Codex tokens across turns", () => {
    const first = replay("codex", "codex-read.jsonl");
    const second = replay("codex", "codex-write.jsonl", first);
    expect(second.totals.outputTokens).toBeGreaterThan(
      first.totals.outputTokens,
    );
    expect(second.totals.turns).toBe(2);
  });
});

describe("usage limits (Claude Code)", () => {
  it("reads the 5-hour and 7-day windows from the recorded run", () => {
    const adapter = createTurnAdapter("claude");
    const events = readFileSync(join(FIXTURES, "claude-read.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .flatMap((l) => adapter.push(JSON.parse(l)));
    const limits = events.find((e) => e.type === "limits");
    expect(limits).toEqual({
      type: "limits",
      windows: [
        { id: "five_hour", utilization: 0.71, resetsAt: 1794240600 },
        { id: "seven_day", utilization: 0.15, resetsAt: 1794560400 },
      ],
    });
  });
});

describe("built-in commands (Claude Code)", () => {
  it("shows a command's result when the turn had no reply text", () => {
    const a = createTurnAdapter("claude");
    const events = a.push({
      type: "result",
      subtype: "success",
      is_error: false,
      uuid: "r1",
      result: "## Context Usage",
    });
    expect(events).toContainEqual({
      type: "text",
      id: "result:r1",
      text: "## Context Usage",
      final: true,
    });
  });

  it("doesn't repeat the result when the reply was already shown", () => {
    const t = replay("claude", "claude-read.jsonl");
    expect(t.items.filter((i) => i.kind === "assistant")).toHaveLength(1);
  });
});
