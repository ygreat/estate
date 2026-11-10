// Estate file; not part of Terax.

/**
 * Whether a project already has work to return to: tabs Estate saved for it,
 * or agent sessions in its folder. Such a project opens straight to the
 * editor; one without any shows the welcome chat box.
 */
export async function projectHasSession({
  workTabs,
  root,
  hasSessions,
}: {
  /** The project's work tabs (see `workTabCount`). */
  workTabs: number;
  root: string | null;
  /** Whether the folder has agent sessions. A failure counts as none. */
  hasSessions: (root: string) => Promise<boolean>;
}): Promise<boolean> {
  if (workTabs > 0) return true;
  if (!root) return false;
  try {
    return await hasSessions(root);
  } catch {
    return false;
  }
}

/**
 * Tabs of a project that count as work: everything but terminals. Opening a
 * project always adds a terminal, so a terminal alone doesn't mean the
 * project has been worked on.
 */
export function workTabCount(
  tabs: readonly { kind: string; spaceId?: string }[],
  spaceId: string,
): number {
  return tabs.filter((t) => t.spaceId === spaceId && t.kind !== "terminal")
    .length;
}

/**
 * Whether any agent has a session for the folder, asking one agent at a
 * time and stopping at the first that has one. A failing agent counts as
 * none.
 */
export async function anyAgentHasSession<A>(
  agents: readonly A[],
  count: (agent: A) => Promise<number>,
): Promise<boolean> {
  for (const agent of agents) {
    const n = await count(agent).catch(() => 0);
    if (n > 0) return true;
  }
  return false;
}
