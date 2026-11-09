import { describe, expect, it } from "vitest";
import { commandSuggestions, parseComposerInput } from "./ChatComposer";

describe("parseComposerInput", () => {
  it("handles /clear and /model locally and sends everything else", () => {
    expect(parseComposerInput("/clear")).toEqual({ kind: "clear" });
    expect(parseComposerInput("  /model  ")).toEqual({
      kind: "model",
      model: undefined,
    });
    expect(parseComposerInput("/model sonnet")).toEqual({
      kind: "model",
      model: "sonnet",
    });
    expect(parseComposerInput("/compact")).toEqual({
      kind: "send",
      text: "/compact",
    });
    expect(parseComposerInput("/clearly not a command")).toEqual({
      kind: "send",
      text: "/clearly not a command",
    });
    expect(parseComposerInput("hello")).toEqual({
      kind: "send",
      text: "hello",
    });
    expect(parseComposerInput("   ")).toBeNull();
  });
});

describe("commandSuggestions", () => {
  const agent = [
    "compact",
    "context",
    "init",
    "clear",
    "model",
    "anthropic-skills:pdf",
  ];

  it("suggests only while a bare /name is being typed", () => {
    expect(commandSuggestions("hello", agent)).toEqual([]);
    expect(commandSuggestions("/compact now", agent)).toEqual([]);
    expect(commandSuggestions("/", agent).length).toBeGreaterThan(0);
  });

  it("puts local commands first, without duplicates, prefix matches first", () => {
    const names = commandSuggestions("/c", agent).map((s) => s.name);
    expect(names[0]).toBe("clear");
    expect(names.filter((n) => n === "clear")).toHaveLength(1);
    // Prefix matches first; substring matches ("anthropic-…") after them.
    expect(names.slice(0, 3)).toEqual(["clear", "compact", "context"]);
    expect(names[names.length - 1]).toBe("anthropic-skills:pdf");
    expect(commandSuggestions("/pdf", agent).map((s) => s.name)).toEqual([
      "anthropic-skills:pdf",
    ]);
  });

  it("shows at most eight", () => {
    const many = Array.from({ length: 20 }, (_, i) => `cmd${i}`);
    expect(commandSuggestions("/cmd", many)).toHaveLength(8);
  });
});
