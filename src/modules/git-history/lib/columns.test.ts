import { describe, expect, it } from "vitest";
import { historyColumns, historyGridTemplate } from "./columns";

const RAIL = 96;

describe("historyColumns", () => {
  it("shows every column in a full-width pane", () => {
    expect(historyColumns(1200, RAIL)).toEqual({
      author: true,
      date: true,
      changes: true,
    });
  });

  it("drops Changes, then Author, then Date as the pane narrows", () => {
    expect(historyColumns(760, RAIL)).toEqual({
      author: true,
      date: true,
      changes: false,
    });
    expect(historyColumns(600, RAIL)).toEqual({
      author: false,
      date: true,
      changes: false,
    });
    expect(historyColumns(400, RAIL)).toEqual({
      author: false,
      date: false,
      changes: false,
    });
  });

  it("shows every column before the pane is measured", () => {
    expect(historyColumns(null, RAIL).changes).toBe(true);
  });

  it("matches the original layout when every column shows", () => {
    expect(
      historyGridTemplate({ author: true, date: true, changes: true }, RAIL),
    ).toBe(
      "96px 60px minmax(0, 560px) minmax(12px, 1fr) minmax(140px, max-content) 96px 116px",
    );
  });

  it("leaves dropped columns out of the template", () => {
    expect(
      historyGridTemplate({ author: false, date: true, changes: false }, RAIL),
    ).toBe("96px 60px minmax(0, 560px) minmax(12px, 1fr) 96px");
  });
});
