// Estate file; not part of Terax.
/**
 * Estate: dropping files from the Files sidebar into a chat box inserts their
 * paths at the caret. A chat box opts in with `data-path-drop` on an element
 * that contains its <textarea>; `data-path-drop-base` (the chat's folder)
 * makes paths inside it relative, which is how agents and people refer to
 * project files.
 */
import type { ExplorerPathDropTarget } from "./useExplorerDnd";

const ACTIVE = "data-path-drop-active";

/** `path` relative to `base` when inside it, else unchanged. Pure. */
export function relativeToBase(path: string, base: string | null): string {
  if (!base) return path;
  const root = base.replace(/\/+$/, "");
  if (path === root) return ".";
  return root && path.startsWith(`${root}/`)
    ? path.slice(root.length + 1)
    : path;
}

/** Paths as chat text: relative, quoted when they contain spaces. Pure. */
export function formatPathsForChat(
  paths: readonly string[],
  base: string | null,
): string {
  return paths
    .map((p) => relativeToBase(p, base))
    .map((p) => (/\s/.test(p) ? `"${p.replace(/"/g, '\\"')}"` : p))
    .join(" ");
}

/**
 * `text` inserted over the selection, with a space on either side where it
 * would otherwise touch other words. Returns the new value and caret. Pure.
 */
export function insertAtCaret(
  value: string,
  start: number,
  end: number,
  text: string,
): { value: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = !after || !/^\s/.test(after) ? " " : "";
  const inserted = `${lead}${text}${trail}`;
  return {
    value: `${before}${inserted}${after}`,
    caret: before.length + inserted.length,
  };
}

function zoneAt(x: number, y: number): HTMLElement | null {
  return (
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-path-drop]") ??
    null
  );
}

let highlighted: HTMLElement | null = null;
function highlight(zone: HTMLElement | null) {
  if (highlighted === zone) return;
  highlighted?.removeAttribute(ACTIVE);
  zone?.setAttribute(ACTIVE, "");
  highlighted = zone;
}

/** Sets a React-controlled textarea's value the way typing does. */
function typeInto(el: HTMLTextAreaElement, value: string, caret: number) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  el.setSelectionRange(caret, caret);
}

export const chatPathDropTarget: ExplorerPathDropTarget = {
  updateTarget(x, y) {
    const zone = zoneAt(x, y);
    highlight(zone);
    return zone !== null;
  },
  dropPath(paths, x, y) {
    highlight(null);
    const zone = zoneAt(x, y);
    const el = zone?.querySelector("textarea");
    if (!zone || !el || el.disabled || el.readOnly) return false;
    const text = formatPathsForChat(
      paths,
      zone.getAttribute("data-path-drop-base"),
    );
    const next = insertAtCaret(
      el.value,
      el.selectionStart ?? el.value.length,
      el.selectionEnd ?? el.value.length,
      text,
    );
    typeInto(el, next.value, next.caret);
    return true;
  },
  clearTarget() {
    highlight(null);
  },
};

/** Tries each target in order; the first one under the pointer wins. */
export function firstPathDropTarget(
  ...targets: ExplorerPathDropTarget[]
): ExplorerPathDropTarget {
  return {
    updateTarget(x, y) {
      let hit = false;
      for (const t of targets) {
        if (hit) t.clearTarget();
        else hit = t.updateTarget(x, y);
      }
      return hit;
    },
    dropPath(paths, x, y) {
      for (const t of targets) {
        if (t.dropPath(paths, x, y)) {
          for (const other of targets) if (other !== t) other.clearTarget();
          return true;
        }
      }
      return false;
    },
    clearTarget() {
      for (const t of targets) t.clearTarget();
    },
  };
}
