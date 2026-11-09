import { describe, expect, it } from "vitest";
import { coerceSidebarSide, DEFAULT_PREFERENCES } from "./store";

describe("coerceSidebarSide", () => {
  it("defaults to the right", () => {
    expect(DEFAULT_PREFERENCES.sidebarSide).toBe("right");
    expect(coerceSidebarSide(undefined)).toBe("right");
  });

  it("keeps a valid side and rejects anything else", () => {
    expect(coerceSidebarSide("left")).toBe("left");
    expect(coerceSidebarSide("right")).toBe("right");
    for (const value of ["Left", "top", "", 1, null, {}]) {
      expect(coerceSidebarSide(value)).toBe("right");
    }
  });
});
