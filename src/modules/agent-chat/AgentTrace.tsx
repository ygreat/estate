/**
 * How an agent's work shows in the chat, adapted from beautiful-ui (MIT):
 * ThinkingState and Shimmer for the live indicator, ToolChips for runs of
 * tool calls, TaskRows for markdown checklists.
 */
import {
  ArrowDown01Icon,
  Cancel01Icon,
  CommandLineIcon,
  FileViewIcon,
  PencilEdit02Icon,
  Search01Icon,
  Tick02Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { FileChip } from "./FileChip";
import {
  editedFiles,
  formatElapsed,
  runLabel,
  type ToolItem,
  type ToolKind,
  toolKind,
} from "./transcriptBlocks";

const KIND_ICON: Record<ToolKind, typeof FileViewIcon> = {
  read: FileViewIcon,
  write: PencilEdit02Icon,
  run: CommandLineIcon,
  search: Search01Icon,
  other: Wrench01Icon,
};

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

/** Light sweeping across a label the agent is working on. */
export function ShimmerText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <span className={cn("estate-shimmer-text whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

/** Shown under the transcript while the agent works with nothing to show yet. */
export function ThinkingIndicator({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = now - since;
  return (
    <div
      role="status"
      className="estate-fade-in flex h-6 items-center gap-2 text-[12.5px] font-medium"
    >
      <Sparkle className="text-primary" />
      <ShimmerText className="estate-shimmer-primary">Thinking</ShimmerText>
      {elapsed >= 3000 && (
        <span className="font-normal text-muted-foreground tabular-nums">
          {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  );
}

/** The settled form: how long the last turn took. */
export function WorkedFor({ ms }: { ms: number }) {
  return (
    <span className="estate-fade-in flex items-center gap-1.5">
      <Sparkle className="size-3" />
      Worked for {formatElapsed(ms)}
    </span>
  );
}

function shortPath(path: string, cwd: string): string {
  const root = cwd.replace(/\/+$/, "");
  return root && path.startsWith(`${root}/`)
    ? path.slice(root.length + 1)
    : path;
}

/**
 * Consecutive tool calls as one group: open while the agent is in it, folded
 * to a count afterwards. The files it edited stay visible as chips.
 */
export const ToolRun = memo(function ToolRun({
  tools,
  live,
  fresh,
  cwd,
}: {
  tools: ToolItem[];
  /** The turn is running and this is the newest group. */
  live: boolean;
  /** Added since the chat loaded, so it animates in. */
  fresh: boolean;
  cwd: string;
}) {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;
  const files = useMemo(() => editedFiles(tools), [tools]);
  const working = live && tools.some((t) => t.status === "running");
  const failed = tools.filter((t) => t.status === "error").length;
  const label = runLabel(tools);

  return (
    <div className={cn("text-[12px]", fresh && "estate-fade-up")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setManual(!open)}
        className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={12}
          strokeWidth={2.2}
          className="shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
        {working ? (
          <ShimmerText>{label}</ShimmerText>
        ) : (
          <span className="tabular-nums">{label}</span>
        )}
        {failed > 0 && (
          <span className="text-destructive">{failed} failed</span>
        )}
      </button>

      <div data-state={open ? "open" : "closed"} className="estate-reveal">
        <div>
          <div className="-mx-1 flex flex-col gap-0.5 px-1 pt-1 pb-0.5">
            {tools.map((tool) => (
              <ToolLine
                key={tool.id}
                tool={tool}
                cwd={cwd}
                fresh={fresh}
                live={live}
              />
            ))}
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="mt-1.5 flex max-w-full flex-wrap gap-1.5">
          {files.map((f) => (
            <FileChip
              key={f.path}
              path={f.path}
              changes={f.changes}
              open
              className={cn("mx-0", fresh && "estate-pop-in")}
            />
          ))}
        </div>
      )}
    </div>
  );
});

const ToolLine = memo(function ToolLine({
  tool,
  cwd,
  fresh,
  live,
}: {
  tool: ToolItem;
  cwd: string;
  fresh: boolean;
  live: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasBody = Boolean(tool.output || tool.detail?.includes("\n"));
  const firstDetail = tool.detail?.split("\n")[0];
  const chip = firstDetail ? shortPath(firstDetail, cwd) : undefined;
  const kind = toolKind(tool);
  // A call left running in a finished turn was cut off, not still going.
  const running = tool.status === "running" && live;

  return (
    <div className={cn(fresh && "estate-fade-up")}>
      <button
        type="button"
        aria-expanded={hasBody ? open : undefined}
        onClick={() => hasBody && setOpen((v) => !v)}
        className={cn(
          "group/row flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left transition-colors",
          hasBody ? "hover:bg-accent/60" : "cursor-default",
        )}
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {running ? (
            <Spinner className="size-3" />
          ) : tool.status === "error" ? (
            <HugeiconsIcon
              icon={Cancel01Icon}
              size={13}
              strokeWidth={2}
              className="text-destructive"
            />
          ) : (
            <>
              <HugeiconsIcon
                icon={KIND_ICON[kind]}
                size={13}
                strokeWidth={1.8}
                className={cn(
                  "transition-opacity duration-100",
                  hasBody && "group-hover/row:opacity-0",
                  open && "opacity-0",
                )}
              />
              {hasBody && (
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={2.2}
                  className={cn(
                    "absolute transition-[opacity,transform] duration-150 group-hover/row:opacity-100",
                    open ? "opacity-100" : "opacity-0",
                  )}
                  style={{
                    transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                  }}
                />
              )}
            </>
          )}
        </span>
        <span className="shrink-0 font-medium text-foreground">
          {tool.title}
        </span>
        {chip && (
          <span
            className="inline-flex h-5 min-w-0 items-center truncate rounded-[5px] bg-muted px-1.5 font-mono text-[11px] text-muted-foreground ring-1 ring-border/50"
            title={firstDetail}
          >
            <span className="truncate">{chip}</span>
          </span>
        )}
      </button>
      {open && hasBody && (
        <pre className="estate-fade-in mt-0.5 mb-1 ml-3 max-h-64 overflow-auto border-l border-border py-0.5 pl-3.5 font-mono text-[11px] leading-[1.6] whitespace-pre-wrap break-words text-muted-foreground">
          {[tool.detail?.includes("\n") ? tool.detail : null, tool.output]
            .filter(Boolean)
            .join("\n\n")}
        </pre>
      )}
    </div>
  );
});

function OpenRing() {
  return (
    <span className="size-[18px] shrink-0 rounded-full border-[1.75px] border-border" />
  );
}

function DoneBadge() {
  return (
    <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
      <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={3} />
    </span>
  );
}

/**
 * The checkbox of a markdown checklist in a reply: a green check or an open
 * ring. globals.css lays the list out as a card (after beautiful-ui TaskRows).
 */
export function ChecklistInput({
  node: _node,
  ...props
}: React.ComponentProps<"input"> & { node?: unknown }) {
  if (props.type !== "checkbox") return <input {...props} />;
  const done = Boolean(props.checked);
  return (
    <span data-checked={done} className="estate-checklist-box">
      {done ? <DoneBadge /> : <OpenRing />}
    </span>
  );
}
