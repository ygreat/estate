import { type CSSProperties, createContext, useContext } from "react";

/** A pane's box inside the workspace surface, in CSS pixels. */
export type PaneRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** "fill": the whole surface (one pane). A rect: one pane of a split. */
export type TabPlacement = "fill" | PaneRect;

type PlacementLookup = (tabId: number) => TabPlacement | null;

const PlacementContext = createContext<PlacementLookup | null>(null);

export const TabPlacementProvider = PlacementContext.Provider;

/**
 * Where a tab shows in the workspace, or null when it is hidden. Without a
 * provider (tests, standalone stacks) a tab shows when it is the active one.
 */
export function useTabPlacement(): (
  tabId: number,
  activeId: number,
) => TabPlacement | null {
  const lookup = useContext(PlacementContext);
  return (tabId, activeId) =>
    lookup ? lookup(tabId) : tabId === activeId ? "fill" : null;
}

const FILL: CSSProperties = { position: "absolute", inset: 0 };
const FILL_SHOWN: CSSProperties = { ...FILL, pointerEvents: "auto" };

/**
 * Style for a tab's layer. Hidden tabs keep filling the surface (so they keep
 * their size and never relayout on show); visibility is toggled separately.
 */
export function placementStyle(placement: TabPlacement | null): CSSProperties {
  if (placement === null) return FILL;
  // The workspace's per-kind layers ignore the pointer; a shown tab takes it back.
  if (placement === "fill") return FILL_SHOWN;
  return {
    position: "absolute",
    left: placement.left,
    top: placement.top,
    width: placement.width,
    height: placement.height,
    pointerEvents: "auto",
  };
}
