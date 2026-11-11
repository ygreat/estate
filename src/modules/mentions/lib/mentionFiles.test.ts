import { describe, expect, it } from "vitest";
import { filterMentionFiles, mentionAbsolute } from "./mentionFiles";

describe("filterMentionFiles", () => {
  const files = [
    "docs/claude-notes.md",
    "src/app.ts",
    "CLAUDE.md",
    "src/claude/agent.ts",
  ];

  it("ranks file names starting with the query first", () => {
    expect(filterMentionFiles(files, "cla", 10)).toEqual([
      "docs/claude-notes.md",
      "CLAUDE.md",
      "src/claude/agent.ts",
    ]);
    expect(filterMentionFiles(files, "agent", 10)).toEqual([
      "src/claude/agent.ts",
    ]);
    expect(filterMentionFiles(files, "src/", 10)).toEqual([
      "src/app.ts",
      "src/claude/agent.ts",
    ]);
  });

  it("caps the list and passes everything for an empty query", () => {
    expect(filterMentionFiles(files, "", 2)).toEqual(files.slice(0, 2));
    expect(filterMentionFiles(files, "a", 1)).toHaveLength(1);
    expect(filterMentionFiles(files, "zzz", 5)).toEqual([]);
  });
});

describe("mentionAbsolute", () => {
  it("resolves inside the folder only", () => {
    expect(mentionAbsolute("src/a.ts", "/p")).toBe("/p/src/a.ts");
    expect(mentionAbsolute("/p/src/a.ts", "/p")).toBe("/p/src/a.ts");
    expect(mentionAbsolute("/etc/hosts", "/p")).toBeNull();
    expect(mentionAbsolute("../x/a.ts", "/p")).toBeNull();
    expect(mentionAbsolute("src/../../a.ts", "/p")).toBeNull();
  });
});
