import type { Tab } from "@/modules/tabs";
import { leafIds } from "@/modules/terminal/lib/panes";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  closePaneOf,
  dropInView,
  type Groups,
  groupedTabIds,
  groupTabOrder,
  NO_GROUPS,
  reconcileGroups,
  setGroupSizes,
  viewFor,
} from "./groups";
import {
  type DropZone,
  findLeaf,
  layoutLeaves,
  MAX_LAYOUT_PANES,
  MAX_TERMINAL_PANES_ON_SCREEN,
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
  /** Keeps a group's tabs next to each other in the tab bar. */
  gatherTabs: (ids: readonly number[]) => void;
};

/** The leaf id of the one-pane view (a standalone tab). */
export const SINGLE_LEAF_ID = "single";

function terminalPanes(tabIds: number[], tabs: Tab[]): number {
  const shown = new Set(tabIds);
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
  gatherTabs,
}: Params) {
  const stored = useLayoutStore((s) => s.groups[spaceId]) ?? NO_GROUPS;
  const setGroups = useLayoutStore((s) => s.setGroups);

  const tabIds = useMemo(() => spaceTabs.map((t) => t.id), [spaceTabs]);
  const groups = useMemo(
    () => reconcileGroups(stored, tabIds),
    [stored, tabIds],
  );
  useEffect(() => {
    if (groups !== stored) setGroups(spaceId, groups);
  }, [groups, stored, setGroups, spaceId]);

  const view = useMemo(() => viewFor(groups, activeId), [groups, activeId]);

  // What the frame draws: the active tab's group, or the active tab alone.
  const layout: WorkspaceLayout = useMemo(
    () =>
      view.kind === "group"
        ? { root: view.group.root, focusedLeafId: view.focusedLeafId }
        : {
            root: { kind: "leaf", id: SINGLE_LEAF_ID, tabId: view.tabId },
            focusedLeafId: SINGLE_LEAF_ID,
          },
    [view],
  );
  const split = view.kind === "group";

  // A group shows tabs that may never have been activated (restored, cold).
  useEffect(() => {
    if (view.kind !== "group") return;
    for (const l of layoutLeaves(view.group.root)) {
      if (spaceTabs.find((t) => t.id === l.tabId)?.cold) warmTab(l.tabId);
    }
  }, [view, spaceTabs, warmTab]);

  const commit = useCallback(
    (next: Groups, focus: number) => {
      const shown = viewFor(next, focus);
      const shownTabs =
        shown.kind === "group" ? groupTabOrder(shown.group) : [shown.tabId];
      if (terminalPanes(shownTabs, spaceTabs) > MAX_TERMINAL_PANES_ON_SCREEN) {
        toast.message("Too many terminal panes on screen", {
          description: `A split can show up to ${MAX_TERMINAL_PANES_ON_SCREEN} terminal panes at once.`,
        });
        return false;
      }
      setGroups(spaceId, next);
      setActiveId(focus);
      if (shown.kind === "group") gatherTabs(groupTabOrder(shown.group));
      return true;
    },
    [setGroups, setActiveId, gatherTabs, spaceId, spaceTabs],
  );

  /** The tab to fill the other half when the shown tab is split with itself. */
  const fillFor = useCallback(
    (tabId: number): number | undefined => {
      const grouped = groupedTabIds(groups);
      const i = tabIds.indexOf(tabId);
      const order = [...tabIds.slice(i + 1), ...tabIds.slice(0, i).reverse()];
      return order.find((id) => !grouped.has(id)) ?? order[0];
    },
    [groups, tabIds],
  );

  const dropTabOnPane = useCallback(
    (tabId: number, leafId: string, zone: DropZone) => {
      const r = dropInView(
        groups,
        activeId,
        tabId,
        leafId,
        zone,
        fillFor(tabId),
        newLayoutId,
      );
      if (!r.ok) {
        if (r.reason === "pane-limit") {
          toast.message(`Up to ${MAX_LAYOUT_PANES} panes`, {
            description: "Close a pane before splitting again.",
          });
        } else if (r.reason === "nothing-to-split") {
          toast.message("Open another tab to split with");
        }
        return false;
      }
      return commit(r.groups, r.focus);
    },
    [groups, activeId, fillFor, commit],
  );

  /** "Split right / down" from a tab's menu: beside the focused pane. */
  const splitWithTab = useCallback(
    (tabId: number, zone: Exclude<DropZone, "center">) =>
      dropTabOnPane(tabId, layout.focusedLeafId, zone),
    [dropTabOnPane, layout.focusedLeafId],
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
      const r = closePaneOf(groups, tabId);
      if (!r) return;
      setGroups(spaceId, r.groups);
      setActiveId(r.focus);
    },
    [groups, setGroups, setActiveId, spaceId],
  );

  const setSizes = useCallback(
    (splitId: string, sizes: number[]) => {
      if (view.kind !== "group") return;
      const next = setGroupSizes(groups, view.group.id, splitId, sizes);
      if (next !== groups) setGroups(spaceId, next);
    },
    [view, groups, setGroups, spaceId],
  );

  const splitTabIds = useMemo(() => groupedTabIds(groups), [groups]);
  /** Group id per grouped tab, for drawing groups in the tab bar. */
  const groupOfTab = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of groups) for (const id of groupTabOrder(g)) m.set(id, g.id);
    return m;
  }, [groups]);

  return {
    layout,
    split,
    /** Tabs that belong to a split group. */
    splitTabIds,
    groupOfTab,
    dropTabOnPane,
    splitWithTab,
    focusPane,
    closePaneOfTab,
    setSizes,
  };
}
