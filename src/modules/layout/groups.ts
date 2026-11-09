/**
 * Split groups: the space-level model of split view.
 *
 * A group is a split of two or more tabs (a tree from model.ts). A tab belongs
 * to at most one group. Activating a grouped tab shows its group with that
 * tab's pane focused; activating any other tab shows it alone. New tabs are
 * standalone, so opening one never disturbs a split. Everything here is pure
 * and returns the same array when nothing changes.
 */
import {
  closePane,
  type DropZone,
  dropTab,
  findLeaf,
  focusedLeaf,
  hydrateLayout,
  layoutLeaves,
  leafForTab,
  MAX_LAYOUT_PANES,
  type NewId,
  removeTab,
  type SerializedLayoutNode,
  serializeLayout,
  setSplitSizes,
  singleLayout,
  type WorkspaceLayout,
} from "./model";

export type SplitGroup = WorkspaceLayout & { id: string };
export type Groups = readonly SplitGroup[];

export type View =
  | { kind: "single"; tabId: number }
  | { kind: "group"; group: SplitGroup; focusedLeafId: string };

export const NO_GROUPS: Groups = [];

export function groupOf(groups: Groups, tabId: number): SplitGroup | undefined {
  return groups.find((g) => leafForTab(g, tabId));
}

/** What the workspace shows for the active tab. */
export function viewFor(groups: Groups, activeId: number): View {
  const group = groupOf(groups, activeId);
  if (!group) return { kind: "single", tabId: activeId };
  const leaf = leafForTab(group, activeId);
  return {
    kind: "group",
    group,
    focusedLeafId: leaf ? leaf.id : group.focusedLeafId,
  };
}

/** Tabs that are part of any group. */
export function groupedTabIds(groups: Groups): Set<number> {
  const out = new Set<number>();
  for (const g of groups)
    for (const l of layoutLeaves(g.root)) out.add(l.tabId);
  return out;
}

function replaceGroup(
  groups: Groups,
  id: string,
  next: SplitGroup | null,
): Groups {
  const out: SplitGroup[] = [];
  for (const g of groups) {
    if (g.id !== id) out.push(g);
    else if (next && layoutLeaves(next.root).length >= 2) out.push(next);
  }
  return out;
}

/** Takes a tab out of whatever group holds it; a group left with one tab dissolves. */
export function withoutTab(groups: Groups, tabId: number): Groups {
  const g = groupOf(groups, tabId);
  if (!g) return groups;
  const next = removeTab(g, tabId);
  return replaceGroup(groups, g.id, next ? { ...next, id: g.id } : null);
}

/** Drops panes of closed tabs, dissolves groups under two tabs, and dedupes. */
export function reconcileGroups(
  groups: Groups,
  tabIds: readonly number[],
): Groups {
  const live = new Set(tabIds);
  const seen = new Set<number>();
  let changed = false;
  const out: SplitGroup[] = [];
  for (const g of groups) {
    let tree: WorkspaceLayout | null = g;
    for (const leaf of layoutLeaves(g.root)) {
      if (live.has(leaf.tabId) && !seen.has(leaf.tabId)) {
        seen.add(leaf.tabId);
        continue;
      }
      changed = true;
      tree = tree ? removeTab(tree, leaf.tabId) : null;
    }
    if (!tree || layoutLeaves(tree.root).length < 2) {
      changed = true;
      continue;
    }
    out.push(tree === g ? g : { ...tree, id: g.id });
  }
  return changed ? out : groups;
}

export type GroupDropResult =
  | { ok: true; groups: Groups; focus: number }
  | {
      ok: false;
      reason: "same-pane" | "pane-limit" | "unknown-pane" | "nothing-to-split";
    };

/**
 * Drops `tabId` on a pane of the current view.
 *
 * - Showing one tab: an edge makes a group of that tab and `tabId`. Dragging
 *   the shown tab onto its own edge splits it with `fillTabId` (the tab the
 *   caller picks for the other half).
 * - Showing a group: an edge adds `tabId` beside the target pane; the center
 *   puts it in that pane (the tab it replaces becomes standalone).
 *
 * A tab moves out of any other group it was in.
 */
