import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useReducer } from "react";
import { checkReadable } from "@/modules/ai/lib/security";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { mentionAbsolute } from "./lib/mentionFiles";
import { type Mention, parseMentions } from "./lib/mentions";

/** Whether an absolute path is a mentionable file, as last checked. */
const known = new Map<string, { ok: boolean; at: number }>();
const KNOWN_CAP = 512;
/** A path that was missing is checked again after this long. */
const MISSING_TTL_MS = 10_000;
const CHECK_DELAY_MS = 150;
const CHECKS_PER_EDIT = 16;
const listeners = new Set<() => void>();

function remember(abs: string, ok: boolean): void {
  if (known.size >= KNOWN_CAP) known.clear();
  known.set(abs, { ok, at: Date.now() });
}

/** A path picked from the file list or the sidebar: a chip with no check. */
export function rememberMention(abs: string): void {
  remember(abs, checkReadable(abs).ok);
  for (const l of listeners) l();
}

function settled(abs: string): boolean {
  const entry = known.get(abs);
  return !!entry && (entry.ok || Date.now() - entry.at < MISSING_TTL_MS);
}

async function check(abs: string): Promise<void> {
  if (!checkReadable(abs).ok) {
    remember(abs, false);
    return;
  }
  const stat = await invoke<{ kind: string }>("fs_stat", {
    path: abs,
    workspace: currentWorkspaceEnv(),
  }).catch(() => null);
  remember(abs, stat !== null);
}

/**
 * The mentions in `value` that name a readable file or folder inside `base`:
 * these render as chips. Typed mentions are checked on disk once, shortly
 * after typing stops; secret files never become chips.
 */
export function useMentionChips(value: string, base: string | null): Mention[] {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const mentions = useMemo(() => parseMentions(value), [value]);

  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    if (!base || mentions.length === 0) return;
    const pending = new Set<string>();
    for (const m of mentions) {
      const abs = mentionAbsolute(m.path, base);
      if (abs && !settled(abs)) pending.add(abs);
      if (pending.size >= CHECKS_PER_EDIT) break;
    }
    if (pending.size === 0) return;
    let alive = true;
    const timer = setTimeout(() => {
      void Promise.all([...pending].map(check)).then(() => {
        if (alive) bump();
      });
    }, CHECK_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [mentions, base]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` re-reads the cache
  return useMemo(() => {
    if (!base) return [];
    return mentions.filter((m) => {
      const abs = mentionAbsolute(m.path, base);
      return abs !== null && known.get(abs)?.ok === true;
    });
  }, [mentions, base, version]);
}
