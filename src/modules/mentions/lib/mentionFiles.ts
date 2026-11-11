import { pathInside, resolveMention } from "./mentions";

/**
 * Files for the `@` picker: names that start with the query first, then paths
 * that contain it, both in index order. Case-insensitive. Pure.
 */
export function filterMentionFiles(
  files: readonly string[],
  query: string,
  cap: number,
): string[] {
  const q = query.toLowerCase();
  if (!q) return files.slice(0, cap);
  const named: string[] = [];
  const rest: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (!lower.includes(q)) continue;
    const name = lower.slice(lower.lastIndexOf("/") + 1);
    if (name.startsWith(q)) {
      named.push(f);
      if (named.length >= cap) break;
    } else if (rest.length < cap) {
      rest.push(f);
    }
  }
  return [...named, ...rest].slice(0, cap);
}

/** A mention's absolute path when it stays inside the chat's folder, else null. */
export function mentionAbsolute(path: string, base: string): string | null {
  if (path.split("/").includes("..")) return null;
  const abs = resolveMention(path, base);
  return pathInside(abs, base) === null ? null : abs;
}
