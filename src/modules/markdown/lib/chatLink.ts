/** An http(s) URL: the links that get browser and Preview actions on hover. */
export function isWebUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** The URL as a hover card shows it: no scheme, no trailing slash on a bare host. */
export function linkLabel(href: string): string {
  const bare = href.replace(/^https?:\/\//i, "");
  return /^[^/]+\/$/.test(bare) ? bare.slice(0, -1) : bare;
}
