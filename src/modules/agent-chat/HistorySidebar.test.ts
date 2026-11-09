import { describe, expect, it } from "vitest";
import { relativeTime, sessionLabel } from "./HistorySidebar";

describe("history sidebar labels", () => {
  const now = Date.UTC(2026, 10, 10, 12, 0, 0);
  it("formats recent times relative to now", () => {
    expect(relativeTime(now - 10_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe("yesterday");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 days ago");
  });

  it("labels a session by title, then latest prompt", () => {
    const base = { id: "s", branch: null, modifiedMs: 0, bytes: 0 };
    expect(sessionLabel({ ...base, title: "Fix build", lastPrompt: "x" })).toBe(
      "Fix build",
    );
    expect(
      sessionLabel({ ...base, title: null, lastPrompt: "run tests" }),
    ).toBe("run tests");
    expect(sessionLabel({ ...base, title: null, lastPrompt: null })).toBe(
      "Untitled session",
    );
  });
});
