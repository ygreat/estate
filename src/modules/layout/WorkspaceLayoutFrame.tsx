import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  beginTerminalResizeInteraction,
  endTerminalResizeInteraction,
  notifyTerminalLayoutMoved,
} from "@/modules/terminal/lib/terminalResizeInteraction";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type DropZone,
  focusedLeaf,
  type LayoutNode,
  layoutLeaves,
  type WorkspaceLayout,
} from "./model";
import {
  type PaneRect,
  type TabPlacement,
  TabPlacementProvider,
} from "./placement";
import { type PaneDropTarget, useTabDragStore } from "./store";

type Props = {
  layout: WorkspaceLayout;
  split: boolean;
  onFocusPane: (leafId: string) => void;
  onSizes: (splitId: string, sizes: number[]) => void;
  /** The per-kind tab layers (terminal, editor, browser...). */
  children: ReactNode;
};

/** Fraction of a pane's width or height that counts as its edge for a drop. */
const EDGE = 0.25;

function zoneAt(r: DOMRect, x: number, y: number): DropZone {
  const rx = (x - r.left) / r.width;
  const ry = (y - r.top) / r.height;
  const edges: [DropZone, number][] = [
    ["left", rx],
    ["right", 1 - rx],
    ["top", ry],
    ["bottom", 1 - ry],
  ];
  edges.sort((a, b) => a[1] - b[1]);
  return edges[0][1] < EDGE ? edges[0][0] : "center";
}

function zoneRect(pane: PaneRect, zone: DropZone): PaneRect {
  const { left, top, width, height } = pane;
  switch (zone) {
    case "left":
      return { left, top, width: width / 2, height };
    case "right":
      return { left: left + width / 2, top, width: width / 2, height };
    case "top":
      return { left, top, width, height: height / 2 };
    case "bottom":
      return { left, top: top + height / 2, width, height: height / 2 };
    default:
      return pane;
  }
}

/**
 * The workspace area: tab layers below, and (when split) the pane frame above
 * them. Panes are measured into rectangles that tell each tab layer where to
 * draw, so tabs never remount when the layout changes.
 */
export function WorkspaceLayoutFrame({
  layout,
  split,
  onFocusPane,
  onSizes,
  children,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [rects, setRects] = useState<ReadonlyMap<string, PaneRect>>(
    () => new Map(),
  );
  const focused = focusedLeaf(layout);

  /** Pane rectangles in the root's CSS pixels (corrects for app zoom). */
  const measure = useCallback(() => {
    const root = rootRef.current;
    const frame = frameRef.current;
    if (!root || !frame) return;
    const base = root.getBoundingClientRect();
    const scale = root.offsetWidth > 0 ? base.width / root.offsetWidth : 1;
    const next = new Map<string, PaneRect>();
    for (const el of frame.querySelectorAll<HTMLElement>(
      "[data-layout-leaf]",
    )) {
      const r = el.getBoundingClientRect();
      next.set(el.dataset.layoutLeaf as string, {
        left: Math.round((r.left - base.left) / scale),
        top: Math.round((r.top - base.top) / scale),
        width: Math.round(r.width / scale),
        height: Math.round(r.height / scale),
      });
    }
    setRects((prev) => (sameRects(prev, next) ? prev : next));
  }, []);

  // Re-observe whenever the set of panes changes.
  const paneKey = layoutLeaves(layout.root)
    .map((l) => l.id)
    .join("|");
  useLayoutEffect(() => {
    if (!split || !paneKey) return;
    measure();
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(measure);
    for (const el of frame.querySelectorAll("[data-layout-leaf]"))
      ro.observe(el);
    return () => ro.disconnect();
  }, [split, paneKey, measure]);

  // Panes (and the tabs in them) moved: let the terminal renderer re-read
  // positions now rather than on its slow geometry check. Runs after the
  // tab layers took their new placement.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires on layout changes
  useEffect(() => {
    notifyTerminalLayoutMoved();
  }, [rects, split, layout.root]);

  const placement = useMemo(() => {
    if (!split) {
      const shown = focused.tabId;
      return (tabId: number): TabPlacement | null =>
        tabId === shown ? "fill" : null;
    }
    const byTab = new Map<number, PaneRect>();
    for (const leaf of layoutLeaves(layout.root)) {
      const r = rects.get(leaf.id);
      if (r) byTab.set(leaf.tabId, r);
    }
    return (tabId: number): TabPlacement | null => byTab.get(tabId) ?? null;
  }, [split, focused.tabId, layout.root, rects]);

  // Clicking inside a pane focuses it (and activates its tab).
  const onPointerDownCapture = (e: React.PointerEvent) => {
    if (!split) return;
    const frame = frameRef.current;
    if (!frame) return;
    for (const el of frame.querySelectorAll<HTMLElement>(
      "[data-layout-leaf]",
    )) {
      const r = el.getBoundingClientRect();
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      ) {
        const id = el.dataset.layoutLeaf as string;
        if (id !== layout.focusedLeafId) onFocusPane(id);
        return;
      }
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative h-full min-h-0"
      onPointerDownCapture={onPointerDownCapture}
    >
      <TabPlacementProvider value={placement}>{children}</TabPlacementProvider>
      {split && (
        <div
          ref={frameRef}
          className="pointer-events-none absolute inset-0 z-10"
        >
          <NodeView
            node={layout.root}
            focusedLeafId={layout.focusedLeafId}
            onSizes={onSizes}
          />
        </div>
      )}
      <DropPreview
        rootRef={rootRef}
        frameRef={frameRef}
        split={split}
        singleLeafId={focused.id}
      />
    </div>
  );
}

function sameRects(
  a: ReadonlyMap<string, PaneRect>,
  b: ReadonlyMap<string, PaneRect>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [k, r] of b) {
    const p = a.get(k);
    if (
      !p ||
      p.left !== r.left ||
      p.top !== r.top ||
      p.width !== r.width ||
      p.height !== r.height
    ) {
      return false;
    }
  }
  return true;
}

