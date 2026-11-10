// Estate file; not part of Terax.
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  EFFORT_LABEL,
  effectiveEffort,
  effortsFor,
  useAgentModels,
} from "@/modules/agent-chat/effort";
import {
  EFFORT_TEXT,
  EffortSelector,
} from "@/modules/agent-chat/EffortSelector";
import { accountModelArg } from "../config";
import { type AccountAgent, useAccountTuning } from "../lib/accountTuning";
import { useChatStore } from "../store/chatStore";

/**
 * Estate: effort (and, for a ChatGPT account, the Codex model) for the AI
 * panel's account models. Sits right after the model name in the chat box;
 * shows nothing for other models.
 */
export function AccountTuningPicker() {
  const selected = useChatStore((s) => s.selectedModelId);
  const agent: AccountAgent | undefined = selected.startsWith("claude-account-")
    ? "claude"
    : selected.startsWith("chatgpt-account-")
      ? "codex"
      : undefined;
  const effort = useAccountTuning((s) => (agent ? s.effort[agent] : undefined));
  const codexModel = useAccountTuning((s) => s.codexModel);
  const setEffort = useAccountTuning((s) => s.setEffort);
  const setCodexModel = useAccountTuning((s) => s.setCodexModel);
  const listed = useAgentModels("codex", agent === "codex");
  if (!agent) return null;

  const model = agent === "codex" ? codexModel : accountModelArg(selected);
  const efforts = effortsFor(agent, model, listed);
  const shown = effectiveEffort(effort, efforts);
  const codexLabel = codexModel
    ? (listed.find((m) => m.id === codexModel)?.label ?? codexModel)
    : undefined;
  if (efforts.length === 0 && agent !== "codex") return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-ml-1 flex h-[22px] max-w-[11rem] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground/80 outline-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent/60 data-[state=open]:text-foreground"
          title={agent === "codex" ? "Codex model and effort" : "Effort"}
        >
          <span className="truncate">
            {codexLabel && <>{codexLabel} · </>}
            <span className={cn(shown && EFFORT_TEXT[shown])}>
              {shown ? EFFORT_LABEL[shown] : "Default effort"}
            </span>
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
            className="shrink-0 opacity-60"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-1">
        {agent === "codex" && (
          <>
            <Heading>Codex model</Heading>
            <div className="max-h-56 overflow-y-auto">
              {[{ id: undefined, label: "Default" }, ...listed].map((m) => (
                <button
                  key={m.id ?? "default"}
                  type="button"
                  onClick={() => setCodexModel(m.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent"
                >
                  <span className="w-3.5">
                    {m.id === codexModel && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={12}
                        strokeWidth={2}
                      />
                    )}
                  </span>
                  <span className="flex-1 truncate">{m.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {efforts.length > 0 && (
          <EffortSelector
            efforts={efforts}
            value={shown}
            onChange={(e) => setEffort(agent, e)}
            className={cn(
              agent === "codex" && "mt-1 border-t border-border/60",
            )}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <div className="px-1 pt-0.5 pb-1 text-[10.5px] font-medium text-muted-foreground">
      {children}
    </div>
  );
}
