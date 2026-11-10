import type { WorkspaceEnv } from "@/modules/workspace";
import type { SpaceMeta } from "./store";

export function findActiveSpace(
  spaces: SpaceMeta[],
  activeId: string | null,
): SpaceMeta | null {
  if (activeId) {
    const found = spaces.find((s) => s.id === activeId);
    if (found) return found;
  }
  return spaces[0] ?? null;
}

export function activeSpaceEnv(
  spaces: SpaceMeta[],
  activeId: string | null,
): WorkspaceEnv {
  return findActiveSpace(spaces, activeId)?.env ?? { kind: "local" };
}

// A WSL space falls back to null, not the local cwd, so its first tab opens at
// the WSL home instead of a Windows path.
export function freshTabCwd(
  env: WorkspaceEnv,
  restoredHome: string | null,
  launchCwd: string | null,
  home: string | null,
): string | null {
  return restoredHome ?? (env.kind === "local" ? (launchCwd ?? home) : null);
}

/**
 * Estate: the active tab after switching to a space. Keeps the active tab if
 * it already belongs there (a cross-space jump set it), else the space's last
 * tab. A space without tabs needs one opened ("open"), since the active tab
 * would otherwise stay on the previous project's tab, along with its folder.
 */
export function tabOnSpaceSwitch(
  tabs: readonly { id: number; spaceId: string }[],
  spaceId: string,
  activeId: number,
): { kind: "keep" } | { kind: "activate"; id: number } | { kind: "open" } {
  const inSpace = tabs.filter((t) => t.spaceId === spaceId);
  if (inSpace.length === 0) return { kind: "open" };
  if (inSpace.some((t) => t.id === activeId)) return { kind: "keep" };
  return { kind: "activate", id: inSpace[inSpace.length - 1].id };
}
