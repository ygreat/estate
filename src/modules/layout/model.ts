/**
 * Split view of tabs: the pure model.
 *
 * The workspace area is a tree of splits whose leaves each show one tab (of any
 * kind). One tab bar drives it: activating a tab that is already on screen
 * focuses its pane; activating one that is not shows it in the focused pane.
 * Every function here is pure and returns the input unchanged (same reference)
 * when nothing changes, so React state built on it re-renders only on change.
 */

export type SplitDir = "row" | "column";
export type DropZone = "left" | "right" | "top" | "bottom" | "center";

export type LayoutLeaf = { kind: "leaf"; id: string; tabId: number };
export type LayoutSplit = {
  kind: "split";
  id: string;
  dir: SplitDir;
  children: LayoutNode[];
  /** Percent per child, summing to 100. */
  sizes: number[];
};
export type LayoutNode = LayoutLeaf | LayoutSplit;

export type WorkspaceLayout = {
  root: LayoutNode;
  focusedLeafId: string;
};

/** Panes on screen at once. Four keeps each pane usable on a 15-inch screen. */
export const MAX_LAYOUT_PANES = 4;

/**
 * Terminal panes on screen at once, across every visible tab: the WebGL
 * renderer's slot pool (Monterey's renderer). Kept equal to
 * MAX_WEBGL_RENDERER_SLOTS by a test, without importing the renderer here.
 */
export const MAX_TERMINAL_PANES_ON_SCREEN = 12;

export type NewId = () => string;

export function singleLayout(tabId: number, newId: NewId): WorkspaceLayout {
  const id = newId();
  return { root: { kind: "leaf", id, tabId }, focusedLeafId: id };
}

export function layoutLeaves(node: LayoutNode): LayoutLeaf[] {
  if (node.kind === "leaf") return [node];
  return node.children.flatMap(layoutLeaves);
}

export function isSplit(layout: WorkspaceLayout): boolean {
  return layout.root.kind === "split";
}

export function findLeaf(
  layout: WorkspaceLayout,
  leafId: string,
): LayoutLeaf | undefined {
  return layoutLeaves(layout.root).find((l) => l.id === leafId);
}

export function leafForTab(
  layout: WorkspaceLayout,
  tabId: number,
): LayoutLeaf | undefined {
  return layoutLeaves(layout.root).find((l) => l.tabId === tabId);
}

export function visibleTabIds(layout: WorkspaceLayout): number[] {
  return layoutLeaves(layout.root).map((l) => l.tabId);
}

export function focusedLeaf(layout: WorkspaceLayout): LayoutLeaf {
  const leaves = layoutLeaves(layout.root);
  return leaves.find((l) => l.id === layout.focusedLeafId) ?? leaves[0];
}

function evenSizes(n: number): number[] {
  return Array.from({ length: n }, () => 100 / n);
}

function normalize(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return evenSizes(sizes.length);
  return sizes.map((s) => (s / total) * 100);
}

/** Replaces a node (by id) anywhere in the tree. */
function replaceNode(
  node: LayoutNode,
  id: string,
  next: LayoutNode,
): LayoutNode {
  if (node.id === id) return next;
  if (node.kind === "leaf") return node;
  let changed = false;
  const children = node.children.map((c) => {
    const r = replaceNode(c, id, next);
    if (r !== c) changed = true;
    return r;
  });
  return changed ? { ...node, children } : node;
}

/**
 * Removes a leaf and collapses splits left with one child. Returns null when
 * the removed leaf was the whole tree.
 */
function removeLeafNode(node: LayoutNode, leafId: string): LayoutNode | null {
  if (node.kind === "leaf") return node.id === leafId ? null : node;
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  let changed = false;
  node.children.forEach((c, i) => {
    const r = removeLeafNode(c, leafId);
    if (r !== c) changed = true;
    if (r) {
      children.push(r);
      sizes.push(node.sizes[i] ?? 0);
    }
  });
  if (!changed) return node;
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return flatten({ ...node, children, sizes: normalize(sizes) });
}

/** Merges a child split into its parent when both split the same way. */
function flatten(split: LayoutSplit): LayoutSplit {
  if (!split.children.some((c) => c.kind === "split" && c.dir === split.dir)) {
    return split;
  }
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  split.children.forEach((c, i) => {
    const share = split.sizes[i] ?? 0;
    if (c.kind === "split" && c.dir === split.dir) {
      c.children.forEach((g, j) => {
        children.push(g);
        sizes.push((share * (c.sizes[j] ?? 0)) / 100);
      });
    } else {
      children.push(c);
      sizes.push(share);
    }
  });
  return { ...split, children, sizes: normalize(sizes) };
}

function withFocus(layout: WorkspaceLayout, leafId: string): WorkspaceLayout {
  return layout.focusedLeafId === leafId
    ? layout
    : { ...layout, focusedLeafId: leafId };
}

function withRoot(
  layout: WorkspaceLayout,
  root: LayoutNode,
  focusedLeafId = layout.focusedLeafId,
): WorkspaceLayout {
  const leaves = layoutLeaves(root);
  const focus = leaves.some((l) => l.id === focusedLeafId)
    ? focusedLeafId
    : leaves[0].id;
  return { root, focusedLeafId: focus };
}

