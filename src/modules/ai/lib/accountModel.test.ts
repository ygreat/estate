import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {},
  invoke: vi.fn(),
}));

import { accountModelArg } from "../config";
import { promptFromMessages } from "./accountModel";

describe("account models", () => {
  it("maps account model ids to CLI model names", () => {
    expect(accountModelArg("claude-account-opus")).toBe("opus");
    expect(accountModelArg("claude-account-haiku")).toBe("haiku");
    expect(accountModelArg("chatgpt-account-default")).toBeUndefined();
  });

  it("flattens the conversation into one prompt", () => {
    const prompt = promptFromMessages([
      { role: "system", content: "Be brief." },
      { role: "user", content: [{ type: "text", text: "Hi" }] },
      { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
      { role: "user", content: [{ type: "text", text: "What's in src?" }] },
    ] as Parameters<typeof promptFromMessages>[0]);
    expect(prompt.startsWith("[Instructions]\nBe brief.")).toBe(true);
    expect(prompt).toContain(
      "User:\nHi\n\nAssistant:\nHello!\n\nUser:\nWhat's in src?",
    );
    expect(prompt).toContain("Estate's own tools are not available here");
  });
});
