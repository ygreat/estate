// Modified by ygreat for Estate, 2026. Originally part of Terax.
const MAX_RESIZE_INTERACTION_MS = 30_000;

type InteractionToken = object;
type InteractionListener = (active: boolean) => void;

type ResizeInteractionState = {
  readonly activeInteractions: Map<
    InteractionToken,
    ReturnType<typeof setTimeout>
  >;
  readonly listeners: Set<InteractionListener>;
};

const GLOBAL_STATE_KEY = "__ESTATE_TERMINAL_RESIZE_INTERACTION__";
const globalScope = globalThis as typeof globalThis & {
  [GLOBAL_STATE_KEY]?: ResizeInteractionState;
};
const state = resolveGlobalState();

function resolveGlobalState(): ResizeInteractionState {
  const existing = globalScope[GLOBAL_STATE_KEY];
  if (existing) return existing;
  const created: ResizeInteractionState = {
    activeInteractions: new Map(),
    listeners: new Set(),
  };
  globalScope[GLOBAL_STATE_KEY] = created;
  return created;
}

/**
 * Marks a user-driven pane layout as active. Repeated layout updates refresh a
 * bounded watchdog without notifying subscribers more than once.
 */
export function beginTerminalResizeInteraction(token: InteractionToken): void {
  const wasInactive = state.activeInteractions.size === 0;
  const previousWatchdog = state.activeInteractions.get(token);
  if (previousWatchdog !== undefined) globalThis.clearTimeout(previousWatchdog);
  state.activeInteractions.set(
    token,
    globalThis.setTimeout(
      () => endTerminalResizeInteraction(token),
      MAX_RESIZE_INTERACTION_MS,
    ),
  );
  if (wasInactive) notifyListeners(true);
}

/** Completes a pane layout after pointer release or keyboard resize. */
export function endTerminalResizeInteraction(token: InteractionToken): void {
  const watchdog = state.activeInteractions.get(token);
  if (watchdog === undefined) return;
  globalThis.clearTimeout(watchdog);
  state.activeInteractions.delete(token);
  if (state.activeInteractions.size === 0) notifyListeners(false);
}

export function terminalResizeInteractionActive(): boolean {
  return state.activeInteractions.size > 0;
}

export function subscribeTerminalResizeInteraction(
  listener: InteractionListener,
): () => void {
  state.listeners.add(listener);
  if (terminalResizeInteractionActive()) listener(true);
  return () => state.listeners.delete(listener);
}

function notifyListeners(active: boolean): void {
  for (const listener of state.listeners) listener(active);
}

// Estate: split view of tabs moves whole terminal tabs between panes. A move
// that keeps the size fires no ResizeObserver, so the window canvas would only
// notice it on its once-a-second geometry check; this signal makes it re-read
// pane positions at once.
type MoveListener = () => void;
const MOVE_LISTENERS_KEY = "__ESTATE_TERMINAL_LAYOUT_MOVE__";
const moveScope = globalThis as typeof globalThis & {
  [MOVE_LISTENERS_KEY]?: Set<MoveListener>;
};
const moveListeners: Set<MoveListener> =
  moveScope[MOVE_LISTENERS_KEY] ?? new Set<MoveListener>();
moveScope[MOVE_LISTENERS_KEY] = moveListeners;

/** Tells terminal renderers that panes may have moved without resizing. */
export function notifyTerminalLayoutMoved(): void {
  for (const listener of moveListeners) listener();
}

export function subscribeTerminalLayoutMoved(
  listener: MoveListener,
): () => void {
  moveListeners.add(listener);
  return () => {
    moveListeners.delete(listener);
  };
}