function setLeafTab(
  layout: WorkspaceLayout,
  leafId: string,
  tabId: number,
): WorkspaceLayout {
  const leaf = findLeaf(layout, leafId);
  if (!leaf || leaf.tabId === tabId) return layout;
  return withRoot(layout, replaceNode(layout.root, leafId, { ...leaf, tabId }));
}

/**
 * Brings a layout in line with the space's tabs and the active tab:
 * panes whose tab closed are removed, the active tab is focused where it is
 * shown, and otherwise it replaces the focused pane's tab.
 */
export function reconcileLayout(
  layout: WorkspaceLayout | undefined,
  tabIds: readonly number[],
  activeId: number,
  newId: NewId,
): WorkspaceLayout {
  const live = new Set(tabIds);
  const activeLive = live.has(activeId);
  if (!layout) return singleLayout(activeId, newId);

  let next = layout;
  const seen = new Set<number>();
  for (const leaf of layoutLeaves(layout.root)) {
    // A tab shows in at most one pane; a closed tab leaves no pane behind.
    if (live.has(leaf.tabId) && !seen.has(leaf.tabId)) {
      seen.add(leaf.tabId);
      continue;
    }
    const root = removeLeafNode(next.root, leaf.id);
    if (!root) return singleLayout(activeId, newId);
    next = withRoot(next, root);
  }

  if (!activeLive) return next;
  const shown = leafForTab(next, activeId);
  if (shown) return withFocus(next, shown.id);
  return setLeafTab(next, focusedLeaf(next).id, activeId);
}

export type DropResult =
  | { ok: true; layout: WorkspaceLayout }
  | { ok: false; reason: "same-pane" | "pane-limit" | "unknown-pane" };

/**
 * Drops a tab on a pane. "center" shows it in that pane (swapping with the
 * pane that showed it before, if any); an edge splits the pane and puts the
 * tab in the new half. A tab already on screen moves rather than duplicates.
 */
export function dropTab(
  layout: WorkspaceLayout,
  tabId: number,
  targetLeafId: string,
  zone: DropZone,
  newId: NewId,
): DropResult {
  const target = findLeaf(layout, targetLeafId);
  if (!target) return { ok: false, reason: "unknown-pane" };
  const shownIn = leafForTab(layout, tabId);

  if (zone === "center") {
    if (target.tabId === tabId)
      return { ok: true, layout: withFocus(layout, target.id) };
    let root = replaceNode(layout.root, target.id, { ...target, tabId });
    if (shownIn) {
      root = replaceNode(root, shownIn.id, { ...shownIn, tabId: target.tabId });
    }
    return { ok: true, layout: withRoot(layout, root, target.id) };
  }

  if (target.tabId === tabId) return { ok: false, reason: "same-pane" };

  let base = layout;
  if (shownIn) {
    const root = removeLeafNode(layout.root, shownIn.id);
    // shownIn !== target, so the tree keeps at least the target leaf.
    if (root) base = withRoot(layout, root);
  }
  if (layoutLeaves(base.root).length >= MAX_LAYOUT_PANES) {
    return { ok: false, reason: "pane-limit" };
  }

  const dir: SplitDir = zone === "left" || zone === "right" ? "row" : "column";
  const before = zone === "left" || zone === "top";
  const fresh: LayoutLeaf = { kind: "leaf", id: newId(), tabId };
  const root = splitAt(base.root, target.id, dir, before, fresh, newId);
  return { ok: true, layout: withRoot(base, root, fresh.id) };
}

function splitAt(
  root: LayoutNode,
  targetId: string,
  dir: SplitDir,
  before: boolean,
  fresh: LayoutLeaf,
  newId: NewId,
): LayoutNode {
  // Same direction as the parent: become a sibling and share the target's size.
  const parent = parentOf(root, targetId);
  if (parent && parent.dir === dir) {
    const i = parent.children.findIndex((c) => c.id === targetId);
    const half = (parent.sizes[i] ?? 100 / parent.children.length) / 2;
    const children = [...parent.children];
    const sizes = [...parent.sizes];
    const at = before ? i : i + 1;
    sizes[i] = half;
    children.splice(at, 0, fresh);
    sizes.splice(at, 0, half);
    return replaceNode(root, parent.id, {
      ...parent,
      children,
      sizes: normalize(sizes),
    });
  }
  const target = findNode(root, targetId);
  if (!target) return root;
  const split: LayoutSplit = {
    kind: "split",
    id: newId(),
    dir,
    children: before ? [fresh, target] : [target, fresh],
    sizes: [50, 50],
  };
  return replaceNode(root, targetId, split);
}

function findNode(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.id === id) return node;
  if (node.kind === "leaf") return undefined;
  for (const c of node.children) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return undefined;
}

function parentOf(node: LayoutNode, id: string): LayoutSplit | undefined {
  if (node.kind === "leaf") return undefined;
  if (node.children.some((c) => c.id === id)) return node;
  for (const c of node.children) {
    const hit = parentOf(c, id);
    if (hit) return hit;
  }
  return undefined;
}

