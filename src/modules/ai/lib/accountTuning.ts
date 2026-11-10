// Estate file; not part of Terax.
/**
 * Estate: what the AI panel's account models run with: the effort level per
 * account, and which Codex model a ChatGPT account uses. Kept in local
 * storage; read when each request starts, so a change applies to the next one.
 */
import { create } from "zustand";
import { type ChatEffort, isEffort } from "@/modules/agent-chat/effort";

export type AccountAgent = "claude" | "codex";

type Tuning = {
  effort: Partial<Record<AccountAgent, ChatEffort>>;
  /** Codex model for a ChatGPT account; unset is Codex's default. */
  codexModel?: string;
};

const KEY = "estate:account-tuning";
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/[\]-]{0,99}$/;

/** Parses stored tuning, dropping anything invalid. Pure. */
export function parseTuning(raw: string | null): Tuning {
  try {
    const v = JSON.parse(raw ?? "{}") as {
      effort?: Record<string, unknown>;
      codexModel?: unknown;
    };
    const effort: Tuning["effort"] = {};
    for (const a of ["claude", "codex"] as const) {
      const e = v?.effort?.[a];
      if (isEffort(e)) effort[a] = e;
    }
    const codexModel =
      typeof v?.codexModel === "string" && MODEL_PATTERN.test(v.codexModel)
        ? v.codexModel
        : undefined;
    return { effort, ...(codexModel && { codexModel }) };
  } catch {
    return { effort: {} };
  }
}

function load(): Tuning {
  try {
    return parseTuning(localStorage.getItem(KEY));
  } catch {
    return { effort: {} };
  }
}

type State = Tuning & {
  setEffort: (agent: AccountAgent, effort: ChatEffort | undefined) => void;
  setCodexModel: (model: string | undefined) => void;
};

export const useAccountTuning = create<State>((set, get) => {
  const save = () => {
    const { effort, codexModel } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ effort, codexModel }));
    } catch {
      // Storage off: kept until restart.
    }
  };
  return {
    ...load(),
    setEffort(agent, effort) {
      const next = { ...get().effort };
      if (effort) next[agent] = effort;
      else delete next[agent];
      set({ effort: next });
      save();
    },
    setCodexModel(codexModel) {
      set({ codexModel });
      save();
    },
  };
});
