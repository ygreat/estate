import {
  Alert02Icon,
  Clock01Icon,
  CancelCircleIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MarkdownCode } from "@/components/ai-elements/markdown-code";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { ChatLink } from "@/modules/markdown/ChatLink";
import { git } from "@/modules/git";
import { PlanCard } from "@/modules/orchestrator/PlanCard";
import {
  parsePlan,
  shownUserText,
  withoutPlan,
} from "@/modules/orchestrator/plan";
import { focusOrchestratedChat } from "@/modules/orchestrator/runs";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ChatStatusItem } from "@/modules/settings/store";
import {
  ACCESS_HINT,
  ACCESS_LABEL,
  type ChatAccess,
  type ChatAgentId,
  type ChatItem,
  CHAT_AGENT_LABEL,
  type Transcript,
  type TurnStats,
  type UsageWindow,
} from "./model";
import { needsSignIn, useAgentAuth } from "./auth";
import { AuthScreen } from "./AuthScreen";
import { ChatComposer } from "./ChatComposer";
import { HistorySidebar, SessionList, useChatSessions } from "./HistorySidebar";
import {
  syncChatTitle,
  type TitleState,
  useSessionName,
  useSessionNames,
} from "./sessionNames";
import { ModelPicker } from "./ModelPicker";
import { useAgentChatStore } from "./store";
import {
  ChecklistInput,
  ShimmerText,
  ThinkingIndicator,
  ToolRun,
  WorkedFor,
} from "./AgentTrace";
import { itemKey, transcriptBlocks } from "./transcriptBlocks";
import { UserMessage } from "./UserMessage";

const NO_COMMANDS: string[] = [];

// Estate: links open without Streamdown's confirmation dialog (ChatLink).
const chatComponents = {
  a: ChatLink,
  code: MarkdownCode,
  input: ChecklistInput,
};
// Streamed words fade in (sd-estateStream in globals.css).
const streamAnimation = {
  animation: "estateStream",
  duration: 220,
  easing: "ease-out",
  sep: "word",
} as const;

