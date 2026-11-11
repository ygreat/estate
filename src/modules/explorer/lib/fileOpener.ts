type Opener = (path: string) => void;

let opener: Opener | null = null;

/** The main window registers how a path becomes an editor tab; returns the unregister. */
export function registerFileOpener(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

/** Opens an absolute path in an editor tab of this window, if one can. */
export function openFileInEditor(path: string): boolean {
  if (!opener) return false;
  opener(path);
  return true;
}