/** Closes a pane. Its tab stays open; it just leaves the screen. */
export function closePane(
  layout: WorkspaceLayout,
  leafId: string,
): WorkspaceLayout {
  if (layout.root.kind === "leaf") return layout;
  const parent = parentOf(layout.root, leafId);
  const root = removeLeafNode(layout.root, leafId);
  if (!root || root === layout.root) return layout;
  // Focus moves to the closed pane's neighbour.
  let focus = layout.focusedLeafId;
  if (focus === leafId && parent) {
    const i = parent.children.findIndex((c) => c.id === leafId);
    const neighbour = parent.children[i > 0 ? i - 1 : 1];
    if (neighbour) focus = layoutLeaves(neighbour)[0].id;
  }
  return withRoot(layout, root, focus);
}

/** Records divider positions. Ignores stale ids and unchanged sizes. */
export function setSplitSizes(
  layout: WorkspaceLayout,
  splitId: string,
  sizes: number[],
): WorkspaceLayout {
  const node = findNode(layout.root, splitId);
  if (node?.kind !== "split") return layout;
  if (sizes.length !== node.children.length) return layout;
  if (sizes.every((s) => !(s >= 0))) return layout;
  const next = normalize(sizes);
  if (next.every((s, i) => Math.abs(s - (node.sizes[i] ?? 0)) < 0.01)) {
    return layout;
  }
  return withRoot(
    layout,
    replaceNode(layout.root, splitId, { ...node, sizes: next }),
  );
}

// ---- Persistence ------------------------------------------------------------

/** Saved form: leaves point at the tab's index among the space's saved tabs. */
export type SerializedLayoutNode =
  | { kind: "leaf"; tab: number; focused?: boolean }
  | {
      kind: "split";
      dir: SplitDir;
      children: SerializedLayoutNode[];
      sizes: number[];
    };

/**
 * Serializes a split layout. Panes whose tab isn't saved (private terminals,
 * diffs) are dropped. Returns undefined when nothing worth saving remains: a
 * single pane is fully described by the space's active tab.
 */
export function serializeLayout(
  layout: WorkspaceLayout,
  tabIndexOf: (tabId: number) => number | undefined,
): SerializedLayoutNode | undefined {
  let root: LayoutNode | null = layout.root;
  for (const leaf of layoutLeaves(layout.root)) {
    if (tabIndexOf(leaf.tabId) === undefined && root) {
      root = removeLeafNode(root, leaf.id);
    }
  }
  if (!root || root.kind === "leaf") return undefined;
  const focusId = layout.focusedLeafId;
  const walk = (n: LayoutNode): SerializedLayoutNode =>
    n.kind === "leaf"
      ? {
          kind: "leaf",
          tab: tabIndexOf(n.tabId) as number,
          ...(n.id === focusId && { focused: true }),
        }
      : {
          kind: "split",
          dir: n.dir,
          children: n.children.map(walk),
          sizes: n.sizes.map((s) => Math.round(s * 100) / 100),
        };
  return walk(root);
}

/**
 * Restores a saved layout. Leaves whose tab is gone are dropped, a tab shows
 * in at most one pane, and anything malformed yields undefined.
 */
export function hydrateLayout(
  saved: unknown,
  tabIdAt: (index: number) => number | undefined,
  newId: NewId,
): WorkspaceLayout | undefined {
  const used = new Set<number>();
  let focusId: string | undefined;
  let leafCount = 0;
  const walk = (raw: unknown, depth: number): LayoutNode | null => {
    if (!raw || typeof raw !== "object" || depth > 8) return null;
    const n = raw as Record<string, unknown>;
    if (n.kind === "leaf") {
      if (typeof n.tab !== "number" || leafCount >= MAX_LAYOUT_PANES)
        return null;
      const tabId = tabIdAt(n.tab);
      if (tabId === undefined || used.has(tabId)) return null;
      used.add(tabId);
      leafCount++;
      const id = newId();
      if (n.focused === true) focusId = id;
      return { kind: "leaf", id, tabId };
    }
    if (n.kind === "split" && (n.dir === "row" || n.dir === "column")) {
      if (!Array.isArray(n.children)) return null;
      const rawSizes = Array.isArray(n.sizes) ? n.sizes : [];
      const children: LayoutNode[] = [];
      const sizes: number[] = [];
      n.children.forEach((c, i) => {
        const child = walk(c, depth + 1);
        if (!child) return;
        children.push(child);
        const s = rawSizes[i];
        sizes.push(typeof s === "number" && s > 0 ? s : 0);
      });
      if (children.length === 0) return null;
      if (children.length === 1) return children[0];
      return flatten({
        kind: "split",
        id: newId(),
        dir: n.dir,
        children,
        sizes: normalize(
          sizes.some((s) => s > 0) ? sizes : evenSizes(children.length),
        ),
      });
    }
    return null;
  };
  const root = walk(saved, 0);
  if (!root) return undefined;
  const leaves = layoutLeaves(root);
  return { root, focusedLeafId: focusId ?? leaves[0].id };
}
