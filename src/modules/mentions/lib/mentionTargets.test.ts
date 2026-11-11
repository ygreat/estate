import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeMentionTarget,
  mentionInChat,
  registerMentionTarget,
} from "./mentionTargets";

describe("mention targets", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
  });

  function target(visible: boolean) {
    const t = {
      shown: visible,
      insert: vi.fn((paths: readonly string[]) => paths.length),
    };
    const reg = registerMentionTarget({
      visible: () => t.shown,
      insert: t.insert,
    });
    cleanups.push(reg.unregister);
    return { ...t, reg, set: (v: boolean) => (t.shown = v) };
  }

  it("has no target until a composer is on screen", () => {
    target(false);
    expect(activeMentionTarget()).toBeNull();
    expect(mentionInChat(["/p/a.ts"])).toBe(0);
  });

  it("sends to the most recently focused composer on screen", () => {
    const a = target(true);
    const b = target(true);
    a.reg.focused();
    expect(mentionInChat(["/p/a.ts"])).toBe(1);
    expect(a.insert).toHaveBeenCalledWith(["/p/a.ts"]);
    expect(b.insert).not.toHaveBeenCalled();
  });

  it("skips a focused composer that is hidden now", () => {
    const a = target(true);
    const b = target(true);
    b.reg.focused();
    b.set(false);
    mentionInChat(["/p/x.md"]);
    expect(a.insert).toHaveBeenCalledOnce();
    expect(b.insert).not.toHaveBeenCalled();
  });

  it("forgets an unregistered composer", () => {
    const a = target(true);
    a.reg.unregister();
    expect(activeMentionTarget()).toBeNull();
  });
});
