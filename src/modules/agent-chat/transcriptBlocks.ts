import type { ChatItem, LineChanges } from "./model";

export type ToolItem = Extract<ChatItem, { kind: "tool" }>;

/**
 * What the transcript renders: single items, and runs of consecutive tool
 * calls shown as one collapsible group.
 */
export type TranscriptBlock =
  | { kind: "item"; key: string; item: ChatItem }
  | { kind: "tools"; key: string; tools: ToolItem[] };

export function itemKey(item: ChatItem): string {
  return `${item.kind}:${item.id}`;
}

export function transcriptBlocks(
  items: readonly ChatItem[],
): TranscriptBlock[] {
  const out: TranscriptBlock[] = [];
  let run: ToolItem[] | null = null;
  for (const item of items) {
    if (item.kind === "tool") {
      if (run) {
        run.push(item);
        continue;
      }
      run = [item];
      out.push({ kind: "tools", key: itemKey(item), tools: run });
      continue;
    }
    run = null;
    out.push({ kind: "item", key: itemKey(item), item });
  }
  return out;
}

export type ToolKind = "read" | "write" | "run" | "search" | "other";

export function toolKind(tool: Pick<ToolItem, "name" | "title">): ToolKind {
  const name = tool.name.toLowerCase();
  const title = tool.title.toLowerCase();
  if (/edit|write|patch|replace|file_change|create/.test(name)) return "write";
  if (/^(edited|wrote)\b/.test(title)) return "write";
  if (/bash|shell|command|exec|run/.test(name)) return "run";
  if (/search|grep|glob|find|web|fetch|^ls$|list/.test(name)) return "search";
  if (/read|view|cat/.test(name) || /^read\b/.test(title)) return "read";
  return "other";
}

export type FileChange = { path: string; changes?: LineChanges };

/**
 * The files a run of tool calls edited, once each, in first-edit order, with
 * their line counts summed. Codex reports several paths per call.
 */
export function editedFiles(tools: readonly ToolItem[]): FileChange[] {
  const byPath = new Map<string, FileChange>();
  for (const tool of tools) {
    if (tool.status === "error" || toolKind(tool) !== "write") continue;
    const paths = (tool.detail ?? "").split("\n").filter(Boolean);
    for (const path of paths) {
      const prev = byPath.get(path);
      const changes =
        paths.length === 1 && tool.changes
          ? prev?.changes
            ? {
                add: prev.changes.add + tool.changes.add,
                del: prev.changes.del + tool.changes.del,
              }
            : tool.changes
          : prev?.changes;
      byPath.set(path, { path, changes });
    }
  }
  return [...byPath.values()];
}

/** "3 tool calls". */
export function runLabel(tools: readonly ToolItem[]): string {
  const n = tools.length;
  return n === 1 ? "1 tool call" : `${n} tool calls`;
}

/** "45s", "2m 05s", "1h 02m". */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
