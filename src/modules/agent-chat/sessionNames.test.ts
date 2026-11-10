import { describe, expect, it } from "vitest";
import { syncChatTitle, type TitleState, withName } from "./sessionNames";

const D = "Claude Code";
const st = (
  sessionId: string | undefined,
  title: string,
  name?: string,
): TitleState => ({ sessionId, title, name });

describe("withName", () => {
  it("sets, trims and removes names", () => {
    expect(withName({}, "k", "  Auth fix ")).toEqual({ k: "Auth fix" });
    expect(withName({ k: "a" }, "k", "  ")).toEqual({});
  });

  it("drops the oldest names past the cap, keeping the latest", () => {
    const names = withName({ a: "1", b: "2" }, "c", "3", 2);
    expect(names).toEqual({ b: "2", c: "3" });
    // Renaming moves a name to the newest end.
    expect(Object.keys(withName({ a: "1", b: "2" }, "a", "x", 2))).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("syncChatTitle", () => {
  it("does nothing for a fresh chat without a session", () => {
    expect(syncChatTitle(null, st(undefined, "Mine"), D)).toEqual({});
  });

  it("names the first session after a renamed tab", () => {
    const prev = st(undefined, "Auth fix");
    expect(syncChatTitle(prev, st("s1", "Auth fix"), D)).toEqual({
      saveName: "Auth fix",
    });
  });

  it("titles a restored tab with its session's name", () => {
    expect(syncChatTitle(null, st("s1", D, "Auth fix"), D)).toEqual({
      setTitle: "Auth fix",
    });
  });

  it("follows the session when another one is opened", () => {
    const prev = st("s1", "Auth fix", "Auth fix");
    expect(syncChatTitle(prev, st("s2", "Auth fix", "Docs"), D)).toEqual({
      setTitle: "Docs",
    });
    expect(syncChatTitle(prev, st("s2", "Auth fix"), D)).toEqual({
      setTitle: D,
    });
  });

  it("resets the title for a new session", () => {
    const prev = st("s1", "Auth fix", "Auth fix");
    expect(syncChatTitle(prev, st(undefined, "Auth fix"), D)).toEqual({
      setTitle: D,
    });
  });

  it("saves a tab rename as the session's name", () => {
    const prev = st("s1", D);
    expect(syncChatTitle(prev, st("s1", "Login"), D)).toEqual({
      saveName: "Login",
    });
  });

  it("clears the name when the tab goes back to the default", () => {
    const prev = st("s1", "Login", "Login");
    expect(syncChatTitle(prev, st("s1", D, "Login"), D)).toEqual({
      saveName: "",
    });
  });

  it("retitles the tab when the session is renamed elsewhere", () => {
    const prev = st("s1", "Login", "Login");
    expect(syncChatTitle(prev, st("s1", "Login", "Sign-in"), D)).toEqual({
      setTitle: "Sign-in",
    });
  });

  it("settles: an applied change causes no further change", () => {
    // After the tab took the name, and after the name was saved.
    expect(
      syncChatTitle(
        st("s1", "Login", "Sign-in"),
        st("s1", "Sign-in", "Sign-in"),
        D,
      ),
    ).toEqual({});
    expect(
      syncChatTitle(st("s1", "Login"), st("s1", "Login", "Login"), D),
    ).toEqual({});
    // A switch reset the title to the default for an unnamed session.
    expect(syncChatTitle(st("s2", "Auth fix"), st("s2", D), D)).toEqual({});
  });
});
