import { describe, expect, it, vi } from "vitest";
import {
  firstPathDropTarget,
  formatPathsForChat,
  insertAtCaret,
  relativeToBase,
} from "./chatPathDrop";
import type { ExplorerPathDropTarget } from "./useExplorerDnd";

describe("relativeToBase", () => {
  it("makes paths inside the chat's folder relative", () => {
    expect(relativeToBase("/p/app/src/a.ts", "/p/app")).toBe("src/a.ts");
    expect(relativeToBase("/p/app/src/a.ts", "/p/app/")).toBe("src/a.ts");
    expect(relativeToBase("/p/app", "/p/app")).toBe(".");
  });

  it("keeps other paths absolute", () => {
    expect(relativeToBase("/p/apple/a.ts", "/p/app")).toBe("/p/apple/a.ts");
    expect(relativeToBase("/x/a.ts", null)).toBe("/x/a.ts");
  });
});

describe("formatPathsForChat", () => {
  it("mentions paths inside the chat's folder", () => {
    expect(formatPathsForChat(["/p/a.ts", "/p/my notes.md"], "/p")).toBe(
      '@a.ts @"my notes.md"',
    );
  });

  it("keeps other paths plain, quoting ones with spaces", () => {
    expect(formatPathsForChat(["/x/my file.ts", "/p"], "/p")).toBe(
      '"/x/my file.ts" .',
    );
    expect(formatPathsForChat(["/x/a.ts"], null)).toBe("/x/a.ts");
  });
});

describe("insertAtCaret", () => {
  it("pads with spaces only where words would touch", () => {
    expect(insertAtCaret("", 0, 0, "a.ts")).toEqual({
      value: "a.ts ",
      caret: 5,
    });
    expect(insertAtCaret("look at", 7, 7, "a.ts")).toEqual({
      value: "look at a.ts ",
      caret: 13,
    });
    expect(insertAtCaret("look at  now", 8, 8, "a.ts")).toEqual({
      value: "look at a.ts now",
      caret: 12,
    });
  });

  it("replaces the selection", () => {
    expect(insertAtCaret("see X here", 4, 5, "a.ts").value).toBe(
      "see a.ts here",
    );
  });
});

describe("firstPathDropTarget", () => {
  const target = (hit: boolean): ExplorerPathDropTarget => ({
    updateTarget: vi.fn(() => hit),
    dropPath: vi.fn(() => hit),
    clearTarget: vi.fn(),
  });

  it("lets the first target under the pointer take the drop", () => {
    const chat = target(true);
    const terminal = target(true);
    const both = firstPathDropTarget(chat, terminal);
    expect(both.updateTarget(1, 1)).toBe(true);
    expect(terminal.updateTarget).not.toHaveBeenCalled();
    expect(terminal.clearTarget).toHaveBeenCalled();
    expect(both.dropPath(["/a"], 1, 1)).toBe(true);
    expect(terminal.dropPath).not.toHaveBeenCalled();
  });

  it("falls through to the next target", () => {
    const chat = target(false);
    const terminal = target(true);
    const both = firstPathDropTarget(chat, terminal);
    expect(both.updateTarget(1, 1)).toBe(true);
    expect(both.dropPath(["/a"], 1, 1)).toBe(true);
    expect(terminal.dropPath).toHaveBeenCalledWith(["/a"], 1, 1);
  });
});
