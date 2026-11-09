// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { placementStyle, useTabPlacement } from "@/modules/layout/placement";
import type { GitHistoryTab, Tab } from "@/modules/tabs";
import { GitHistoryPane, type GitHistorySearchHandle } from "./GitHistoryPane";

type CommitFileDiffOpenInput = {
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

type Props = {
  tabs: Tab[];
  activeId: number;
  onOpenCommitFile: (input: CommitFileDiffOpenInput) => void;
  onSearchHandle?: (handle: GitHistorySearchHandle | null) => void;
};

export function GitHistoryStack({
  tabs,
  activeId,
  onOpenCommitFile,
  onSearchHandle,
}: Props) {
  const placementOf = useTabPlacement();
  const shown = tabs.flatMap((t) => {
    if (t.kind !== "git-history") return [];
    const placement = placementOf(t.id, activeId);
    return placement ? [{ tab: t as GitHistoryTab, placement }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map(({ tab, placement }) => (
        <div key={tab.id} style={placementStyle(placement)}>
          <GitHistoryPane
            repoRoot={tab.repoRoot}
            onOpenCommitFile={onOpenCommitFile}
            // Find (Cmd-F) targets the focused pane's history only.
            onSearchHandle={tab.id === activeId ? onSearchHandle : undefined}
          />
        </div>
      ))}
    </>
  );
}
