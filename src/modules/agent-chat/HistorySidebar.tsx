import { Add01Icon, GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ChatAgentId } from "./model";
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

export function sessionLabel(s: SessionSummary): string {
  return s.title || s.lastPrompt || "Untitled session";
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
  sessions,
  currentId,
  disabled,
  onOpen,
  limit,
}: {
  sessions: SessionSummary[];
  currentId: string | undefined;
  disabled: boolean;
  onOpen: (id: string) => void;
  limit?: number;
}) {
  const shown = limit ? sessions.slice(0, limit) : sessions;
  return (
    <ul className="flex flex-col gap-0.5">
      {shown.map((s) => {
        const current = s.id === currentId;
        return (
          <li key={s.id}>
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
                {sessionLabel(s)}
              </span>
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span>{relativeTime(s.modifiedMs)}</span>
                {s.branch && (
                  <span className="flex min-w-0 items-center gap-0.5">
                    <HugeiconsIcon
                      icon={GitBranchIcon}
                      size={10}
                      strokeWidth={2}
                    />
                    <span className="truncate font-mono">{s.branch}</span>
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
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
