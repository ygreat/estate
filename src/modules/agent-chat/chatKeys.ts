/**
 * Escape stops a running agent, as in the agent's own CLI. Pure, so the
 * rule is tested: a key something else already handled (the `/` menu, the
 * `@` file list) or one typed into an input method's composition does not
 * stop, and neither does a key from outside the chat (a menu or dialog
 * rendered in a portal, whose events still bubble through React).
 */
export function stopsAgent(e: {
  key: string;
  running: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  /** The key was pressed on an element inside the chat's own DOM. */
  inside: boolean;
}): boolean {
  return (
    e.key === "Escape" &&
    e.running &&
    e.inside &&
    !e.defaultPrevented &&
    !e.isComposing
  );
}
