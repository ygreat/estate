// Estate file; not part of Terax.
import {
  ArrowDown01Icon,
  ArrowUpIcon,
  Rocket01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { forwardRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AuthStatus, signIn } from "@/modules/agent-chat/AgentPicker";
import { type AgentAuth, INSTALL_HINT } from "@/modules/agent-chat/auth";
import {
  CHAT_AGENT_LABEL,
  CHAT_AGENTS,
  type ChatAgentId,
} from "@/modules/agent-chat/model";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";

type Props = {
  agent: ChatAgentId;
  onAgentChange: (agent: ChatAgentId) => void;
  auth: Partial<Record<ChatAgentId, AgentAuth>>;
  checking: readonly ChatAgentId[];
  /** The agent the Orchestrator plans with. */
  planner: ChatAgentId;
  /** Project folder, where a sign-in terminal opens. */
  cwd: string;
  onStartChat: (prompt: string, agent: ChatAgentId) => void;
  onPlan: (goal: string, agent: ChatAgentId) => void;
  /** The agent menu opened or closed. */
  onMenuOpenChange?: (open: boolean) => void;
};

/**
 * Estate: the welcome screen's chat box. The agent switcher sits inside it
 * on the left, so picking who answers and writing the prompt is one control.
 */
export const WelcomeComposer = forwardRef<HTMLTextAreaElement, Props>(
  function WelcomeComposer(
    {
      agent,
      onAgentChange,
      auth,
      checking,
      planner,
      cwd,
      onStartChat,
      onPlan,
      onMenuOpenChange,
    },
    ref,
  ) {
    const [goal, setGoal] = useState("");
    const [orchestrate, setOrchestrate] = useState(false);
    const text = goal.trim();
    const state = auth[agent]?.state;
    // An empty prompt still opens a chat; a plan needs a goal.
    const canSend = orchestrate ? !!text : state !== "missing";

    const send = () => {
      if (!canSend) return;
      if (orchestrate) onPlan(text, planner);
      else onStartChat(text, agent);
    };

    return (
      <div className="flex w-full flex-col items-center gap-3">
        <div className="flex w-full items-start gap-1 rounded-xl border border-border/50 bg-card/30 py-2 pr-2 pl-1.5 shadow-sm transition-colors focus-within:border-foreground/25">
          {/* Not modal: a modal menu blocks clicks behind it, so a click
              outside it on the welcome screen never closed it. */}
          <DropdownMenu modal={false} onOpenChange={onMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-[22px] shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-foreground/90 outline-none transition-colors hover:bg-accent/70 focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent/70"
                title={
                  orchestrate
                    ? `Orchestrator, planning with ${CHAT_AGENT_LABEL[planner]}`
                    : `Agent: ${CHAT_AGENT_LABEL[agent]}`
                }
              >
                {orchestrate ? (
                  <HugeiconsIcon
                    icon={Rocket01Icon}
                    size={13}
                    strokeWidth={1.75}
                  />
                ) : (
                  <AgentIcon agent={agent} size={13} />
                )}
                <span className="max-w-[8rem] truncate">
                  {orchestrate ? "Orchestrator" : CHAT_AGENT_LABEL[agent]}
                </span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={11}
                  strokeWidth={2}
                  className="opacity-60"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-60">
              <div className="px-2 pt-1.5 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Chat with
              </div>
              {CHAT_AGENTS.map((a) => {
                const selected = !orchestrate && a === agent;
                const missing = auth[a]?.state === "missing";
                return (
                  <DropdownMenuItem
                    key={a}
                    disabled={missing}
                    title={missing ? INSTALL_HINT[a] : undefined}
                    onSelect={() => {
                      setOrchestrate(false);
                      onAgentChange(a);
                    }}
                    className={cn(
                      "flex items-center gap-2 pr-2 text-[12px]",
                      selected && "bg-accent/40",
                    )}
                  >
                    <AgentIcon agent={a} size={13} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span>{CHAT_AGENT_LABEL[a]}</span>
                      <AuthStatus
                        auth={auth[a]}
                        checking={checking.includes(a)}
                      />
                    </span>
                    {selected ? (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={12}
                        strokeWidth={2}
                        className="shrink-0"
                      />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <div className="px-2 pt-1 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Delegate
              </div>
              <DropdownMenuItem
                onSelect={() => setOrchestrate(true)}
                className={cn(
                  "flex items-center gap-2 pr-2 text-[12px]",
                  orchestrate && "bg-accent/40",
                )}
              >
                <HugeiconsIcon
                  icon={Rocket01Icon}
                  size={13}
                  strokeWidth={1.75}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>Orchestrator</span>
                  <span className="line-clamp-1 text-[10.5px] text-muted-foreground">
                    {CHAT_AGENT_LABEL[planner]} splits the goal into tasks for
                    several agents.
                  </span>
                </span>
                {orchestrate ? (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    size={12}
                    strokeWidth={2}
                    className="shrink-0"
                  />
                ) : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!orchestrate && state === "signed-out" ? (
            <button
              type="button"
              onClick={() => signIn(auth[agent], cwd)}
              className="mt-px flex h-5 shrink-0 items-center rounded px-1.5 text-[10.5px] text-amber-600 ring-1 ring-amber-500/40 ring-inset transition-colors hover:bg-amber-500/10 dark:text-amber-400"
              title={`Sign in to ${CHAT_AGENT_LABEL[agent]} in a terminal`}
            >
              Sign in
            </button>
          ) : !orchestrate && state === "missing" ? (
            <span
              className="mt-px flex h-5 shrink-0 items-center rounded px-1.5 text-[10.5px] text-muted-foreground ring-1 ring-border ring-inset"
              title={INSTALL_HINT[agent]}
            >
              Not installed
            </span>
          ) : null}

          <textarea
            ref={ref}
            value={goal}
            onChange={(e) => {
              setGoal(e.target.value);
              // Grow with the text, up to 160px.
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={
              orchestrate
                ? "Describe a goal to plan and delegate…"
                : "Describe what you want to build…"
            }
            aria-label="Describe what you want to build"
            className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-1 py-px text-[13px] leading-[20px] outline-none placeholder:text-muted-foreground/60"
          />

          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label={
              orchestrate ? "Plan" : text ? "Start chat" : "Open chat"
            }
            title={
              orchestrate
                ? "Plan with Orchestrator (Enter)"
                : text
                  ? "Start chat (Enter)"
                  : "Open chat (Enter)"
            }
            className={cn(
              "flex size-[22px] shrink-0 items-center justify-center rounded-md transition-colors",
              canSend
                ? text
                  ? "bg-foreground text-background hover:bg-foreground/85"
                  : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                : "text-muted-foreground/40",
            )}
          >
            <HugeiconsIcon icon={ArrowUpIcon} size={13} strokeWidth={2} />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          Enter to {orchestrate ? "plan" : "start"} · Shift+Enter for newline ·
          Esc to skip
        </p>
      </div>
    );
  },
);
