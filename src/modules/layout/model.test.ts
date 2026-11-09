import { MAX_WEBGL_RENDERER_SLOTS } from "@/modules/terminal/ghostty/webgl/WebGlTerminalRuntime";
import { describe, expect, it } from "vitest";
import {
  closePane,
  dropTab,
  hydrateLayout,
  type LayoutNode,
  layoutLeaves,
  MAX_LAYOUT_PANES,
  MAX_TERMINAL_PANES_ON_SCREEN,
  reconcileLayout,
  serializeLayout,
  setSplitSizes,
  singleLayout,
  visibleTabIds,
  type WorkspaceLayout,
} from "./model";

function ids() {
  let n = 0;
  return () => `n${++n}`;
}

function shape(node: LayoutNode): unknown {
  return node.kind === "leaf"
    ? node.tabId
    : { [node.dir]: node.children.map(shape) };
}

function split(
  layout: WorkspaceLayout,
  tabId: number,
  leafId: string,
  zone: Parameters<typeof dropTab>[3],
  newId: () => string,
): WorkspaceLayout {
  const r = dropTab(layout, tabId, leafId, zone, newId);
  if (!r.ok) throw new Error(r.reason);
  return r.layout;
}

describe("reconcileLayout", () => {
  it("starts with one pane showing the active tab", () => {
    const l = reconcileLayout(undefined, [1, 2], 1, ids());
    expect(shape(l.root)).toBe(1);
  });

  it("shows a newly activated tab in the focused pane", () => {
    const newId = ids();
    const l = reconcileLayout(singleLayout(1, newId), [1, 2], 2, newId);
    expect(shape(l.root)).toBe(2);
  });

  it("focuses the pane that already shows the active tab", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    const left = layoutLeaves(l.root)[0];
    const next = reconcileLayout(l, [1, 2], 1, newId);
    expect(next.focusedLeafId).toBe(left.id);
    expect(shape(next.root)).toEqual({ row: [1, 2] });
  });

  it("returns the same layout when nothing changes", () => {
    const newId = ids();
    const l = singleLayout(1, newId);
    expect(reconcileLayout(l, [1, 2], 1, newId)).toBe(l);
  });

  it("removes the pane of a closed tab and collapses the split", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    const next = reconcileLayout(l, [1, 3], 1, newId);
    expect(shape(next.root)).toBe(1);
  });

  it("falls back to one pane when every shown tab closed", () => {
    const newId = ids();
    const l = singleLayout(1, newId);
    expect(shape(reconcileLayout(l, [5], 5, newId).root)).toBe(5);
  });

  it("ignores an active tab that isn't in this space", () => {
    const newId = ids();
    const l = singleLayout(1, newId);
    expect(reconcileLayout(l, [1], 99, newId)).toBe(l);
  });
});

describe("dropTab", () => {
  it("splits a pane on each edge", () => {
    const newId = ids();
    const base = singleLayout(1, newId);
    const at = base.focusedLeafId;
    expect(shape(split(base, 2, at, "right", newId).root)).toEqual({
      row: [1, 2],
    });
    expect(shape(split(base, 2, at, "left", newId).root)).toEqual({
      row: [2, 1],
    });
    expect(shape(split(base, 2, at, "bottom", newId).root)).toEqual({
      column: [1, 2],
    });
    expect(shape(split(base, 2, at, "top", newId).root)).toEqual({
      column: [2, 1],
    });
  });

  it("focuses the new pane", () => {
    const newId = ids();
    const base = singleLayout(1, newId);
    const l = split(base, 2, base.focusedLeafId, "right", newId);
    expect(
      layoutLeaves(l.root).find((x) => x.id === l.focusedLeafId)?.tabId,
    ).toBe(2);
  });

  it("adds a sibling in the same direction and halves the target's share", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    const right = layoutLeaves(l.root)[1];
    l = split(l, 3, right.id, "right", newId);
    expect(shape(l.root)).toEqual({ row: [1, 2, 3] });
    expect(l.root.kind === "split" && l.root.sizes).toEqual([50, 25, 25]);
  });

  it("nests a split in the other direction", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    const right = layoutLeaves(l.root)[1];
    l = split(l, 3, right.id, "bottom", newId);
    expect(shape(l.root)).toEqual({ row: [1, { column: [2, 3] }] });
  });

  it("moves a tab that is already on screen instead of duplicating it", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    const left = layoutLeaves(l.root)[0];
    l = split(l, 2, left.id, "bottom", newId);
    expect(shape(l.root)).toEqual({ column: [1, 2] });
    expect(visibleTabIds(l)).toEqual([1, 2]);
  });

  it("swaps tabs when dropped on the center of another pane", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    const left = layoutLeaves(l.root)[0];
    l = split(l, 2, left.id, "center", newId);
    expect(shape(l.root)).toEqual({ row: [2, 1] });
  });

  it("shows a hidden tab in a pane dropped on its center", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    l = split(l, 3, layoutLeaves(l.root)[0].id, "center", newId);
    expect(shape(l.root)).toEqual({ row: [3, 2] });
  });

  it("refuses to split a pane with its own tab", () => {
    const newId = ids();
    const l = singleLayout(1, newId);
    expect(dropTab(l, 1, l.focusedLeafId, "right", newId)).toEqual({
      ok: false,
      reason: "same-pane",
    });
  });

  it("refuses more than the pane limit", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    for (let t = 2; t <= MAX_LAYOUT_PANES; t++) {
      l = split(l, t, l.focusedLeafId, "right", newId);
    }
    expect(layoutLeaves(l.root)).toHaveLength(MAX_LAYOUT_PANES);
    const r = dropTab(l, 99, l.focusedLeafId, "bottom", newId);
    expect(r).toEqual({ ok: false, reason: "pane-limit" });
  });

  it("allows moving a shown tab even at the pane limit", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    for (let t = 2; t <= MAX_LAYOUT_PANES; t++) {
      l = split(l, t, l.focusedLeafId, "right", newId);
    }
    const first = layoutLeaves(l.root)[0];
    const r = dropTab(l, MAX_LAYOUT_PANES, first.id, "bottom", newId);
    expect(r.ok).toBe(true);
  });

  it("reports an unknown pane", () => {
    const newId = ids();
    expect(dropTab(singleLayout(1, newId), 2, "nope", "left", newId)).toEqual({
      ok: false,
      reason: "unknown-pane",
    });
  });
});

