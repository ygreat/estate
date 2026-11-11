import { describe, expect, it } from "vitest";
import type { ChatItem } from "./model";
import {
  editedFiles,
  formatElapsed,
  type ToolItem,
  toolKind,
  transcriptBlocks,
} from "./transcriptBlocks";

const tool = (id: string, extra: Partial<ToolItem> = {}): ToolItem => ({
  kind: "tool",
  id,
  name: "Read",
  title: `Read ${id}`,
  status: "done",
  ...extra,
});
const text = (id: string): ChatItem => ({
  kind: "assistant",
  id,
  text: id,
  streaming: false,
});

describe("transcriptBlocks", () => {
  it("groups consecutive tool calls and keys a group by its first call", () => {
    const blocks = transcriptBlocks([
      { kind: "user", id: "u", text: "hi" },
      tool("a"),
      tool("b"),
      text("t"),
      tool("c"),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual([
      "item",
      "tools",
      "item",
      "tools",
    ]);
    expect(blocks[1]).toMatchObject({ key: "tool:a" });
    expect(blocks[1].kind === "tools" && blocks[1].tools.length).toBe(2);
  });
});

describe("toolKind", () => {
  it("classifies by tool name, then by title", () => {
    expect(toolKind({ name: "Edit", title: "Edited a.ts" })).toBe("write");
    expect(toolKind({ name: "file_change", title: "Edited 2 files" })).toBe(
      "write",
    );
    expect(toolKind({ name: "Bash", title: "List files" })).toBe("run");
    expect(toolKind({ name: "Grep", title: "Grep: foo" })).toBe("search");
    expect(toolKind({ name: "Read", title: "Read a.ts" })).toBe("read");
    expect(toolKind({ name: "mcp_tool", title: "tools" })).toBe("other");
  });
});

describe("editedFiles", () => {
  it("lists each edited file once with its summed line counts", () => {
    const files = editedFiles([
      tool("1", {
        name: "Edit",
        detail: "/r/a.ts",
        changes: { add: 2, del: 1 },
      }),
      tool("2", { name: "Read", detail: "/r/b.ts" }),
      tool("3", {
        name: "Edit",
        detail: "/r/a.ts",
        changes: { add: 3, del: 0 },
      }),
      tool("4", { name: "file_change", detail: "/r/c.ts\n/r/d.ts" }),
      tool("5", { name: "Edit", detail: "/r/e.ts", status: "error" }),
    ]);
    expect(files).toEqual([
      { path: "/r/a.ts", changes: { add: 5, del: 1 } },
      { path: "/r/c.ts", changes: undefined },
      { path: "/r/d.ts", changes: undefined },
    ]);
  });
});

describe("formatElapsed", () => {
  it("reads like a duration", () => {
    expect(formatElapsed(4_400)).toBe("4s");
    expect(formatElapsed(125_000)).toBe("2m 05s");
    expect(formatElapsed(3_720_000)).toBe("1h 02m");
  });
});
