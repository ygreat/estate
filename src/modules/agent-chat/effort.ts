// Estate file; not part of Terax.
/**
 * Effort (how hard the agent thinks) and the models an agent offers, for the
 * chat tab's picker and the AI panel's account models. Pure, apart from
 * `useAgentModels`, which reads Codex's model list once.
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { ChatAgentId } from "./model";

export type ChatEffort = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORTS: readonly ChatEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/** Codex's `model_reasoning_effort` values that the picker offers. */
const CODEX_EFFORTS: readonly ChatEffort[] = ["low", "medium", "high", "xhigh"];

export const EFFORT_LABEL: Record<ChatEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

export function isEffort(v: unknown): v is ChatEffort {
  return EFFORTS.includes(v as ChatEffort);
}

/** A model the agent lists (from `agent_chat_models`). */
export type AgentModel = {
  id: string;
  label: string;
  efforts: string[];
  defaultEffort: string | null;
};

/**
 * Effort levels the agent takes with this model (undefined: its default).
 * Claude Code: all of them, except on Haiku. Codex: what the model lists, or
 * every level up to Extra high when the model isn't listed (Codex has no
 * "max"). Gemini CLI and OpenCode: none.
 */
export function effortsFor(
  agent: ChatAgentId,
  model: string | undefined,
  listed: readonly AgentModel[],
): ChatEffort[] {
  if (agent === "claude") {
    return model && /haiku/i.test(model) ? [] : [...EFFORTS];
  }
  if (agent === "codex") {
    const found = model ? listed.find((m) => m.id === model) : undefined;
    return found
      ? EFFORTS.filter((e) => found.efforts.includes(e))
      : [...CODEX_EFFORTS];
  }
  return [];
}

/** The effort to send: the chosen one if this model takes it, else none. */
export function effectiveEffort(
  effort: ChatEffort | undefined,
  available: readonly ChatEffort[],
): ChatEffort | undefined {
  return effort && available.includes(effort) ? effort : undefined;
}

const cache = new Map<ChatAgentId, Promise<AgentModel[]>>();

/** Models the agent lists (Codex only for now), loaded once per launch. */
export function loadAgentModels(agent: ChatAgentId): Promise<AgentModel[]> {
  let p = cache.get(agent);
  if (!p) {
    p =
      agent === "codex"
        ? invoke<AgentModel[]>("agent_chat_models", { agent }).catch(() => [])
        : Promise.resolve([]);
    cache.set(agent, p);
  }
  return p;
}

export function useAgentModels(agent: ChatAgentId, enabled = true) {
  const [models, setModels] = useState<AgentModel[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadAgentModels(agent).then((list) => {
      if (alive) setModels(list);
    });
    return () => {
      alive = false;
    };
  }, [agent, enabled]);
  return models;
}
