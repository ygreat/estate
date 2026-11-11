import { describe, expect, it } from "vitest";
import {
  backspaceMention,
  formatMention,
  mentionTrigger,
  parseMentions,
  pathInside,
  resolveMention,
  spliceMention,
} from "./mentions";

describe("parseMentions", () => {
  it("finds plain and quoted mentions", () => {
    const text = 'see @CLAUDE.md and @"docs/my notes.md" please';
    expect(parseMentions(text)).toEqual([
      { start: 4, end: 14, path: "CLAUDE.md" },
      { start: 19, end: 38, path: "docs/my notes.md" },
    ]);
  });

  it("leaves sentence punctuation out of the path", () => {
    const text = "read @src/app.ts, then (@a/b.md).";
    const [first] = parseMentions(text);
    expect(first.path).toBe("src/app.ts");
    expect(text.slice(first.start, first.end)).toBe("@src/app.ts");
    expect(parseMentions("x @a/b.md).")).toMatchObject([{ path: "a/b.md" }]);
  });

  it("ignores an @ inside a word, alone, or with only punctuation", () => {
    expect(parseMentions("mail a@b.com")).toEqual([]);
    expect(parseMentions("just @ here")).toEqual([]);
    expect(parseMentions("@, ok")).toEqual([]);
  });

  it("round-trips paths through formatMention", () => {
    for (const p of [
      "a.md",
      "dir/with space.ts",
      'odd"name.md',
      "back\\slash",
    ]) {
      const text = `x ${formatMention(p)} y`;
      expect(parseMentions(text).map((m) => m.path)).toEqual([p]);
    }
  });
});

describe("mentionTrigger", () => {
  it("reports the @query being typed", () => {
    expect(mentionTrigger("hi @src/ap", 10)).toEqual({
      start: 3,
      end: 10,
      query: "src/ap",
    });
    expect(mentionTrigger("@", 1)).toEqual({ start: 0, end: 1, query: "" });
  });

  it("does not trigger inside words, after spaces, or in quoted mentions", () => {
    expect(mentionTrigger("a@b", 3)).toBeNull();
    expect(mentionTrigger("@a b", 4)).toBeNull();
    expect(mentionTrigger('@"my f', 6)).toBeNull();
  });
});

describe("editing", () => {
  it("splices a mention with spacing", () => {
    expect(spliceMention("hi @cl", 3, 6, "@CLAUDE.md")).toEqual({
      value: "hi @CLAUDE.md ",
      caret: 14,
    });
    expect(spliceMention("hi there", 2, 2, "@a.md")).toEqual({
      value: "hi @a.md there",
      caret: 8,
    });
  });

  it("backspace removes a whole chip, including from the space after it", () => {
    const value = "see @a.md now";
    const chips = parseMentions(value);
    expect(backspaceMention(value, 9, chips)).toEqual({
      value: "see  now",
      caret: 4,
    });
    expect(backspaceMention(value, 10, chips)).toEqual({
      value: "see now",
      caret: 4,
    });
    expect(backspaceMention(value, 8, chips)).toBeNull();
    expect(backspaceMention(value, 13, chips)).toBeNull();
  });
});

describe("paths", () => {
  it("keeps mentions inside the chat folder", () => {
    expect(pathInside("/w/p/src/a.ts", "/w/p")).toBe("src/a.ts");
    expect(pathInside("/w/p/src/", "/w/p/")).toBe("src");
    expect(pathInside("/w/p", "/w/p")).toBeNull();
    expect(pathInside("/w/pp/a.ts", "/w/p")).toBeNull();
    expect(pathInside("/etc/hosts", "/w/p")).toBeNull();
  });

  it("resolves a mention against the folder", () => {
    expect(resolveMention("src/a.ts", "/w/p/")).toBe("/w/p/src/a.ts");
    expect(resolveMention("./a.ts", "/w/p")).toBe("/w/p/a.ts");
    expect(resolveMention("/abs/x", "/w/p")).toBe("/abs/x");
  });
});
