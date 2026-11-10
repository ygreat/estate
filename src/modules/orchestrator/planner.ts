// Estate file; not part of Terax.
import type { AgentAuth } from "@/modules/agent-chat/auth";
import { CHAT_AGENTS, type ChatAgentId } from "@/modules/agent-chat/model";
import type { OrchestratorDelegate } from "./instructions";

/**
 * The coding agent that plans an Orchestrator goal. A set preference wins;
 * "ask" (automatic) takes the first signed-in agent, else Claude Code.
 * The AI panel's planner picker and App resolve the same way, so the agent
 * shown in the chat bar is the one that plans.
 */
export function resolvePlanner(
  pref: OrchestratorDelegate,
  auth: Partial<Record<ChatAgentId, AgentAuth>>,
): ChatAgentId {
  if (pref !== "ask") return pref;
  return CHAT_AGENTS.find((a) => auth[a]?.state === "signed-in") ?? "claude";
}
