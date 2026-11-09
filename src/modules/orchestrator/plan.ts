/**
 * Estate Orchestrator: the plan format and the messages around it. Pure.
 *
 * The Orchestrator agent replies with a fenced ```estate-plan block of JSON;
 * Estate shows it as an editable plan, runs each task as an agent chat, and
 * sends the results back for a summary.
 */
import type { ChatAgentId } from "@/modules/agent-chat/model";

export type ModelSize = "fast" | "balanced" | "deep";

export type PlanTask = {
  title: string;
  prompt: string;
  /** Edits code: gets "Edit files" access and, when enabled, its own worktree. */
  edits: boolean;
  model: ModelSize;
};

export type Plan = { tasks: PlanTask[] };

export const MAX_PLAN_TASKS = 8;
const FENCE = /```estate-plan\s*\n([\s\S]*?)```/;

const SIZES: readonly ModelSize[] = ["fast", "balanced", "deep"];

/** The plan in an Orchestrator reply, or null if there is none (or it's invalid). */
export function parsePlan(text: string): Plan | null {
  const m = FENCE.exec(text);
  if (!m) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const list = (raw as { tasks?: unknown })?.tasks;
  if (!Array.isArray(list)) return null;
  const tasks: PlanTask[] = [];
  for (const item of list) {
    if (tasks.length >= MAX_PLAN_TASKS) break;
    const o = (item ?? {}) as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
    if (!title || !prompt) continue;
    tasks.push({
      title: title.slice(0, 120),
      prompt,
      edits: o.edits !== false,
      model: SIZES.includes(o.model as ModelSize)
        ? (o.model as ModelSize)
        : "balanced",
    });
  }
  return tasks.length ? { tasks } : null;
}

const OPEN_FENCE = "```estate-plan";

/**
 * The reply without its plan block (the plan shows as a card instead). A block
 * still streaming in is hidden too, so raw JSON never flashes by.
 */
export function withoutPlan(text: string): string {
  const done = text.replace(FENCE, "");
  const open = done.indexOf(OPEN_FENCE);
  return (open === -1 ? done : done.slice(0, open)).trim();
}

/** A model for a size, per agent; undefined uses the agent's default. */
export function modelFor(
  agent: ChatAgentId,
  size: ModelSize,
): string | undefined {
  switch (agent) {
    case "claude":
      return size === "fast" ? "haiku" : size === "deep" ? "opus" : "sonnet";
    case "gemini":
      return size === "fast" ? "gemini-2.5-flash" : "gemini-2.5-pro";
    default:
      return undefined;
  }
}

/** The Orchestrator's first message: its instructions, then the goal. */
export function orchestratorPrompt(instructions: string, goal: string): string {
  return `[Estate Orchestrator instructions]\n${instructions.trim()}\n\n[Goal]\n${goal.trim()}`;
}

const GOAL_MARK = "\n\n[Goal]\n";

/** What the user typed, without the instructions Estate put in front of it. */
export function shownUserText(text: string): string {
  if (!text.startsWith("[Estate Orchestrator instructions]")) return text;
  const at = text.indexOf(GOAL_MARK);
  return at === -1 ? text : text.slice(at + GOAL_MARK.length);
}

/** A short, safe worktree name from a task title. */
export function taskSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "task";
}

export type TaskResult = {
  title: string;
  agent: ChatAgentId;
  where: string;
  ok: boolean;
  /** The task agent's last reply. */
  reply: string;
};

const REPLY_LIMIT = 2000;

/** What goes back to the Orchestrator once every task has finished. */
export function resultsMessage(results: readonly TaskResult[]): string {
  const parts = results.map((r, i) => {
    const reply =
      r.reply.length > REPLY_LIMIT
        ? `${r.reply.slice(0, REPLY_LIMIT)}…`
        : r.reply;
    return `### Task ${i + 1}: ${r.title}\nAgent: ${r.agent}. Worked in: ${r.where}. ${
      r.ok ? "Finished." : "Stopped with an error."
    }\n\n${reply || "(no reply)"}`;
  });
  return `All tasks have finished. Summarize the results for the user, say what's left, and explain how to review and merge each branch.\n\n${parts.join("\n\n")}`;
}
