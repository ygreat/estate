/**
 * Chat composers that accept file mentions from elsewhere (the Files sidebar).
 * The newest focused composer that is on screen receives them.
 */

export type MentionTarget = {
  /** On screen now: its tab is shown (alone or in a split) or its bar is open. */
  visible: () => boolean;
  /** Inserts the paths as mentions; returns how many were inserted. */
  insert: (paths: readonly string[]) => number;
};

type Entry = { target: MentionTarget; focusedAt: number };

const targets = new Map<object, Entry>();
let clock = 0;

export function registerMentionTarget(target: MentionTarget): {
  focused: () => void;
  unregister: () => void;
} {
  const key = {};
  targets.set(key, { target, focusedAt: ++clock });
  return {
    focused: () => {
      const entry = targets.get(key);
      if (entry) entry.focusedAt = ++clock;
    },
    unregister: () => {
      targets.delete(key);
    },
  };
}

/** The composer that "Mention in Chat" would use, or null when none is on screen. */
export function activeMentionTarget(): MentionTarget | null {
  let best: Entry | null = null;
  for (const entry of targets.values()) {
    if (!entry.target.visible()) continue;
    if (!best || entry.focusedAt > best.focusedAt) best = entry;
  }
  return best?.target ?? null;
}

export function mentionInChat(paths: readonly string[]): number {
  return activeMentionTarget()?.insert(paths) ?? 0;
}
