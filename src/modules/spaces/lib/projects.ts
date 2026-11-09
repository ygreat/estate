/**
 * Estate: projects for the welcome screen and the status bar's project menu.
 * A project is a space with a root folder. Pure, apart from the small
 * "last opened" map kept in local storage for ordering.
 */
import type { SpaceMeta } from "./store";

const OPENED_KEY = "estate:project-opened";

export function readOpenedAt(): Record<string, number> {
  try {
    const raw = localStorage.getItem(OPENED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

export function markOpened(spaceId: string, now = Date.now()): void {
  try {
    const map = readOpenedAt();
    map[spaceId] = now;
    localStorage.setItem(OPENED_KEY, JSON.stringify(map));
  } catch {
    // Storage off: recents just fall back to the spaces' own order.
  }
}

/** Projects with a folder, most recently opened first. */
export function recentProjects(
  spaces: readonly SpaceMeta[],
  openedAt: Readonly<Record<string, number>>,
): SpaceMeta[] {
  return spaces
    .filter((s) => s.root)
    .map((s, i) => ({ s, i, at: openedAt[s.id] ?? s.updatedAt ?? 0 }))
    .sort((a, b) => b.at - a.at || a.i - b.i)
    .map((x) => x.s);
}

function normalize(path: string): string {
  return path.replace(/[\\/]+$/, "") || path;
}

/** The project already open on this folder, if any. */
export function projectForFolder(
  spaces: readonly SpaceMeta[],
  folder: string,
): SpaceMeta | undefined {
  const want = normalize(folder);
  return spaces.find((s) => s.root && normalize(s.root) === want);
}

export function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** "~/code/app" for display. */
export function shortPath(path: string, home: string | null): string {
  if (home && (path === home || path.startsWith(`${normalize(home)}/`))) {
    return `~${path.slice(normalize(home).length)}`;
  }
  return path;
}