describe("closePane", () => {
  it("removes the pane, keeps its tab open, and focuses the neighbour", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    const right = layoutLeaves(l.root)[1];
    const next = closePane(l, right.id);
    expect(shape(next.root)).toBe(1);
    expect(next.focusedLeafId).toBe(layoutLeaves(next.root)[0].id);
  });

  it("leaves a single pane alone", () => {
    const newId = ids();
    const l = singleLayout(1, newId);
    expect(closePane(l, l.focusedLeafId)).toBe(l);
  });

  it("flattens a nested split left with one child", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    l = split(l, 3, layoutLeaves(l.root)[1].id, "bottom", newId);
    l = split(l, 4, layoutLeaves(l.root)[0].id, "right", newId);
    // row [1, 4, column [2, 3]] -> close 2 -> row [1, 4, 3]
    const two = layoutLeaves(l.root).find((x) => x.tabId === 2);
    const next = closePane(l, two?.id ?? "");
    expect(shape(next.root)).toEqual({ row: [1, 4, 3] });
  });
});

describe("setSplitSizes", () => {
  it("stores normalized sizes and ignores no-ops", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    const id = l.root.id;
    const next = setSplitSizes(l, id, [30, 70]);
    expect(next.root.kind === "split" && next.root.sizes).toEqual([30, 70]);
    expect(setSplitSizes(next, id, [30, 70])).toBe(next);
    expect(setSplitSizes(next, "missing", [50, 50])).toBe(next);
    expect(setSplitSizes(next, id, [1, 2, 3])).toBe(next);
  });
});

describe("serializeLayout / hydrateLayout", () => {
  it("round-trips a split layout through tab indexes", () => {
    const newId = ids();
    let l = singleLayout(10, newId);
    l = split(l, 20, l.focusedLeafId, "right", newId);
    l = split(l, 30, layoutLeaves(l.root)[1].id, "bottom", newId);
    l = setSplitSizes(l, l.root.id, [40, 60]);
    const index = new Map([
      [10, 0],
      [20, 1],
      [30, 2],
    ]);
    const saved = serializeLayout(l, (id) => index.get(id));
    expect(saved).toBeDefined();

    const restoredIds = [110, 120, 130];
    const back = hydrateLayout(saved, (i) => restoredIds[i], ids());
    expect(back && shape(back.root)).toEqual({
      row: [110, { column: [120, 130] }],
    });
    expect(back?.root.kind === "split" && back.root.sizes).toEqual([40, 60]);
    const focused =
      back && layoutLeaves(back.root).find((x) => x.id === back.focusedLeafId);
    expect(focused?.tabId).toBe(130);
  });

  it("drops panes whose tab isn't saved, and saves nothing for one pane", () => {
    const newId = ids();
    let l = singleLayout(1, newId);
    l = split(l, 2, l.focusedLeafId, "right", newId);
    expect(
      serializeLayout(l, (id) => (id === 1 ? 0 : undefined)),
    ).toBeUndefined();
    expect(serializeLayout(singleLayout(1, newId), () => 0)).toBeUndefined();
  });

  it("rejects malformed data and drops missing or duplicate tabs", () => {
    expect(hydrateLayout(null, () => 1, ids())).toBeUndefined();
    expect(
      hydrateLayout({ kind: "split", dir: "diagonal" }, () => 1, ids()),
    ).toBeUndefined();
    const saved = {
      kind: "split",
      dir: "row",
      sizes: [50, 50, 50],
      children: [
        { kind: "leaf", tab: 0 },
        { kind: "leaf", tab: 0 },
        { kind: "leaf", tab: 7 },
      ],
    };
    const back = hydrateLayout(saved, (i) => (i === 0 ? 5 : undefined), ids());
    expect(back && shape(back.root)).toBe(5);
  });

  it("caps restored panes at the limit", () => {
    const children = Array.from({ length: 8 }, (_, i) => ({
      kind: "leaf",
      tab: i,
    }));
    const back = hydrateLayout(
      { kind: "split", dir: "row", sizes: [], children },
      (i) => i + 1,
      ids(),
    );
    expect(back && layoutLeaves(back.root)).toHaveLength(MAX_LAYOUT_PANES);
  });
});

describe("limits", () => {
  it("matches the WebGL renderer's slot pool", () => {
    expect(MAX_TERMINAL_PANES_ON_SCREEN).toBe(MAX_WEBGL_RENDERER_SLOTS);
  });
});
