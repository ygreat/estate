import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { ChatAgentId } from "./model";

/** Mirrors `AgentAuth` in src-tauri/src/modules/agent_chat.rs. */
export type AgentAuth = {
  state: "signed-in" | "signed-out" | "missing" | "unknown";
  method: string | null;
  loginCommand: string;
};

/** Asked once per app session per agent; "Check again" asks again. */
const cache = new Map<ChatAgentId, Promise<AgentAuth>>();

function fetchAuth(agent: ChatAgentId, fresh: boolean): Promise<AgentAuth> {
  if (fresh) cache.delete(agent);
  let p = cache.get(agent);
  if (!p) {
    p = invoke<AgentAuth>("agent_chat_auth", { agent }).catch(
      (): AgentAuth => ({ state: "unknown", method: null, loginCommand: "" }),
    );
    cache.set(agent, p);
  }
  return p;
}

export function useAgentAuth(agent: ChatAgentId) {
  const [auth, setAuth] = useState<AgentAuth | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let alive = true;
    setChecking(true);
    void fetchAuth(agent, false).then((a) => {
      if (!alive) return;
      setAuth(a);
      setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, [agent]);
  const recheck = useCallback(() => {
    setChecking(true);
    void fetchAuth(agent, true).then((a) => {
      setAuth(a);
      setChecking(false);
    });
  }, [agent]);
  return { auth, checking, recheck };
}

/** The only commands the sign-in event may run (App checks this). */
export const LOGIN_COMMANDS: readonly string[] = [
  "claude auth login",
  "codex login",
  "gemini",
  "opencode auth login",
];

/** Opens a terminal tab in `cwd` and runs `command` there (handled by App). */
export const RUN_IN_TERMINAL_EVENT = "estate:run-in-new-terminal";

export type RunInTerminalDetail = { command: string; cwd: string };

export function runInNewTerminal(detail: RunInTerminalDetail): void {
  window.dispatchEvent(
    new CustomEvent<RunInTerminalDetail>(RUN_IN_TERMINAL_EVENT, { detail }),
  );
}

/** Whether chat should wait for sign-in (unknown never blocks). */
export function needsSignIn(auth: AgentAuth | null): boolean {
  return auth?.state === "signed-out" || auth?.state === "missing";
}
