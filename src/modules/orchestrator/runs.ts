/**
 * Estate Orchestrator: running a plan. Each task becomes an agent chat (in its
 * own git worktree when it edits code); when every task has finished, the
 * results go back to the Orchestrator chat for a summary.
 */
import { toast } from "sonner";
import { create } from "zustand";
import { newChatId } from "@/modules/agent-chat/ids";
import type { ChatAgentId, ChatItem } from "@/modules/agent-chat/model";
import { useAgentChatStore } from "@/modules/agent-chat/store";
import { native } from "@/modules/ai/lib/native";
import { git } from "@/modules/git";
import { modelFor, type PlanTask, resultsMessage, taskSlug } from "./plan";

/** What App provides: opening and focusing agent chat tabs. */
export type OrchestratorHost = {
  openChat: (
    agent: ChatAgentId,
    cwd: string,
    chatId: string,
    title: string,
  ) => void;
  focusChat: (chatId: string) => void;
};

let host: OrchestratorHost | null = null;
export function setOrchestratorHost(next: OrchestratorHost | null): void {
  host = next;
}

/** Brings a task's chat (or the Orchestrator's) to the front. */
export function focusOrchestratedChat(chatId: string): void {
  host?.focusChat(chatId);
}

/** A plan task as edited in the plan card. */
export type RunTask = PlanTask & { agent: ChatAgentId };

export type TaskStatus = "starting" | "running" | "done" | "failed";

export type TaskRun = {
  title: string;
  agent: ChatAgentId;
  chatId: string | null;
  where: string;
  status: TaskStatus;
};

type Run = { tasks: TaskRun[]; reported: boolean };

type RunsState = {
  /** The latest run per Orchestrator chat. */
  runs: Record<string, Run>;
};

export const useOrchestratorRuns = create<RunsState>(() => ({ runs: {} }));

function updateTask(
  orchestratorId: string,
  index: number,
  patch: Partial<TaskRun>,
) {
  useOrchestratorRuns.setState((s) => {
    const run = s.runs[orchestratorId];
    if (!run) return s;
    const tasks = run.tasks.slice();
    tasks[index] = { ...tasks[index], ...patch };
    return { runs: { ...s.runs, [orchestratorId]: { ...run, tasks } } };
  });
}

/** Where an editing task works: its own worktree when possible. */
async function workFolder(
  cwd: string,
  task: RunTask,
  worktrees: boolean,
): Promise<{ cwd: string; where: string }> {
  if (!task.edits || !worktrees) return { cwd, where: "the project folder" };
  try {
    const repo = await git.resolveRepo(cwd);
    if (!repo)
      return { cwd, where: "the project folder (not a git repository)" };
    const created = await git.taskCreate(repo.repoRoot, {
      name: taskSlug(task.title),
    });
    return { cwd: created.task.path, where: `branch ${created.task.branch}` };
  } catch (error) {
    toast.message(`"${task.title}" runs in the project folder`, {
      description: `Couldn't create a worktree: ${String(error)}`,
    });
    return { cwd, where: "the project folder" };
  }
}

/** Starts every task of a plan. */
export async function dispatchPlan(
  orchestratorChatId: string,
  cwd: string,
  tasks: readonly RunTask[],
  worktrees: boolean,
): Promise<void> {
  if (!host || tasks.length === 0) return;
  useOrchestratorRuns.setState((s) => ({
    runs: {
      ...s.runs,
      [orchestratorChatId]: {
        reported: false,
        tasks: tasks.map((t) => ({
          title: t.title,
          agent: t.agent,
          chatId: null,
          where: "",
          status: "starting",
        })),
      },
    },
  }));
  watch();
  const store = useAgentChatStore.getState();
  await Promise.all(
    tasks.map(async (task, i) => {
      const folder = await workFolder(cwd, task, worktrees);
      try {
        await native.workspaceAuthorize(folder.cwd);
      } catch (error) {
        updateTask(orchestratorChatId, i, {
          status: "failed",
          where: folder.where,
        });
        toast.error(`Couldn't start "${task.title}"`, {
          description: String(error),
        });
        return;
      }
      const chatId = newChatId();
      host?.openChat(task.agent, folder.cwd, chatId, task.title);
      store.open(chatId, { agent: task.agent, cwd: folder.cwd });
      store.setModel(chatId, modelFor(task.agent, task.model));
      store.setAccess(chatId, task.edits ? "edit" : "read");
      updateTask(orchestratorChatId, i, {
        chatId,
        where: folder.where,
        status: "running",
      });
      void store.send(chatId, task.prompt);
    }),
  );
  host?.focusChat(orchestratorChatId);
}

function lastReply(items: readonly ChatItem[]): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "assistant") return item.text;
  }
  return "";
}

function failed(items: readonly ChatItem[]): boolean {
  const last = items[items.length - 1];
  return last?.kind === "notice" && last.tone === "error";
}

let watching = false;

/** Marks tasks finished as their chats go idle, and reports once all are. */
function watch(): void {
  if (watching) return;
  watching = true;
  useAgentChatStore.subscribe((chatState) => {
    const { runs } = useOrchestratorRuns.getState();
    for (const [orchestratorId, run] of Object.entries(runs)) {
      if (run.reported) continue;
      run.tasks.forEach((task, i) => {
        if (task.status !== "running" || !task.chatId) return;
        const chat = chatState.chats[task.chatId];
        // send() marks the chat running at once, so idle after a prompt = finished.
        if (!chat || chat.running) return;
        if (!chat.transcript.items.some((it) => it.kind === "user")) return;
        updateTask(orchestratorId, i, {
          status: failed(chat.transcript.items) ? "failed" : "done",
        });
      });
      const current = useOrchestratorRuns.getState().runs[orchestratorId];
      const finished = current.tasks.every(
        (t) => t.status === "done" || t.status === "failed",
      );
      const orchestrator = chatState.chats[orchestratorId];
      if (!finished || !orchestrator || orchestrator.running) continue;
      useOrchestratorRuns.setState((s) => ({
        runs: { ...s.runs, [orchestratorId]: { ...current, reported: true } },
      }));
      const results = current.tasks.map((t) => ({
        title: t.title,
        agent: t.agent,
        where: t.where,
        ok: t.status === "done",
        reply: t.chatId
          ? lastReply(chatState.chats[t.chatId]?.transcript.items ?? [])
          : "",
      }));
      void useAgentChatStore
        .getState()
        .send(orchestratorId, resultsMessage(results));
    }
  });
}
