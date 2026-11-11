import { describe, expect, it } from "vitest";
import { clearPromptHeadSequence, wrappedRowsAbove } from "./promptReflow";

describe("wrappedRowsAbove", () => {
  const wraps = (continuing: number[]) => (line: number) =>
    continuing.includes(line);

  it("counts the rows the cursor's row continues", () => {
    expect(wrappedRowsAbove(wraps([10]), 10, 40)).toBe(1);
    expect(wrappedRowsAbove(wraps([9, 10]), 10, 40)).toBe(2);
    expect(wrappedRowsAbove(wraps([]), 10, 40)).toBe(0);
  });

  it("stops at a hard line break, the buffer start and the limit", () => {
    expect(wrappedRowsAbove(wraps([8, 10]), 10, 40)).toBe(1);
    expect(wrappedRowsAbove(wraps([0, 1, 2]), 2, 40)).toBe(2);
    expect(wrappedRowsAbove(wraps([5, 6, 7, 8, 9, 10]), 10, 3)).toBe(3);
  });

  it("emits nothing when there is no head", () => {
    expect(clearPromptHeadSequence(0)).toBe("");
    expect(clearPromptHeadSequence(2)).toBe("\x1b[2A\r\x1b[0J");
  });
});
