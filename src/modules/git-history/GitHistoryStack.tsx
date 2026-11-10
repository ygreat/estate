// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { cn } from "@/lib/utils";
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

/**
 * Estate: keeps every open Git Graph mounted, like terminals, chats and the
 * browser, so moving it into or out of a split (or switching tabs) keeps its
 * commits, scroll and search instead of reloading.
 */
export function GitHistoryStack({
  tabs,
  activeId,
  onOpenCommitFile,
  onSearchHandle,
}: Props) {
  const placementOf = useTabPlacement();
  const open = tabs.filter(
    (t): t is GitHistoryTab => t.kind === "git-history" && !t.cold,
  );
  if (open.length === 0) return null;
  return (
    <>
      {open.map((tab) => {
        const placement = placementOf(tab.id, activeId);
        const visible = placement !== null;
        return (
          <div
            key={tab.id}
            style={placementStyle(placement)}
            className={cn(!visible && "invisible pointer-events-none")}
            aria-hidden={!visible}
          >
            <GitHistoryPane
              repoRoot={tab.repoRoot}
              onOpenCommitFile={onOpenCommitFile}
              // Find (Cmd-F) targets the focused pane's history only.
              onSearchHandle={tab.id === activeId ? onSearchHandle : undefined}
              visible={visible}
            />
          </div>
        );
      })}
    </>
  );
}
