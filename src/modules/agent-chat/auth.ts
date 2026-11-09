import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_AGENTS, type ChatAgentId } from "./model";

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

/** Whether an agent is installed and signed in (cached per app session). */
export function checkAgentAuth(
  agent: ChatAgentId,
  fresh = false,
): Promise<AgentAuth> {
  return fetchAuth(agent, fresh);
}

/**
 * Calls `onChange` with whether any of `agents` is signed in, now and each
 * time the window regains focus (after a sign-in). Returns a stop function.
 */
export function watchSignedIn(
  agents: readonly ChatAgentId[],
  onChange: (signedIn: boolean) => void,
): () => void {
  let alive = true;
  const check = (fresh: boolean) => {
    void Promise.all(agents.map((a) => fetchAuth(a, fresh))).then((states) => {
      if (alive) onChange(states.some((a) => a.state === "signed-in"));
    });
  };
  check(false);
  const onFocus = () => check(true);
  window.addEventListener("focus", onFocus);
  return () => {
    alive = false;
    window.removeEventListener("focus", onFocus);
  };
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

function isMainWindow(): boolean {
  try {
    return getCurrentWebviewWindow().label === "main";
  } catch {
    return true;
  }
}

/**
 * Asks the main window for a terminal running `command`. From another window
 * (Settings) it goes over a Tauri event; App applies the same allow-list.
 */
export function runInNewTerminal(detail: RunInTerminalDetail): void {
  if (isMainWindow()) {
    window.dispatchEvent(
      new CustomEvent<RunInTerminalDetail>(RUN_IN_TERMINAL_EVENT, { detail }),
    );
    return;
  }
  void emitTo("main", RUN_IN_TERMINAL_EVENT, detail);
}

/** How to install each agent, shown when it isn't found. */
export const INSTALL_HINT: Record<ChatAgentId, string> = {
  claude: "curl -fsSL https://claude.ai/install.sh | bash",
  codex: "npm install -g @openai/codex",
  gemini: "npm install -g @google/gemini-cli",
  opencode: "npm install -g opencode-ai",
};

/** What each agent signs in with, for people choosing between them. */
export const SIGN_IN_WITH: Record<ChatAgentId, string> = {
  claude: "Claude account or API key",
  codex: "ChatGPT account or API key",
  gemini: "Google account or API key",
  opencode: "Provider of your choice",
};

/**
 * Sign-in state of every chat agent. Re-checks the ones not signed in when the
 * window regains focus (after a sign-in in the terminal or browser).
 */
export function useAgentStatuses(
  agents: readonly ChatAgentId[] = CHAT_AGENTS,
  enabled = true,
) {
  const [auth, setAuth] = useState<Partial<Record<ChatAgentId, AgentAuth>>>({});
  const authRef = useRef(auth);
  authRef.current = auth;
  const [checking, setChecking] = useState<ChatAgentId[]>([]);
  const check = useCallback((agent: ChatAgentId, fresh: boolean) => {
    setChecking((c) => (c.includes(agent) ? c : [...c, agent]));
    void fetchAuth(agent, fresh).then((a) => {
      setAuth((m) => ({ ...m, [agent]: a }));
      setChecking((c) => c.filter((x) => x !== agent));
    });
  }, []);
  useEffect(() => {
    if (!enabled) return;
    for (const a of agents) check(a, false);
  }, [check, agents, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => {
      for (const a of agents) {
        if (authRef.current[a]?.state !== "signed-in") check(a, true);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [check, agents, enabled]);
  const recheck = useCallback(
    (agent?: ChatAgentId) => {
      for (const a of agent ? [agent] : agents) check(a, true);
    },
    [check, agents],
  );
  return { auth, checking, recheck };
}

/** The agents whose accounts can power the Estate AI panel. */
export const ACCOUNT_AGENTS: readonly ChatAgentId[] = ["claude", "codex"];

/** Whether chat should wait for sign-in (unknown never blocks). */
export function needsSignIn(auth: AgentAuth | null): boolean {
  return auth?.state === "signed-out" || auth?.state === "missing";
}