const HISTORY_OPEN_KEY = "estate:agent-chat-history-open";
function readHistoryOpen(): boolean {
  try {
    return localStorage.getItem(HISTORY_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}
function writeHistoryOpen(open: boolean): void {
  try {
    localStorage.setItem(HISTORY_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Private storage off: the sidebar just won't be remembered.
  }
}

type Props = {
  chatId: string;
  agent: ChatAgentId;
  cwd: string;
  /** Estate: an Orchestrator chat shows its plans as plan cards. */
  role?: "orchestrator";
  /** The tab's title, which is also its session's name. */
  title: string;
  onRename: (title: string) => void;
  visible: boolean;
};

const ACCESS_ORDER: ChatAccess[] = ["read", "edit", "full"];

/**
 * Whether a transcript row was added since the chat loaded or switched
 * session: only those animate in, not a whole history appearing at once.
 */
function useFreshKeys(keys: readonly string[], token: string) {
  const snapshot = useRef<{ token: string; old: Set<string> } | null>(null);
  if (!snapshot.current || snapshot.current.token !== token)
    snapshot.current = { token, old: new Set(keys) };
  const old = snapshot.current.old;
  return (key: string) => !old.has(key);
}

/** When the running turn started, and how long the last one took. */
function useTurnTiming(running: boolean, sessionId: string | undefined) {
  const [turn, setTurn] = useState<{ start: number; ms?: number } | null>(null);
  useEffect(() => {
    setTurn((t) => {
      if (running) return t && t.ms === undefined ? t : { start: Date.now() };
      return t && t.ms === undefined ? { ...t, ms: Date.now() - t.start } : t;
    });
  }, [running]);
  const lastSession = useRef(sessionId);
  useEffect(() => {
    if (lastSession.current && sessionId !== lastSession.current) setTurn(null);
    lastSession.current = sessionId;
  }, [sessionId]);
  return turn;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function AgentChatPane({
  chatId,
  agent,
  cwd,
  role,
  title,
  onRename,
  visible,
}: Props) {
  const open = useAgentChatStore((s) => s.open);
  const {
    auth,
    checking: authChecking,
    recheck: recheckAuth,
  } = useAgentAuth(agent);
  const chat = useAgentChatStore((s) => s.chats[chatId]);
  const send = useAgentChatStore((s) => s.send);
  const cancel = useAgentChatStore((s) => s.cancel);
  const setAccess = useAgentChatStore((s) => s.setAccess);
  const retryWithAccess = useAgentChatStore((s) => s.retryWithAccess);
  const setModel = useAgentChatStore((s) => s.setModel);
  const setEffort = useAgentChatStore((s) => s.setEffort);
  const newSession = useAgentChatStore((s) => s.newSession);
  const openSession = useAgentChatStore((s) => s.openSession);
  const [historyOpen, setHistoryOpen] = useState(readHistoryOpen);
  const toggleHistory = () => {
    setHistoryOpen((v) => {
      writeHistoryOpen(!v);
      return !v;
    });
  };
  const agentCommands =
    useAgentChatStore((s) => s.commands[agent]) ?? NO_COMMANDS;

  useEffect(() => {
    open(chatId, { agent, cwd });
  }, [open, chatId, agent, cwd]);

  const [modelOpen, setModelOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  const items = chat?.transcript.items ?? [];
  const running = chat?.running ?? false;
  const access = chat?.access ?? "read";
  const loaded = chat?.loaded ?? false;
  const orchestrator = role === "orchestrator";
  useTabSessionName({
    enabled: loaded && !orchestrator,
    agent,
    sessionId: chat?.transcript.sessionId,
    title,
    onRename,
  });
  // Only the latest plan is live; earlier ones were superseded.
  const planItemId = useMemo(() => {
    if (!orchestrator) return null;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.kind === "assistant" && !item.streaming && parsePlan(item.text))
        return item.id;
    }
    return null;
  }, [orchestrator, items]);

  // Follow new output while the reader is at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  });

  useEffect(() => {
    if (visible && loaded) inputRef.current?.focus();
  }, [visible, loaded]);

  const blocks = useMemo(() => transcriptBlocks(items), [items]);
  const isFresh = useFreshKeys(
    blocks.map((b) => b.key),
    `${loaded}:${items[0] ? itemKey(items[0]) : ""}`,
  );
  const turn = useTurnTiming(running, chat?.transcript.sessionId);
  const lastBlock = blocks[blocks.length - 1];
  // Streaming text and running tools show progress themselves.
  const busyElsewhere =
    (lastBlock?.kind === "item" &&
      lastBlock.item.kind === "assistant" &&
      lastBlock.item.streaming) ||
    (lastBlock?.kind === "tools" &&
      lastBlock.tools.some((t) => t.status === "running"));

  const lastIndex = items.length - 1;
  const lastIsReply = lastIndex >= 0 && items[lastIndex].kind !== "user";
  // Codex, Gemini and OpenCode don't always report what was refused; offer a
  // retry with more access after any reply in a read-only chat.
  const offerGenericRetry =
    !running &&
    lastIsReply &&
    !chat?.transcript.denied &&
    access === "read" &&
    agent !== "claude";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-1 size-7 text-muted-foreground"
          aria-pressed={historyOpen}
          title={historyOpen ? "Hide sessions" : "Show sessions"}
          onClick={() => toggleHistory()}
        >
          <HugeiconsIcon icon={Clock01Icon} size={15} strokeWidth={1.75} />
        </Button>
        <AgentIcon agent={agent} size={15} />
        <span className="text-[12.5px] font-medium">
          {CHAT_AGENT_LABEL[agent]}
        </span>
        <span
          className="truncate text-[11.5px] text-muted-foreground"
          title={cwd}
        >
          in {folderName(cwd)}
        </span>
        {running && (
          <span className="text-[11.5px]">
            <ShimmerText>Working…</ShimmerText>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ModelPicker
            agent={agent}
            value={chat?.model}
            reported={chat?.transcript.model}
            disabled={running}
            open={modelOpen}
            onOpenChange={setModelOpen}
            onChange={(m) => setModel(chatId, m)}
            effort={chat?.effort}
            onEffortChange={(e) => setEffort(chatId, e)}
          />
          <Select
            value={access}
            onValueChange={(v) => setAccess(chatId, v as ChatAccess)}
            disabled={running}
          >
            <SelectTrigger
              className="h-7 w-32 text-[11.5px]"
              title={ACCESS_HINT[access]}
              aria-label="Access level"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_ORDER.map((a) => (
                <SelectItem
                  key={a}
                  value={a}
                  className="text-[12px]"
                  title={ACCESS_HINT[a]}
                >
                  {ACCESS_LABEL[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {auth && needsSignIn(auth) ? (
        <div className="min-h-0 flex-1">
          <AuthScreen
            agent={agent}
            cwd={cwd}
            auth={auth}
            checking={authChecking}
            onRecheck={recheckAuth}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {historyOpen && (
            <HistorySidebar
              agent={agent}
              cwd={cwd}
              currentSessionId={chat?.transcript.sessionId}
              running={running}
              refresh={chat?.transcript.totals.turns ?? 0}
              onOpen={(sid) => void openSession(chatId, sid)}
              onNew={() => newSession(chatId)}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              }}
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
                {items.length === 0 && (
                  <EmptyState
                    agent={agent}
                    cwd={cwd}
                    access={access}
                    loaded={loaded}
                    onOpenSession={(sid) => void openSession(chatId, sid)}
                  />
                )}
                {blocks.map((block, i) => {
                  const fresh = isFresh(block.key);
                  if (block.kind === "tools")
                    return (
                      <ToolRun
                        key={block.key}
                        tools={block.tools}
                        live={running && i === blocks.length - 1}
                        fresh={fresh}
                        cwd={cwd}
                      />
                    );
                  const item = block.item;
                  return (
                    <div
                      key={block.key}
                      className={fresh ? "estate-fade-up" : undefined}
                    >
                      <ChatRow
                        item={item}
                        cwd={cwd}
                        access={access}
                        running={running}
                        onRetry={(a) => void retryWithAccess(chatId, a)}
                        orchestrator={
                          orchestrator
                            ? {
                                chatId,
                                cwd,
                                agent,
                                live: item.id === planItemId,
                              }
                            : undefined
                        }
                      />
                    </div>
                  );
                })}
                {running && turn && !busyElsewhere && (
                  <ThinkingIndicator since={turn.start} />
                )}
                {offerGenericRetry && (
                  <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <span>Blocked by this chat's access level?</span>
                    <button
                      type="button"
                      className="underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => void retryWithAccess(chatId, "edit")}
                    >
                      Allow edits and retry
                    </button>
                  </div>
                )}
                {!running &&
                  (turn?.ms !== undefined || chat?.transcript.stats) && (
                    <Stats stats={chat?.transcript.stats} workedMs={turn?.ms} />
                  )}
              </div>
            </div>

            {/* Estate: files dragged from the sidebar drop their paths here. */}
            <div
              data-path-drop
              data-path-drop-base={cwd}
              className="shrink-0 border-t border-border/60 px-3 py-2.5"
            >
              <ChatComposer
                ref={inputRef}
                placeholder={`Message ${CHAT_AGENT_LABEL[agent]}… (/ for commands, @ for files)`}
                cwd={cwd}
                visible={visible}
                disabled={!loaded}
                running={running}
                agentCommands={agentCommands}
                onStop={() => cancel(chatId)}
                onAction={(action) => {
                  if (action.kind === "clear") {
                    newSession(chatId);
                    return;
                  }
                  if (action.kind === "model") {
                    if (action.model) setModel(chatId, action.model);
                    else setModelOpen(true);
                    return;
                  }
                  stickToBottom.current = true;
                  void send(chatId, action.text);
                }}
              />
              {chat && (
                <ChatStatusLine
                  agent={agent}
                  cwd={cwd}
                  access={access}
                  transcript={chat.transcript}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Repository root and branch for the chat's folder, refreshed after turns. */
function useRepo(cwd: string, refresh: number) {
  const [repo, setRepo] = useState<{ root: string; branch: string } | null>(
    null,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `refresh` re-resolves after each turn
  useEffect(() => {
    let alive = true;
    git
      .resolveRepo(cwd)
      .then((r) => {
        if (alive) setRepo(r ? { root: r.repoRoot, branch: r.branch } : null);
      })
      .catch(() => {
        if (alive) setRepo(null);
      });
    return () => {
      alive = false;
    };
  }, [cwd, refresh]);
  return repo;
}

type StatusPart = { key: ChatStatusItem; text: string; title?: string };

/** Estate: configurable line under the composer (Settings > Agents). */
function ChatStatusLine({
  agent,
  cwd,
  access,
  transcript,
}: {
  agent: ChatAgentId;
  cwd: string;
  access: ChatAccess;
  transcript: Transcript;
}) {
  const items = usePreferencesStore((s) => s.agentChatStatusItems);
  const limits = useAgentChatStore((s) => s.limits[agent]);
  const repo = useRepo(cwd, transcript.totals.turns);
  if (items.length === 0) return null;

  const worktree = repo?.root.includes("/.estate/worktrees/")
    ? folderName(repo.root)
    : null;
  const t = transcript.totals;
  const parts: StatusPart[] = [];
  for (const item of items) {
    switch (item) {
      case "folder":
        parts.push({ key: item, text: folderName(cwd), title: cwd });
        break;
      case "branch":
        if (repo?.branch) {
          parts.push({
            key: item,
            text: worktree
              ? `${repo.branch} · worktree ${worktree}`
              : repo.branch,
            title: repo.root,
          });
        }
        break;
      case "model":
        if (transcript.model) parts.push({ key: item, text: transcript.model });
        break;
      case "access":
        parts.push({ key: item, text: ACCESS_LABEL[access] });
        break;
      case "context":
        if (transcript.contextTokens) {
          parts.push({
            key: item,
            text: `${compact(transcript.contextTokens)} context`,
            title: `${transcript.contextTokens.toLocaleString()} tokens in context`,
          });
        }
        break;
      case "tokens":
        if (t.inputTokens || t.outputTokens) {
          parts.push({
            key: item,
            text:
              compact(t.inputTokens) +
              " in · " +
              compact(t.outputTokens) +
              " out",
          });
        }
        break;
      case "cost":
        if (t.costUsd > 0) {
          parts.push({
            key: item,
            text: `$${t.costUsd.toFixed(t.costUsd < 1 ? 4 : 2)}`,
            title:
              "This chat so far (" +
              t.turns +
              (t.turns === 1 ? " turn)" : " turns)"),
          });
        }
        break;
    }
  }
  const gauges = items.includes("limits") && limits ? limits.windows : [];
  if (parts.length === 0 && gauges.length === 0) return null;
  return (
    <div className="mx-auto mt-1.5 flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground">
      {parts.map((part, i) => (
        <span
          key={part.key}
          className="flex items-center gap-2"
          title={part.title}
        >
          {i > 0 && <span className="text-muted-foreground/40">·</span>}
          <span
            className={
              part.key === "branch" || part.key === "model"
                ? "font-mono"
                : undefined
            }
          >
            {part.text}
          </span>
        </span>
      ))}
      {gauges.length > 0 && (
        <span className="ml-auto flex items-center gap-3">
          {gauges.map((w) => (
            <UsageGauge key={w.id} window={w} />
          ))}
        </span>
      )}
    </div>
  );
}

function resetLabel(resetsAt: number | undefined): string {
  if (!resetsAt) return "";
  const at = new Date(resetsAt * 1000);
  const soon = at.getTime() - Date.now() < 24 * 60 * 60 * 1000;
  const when = at.toLocaleString(
    undefined,
    soon
      ? { hour: "numeric", minute: "2-digit" }
      : { weekday: "short", hour: "numeric", minute: "2-digit" },
  );
  return `, resets ${when}`;
}

/** Estate: how much of a usage window is left, as a small bar. */
function UsageGauge({ window: w }: { window: UsageWindow }) {
  const left = Math.max(0, Math.min(1, 1 - w.utilization));
  const pct = Math.round(left * 100);
  const label = w.id === "five_hour" ? "5h" : "7d";
  const name = w.id === "five_hour" ? "5-hour" : "7-day";
  const tone =
    left > 0.4 ? "bg-emerald-500" : left > 0.15 ? "bg-amber-500" : "bg-red-500";
  return (
    <span
      className="flex items-center gap-1.5"
      title={`${name} limit: ${pct}% left${resetLabel(w.resetsAt)}`}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className="relative h-1.5 w-12 overflow-hidden rounded-full bg-foreground/10"
      >
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width]",
            tone,
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums">
        {pct}%<span className="sr-only"> of the {name} limit left</span>
      </span>
    </span>
  );
}

function EmptyState({
  agent,
  cwd,
  access,
  loaded,
  onOpenSession,
}: {
  agent: ChatAgentId;
  cwd: string;
  access: ChatAccess;
  loaded: boolean;
  onOpenSession: (sessionId: string) => void;
}) {
  const { sessions } = useChatSessions(agent, cwd, 0);
  if (!loaded) return null;
  return (
    <div className="mt-16 flex flex-col items-center gap-2 text-center">
      <AgentIcon agent={agent} size={26} />
      <p className="text-[13px] font-medium">
        Chat with {CHAT_AGENT_LABEL[agent]} in {folderName(cwd)}
      </p>
      <p className="max-w-sm text-[11.5px] text-muted-foreground">
        Access: {ACCESS_LABEL[access]}. {ACCESS_HINT[access]} You can change it
        at the top right.
      </p>
      {sessions && sessions.length > 0 && (
        <div className="mt-6 w-full max-w-sm text-left">
          <p className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">
            Continue a session in this folder
          </p>
          <SessionList
            agent={agent}
            sessions={sessions}
            currentId={undefined}
            disabled={false}
            onOpen={onOpenSession}
            limit={5}
          />
        </div>
      )}
    </div>
  );
}

const ChatRow = memo(function ChatRow({
  item,
  cwd,
  access,
  running,
  onRetry,
  orchestrator,
}: {
  item: ChatItem;
  cwd: string;
  access: ChatAccess;
  running: boolean;
  onRetry: (access: ChatAccess) => void;
  orchestrator?: {
    chatId: string;
    cwd: string;
    agent: ChatAgentId;
    live: boolean;
  };
}) {
  switch (item.kind) {
    case "user":
      return (
        <UserMessage
          text={orchestrator ? shownUserText(item.text) : item.text}
          cwd={cwd}
        />
      );
    case "assistant": {
      const plan =
        orchestrator && !item.streaming ? parsePlan(item.text) : null;
      const text = orchestrator ? withoutPlan(item.text) : item.text;
      return (
        <div className="estate-agent-reply select-text text-[13px] leading-6">
          <MessageResponse
            streaming={item.streaming}
            isAnimating={item.streaming}
            animated={streamAnimation}
            caret="block"
            className="[&>*:last-child]:after:text-muted-foreground/70"
            components={chatComponents}
          >
            {text}
          </MessageResponse>
          {plan &&
            orchestrator &&
            (orchestrator.live ? (
              <PlanCard
                plan={plan}
                orchestratorChatId={orchestrator.chatId}
                cwd={orchestrator.cwd}
                agent={orchestrator.agent}
                onOpenTask={focusOrchestratedChat}
              />
            ) : (
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                Earlier plan ({plan.tasks.length}{" "}
                {plan.tasks.length === 1 ? "task" : "tasks"}), replaced by a
                newer one.
              </div>
            ))}
        </div>
      );
    }
    case "tool":
      // Rendered in groups by ToolRun.
      return null;
    case "notice":
      if (item.tone === "denied") {
        const next = ACCESS_ORDER.filter(
          (a) => ACCESS_ORDER.indexOf(a) > ACCESS_ORDER.indexOf(access),
        );
        return (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[12px]">
            <div className="flex items-center gap-1.5 font-medium">
              <HugeiconsIcon
                icon={Alert02Icon}
                size={13}
                strokeWidth={2}
                className="text-amber-500"
              />
              {item.text}
            </div>
            {item.tools && (
              <ul className="mt-1.5 flex flex-col gap-0.5 text-[11.5px] text-muted-foreground">
                {item.tools.map((t) => (
                  <li
                    key={`${t.name}:${t.title}`}
                    className="truncate font-mono"
                  >
                    {t.title}
                  </li>
                ))}
              </ul>
            )}
            {next.length > 0 && (
              <div className="mt-2 flex gap-2">
                {next.map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant={a === "edit" ? "default" : "outline"}
                    className="h-7 text-[11.5px]"
                    disabled={running}
                    onClick={() => onRetry(a)}
                  >
                    {a === "edit"
                      ? "Allow edits and retry"
                      : "Allow everything and retry"}
                  </Button>
                ))}
              </div>
            )}
          </div>
        );
      }
      return (
        <div
          className={cn(
            "flex items-start gap-1.5 whitespace-pre-wrap break-words text-[12px]",
            item.tone === "error"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          <HugeiconsIcon
            icon={
              item.tone === "error" ? CancelCircleIcon : InformationCircleIcon
            }
            size={13}
            strokeWidth={2}
            className="mt-0.5 shrink-0"
          />
          <span>{item.text}</span>
        </div>
      );
  }
});

function Stats({
  stats,
  workedMs,
}: {
  stats?: TurnStats;
  /** How long the last turn took, when this pane saw it run. */
  workedMs?: number;
}) {
  const parts: string[] = [];
  if (stats?.costUsd !== undefined)
    parts.push(`$${stats.costUsd.toFixed(stats.costUsd < 0.01 ? 4 : 2)}`);
  if (stats?.inputTokens !== undefined)
    parts.push(`${stats.inputTokens.toLocaleString()} in`);
  if (stats?.outputTokens !== undefined)
    parts.push(`${stats.outputTokens.toLocaleString()} out`);
  if (parts.length === 0 && workedMs === undefined) return null;
  return (
    <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground/80">
      {workedMs !== undefined && <WorkedFor ms={workedMs} />}
      {workedMs !== undefined && parts.length > 0 && (
        <span className="text-muted-foreground/40">·</span>
      )}
      {parts.length > 0 && <span>{parts.join(" · ")}</span>}
    </div>
  );
}

/** Estate: keeps the tab's title and its session's name the same. */
function useTabSessionName({
  enabled,
  agent,
  sessionId,
  title,
  onRename,
}: {
  enabled: boolean;
  agent: ChatAgentId;
  sessionId: string | undefined;
  title: string;
  onRename: (title: string) => void;
}) {
  const name = useSessionName(agent, sessionId);
  const last = useRef<TitleState | null>(null);
  const renameRef = useRef(onRename);
  renameRef.current = onRename;
  useEffect(() => {
    if (!enabled) return;
    const cur: TitleState = { sessionId, title, name };
    const change = syncChatTitle(last.current, cur, CHAT_AGENT_LABEL[agent]);
    last.current = cur;
    if (change.setTitle !== undefined) renameRef.current(change.setTitle);
    if (change.saveName !== undefined && sessionId)
      useSessionNames.getState().setName(agent, sessionId, change.saveName);
  }, [enabled, agent, sessionId, title, name]);
}
