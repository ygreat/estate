import { create } from "zustand";
import type { Groups } from "./groups";
import type { DropZone } from "./model";

let counter = 0;
/** Ids for layout nodes. Session-local; saved layouts get fresh ids on restore. */
export const newLayoutId = (): string => `pane-${++counter}`;

type LayoutState = {
  /** Split groups per space (project). */
  groups: Record<string, Groups>;
  setGroups: (spaceId: string, groups: Groups) => void;
  hydrate: (groups: Record<string, Groups>) => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  groups: {},
  setGroups: (spaceId, groups) =>
    set((s) =>
      s.groups[spaceId] === groups
        ? s
        : { groups: { ...s.groups, [spaceId]: groups } },
    ),
  hydrate: (groups) => set((s) => ({ groups: { ...s.groups, ...groups } })),
}));

export type PaneDropTarget = { leafId: string; zone: DropZone };

type TabDragState = {
  /** Tab being dragged out of the tab bar over the workspace, if any. */
  tabId: number | null;
  x: number;
  y: number;
  /** Where releasing would drop it, set by the layout view's hit test. */
  target: PaneDropTarget | null;
  move: (tabId: number, x: number, y: number) => void;
  leaveWorkspace: () => void;
  setTarget: (target: PaneDropTarget | null) => void;
  /** Ends the drag and returns the drop target, if the tab was over a pane. */
  end: () => PaneDropTarget | null;
};

export const useTabDragStore = create<TabDragState>((set, get) => ({
  tabId: null,
  x: 0,
  y: 0,
  target: null,
  move: (tabId, x, y) => set({ tabId, x, y }),
  leaveWorkspace: () =>
    set((s) => (s.tabId === null ? s : { tabId: null, target: null })),
  setTarget: (target) =>
    set((s) =>
      s.target?.leafId === target?.leafId && s.target?.zone === target?.zone
        ? s
        : { target },
    ),
  end: () => {
    const target = get().tabId === null ? null : get().target;
    set({ tabId: null, target: null });
    return target;
  },
}));
