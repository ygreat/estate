import { create } from "zustand";
import type { DropZone, WorkspaceLayout } from "./model";

let counter = 0;
/** Ids for layout nodes. Session-local; saved layouts get fresh ids on restore. */
export const newLayoutId = (): string => `pane-${++counter}`;

type LayoutState = {
  /** Split layout per space (project). */
  layouts: Record<string, WorkspaceLayout>;
  setLayout: (spaceId: string, layout: WorkspaceLayout) => void;
  hydrate: (layouts: Record<string, WorkspaceLayout>) => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  layouts: {},
  setLayout: (spaceId, layout) =>
    set((s) =>
      s.layouts[spaceId] === layout
        ? s
        : { layouts: { ...s.layouts, [spaceId]: layout } },
    ),
  hydrate: (layouts) => set((s) => ({ layouts: { ...s.layouts, ...layouts } })),
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
