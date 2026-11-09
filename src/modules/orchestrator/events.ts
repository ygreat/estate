/** Estate: asks App to start an Orchestrator for a goal (from the AI panel). */
export const ORCHESTRATE_EVENT = "estate:orchestrate";

export type OrchestrateDetail = { goal: string };

export function requestOrchestration(goal: string): void {
  window.dispatchEvent(
    new CustomEvent<OrchestrateDetail>(ORCHESTRATE_EVENT, { detail: { goal } }),
  );
}
