import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  relativeTime,
  SessionList,
  useChatSessions,
} from "@/modules/agent-chat/HistorySidebar";
import { useAgentChatStore } from "@/modules/agent-chat/store";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import { AgentIcon } from "../lib/agentIcon";
import {
  AGENT_STATE_LABEL,
  type AgentRow,
  type AgentRowState,
  buildAgentRows,
  type ChatActivity,
} from "../lib/agentRows";
import { useAgentStore } from "../store/agentStore";

type Props = {
  tabs: Tab[];
  activeTabId: number;
  activeSpaceId: string;
  /** Space id → name, for agents running in other projects. */
  spaceNames: ReadonlyMap<string, string>;
  /** The project folder (explorer root), for its saved sessions. */
  cwd: string | null;
  onActivate: (tabId: number, leafId: number | null) => void;
  onOpenSession: (cwd: string, sessionId: string) => void;
};

const DOT: Record<AgentRowState, string> = {
  attention:
    "bg-amber-500 shadow-[0_0_0_3px] shadow-amber-500/20 animate-pulse",
  blocked: "bg-orange-500 shadow-[0_0_0_3px] shadow-orange-500/20",
  working: "bg-sky-500 shadow-[0_0_0_3px] shadow-sky-500/20 animate-pulse",
  idle: "bg-emerald-500",
  ready: "bg-muted-foreground/40",
};

const TEXT: Record<AgentRowState, string> = {
  attention: "text-amber-600 dark:text-amber-400",
  blocked: "text-orange-600 dark:text-orange-400",
  working: "text-sky-600 dark:text-sky-400",
  idle: "text-emerald-600 dark:text-emerald-400",
  ready: "text-muted-foreground",
};

/** Re-renders every 30 s so "3 min ago" stays true. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function AgentsPanel({
  tabs,
  activeTabId,
  activeSpaceId,
  spaceNames,
  cwd,
  onActivate,
  onOpenSession,
}: Props) {
  const sessions = useAgentStore((s) => s.sessions);
  const chats = useAgentChatStore((s) => s.chats);
  const now = useNow();

  const chatActivity = useMemo(() => {
    const out: Record<string, ChatActivity> = {};
    for (const [id, c] of Object.entries(chats)) {
      out[id] = {
        running: c.running,
        hasMessages: c.transcript.items.length > 0,
        blocked: c.transcript.denied,
      };
    }
    return out;
  }, [chats]);

  const rows = useMemo(
    () => buildAgentRows(tabs, sessions, chatActivity),
    [tabs, sessions, chatActivity],
  );
  const here = rows.filter((r) => r.spaceId === activeSpaceId);
  const elsewhere = rows.filter((r) => r.spaceId !== activeSpaceId);
  const working = rows.filter((r) => r.state === "working").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          Agents
        </span>
        {working > 0 && (
          <span className="text-[10.5px] text-muted-foreground">
            {working} working
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {rows.length === 0 ? (
          <p className="px-2 py-2 text-[11.5px] leading-5 text-muted-foreground">
            No agents running. Start one from + → Launch agents, or run claude,
            codex or gemini in a terminal.
          </p>
        ) : (
          <>
            <Section
              title="This project"
              rows={here}
              activeTabId={activeTabId}
              now={now}
              onActivate={onActivate}
            />
            {elsewhere.length > 0 && (
              <Section
                title="Other projects"
                rows={elsewhere}
                activeTabId={activeTabId}
                now={now}
                onActivate={onActivate}
                spaceNames={spaceNames}
              />
            )}
          </>
        )}
        {cwd && (
          <SavedSessions
            cwd={cwd}
            now={now}
            onOpen={(id) => onOpenSession(cwd, id)}
          />
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  rows,
  activeTabId,
  now,
  onActivate,
  spaceNames,
}: {
  title: string;
  rows: AgentRow[];
  activeTabId: number;
  now: number;
  onActivate: (tabId: number, leafId: number | null) => void;
  spaceNames?: ReadonlyMap<string, string>;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-1">
      <h3 className="px-2 pt-2 pb-1 text-[10.5px] font-medium tracking-wide text-muted-foreground/80 uppercase">
        {title}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onActivate(r.tabId, r.leafId)}
              aria-current={r.tabId === activeTabId ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                r.tabId === activeTabId ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("size-2 shrink-0 rounded-full", DOT[r.state])}
              />
              <AgentIcon
                agent={r.agent}
                size={14}
                className="shrink-0 text-muted-foreground"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] leading-4">
                  {r.title}
                  {r.kind === "chat" && (
                    <span className="text-muted-foreground"> · chat</span>
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-1 text-[10.5px] text-muted-foreground">
                  <span className={cn("shrink-0 font-medium", TEXT[r.state])}>
                    {AGENT_STATE_LABEL[r.state]}
                  </span>
                  {r.since !== null && (
                    <span className="shrink-0">
                      · {relativeTime(r.since, now)}
                    </span>
                  )}
                  {spaceNames?.get(r.spaceId) ? (
                    <span className="truncate">
                      · {spaceNames.get(r.spaceId)}
                    </span>
                  ) : r.folder ? (
                    <span className="truncate">· {r.folder}</span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SavedSessions({
  cwd,
  now,
  onOpen,
}: {
  cwd: string;
  now: number;
  onOpen: (sessionId: string) => void;
}) {
  const { sessions } = useChatSessions("claude", cwd, 0);
  if (!sessions || sessions.length === 0) return null;
  return (
    <section className="mt-3">
      <h3 className="px-2 pt-2 pb-1 text-[10.5px] font-medium tracking-wide text-muted-foreground/80 uppercase">
        Saved Claude Code sessions
      </h3>
      {/* Estate: the chat tab's name when it has one; right-click renames. */}
      <SessionList
        agent="claude"
        sessions={sessions}
        currentId={undefined}
        disabled={false}
        onOpen={onOpen}
        limit={8}
        now={now}
      />
    </section>
  );
}
