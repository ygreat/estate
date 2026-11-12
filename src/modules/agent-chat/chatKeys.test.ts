import { describe, expect, it } from "vitest";
import { stopsAgent } from "./chatKeys";

const base = {
  key: "Escape",
  running: true,
  defaultPrevented: false,
  isComposing: false,
  inside: true,
};

describe("stopsAgent", () => {
  it("stops a running agent on Escape", () => {
    expect(stopsAgent(base)).toBe(true);
  });

  it("ignores other keys and idle chats", () => {
    expect(stopsAgent({ ...base, key: "Enter" })).toBe(false);
    expect(stopsAgent({ ...base, running: false })).toBe(false);
  });

  it("leaves Escape to whatever handled it first", () => {
    expect(stopsAgent({ ...base, defaultPrevented: true })).toBe(false);
    expect(stopsAgent({ ...base, isComposing: true })).toBe(false);
  });

  it("ignores keys from portals outside the chat", () => {
    expect(stopsAgent({ ...base, inside: false })).toBe(false);
  });
});
