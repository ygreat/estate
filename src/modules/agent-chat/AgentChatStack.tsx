import { cn } from "@/lib/utils";
import { placementStyle, useTabPlacement } from "@/modules/layout/placement";
import type { AgentChatTab, Tab } from "@/modules/tabs";
import { AgentChatPane } from "./AgentChatPane";

type Props = {
  tabs: Tab[];
  activeId: number;
};

/** Keeps every open chat mounted (streaming continues while hidden). */
export function AgentChatStack({ tabs, activeId }: Props) {
  const placementOf = useTabPlacement();
  const chats = tabs.filter(
    (t): t is AgentChatTab => t.kind === "agent-chat" && !t.cold,
  );
  return (
    <div className="relative h-full w-full">
      {chats.map((t) => {
        const placement = placementOf(t.id, activeId);
        const visible = placement !== null;
        return (
          <div
            key={t.id}
            style={placementStyle(placement)}
            className={cn(!visible && "invisible pointer-events-none")}
            aria-hidden={!visible}
          >
            <AgentChatPane
              chatId={t.chatId}
              agent={t.agent}
              cwd={t.cwd}
              visible={visible}
            />
          </div>
        );
      })}
    </div>
  );
}
