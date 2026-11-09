import type { Tab } from "@/modules/tabs";
import { leafIds } from "@/modules/terminal/lib/panes";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  closePane,
  type DropZone,
  dropTab,
  findLeaf,
  focusedLeaf,
  isSplit,
  leafForTab,
  MAX_LAYOUT_PANES,
  MAX_TERMINAL_PANES_ON_SCREEN,
  reconcileLayout,
  setSplitSizes,
  visibleTabIds,
  type WorkspaceLayout,
} from "./model";
import { newLayoutId, useLayoutStore } from "./store";

type Params = {
  spaceId: string;
  /** The active space's tabs, in tab-bar order. */
  spaceTabs: Tab[];
  activeId: number;
  setActiveId: (id: number) => void;
  warmTab: (id: number) => void;
};

/**
 * Terminal panes on screen across every visible tab. The WebGL renderer (the
 * one Monterey uses) has a fixed pool of slots, so a split can't exceed it.
 */
function visibleTerminalPanes(layout: WorkspaceLayout, tabs: Tab[]): number {
  const shown = new Set(visibleTabIds(layout));
  let n = 0;
  for (const t of tabs) {
    if (t.kind === "terminal" && shown.has(t.id))
      n += leafIds(t.paneTree).length;
  }
  return n;
}

export function useWorkspaceLayout({
  spaceId,
  spaceTabs,
  activeId,
  setActiveId,
  warmTab,
}: Params) {
  const stored = useLayoutStore((s) => s.layouts[spaceId]);
  const setLayout = useLayoutStore((s) => s.setLayout);

  const tabIds = useMemo(() => spaceTabs.map((t) => t.id), [spaceTabs]);
  // Derived during render so a tab switch never paints a stale layout.
  const layout = useMemo(
    () => reconcileLayout(stored, tabIds, activeId, newLayoutId),
    [stored, tabIds, activeId],
  );
  useEffect(() => {
    if (layout !== stored) setLayout(spaceId, layout);
  }, [layout, stored, setLayout, spaceId]);

  // Panes other than the focused one show tabs that were never activated.
  useEffect(() => {
    for (const id of visibleTabIds(layout)) {
      if (spaceTabs.find((t) => t.id === id)?.cold) warmTab(id);
    }
  }, [layout, spaceTabs, warmTab]);

  const commit = useCallback(
    (next: WorkspaceLayout, focusTabId: number) => {
      if (
        visibleTerminalPanes(next, spaceTabs) > MAX_TERMINAL_PANES_ON_SCREEN
      ) {
        toast.message("Too many terminal panes on screen", {
          description: `A split can show up to ${MAX_TERMINAL_PANES_ON_SCREEN} terminal panes at once.`,
        });
        return false;
      }
      setLayout(spaceId, next);
      setActiveId(focusTabId);
      return true;
    },
    [setLayout, setActiveId, spaceId, spaceTabs],
  );

  const dropTabOnPane = useCallback(
    (tabId: number, leafId: string, zone: DropZone) => {
      const r = dropTab(layout, tabId, leafId, zone, newLayoutId);
      if (!r.ok) {
        if (r.reason === "pane-limit") {
          toast.message(`Up to ${MAX_LAYOUT_PANES} panes`, {
            description: "Close a pane before splitting again.",
          });
        }
        return false;
      }
      return commit(r.layout, tabId);
    },
    [layout, commit],
  );

  /**
   * Splits the focused pane and shows `tabId` beside it. When that tab is the
   * focused pane's own, the pane keeps the nearest tab that isn't on screen.
   */
  const splitWithTab = useCallback(
    (tabId: number, zone: Exclude<DropZone, "center">) => {
      let base = layout;
      const focus = focusedLeaf(base);
      if (focus.tabId === tabId) {
        const shown = new Set(visibleTabIds(base));
        const i = tabIds.indexOf(tabId);
        const order = [...tabIds.slice(i + 1), ...tabIds.slice(0, i).reverse()];
        const fill = order.find((id) => !shown.has(id));
        if (fill === undefined) {
          toast.message("Open another tab to split with");
          return false;
        }
        const swapped = dropTab(base, fill, focus.id, "center", newLayoutId);
        if (!swapped.ok) return false;
        base = swapped.layout;
      }
      const r = dropTab(base, tabId, focus.id, zone, newLayoutId);
      if (!r.ok) {
        if (r.reason === "pane-limit") {
          toast.message(`Up to ${MAX_LAYOUT_PANES} panes`, {
            description: "Close a pane before splitting again.",
          });
        }
        return false;
      }
      return commit(r.layout, tabId);
    },
    [layout, tabIds, commit],
  );

  const focusPane = useCallback(
    (leafId: string) => {
      const leaf = findLeaf(layout, leafId);
      if (leaf && leaf.tabId !== activeId) setActiveId(leaf.tabId);
    },
    [layout, activeId, setActiveId],
  );

  const closePaneOfTab = useCallback(
    (tabId: number) => {
      const leaf = leafForTab(layout, tabId);
      if (!leaf) return;
      const next = closePane(layout, leaf.id);
      if (next === layout) return;
      setLayout(spaceId, next);
      setActiveId(focusedLeaf(next).tabId);
    },
    [layout, setLayout, setActiveId, spaceId],
  );

  const setSizes = useCallback(
    (splitId: string, sizes: number[]) => {
      const next = setSplitSizes(layout, splitId, sizes);
      if (next !== layout) setLayout(spaceId, next);
    },
    [layout, setLayout, spaceId],
  );

  const split = isSplit(layout);
  const splitTabIds = useMemo(
    () => new Set(split ? visibleTabIds(layout) : []),
    [layout, split],
  );

  return {
    layout,
    split,
    /** Tabs shown in a pane of a split (empty when there is one pane). */
    splitTabIds,
    dropTabOnPane,
    splitWithTab,
    focusPane,
    closePaneOfTab,
    setSizes,
  };
}
