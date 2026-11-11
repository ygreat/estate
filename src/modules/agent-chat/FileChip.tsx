import { cn } from "@/lib/utils";
import { FileIcon } from "@/modules/explorer/FileIcon";
import { openFileInEditor } from "@/modules/explorer/lib/fileOpener";
import type { LineChanges } from "./model";

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * A file named inside chat text: its icon and name in a soft pill (after
 * beautiful-ui's EntityChip, MIT). With `changes` it is an edited-file chip
 * that opens the file when clicked.
 */
export function FileChip({
  path,
  changes,
  open = false,
  className,
  style,
}: {
  /** Absolute path, or the path as the user wrote it. */
  path: string;
  changes?: LineChanges;
  /** Click opens the file in an editor tab. */
  open?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const name = baseName(path);
  const body = (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-background">
        <FileIcon name={name} width={11} height={11} />
      </span>
      <span className="min-w-0 truncate font-medium text-foreground">
        {name}
      </span>
      {changes && changes.add > 0 && (
        <span className="shrink-0 font-mono text-emerald-500 tabular-nums">
          +{changes.add}
        </span>
      )}
      {changes && changes.del > 0 && (
        <span className="shrink-0 font-mono text-red-500 tabular-nums">
          -{changes.del}
        </span>
      )}
    </>
  );
  const box = cn(
    "mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-px pr-1.5 pl-[3px] align-middle text-[12px] leading-5 ring-1 ring-border/60",
    className,
  );
  if (!open) {
    return (
      <span className={box} title={path} style={style}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cn(box, "transition-colors hover:bg-accent")}
      title={`Open ${path}`}
      style={style}
      onClick={() => openFileInEditor(path)}
    >
      {body}
    </button>
  );
}
