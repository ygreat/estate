import { type ComponentProps, lazy, Suspense } from "react";
import type { AgentsPanel as AgentsPanelType } from "./AgentsPanel";

const AgentsPanelInner = lazy(() =>
  import("./AgentsPanel").then((m) => ({ default: m.AgentsPanel })),
);

/** The Agents sidebar view loads when it's first shown. */
export function AgentsPanel(props: ComponentProps<typeof AgentsPanelType>) {
  return (
    <Suspense fallback={null}>
      <AgentsPanelInner {...props} />
    </Suspense>
  );
}
