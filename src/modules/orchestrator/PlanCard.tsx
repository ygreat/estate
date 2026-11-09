import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  CHAT_AGENT_LABEL,
  CHAT_AGENTS,
  type ChatAgentId,
} from "@/modules/agent-chat/model";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ModelSize, Plan } from "./plan";
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

const STATUS: Record<TaskStatus, { label: string; tone: string }> = {
  starting: { label: "Starting", tone: "text-muted-foreground" },
  running: { label: "Working", tone: "text-sky-600 dark:text-sky-400" },
  done: { label: "Done", tone: "text-emerald-600 dark:text-emerald-400" },
  failed: { label: "Failed", tone: "text-destructive" },
};

const field =
  "rounded-md border border-border/70 bg-background px-2 py-1 text-[12px] outline-none focus-visible:border-ring";

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
                      className={cn(field, "min-w-0 flex-1 font-medium")}
                    />
                    <select
                      value={t.agent}
                      onChange={(e) =>
                        update(i, { agent: e.target.value as ChatAgentId })
                      }
                      aria-label="Agent"
                      className={field}
                    >
                      {CHAT_AGENTS.map((a) => (
                        <option key={a} value={a}>
                          {CHAT_AGENT_LABEL[a]}
                        </option>
                      ))}
                    </select>
                    <select
                      value={t.model}
                      onChange={(e) =>
                        update(i, { model: e.target.value as ModelSize })
                      }
                      aria-label="Model size"
                      className={field}
                    >
                      {(Object.keys(SIZE_LABEL) as ModelSize[]).map((m) => (
                        <option key={m} value={m}>
                          {SIZE_LABEL[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={t.prompt}
                    onChange={(e) => update(i, { prompt: e.target.value })}
                    rows={3}
                    aria-label="Task instructions"
                    className={cn(field, "resize-y leading-5")}
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={t.edits}
                        onChange={(e) => update(i, { edits: e.target.checked })}
                      />
                      Edits code
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setTasks((list) => list.filter((_, j) => j !== i))
                      }
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
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
            className="bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] text-white hover:opacity-90"
          >
            Run {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </Button>
        </div>
      )}
    </div>
  );
}