function NodeView({
  node,
  focusedLeafId,
  onSizes,
}: {
  node: LayoutNode;
  focusedLeafId: string;
  onSizes: (splitId: string, sizes: number[]) => void;
}) {
  if (node.kind === "leaf") {
    return (
      <div data-layout-leaf={node.id} className="relative h-full w-full">
        {node.id === focusedLeafId && (
          <div className="pointer-events-none absolute inset-0 rounded-[3px] ring-1 ring-inset ring-primary/40" />
        )}
      </div>
    );
  }
  const defaultLayout = Object.fromEntries(
    node.children.map((c, i) => [c.id, node.sizes[i] ?? 0]),
  );
  return (
    <ResizablePanelGroup
      // A new child set needs a fresh group so its saved sizes apply.
      key={node.children.map((c) => c.id).join("|")}
      orientation={node.dir === "row" ? "horizontal" : "vertical"}
      defaultLayout={defaultLayout}
      onLayoutChanged={(l, { isUserInteraction }) => {
        if (!isUserInteraction) return;
        onSizes(
          node.id,
          node.children.map((c) => l[c.id] ?? 0),
        );
      }}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <PaneHandle />}
          <ResizablePanel id={child.id} minSize="12%">
            <NodeView
              node={child}
              focusedLeafId={focusedLeafId}
              onSizes={onSizes}
            />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

/** A divider between panes; terminals resize smoothly while it is dragged. */
function PaneHandle() {
  const token = useRef<object>({});
  const removeListeners = useRef<(() => void) | null>(null);
  const finish = useCallback(() => {
    removeListeners.current?.();
    removeListeners.current = null;
    endTerminalResizeInteraction(token.current);
  }, []);
  useEffect(() => finish, [finish]);
  return (
    <ResizableHandle
      className="pointer-events-auto bg-border/60 transition-colors duration-[var(--dur-fast)] after:w-3 hover:bg-border"
      onPointerDownCapture={(e) => {
        if (e.button !== 0) return;
        finish();
        beginTerminalResizeInteraction(token.current);
        const end = () => finish();
        window.addEventListener("pointerup", end, true);
        window.addEventListener("pointercancel", end, true);
        removeListeners.current = () => {
          window.removeEventListener("pointerup", end, true);
          window.removeEventListener("pointercancel", end, true);
        };
      }}
      onBlur={finish}
    />
  );
}

/** Highlights where a tab dragged out of the tab bar would land. */
function DropPreview({
  rootRef,
  frameRef,
  split,
  singleLeafId,
}: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  frameRef: React.RefObject<HTMLDivElement | null>;
  split: boolean;
  singleLeafId: string;
}) {
  const tabId = useTabDragStore((s) => s.tabId);
  const x = useTabDragStore((s) => s.x);
  const y = useTabDragStore((s) => s.y);
  const setTarget = useTabDragStore((s) => s.setTarget);
  const [preview, setPreview] = useState<PaneRect | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (tabId === null || !root) {
      setPreview(null);
      return;
    }
    const base = root.getBoundingClientRect();
    const scale = root.offsetWidth > 0 ? base.width / root.offsetWidth : 1;
    const toLocal = (r: DOMRect): PaneRect => ({
      left: (r.left - base.left) / scale,
      top: (r.top - base.top) / scale,
      width: r.width / scale,
      height: r.height / scale,
    });
    const panes: [string, DOMRect][] =
      split && frameRef.current
        ? [
            ...frameRef.current.querySelectorAll<HTMLElement>(
              "[data-layout-leaf]",
            ),
          ].map((el) => [
            el.dataset.layoutLeaf as string,
            el.getBoundingClientRect(),
          ])
        : [[singleLeafId, base]];
    let target: PaneDropTarget | null = null;
    let box: PaneRect | null = null;
    for (const [leafId, r] of panes) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const zone = zoneAt(r, x, y);
        target = { leafId, zone };
        box = zoneRect(toLocal(r), zone);
        break;
      }
    }
    setTarget(target);
    setPreview(box);
  }, [tabId, x, y, split, singleLeafId, rootRef, frameRef, setTarget]);

  if (!preview) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-md border border-primary/50 bg-primary/10 transition-all duration-[var(--dur-fast)]"
      style={preview}
    />
  );
}
