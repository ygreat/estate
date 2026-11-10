import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  CHAT_AGENT_LABEL,
  CHAT_AGENTS,
  type ChatAgentId,
} from "@/modules/agent-chat/model";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { type ModelSize, modelFor, type Plan } from "./plan";
import {
  dispatchPlan,
  type RunTask,
  type TaskStatus,
  useOrchestratorRuns,
} from "./runs";

type Props = {
  plan: Plan;
  orchestratorChatId: string;
  cwd: string;
  /** The Orchestrator's own agent: the default for every task. */
  agent: ChatAgentId;
  onOpenTask: (chatId: string) => void;
};

const SIZE_LABEL: Record<ModelSize, string> = {
  fast: "Fast",
  balanced: "Balanced",
  deep: "Deep",
};
const SIZES = Object.keys(SIZE_LABEL) as ModelSize[];

const STATUS: Record<TaskStatus, { label: string; tone: string }> = {
  starting: { label: "Starting", tone: "text-muted-foreground" },
  running: { label: "Working", tone: "text-sky-600 dark:text-sky-400" },
  done: { label: "Done", tone: "text-emerald-600 dark:text-emerald-400" },
  failed: { label: "Failed", tone: "text-destructive" },
};

// Estate: the same field look as the app's Select (input fill, no border).
const field =
  "rounded-lg border border-transparent bg-input/50 px-2.5 text-[12px] outline-none transition-[box-shadow,border-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
const trigger =
  "h-8 shrink-0 gap-1.5 rounded-lg px-2.5 py-0 text-[12px] data-[size=default]:h-8 [&_svg:not([class*='size-'])]:size-3.5";
const menu = "rounded-xl p-1";
const menuItem = "rounded-lg py-1.5 pl-2 text-[12px]";

/** Estate: the Orchestrator's plan, editable until it runs. */
export function PlanCard({
  plan,
  orchestratorChatId,
  cwd,
  agent,
  onOpenTask,
}: Props) {
  const worktrees = usePreferencesStore((s) => s.orchestratorWorktrees);
  const run = useOrchestratorRuns((s) => s.runs[orchestratorChatId]);
  const [tasks, setTasks] = useState<(RunTask & { key: number })[]>(() =>
    plan.tasks.map((t, key) => ({ ...t, agent, key })),
  );
  const [starting, setStarting] = useState(false);
  const started = Boolean(run) || starting;

  const update = (i: number, patch: Partial<RunTask>) =>
    setTasks((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <div className="mt-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium">
          Plan · {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </span>
        {!started && (
          <span className="text-[10.5px] text-muted-foreground">
            Edit anything, then run. Editing tasks{" "}
            {worktrees
              ? "get their own git worktree"
              : "share the project folder"}
            .
          </span>
        )}
      </div>

      <ol className="flex flex-col gap-2">
        {tasks.map((t, i) => {
          const status = run?.tasks[i];
          return (
            <li
              key={t.key}
              className="rounded-lg border border-border/60 bg-card p-2"
            >
              {started ? (
                <div className="flex items-center gap-2">
                  {status?.status === "running" ||
                  status?.status === "starting" ? (
                    <Spinner className="size-3" />
                  ) : null}
                  <span className="flex-1 text-[12px] font-medium">
                    {t.title}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">
                    {CHAT_AGENT_LABEL[t.agent]}
                    {status?.where ? ` · ${status.where}` : ""}
                  </span>
                  {status && (
                    <span
                      className={cn(
                        "text-[10.5px] font-medium",
                        STATUS[status.status].tone,
                      )}
                    >
                      {STATUS[status.status].label}
                    </span>
                  )}
                  {status?.chatId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => status.chatId && onOpenTask(status.chatId)}
                    >
                      Open
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <input
                      value={t.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                      aria-label="Task title"
                      className={cn(field, "h-8 min-w-0 flex-1 font-medium")}
                    />
                    <Select
                      value={t.agent}
                      onValueChange={(v) =>
                        update(i, { agent: v as ChatAgentId })
                      }
                    >
                      <SelectTrigger aria-label="Agent" className={trigger}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        align="end"
                        className={menu}
                      >
                        {CHAT_AGENTS.map((a) => (
                          <SelectItem key={a} value={a} className={menuItem}>
                            <AgentIcon agent={a} size={13} />
                            {CHAT_AGENT_LABEL[a]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={t.model}
                      onValueChange={(v) =>
                        update(i, { model: v as ModelSize })
                      }
                    >
                      <SelectTrigger
                        aria-label="Model size"
                        className={cn(trigger, "min-w-[6.5rem]")}
                      >
                        <SelectValue>{SIZE_LABEL[t.model]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        align="end"
                        className={menu}
                      >
                        {SIZES.map((m) => (
                          <SelectItem key={m} value={m} className={menuItem}>
                            {SIZE_LABEL[m]}
                            {/* Estate: the model this size picks for the agent. */}
                            <span className="font-normal text-muted-foreground">
                              {modelFor(t.agent, m) ?? "agent's default"}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <textarea
                    value={t.prompt}
                    onChange={(e) => update(i, { prompt: e.target.value })}
                    rows={3}
                    aria-label="Task instructions"
                    className={cn(field, "resize-y py-1.5 leading-5")}
                  />
                  <div className="flex items-center justify-between pt-0.5">
                    <label
                      htmlFor={`${orchestratorChatId}-task-${t.key}-edits`}
                      className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground select-none"
                    >
                      <Checkbox
                        id={`${orchestratorChatId}-task-${t.key}-edits`}
                        checked={t.edits}
                        onCheckedChange={(v) =>
                          update(i, { edits: v === true })
                        }
                        className="size-3.5 rounded-[4px] [&_svg]:size-3"
                      />
                      Edits code
                    </label>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        setTasks((list) => list.filter((_, j) => j !== i))
                      }
                      className="h-6 rounded-md text-[11px] font-normal text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!started && (
        <div className="mt-2.5 flex justify-end">
          <Button
            size="sm"
            disabled={
              tasks.length === 0 ||
              tasks.some((t) => !t.title.trim() || !t.prompt.trim())
            }
            onClick={() => {
              setStarting(true);
              void dispatchPlan(orchestratorChatId, cwd, tasks, worktrees);
            }}
            className="h-7 px-3 text-[11.5px]"
          >
            Run {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </Button>
        </div>
      )}
    </div>
  );
}
