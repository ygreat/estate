import { describe, expect, it } from "vitest";
import {
  closePaneOf,
  dropInView,
  type GroupDropResult,
  groupedTabIds,
  groupOf,
  type Groups,
  hydrateGroups,
  NO_GROUPS,
  reconcileGroups,
  serializeGroups,
  setGroupSizes,
  viewFor,
} from "./groups";
import { type LayoutNode, layoutLeaves, MAX_LAYOUT_PANES } from "./model";

function ids() {
  let n = 0;
  return () => `g${++n}`;
}

function shape(node: LayoutNode): unknown {
  return node.kind === "leaf"
    ? node.tabId
    : { [node.dir]: node.children.map(shape) };
}

function ok(r: GroupDropResult): { groups: Groups; focus: number } {
  if (!r.ok) throw new Error(r.reason);
  return r;
}

/** Drops onto the first pane of whatever the active tab shows. */
function drop(
  groups: Groups,
  activeId: number,
  tabId: number,
  zone: "left" | "right" | "top" | "bottom" | "center",
  newId: () => string,
  fill?: number,
) {
  const view = viewFor(groups, activeId);
  const leafId =
    view.kind === "group" ? layoutLeaves(view.group.root)[0].id : "single";
  return dropInView(groups, activeId, tabId, leafId, zone, fill, newId);
}

describe("split groups", () => {
  it("shows a standalone tab alone", () => {
    expect(viewFor(NO_GROUPS, 1)).toEqual({ kind: "single", tabId: 1 });
  });

  it("dropping another tab on an edge of a single tab makes a group", () => {
    const r = ok(drop(NO_GROUPS, 1, 2, "right", ids()));
    expect(r.groups).toHaveLength(1);
    expect(shape(r.groups[0].root)).toEqual({ row: [1, 2] });
    expect(r.focus).toBe(2);
  });

  it("dragging the shown tab onto its own edge splits it with the fill tab", () => {
    const r = ok(drop(NO_GROUPS, 1, 1, "bottom", ids(), 2));
    expect(shape(r.groups[0].root)).toEqual({ column: [2, 1] });
    expect(r.focus).toBe(1);
  });

  it("refuses to split the only tab with nothing to fill", () => {
    expect(drop(NO_GROUPS, 1, 1, "right", ids())).toEqual({
      ok: false,
      reason: "nothing-to-split",
    });
  });

  it("a new standalone tab shows alone and leaves the group intact", () => {
    const { groups } = ok(drop(NO_GROUPS, 1, 2, "right", ids()));
    expect(viewFor(groups, 3)).toEqual({ kind: "single", tabId: 3 });
    const back = viewFor(groups, 1);
    expect(back.kind).toBe("group");
    expect(back.kind === "group" && shape(back.group.root)).toEqual({
      row: [1, 2],
    });
  });

  it("activating a grouped tab focuses its pane", () => {
    const { groups } = ok(drop(NO_GROUPS, 1, 2, "right", ids()));
    const v = viewFor(groups, 1);
    expect(
      v.kind === "group" &&
        layoutLeaves(v.group.root).find((l) => l.id === v.focusedLeafId)?.tabId,
    ).toBe(1);
  });

  it("adds a tab to the shown group on an edge", () => {
    const newId = ids();
    let { groups } = ok(drop(NO_GROUPS, 1, 2, "right", newId));
    groups = ok(drop(groups, 2, 3, "bottom", newId)).groups;
    expect(groups).toHaveLength(1);
    expect(shape(groups[0].root)).toEqual({ row: [{ column: [1, 3] }, 2] });
  });

  it("center drop replaces a pane's tab, which becomes standalone", () => {
    const newId = ids();
    let { groups } = ok(drop(NO_GROUPS, 1, 2, "right", newId));
    groups = ok(drop(groups, 1, 3, "center", newId)).groups;
    expect(shape(groups[0].root)).toEqual({ row: [3, 2] });
    expect(groupOf(groups, 1)).toBeUndefined();
  });

  it("moves a tab out of another group, dissolving it", () => {
    const newId = ids();
    let { groups } = ok(drop(NO_GROUPS, 1, 2, "right", newId));
    groups = ok(drop(groups, 3, 4, "right", newId)).groups;
    expect(groups).toHaveLength(2);
    // Show tab 1's group and pull tab 4 into it: 3+4 dissolves.
    groups = ok(drop(groups, 1, 4, "bottom", newId)).groups;
    expect(groups).toHaveLength(1);
    expect([...groupedTabIds(groups)].sort()).toEqual([1, 2, 4]);
  });

  it("caps a group at the pane limit", () => {
    const newId = ids();
    let { groups } = ok(drop(NO_GROUPS, 1, 2, "right", newId));
    for (let t = 3; t <= MAX_LAYOUT_PANES; t++)
      groups = ok(drop(groups, 1, t, "right", newId)).groups;
    expect(drop(groups, 1, 99, "bottom", newId)).toEqual({
      ok: false,
      reason: "pane-limit",
    });
  });

  it("closing a pane keeps the tab open and dissolves a group of two", () => {
    const { groups } = ok(drop(NO_GROUPS, 1, 2, "right", ids()));
    const r = closePaneOf(groups, 2);
    expect(r?.groups).toEqual([]);
    expect(r?.focus).toBe(1);
  });

  it("reconcile drops closed tabs and dissolves small groups", () => {
    const newId = ids();
    let { groups } = ok(drop(NO_GROUPS, 1, 2, "right", newId));
    groups = ok(drop(groups, 1, 3, "bottom", newId)).groups;
    expect(reconcileGroups(groups, [1, 2, 3])).toBe(groups);
    const less = reconcileGroups(groups, [1, 3]);
    expect(shape(less[0].root)).toEqual({ column: [1, 3] });
    expect(reconcileGroups(less, [1])).toEqual([]);
  });

  it("stores divider sizes per group", () => {
    const { groups } = ok(drop(NO_GROUPS, 1, 2, "right", ids()));
    const g = groups[0];
    const next = setGroupSizes(groups, g.id, g.root.id, [30, 70]);
    expect(next[0].root.kind === "split" && next[0].root.sizes).toEqual([
      30, 70,
    ]);
    expect(setGroupSizes(next, "nope", g.root.id, [50, 50])).toBe(next);
  });

  it("round-trips groups through saved tab indexes, and reads the older single layout", () => {
    const newId = ids();
    let { groups } = ok(drop(NO_GROUPS, 10, 20, "right", newId));
    groups = ok(drop(groups, 30, 40, "bottom", newId)).groups;
    const index = new Map([
      [10, 0],
      [20, 1],
      [30, 2],
      [40, 3],
    ]);
    const saved = serializeGroups(groups, (id) => index.get(id));
    expect(saved).toHaveLength(2);
    const tabs = [110, 120, 130, 140];
    const back = hydrateGroups(saved, (i) => tabs[i], ids());
    expect(back.map((g) => shape(g.root))).toEqual([
      { row: [110, 120] },
      { column: [130, 140] },
    ]);
    const legacy = hydrateGroups(saved?.[0], (i) => tabs[i], ids());
    expect(legacy).toHaveLength(1);
    expect(hydrateGroups(null, (i) => tabs[i], ids())).toEqual([]);
  });
});
