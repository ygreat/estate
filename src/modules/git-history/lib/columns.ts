// Estate file; not part of Terax.
/**
 * Which optional columns of the commit table fit a pane's width. A split pane
 * can be half the window or less, so columns drop from least to most useful
 * (Changes, then Author, then Date) to keep room for the subject. Pure.
 */

export type HistoryColumns = {
  author: boolean;
  date: boolean;
  changes: boolean;
};

const SHA = 60;
const SPACER = 12;
const AUTHOR = 140;
const DATE = 96;
const CHANGES = 116;
const GAP = 12;
/** Row padding on the right plus the active row's left border. */
const EDGES = 14;
/** The least the subject should get before a column is dropped. */
export const SUBJECT_MIN = 180;

const ALL: HistoryColumns = { author: true, date: true, changes: true };

function needed(cols: HistoryColumns, railPx: number): number {
  const optional = [
    cols.author && AUTHOR,
    cols.date && DATE,
    cols.changes && CHANGES,
  ].filter((w): w is number => typeof w === "number");
  const widths = [railPx, SHA, SUBJECT_MIN, SPACER, ...optional];
  return widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1) + EDGES;
}

/** Columns for a pane `width` px wide; null (not measured yet) shows all. */
export function historyColumns(
  width: number | null,
  railPx: number,
): HistoryColumns {
  if (width === null) return ALL;
  const cols = { ...ALL };
  for (const drop of ["changes", "author", "date"] as const) {
    if (needed(cols, railPx) <= width) break;
    cols[drop] = false;
  }
  return cols;
}

/** The grid template for these columns (rail | sha | subject | spacer | …). */
export function historyGridTemplate(
  cols: HistoryColumns,
  railPx: number,
): string {
  return [
    `${railPx}px`,
    `${SHA}px`,
    "minmax(0, 560px)",
    `minmax(${SPACER}px, 1fr)`,
    cols.author && `minmax(${AUTHOR}px, max-content)`,
    cols.date && `${DATE}px`,
    cols.changes && `${CHANGES}px`,
  ]
    .filter(Boolean)
    .join(" ");
}
