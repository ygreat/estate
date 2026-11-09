// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { placementStyle, useTabPlacement } from "@/modules/layout/placement";
import type { GitCommitFileDiffTab, GitDiffTab, Tab } from "@/modules/tabs";
import { GitDiffPane } from "./GitDiffPane";

type Props = {
  tabs: Tab[];
  activeId: number;
};

/** Renders every git diff tab on screen (one, or one per split pane). */
export function GitDiffStack({ tabs, activeId }: Props) {
  const placementOf = useTabPlacement();
  const shown = tabs.flatMap((t) => {
    if (t.kind !== "git-diff" && t.kind !== "git-commit-file") return [];
    const placement = placementOf(t.id, activeId);
    return placement
      ? [{ tab: t as GitDiffTab | GitCommitFileDiffTab, placement }]
      : [];
  });
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map(({ tab, placement }) => (
        <div key={tab.id} style={placementStyle(placement)}>
          {tab.kind === "git-diff" ? (
            <GitDiffPane
              active
              source={{
                kind: "working",
                repoRoot: tab.repoRoot,
                path: tab.path,
                mode: tab.mode,
                originalPath: tab.originalPath,
              }}
            />
          ) : (
            <GitDiffPane
              active
              source={{
                kind: "commit",
                repoRoot: tab.repoRoot,
                sha: tab.sha,
                path: tab.path,
                originalPath: tab.originalPath,
              }}
              chipLabel={tab.shortSha}
            />
          )}
        </div>
      ))}
    </>
  );
}
