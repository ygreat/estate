// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Tab } from "./useTabs";

type Result = {
  explorerRoot: string | null;
  inheritedCwdForNewTab: () => string | undefined;
};

export function useWorkspaceCwd(
  activeTab: Tab | undefined,
  tabs: Tab[],
  home: string | null,
  /** Estate: the project's (space's) root folder, preferred over older terminals. */
  projectRoot: string | null = null,
  /** Estate: the active project (space), to scope the last terminal folder. */
  activeSpaceId: string | null = null,
): Result {
  // Estate: remembered with the terminal's own project, so another project's
  // terminal never decides this project's folder.
  const lastTerminal = useRef<{ cwd: string; spaceId: string } | null>(null);

  useEffect(() => {
    if (activeTab?.kind === "terminal" && activeTab.cwd) {
      lastTerminal.current = { cwd: activeTab.cwd, spaceId: activeTab.spaceId };
    }
  }, [activeTab]);

  const explorerRoot = useMemo<string | null>(() => {
    if (activeTab?.kind === "terminal" && activeTab.cwd) return activeTab.cwd;
    // Estate: a chat works in its own folder; the explorer follows it.
    if (activeTab?.kind === "agent-chat") return activeTab.cwd;
    const last = lastTerminalCwdFor(lastTerminal.current, activeSpaceId);
    if (last) return last;
    // Estate: with no terminal yet (a project opened from the welcome screen
    // or the project menu), the project's folder.
    if (projectRoot) return projectRoot;
    const anyTerm = tabs.find(
      (t) =>
        t.kind === "terminal" &&
        t.cwd &&
        (activeSpaceId === null || t.spaceId === activeSpaceId),
    );
    if (anyTerm?.kind === "terminal" && anyTerm.cwd) return anyTerm.cwd;
    return home;
  }, [activeTab, tabs, home, projectRoot, activeSpaceId]);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    if (activeTab?.kind === "terminal" && activeTab.cwd) return activeTab.cwd;
    if (activeTab?.kind === "agent-chat") return activeTab.cwd;
    // Editor tabs inherit the last terminal's cwd (or workspace home), not
    // the file's folder — opening a new terminal from a file shouldn't
    // hijack the user's working directory context.
    return (
      lastTerminalCwdFor(lastTerminal.current, activeSpaceId) ??
      projectRoot ??
      home ??
      undefined
    );
  }, [activeTab, home, projectRoot, activeSpaceId]);

  return { explorerRoot, inheritedCwdForNewTab };
}

/**
 * Estate: the last terminal folder, if that terminal is in the active project.
 * Without a known project (null), any last terminal counts, as before.
 */
export function lastTerminalCwdFor(
  last: { cwd: string; spaceId: string } | null,
  activeSpaceId: string | null,
): string | null {
  if (!last) return null;
  return activeSpaceId === null || last.spaceId === activeSpaceId
    ? last.cwd
    : null;
}
