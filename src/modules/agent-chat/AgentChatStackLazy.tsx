import { type ComponentProps, lazy, Suspense } from "react";
import type { AgentChatStack as AgentChatStackType } from "./AgentChatStack";

const AgentChatStackInner = lazy(() =>
  import("./AgentChatStack").then((m) => ({ default: m.AgentChatStack })),
);

type Props = ComponentProps<typeof AgentChatStackType>;

/** Chat mode loads only once a chat tab exists. */
export function AgentChatStack(props: Props) {
  if (!props.tabs.some((tab) => tab.kind === "agent-chat" && !tab.cold))
    return null;
  return (
    <Suspense fallback={null}>
      <AgentChatStackInner {...props} />
    </Suspense>
  );
}
