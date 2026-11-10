import {
  Add01Icon,
  GitBranchIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ChatAgentId } from "./model";
import { sessionKey, useSessionNames } from "./sessionNames";
import { listChatSessions, type SessionSummary } from "./store";

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** A name given in Estate first (the chat tab's title), then the agent's. */
export function sessionLabel(s: SessionSummary, name?: string): string {
  return name || s.title || s.lastPrompt || "Untitled session";
}

/** The folder's saved sessions, newest first; refetched when `refresh` changes. */
export function useChatSessions(
  agent: ChatAgentId,
  cwd: string,
  refresh: number,
) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `refresh` refetches after each turn
  useEffect(() => {
    let alive = true;
    listChatSessions(agent, cwd)
      .then((list) => {
        if (!alive) return;
        setSessions(list);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setSessions([]);
        setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [agent, cwd, refresh]);
  return { sessions, error };
}

export function SessionList({
  agent,
  sessions,
  currentId,
  disabled,
  onOpen,
  limit,
  now,
}: {
  agent: ChatAgentId;
  sessions: SessionSummary[];
  currentId: string | undefined;
  disabled: boolean;
  onOpen: (id: string) => void;
  limit?: number;
  /** A ticking clock, so times stay current while the list stays open. */
  now?: number;
}) {
  const names = useSessionNames((s) => s.names);
  const setName = useSessionNames((s) => s.setName);
  const [editingId, setEditingId] = useState<string | null>(null);
  const shown = limit ? sessions.slice(0, limit) : sessions;
  return (
    <ul className="flex flex-col gap-0.5">
      {shown.map((s) => {
        const current = s.id === currentId;
        const label = sessionLabel(s, names[sessionKey(agent, s.id)]);
        const meta = (
          <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span>{relativeTime(s.modifiedMs, now)}</span>
            {s.branch && (
              <span className="flex min-w-0 items-center gap-0.5">
                <HugeiconsIcon icon={GitBranchIcon} size={10} strokeWidth={2} />
                <span className="truncate font-mono">{s.branch}</span>
              </span>
            )}
          </span>
        );
        if (editingId === s.id) {
          return (
            <li
              key={s.id}
              className={cn(
                "flex flex-col gap-0.5 rounded-md px-2 py-1.5",
                current ? "bg-accent" : "bg-accent/60",
              )}
            >
              <SessionRenameInput
                initial={label}
                onCommit={(value) => {
                  setName(agent, s.id, value);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
              {meta}
            </li>
          );
        }
        return (
          <li key={s.id}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onOpen(s.id)}
                  aria-current={current ? "true" : undefined}
                  title={s.lastPrompt ?? undefined}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors disabled:opacity-60",
                    current ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <span className="line-clamp-2 text-[12px] leading-4">
                    {label}
                  </span>
                  {meta}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent
                className="min-w-32 p-1"
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <ContextMenuItem
                  className="gap-2 rounded-xl px-2.5 py-1.5 text-[13px]"
                  onSelect={() => setEditingId(s.id)}
                >
                  <HugeiconsIcon
                    icon={PencilEdit02Icon}
                    size={13}
                    strokeWidth={1.75}
                  />
                  <span className="flex-1">Rename</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </li>
        );
      })}
    </ul>
  );
}

/** Enter saves (empty restores the agent's own title), Escape cancels. */
function SessionRenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    // After the context menu hands focus back to its trigger.
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };
  // An unchanged name isn't saved, so the agent's own title keeps showing.
  const commit = (value: string) =>
    finish(() =>
      value.trim() === initial.trim() ? onCancel() : onCommit(value),
    );
  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Rename session"
      className="w-full min-w-0 rounded-sm bg-background px-1 text-[12px] leading-4 text-foreground outline-none ring-1 ring-border focus:ring-ring"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit(e.currentTarget.value);
        else if (e.key === "Escape") finish(onCancel);
      }}
      onBlur={(e) => {
        if (!document.hasFocus()) return;
        commit(e.currentTarget.value);
      }}
    />
  );
}

type Props = {
  agent: ChatAgentId;
  cwd: string;
  currentSessionId: string | undefined;
  running: boolean;
  /** Changes after each turn, to pick up the session the agent just saved. */
  refresh: number;
  onOpen: (sessionId: string) => void;
  onNew: () => void;
};

/** Estate: the project's agent sessions, beside the chat. */
export function HistorySidebar({
  agent,
  cwd,
  currentSessionId,
  running,
  refresh,
  onOpen,
  onNew,
}: Props) {
  const { sessions, error } = useChatSessions(agent, cwd, refresh);
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-card/30">
      <div className="flex h-9 shrink-0 items-center justify-between px-2.5">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          Sessions
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px]"
          disabled={running}
          onClick={onNew}
          title="Start a new session"
        >
          <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} />
          New
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {agent !== "claude" ? (
          <p className="px-1 text-[11px] text-muted-foreground">
            Session history is available for Claude Code chats for now.
          </p>
        ) : sessions === null ? (
          <div className="flex justify-center py-4">
            <Spinner className="size-3.5" />
          </div>
        ) : error ? (
          <p className="px-1 text-[11px] text-destructive">{error}</p>
        ) : sessions.length === 0 ? (
          <p className="px-1 text-[11px] text-muted-foreground">
            No sessions in this folder yet.
          </p>
        ) : (
          <SessionList
            agent={agent}
            sessions={sessions}
            currentId={currentSessionId}
            disabled={running}
            onOpen={onOpen}
          />
        )}
      </div>
    </aside>
  );
}
