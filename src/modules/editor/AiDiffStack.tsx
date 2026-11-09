// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { placementStyle, useTabPlacement } from "@/modules/layout/placement";
import type { AiDiffTab, Tab } from "@/modules/tabs";
import { AiDiffPane } from "./AiDiffPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  onAccept: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
};

/** Renders every AI diff tab on screen (one, or one per split pane). */
export function AiDiffStack({ tabs, activeId, onAccept, onReject }: Props) {
  const placementOf = useTabPlacement();
  const shown = tabs.flatMap((t) => {
    if (t.kind !== "ai-diff") return [];
    const placement = placementOf(t.id, activeId);
    return placement ? [{ tab: t as AiDiffTab, placement }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map(({ tab, placement }) => (
        <div key={tab.id} style={placementStyle(placement)}>
          <AiDiffPane
            path={tab.path}
            originalContent={tab.originalContent}
            proposedContent={tab.proposedContent}
            status={tab.status}
            isNewFile={tab.isNewFile}
            onAccept={() => onAccept(tab.approvalId)}
            onReject={() => onReject(tab.approvalId)}
          />
        </div>
      ))}
    </>
  );
}
