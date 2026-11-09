import { describe, expect, it } from "vitest";
import { gatherTabs, type Tab } from "./useTabs";

const tab = (id: number): Tab => ({
  id,
  kind: "preview",
  spaceId: "s",
  title: String(id),
  url: "",
});
const order = (tabs: Tab[]) => tabs.map((t) => t.id);

describe("gatherTabs", () => {
  it("moves the listed tabs next to the first of them, in order", () => {
    const tabs = [1, 2, 3, 4, 5].map(tab);
    expect(order(gatherTabs(tabs, [2, 5]))).toEqual([1, 2, 5, 3, 4]);
    expect(order(gatherTabs(tabs, [5, 2]))).toEqual([1, 5, 2, 3, 4]);
    expect(order(gatherTabs(tabs, [4, 1, 3]))).toEqual([4, 1, 3, 2, 5]);
  });

  it("returns the same array when nothing moves", () => {
    const tabs = [1, 2, 3].map(tab);
    expect(gatherTabs(tabs, [2, 3])).toBe(tabs);
    expect(gatherTabs(tabs, [2])).toBe(tabs);
    expect(gatherTabs(tabs, [2, 99])).toBe(tabs);
  });
});
