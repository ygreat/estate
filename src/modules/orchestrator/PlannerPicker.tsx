// Estate file; not part of Terax.
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AuthStatus, signIn } from "@/modules/agent-chat/AgentPicker";
import { INSTALL_HINT, useAgentStatuses } from "@/modules/agent-chat/auth";
import { CHAT_AGENT_LABEL, CHAT_AGENTS } from "@/modules/agent-chat/model";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setOrchestratorAgent } from "@/modules/settings/store";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { resolvePlanner } from "./planner";

/**
 * Estate: in the AI panel's chat bar with the Orchestrator selected, this
 * takes the model picker's place. An Orchestrator plans with a signed-in
 * coding agent, not an API model, so the bar shows that agent instead.
 * Picking one saves it as Settings > Agents > "Plans and delegates with".
 */
export function PlannerPicker({ cwd }: { cwd: string }) {
  const pref = usePreferencesStore((s) => s.orchestratorAgent);
  const { auth, checking } = useAgentStatuses();
  const planner = resolvePlanner(pref, auth);
  const plannerState = auth[planner]?.state;
  const notReady = plannerState === "signed-out" || plannerState === "missing";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-[22px] max-w-[10rem] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] outline-none transition-colors",
            "hover:bg-accent/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent/60 data-[state=open]:text-foreground",
            notReady
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
          )}
          title={
            notReady
              ? `${CHAT_AGENT_LABEL[planner]} is not signed in`
              : `Plans with ${CHAT_AGENT_LABEL[planner]}`
          }
        >
          <AgentIcon agent={planner} size={12} className="shrink-0" />
          <span className="truncate">{CHAT_AGENT_LABEL[planner]}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
            className="shrink-0 opacity-60"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-60">
        <div className="px-2 pt-1.5 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Plans and delegates with
        </div>
        {CHAT_AGENTS.map((a) => {
          const selected = a === planner;
          const missing = auth[a]?.state === "missing";
          return (
            <DropdownMenuItem
              key={a}
              disabled={missing}
              title={missing ? INSTALL_HINT[a] : undefined}
              onSelect={() => void setOrchestratorAgent(a)}
              className={cn(
                "flex items-center gap-2 pr-2 text-[12px]",
                selected && "bg-accent/40",
              )}
            >
              <AgentIcon agent={a} size={13} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{CHAT_AGENT_LABEL[a]}</span>
                <AuthStatus auth={auth[a]} checking={checking.includes(a)} />
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
        {plannerState === "signed-out" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => signIn(auth[planner], cwd)}
              className="text-[12px]"
            >
              Sign in to {CHAT_AGENT_LABEL[planner]}…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
