/**
 * Ghostty clears a redrawable prompt after a resize from the row its prompt
 * iterator finds, which after reflow is only the cursor's row: a prompt that
 * newly wraps keeps its head on the rows above. The shell's redraw (`\r`, clear
 * line, prompt) then prints a second copy below it. These rows are the head:
 * the rows above the cursor that the cursor's row continues. Pure.
 */
export function wrappedRowsAbove(
  continuesPrevious: (line: number) => boolean,
  cursorLine: number,
  limit: number,
): number {
  let rows = 0;
  while (rows < limit && cursorLine - rows > 0) {
    if (!continuesPrevious(cursorLine - rows)) break;
    rows += 1;
  }
  return rows;
}

/** Moves to the head's first column and clears it and everything below. */
export function clearPromptHeadSequence(rows: number): string {
  return rows > 0 ? `\x1b[${rows}A\r\x1b[0J` : "";
}
