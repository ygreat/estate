/**
 * Opening an agent's terminal-only command from a chat: App provides the
 * terminal tab, the chat says what to run there.
 */

export type ChatTerminalHost = {
  /** Opens a terminal tab in `cwd` and runs `commandLine` in it. */
  runInTerminal: (cwd: string, title: string, commandLine: string) => void;
};

let host: ChatTerminalHost | null = null;

export function setChatTerminalHost(next: ChatTerminalHost | null): void {
  host = next;
}

/** False when no app is listening (e.g. in tests). */
export function runInTerminal(
  cwd: string,
  title: string,
  commandLine: string,
): boolean {
  if (!host) return false;
  host.runInTerminal(cwd, title, commandLine);
  return true;
}
