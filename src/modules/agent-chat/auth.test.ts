import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOGIN_COMMANDS, needsSignIn } from "./auth";

describe("agent sign-in", () => {
  it("blocks chat only when signed out or not installed", () => {
    const base = { method: null, loginCommand: "claude auth login" };
    expect(needsSignIn({ ...base, state: "signed-out" })).toBe(true);
    expect(needsSignIn({ ...base, state: "missing" })).toBe(true);
    expect(needsSignIn({ ...base, state: "signed-in" })).toBe(false);
    expect(needsSignIn({ ...base, state: "unknown" })).toBe(false);
    expect(needsSignIn(null)).toBe(false);
  });

  it("allows exactly the login commands the Rust side returns", () => {
    const rust = readFileSync(
      join(import.meta.dirname, "../../../src-tauri/src/modules/agent_chat.rs"),
      "utf8",
    );
    const fn = rust.slice(
      rust.indexOf("fn login_command("),
      rust.indexOf("/// `claude auth status --json`"),
    );
    const fromRust = [...fn.matchAll(/=> "([^"]+)"/g)].map((m) => m[1]).sort();
    expect([...LOGIN_COMMANDS].sort()).toEqual(fromRust);
  });
});