export function dropInView(
  groups: Groups,
  activeId: number,
  tabId: number,
  targetLeafId: string,
  zone: DropZone,
  fillTabId: number | undefined,
  newId: NewId,
): GroupDropResult {
  const view = viewFor(groups, activeId);

  if (view.kind === "single") {
    if (zone === "center") return { ok: true, groups, focus: tabId };
    let base = groups;
    let shownTab = activeId;
    if (tabId === activeId) {
      if (fillTabId === undefined || fillTabId === activeId) {
        return { ok: false, reason: "nothing-to-split" };
      }
      base = withoutTab(base, fillTabId);
      shownTab = fillTabId;
    } else {
      base = withoutTab(base, tabId);
    }
    const start = singleLayout(shownTab, newId);
    const r = dropTab(start, tabId, start.focusedLeafId, zone, newId);
    if (!r.ok) return r;
    return {
      ok: true,
      groups: [...base, { ...r.layout, id: newId() }],
      focus: tabId,
    };
  }

  const group = view.group;
  if (!findLeaf(group, targetLeafId))
    return { ok: false, reason: "unknown-pane" };
  const inGroup = Boolean(leafForTab(group, tabId));
  // A tab from elsewhere leaves its old group first (that group isn't this one).
  const base = inGroup ? groups : withoutTab(groups, tabId);
  const current = base.find((g) => g.id === group.id) ?? group;
  if (
    !inGroup &&
    zone !== "center" &&
    layoutLeaves(current.root).length >= MAX_LAYOUT_PANES
  ) {
    return { ok: false, reason: "pane-limit" };
  }
  const r = dropTab(current, tabId, targetLeafId, zone, newId);
  if (!r.ok) return r;
  return {
    ok: true,
    groups: replaceGroup(base, group.id, { ...r.layout, id: group.id }),
    focus: tabId,
  };
}

/**
 * Closes the pane showing `tabId`: the tab leaves its group and stays open.
 * `focus` is the tab to show next (the group's remaining focused tab).
 */
export function closePaneOf(
  groups: Groups,
  tabId: number,
): { groups: Groups; focus: number } | null {
  const g = groupOf(groups, tabId);
  if (!g) return null;
  const leaf = leafForTab(g, tabId);
  if (!leaf) return null;
  const next = closePane({ ...g, focusedLeafId: leaf.id }, leaf.id);
  const focus = focusedLeaf(next).tabId;
  return { groups: replaceGroup(groups, g.id, { ...next, id: g.id }), focus };
}

export function setGroupSizes(
  groups: Groups,
  groupId: string,
  splitId: string,
  sizes: number[],
): Groups {
  const g = groups.find((x) => x.id === groupId);
  if (!g) return groups;
  const next = setSplitSizes(g, splitId, sizes);
  return next === g
    ? groups
    : replaceGroup(groups, groupId, { ...next, id: groupId });
}

/** Tabs of a group in pane order, for keeping them together in the tab bar. */
export function groupTabOrder(group: WorkspaceLayout): number[] {
  return layoutLeaves(group.root).map((l) => l.tabId);
}

// ---- Persistence --------------------------------------------------------------

export function serializeGroups(
  groups: Groups,
  tabIndexOf: (tabId: number) => number | undefined,
): SerializedLayoutNode[] | undefined {
  const out = groups
    .map((g) => serializeLayout(g, tabIndexOf))
    .filter((x): x is SerializedLayoutNode => x !== undefined);
  return out.length ? out : undefined;
}

/** Restores saved groups; also accepts the older single `layout` form. */
export function hydrateGroups(
  saved: unknown,
  tabIdAt: (index: number) => number | undefined,
  newId: NewId,
): Groups {
  const list = Array.isArray(saved) ? saved : saved ? [saved] : [];
  const out: SplitGroup[] = [];
  const used = new Set<number>();
  for (const raw of list.slice(0, 16)) {
    const tree = hydrateLayout(
      raw,
      (i) => {
        const id = tabIdAt(i);
        return id === undefined || used.has(id) ? undefined : id;
      },
      newId,
    );
    if (!tree || layoutLeaves(tree.root).length < 2) continue;
    for (const l of layoutLeaves(tree.root)) used.add(l.tabId);
    out.push({ ...tree, id: newId() });
  }
  return out;
}
