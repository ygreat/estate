import { describe, expect, it } from "vitest";
import {
  applyChatEvent,
  beginTurn,
  clip,
  describeTool,
  EMPTY_TRANSCRIPT,
  lineChanges,
  MAX_ITEMS,
  unwrapShell,
} from "./model";

describe("applyChatEvent", () => {
  it("appends deltas and lets the final text replace them", () => {
    let t = applyChatEvent(EMPTY_TRANSCRIPT, {
      type: "text",
      id: "a",
      text: "Hel",
      final: false,
    });
    t = applyChatEvent(t, { type: "text", id: "a", text: "lo", final: false });
    expect(t.items[0]).toMatchObject({ text: "Hello", streaming: true });
    t = applyChatEvent(t, {
      type: "text",
      id: "a",
      text: "Hello!",
      final: true,
    });
    expect(t.items).toEqual([
      { kind: "assistant", id: "a", text: "Hello!", streaming: false },
    ]);
  });

  it("updates a tool call in place and keeps its name and title", () => {
    let t = applyChatEvent(EMPTY_TRANSCRIPT, {
      type: "tool",
      id: "t",
      name: "Bash",
      title: "List",
      detail: "ls",
      status: "running",
    });
    t = applyChatEvent(t, {
      type: "tool",
      id: "t",
      name: "",
      title: "",
      status: "done",
      output: "a",
    });
    expect(t.items).toEqual([
      {
        kind: "tool",
        id: "t",
        name: "Bash",
        title: "List",
        detail: "ls",
        status: "done",
        output: "a",
      },
    ]);
  });

  it("closes streaming text and running tools when the turn ends", () => {
    let t = applyChatEvent(EMPTY_TRANSCRIPT, {
      type: "text",
      id: "a",
      text: "x",
      final: false,
    });
    t = applyChatEvent(t, {
      type: "tool",
      id: "t",
      name: "x",
      title: "x",
      status: "running",
    });
    t = applyChatEvent(t, { type: "done", ok: false });
    expect(
      t.items.map((i) =>
        "streaming" in i ? i.streaming : i.kind === "tool" && i.status,
      ),
    ).toEqual([false, "error"]);
  });

  it("caps the transcript and tool output", () => {
    let t = EMPTY_TRANSCRIPT;
    for (let i = 0; i < MAX_ITEMS + 10; i++) t = beginTurn(t, `u${i}`, "hi");
    expect(t.items).toHaveLength(MAX_ITEMS);
    expect(clip("x".repeat(20), 10)).toMatch(
      /^x{10}\n… \(10 more characters\)$/,
    );
  });

  it("starting a turn clears the last turn's refusals and usage", () => {
    let t = applyChatEvent(EMPTY_TRANSCRIPT, {
      type: "denied",
      tools: [{ name: "Write", title: "Wrote a" }],
    });
    t = applyChatEvent(t, { type: "usage", costUsd: 1 });
    t = beginTurn(t, "u", "again");
    expect(t.denied).toBe(false);
    expect(t.stats).toBeUndefined();
  });
});

describe("tool descriptions", () => {
  it("summarises common tools", () => {
    expect(
      describeTool("Bash", { command: "ls", description: "List files" }),
    ).toEqual({ title: "List files", detail: "ls" });
    expect(describeTool("Write", { file_path: "/a/b.ts" })).toEqual({
      title: "Wrote b.ts",
      detail: "/a/b.ts",
    });
    expect(describeTool("Edit", { file_path: "/a/b.ts" }).title).toBe(
      "Edited b.ts",
    );
    expect(describeTool("Grep", { pattern: "foo" }).title).toBe("Grep: foo");
    expect(describeTool("Mystery", 42)).toEqual({ title: "Mystery" });
  });

  it("unwraps shell wrappers", () => {
    expect(unwrapShell("/bin/bash -lc 'ls -la'")).toBe("ls -la");
    expect(unwrapShell('/bin/zsh -lc "echo hi"')).toBe("echo hi");
    expect(unwrapShell("git status")).toBe("git status");
  });
});

describe("edit line counts", () => {
  it("ignores the lines an edit keeps", () => {
    expect(lineChanges("a\nb\nc", "a\nB\nB2\nc")).toEqual({ add: 2, del: 1 });
    expect(lineChanges("", "x\ny")).toEqual({ add: 2, del: 0 });
    expect(lineChanges("same", "same")).toEqual({ add: 0, del: 0 });
  });

  it("reports edits, multi-edits and writes", () => {
    expect(
      describeTool("Edit", {
        file_path: "/a.ts",
        old_string: "x",
        new_string: "y\nz",
      }).changes,
    ).toEqual({ add: 2, del: 1 });
    expect(
      describeTool("MultiEdit", {
        file_path: "/a.ts",
        edits: [
          { old_string: "x", new_string: "y" },
          { oldString: "", newString: "n" },
        ],
      }).changes,
    ).toEqual({ add: 2, del: 1 });
    expect(
      describeTool("Write", { file_path: "/a.ts", content: "1\n2\n" }).changes,
    ).toEqual({ add: 2, del: 0 });
  });
});
