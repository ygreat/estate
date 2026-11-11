import { isAllowedPreviewUrl } from "./previewUrl";

type Opener = (url: string) => void;

let opener: Opener | null = null;

/** The main window registers how a URL becomes a Preview tab; returns the unregister. */
export function registerPreviewOpener(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

/** Whether a URL can open in a Preview tab of this window right now. */
export function canOpenInPreview(url: string): boolean {
  return opener !== null && isAllowedPreviewUrl(url);
}

export function openInPreview(url: string): boolean {
  if (!opener || !isAllowedPreviewUrl(url)) return false;
  opener(url);
  return true;
}
