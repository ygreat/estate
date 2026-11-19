/**
 * Estate: shows agent chat sessions in Claude Code's own resume list.
 *
 * Claude Code hides sessions that ran headless (`claude -p`, what a chat turn
 * runs) from `claude --resume`. The backend (`agent_chat_sync_cli`) rewrites
 * the tag that hides them and names the session after the chat; see
 * src-tauri/src/modules/agent_chat_cli_sync.rs.
 */
import { invoke } from "@tauri-apps/api/core";
import type { ChatAgentId } from "./model";
import { sessionKey } from "./sessionNames";

/** Mirrors `CliSyncOutcome` in agent_chat_cli_sync.rs. */
export type CliSyncOutcome = {
  /** Lines rewritten by this sync. */
  patched: number;
  /** Nothing was left to rewrite: the session already shows in the CLI. */
  already: boolean;
  /** The chat's name was written as the session's title. */
  titled: boolean;
};

export type CliSyncTarget = {
  cwd: string;
  sessionId: string;
  /** The chat's name (from `sessionNames`), shown in the resume list. */
  title?: string;
};

/**
 * The session a chat can sync, or null: only Claude Code chats that have one.
 * `names` is the session-name map; the chat's name becomes the title.
 */
export function cliSyncTarget(
  chat:
    | { agent: ChatAgentId; cwd: string; transcript?: { sessionId?: string } }
    | null
    | undefined,
  names?: Readonly<Record<string, string>>,
): CliSyncTarget | null {
  const sessionId = chat?.transcript?.sessionId;
  if (chat?.agent !== "claude" || !sessionId || !chat.cwd) return null;
  const title = names?.[sessionKey("claude", sessionId)];
  return title
    ? { cwd: chat.cwd, sessionId, title }
    : { cwd: chat.cwd, sessionId };
}

/** `full` rereads the whole session file instead of only what was added. */
export function syncToCli(
  target: CliSyncTarget,
  full: boolean,
): Promise<CliSyncOutcome> {
  return invoke<CliSyncOutcome>("agent_chat_sync_cli", {
    agent: "claude",
    cwd: target.cwd,
    sessionId: target.sessionId,
    title: target.title ?? null,
    full,
  });
}

/** What the per-chat button tells the user after a sync. */
export function cliSyncMessage(
  outcome: CliSyncOutcome,
  title?: string,
): string {
  const named = title ? ` as “${title}”` : "";
  return outcome.already && !outcome.titled
    ? `This session already shows in claude --resume${named}.`
    : `This session now shows in claude --resume${named}.`;
}
