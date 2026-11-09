// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { openUrl } from "@tauri-apps/plugin-opener";

export function isExternalUrl(href: string): boolean {
  return /^(?:https?:|mailto:|tel:)/i.test(href);
}

export function openExternalUrl(
  href: string,
  onSettled?: () => void,
): Promise<void> {
  if (!isExternalUrl(href)) {
    onSettled?.();
    return Promise.resolve();
  }

  return openUrl(href)
    .catch((error) => {
      console.error("[estate] failed to open external link:", error);
    })
    .finally(() => onSettled?.());
}
