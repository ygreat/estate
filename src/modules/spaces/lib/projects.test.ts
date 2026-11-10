import { describe, expect, it } from "vitest";
import {
  folderName,
  projectForFolder,
  recentProjects,
  shortPath,
} from "./projects";
import type { SpaceMeta } from "./store";

const space = (id: string, root: string | null, updatedAt = 0): SpaceMeta => ({
  id,
  name: id,
  root,
  env: { kind: "local" } as SpaceMeta["env"],
  createdAt: 0,
  updatedAt,
});

describe("projects", () => {
  const spaces = [
    space("a", "/w/a", 1),
    space("b", "/w/b", 5),
    space("c", null, 9),
  ];

  it("lists projects with a folder, most recently opened first", () => {
    expect(recentProjects(spaces, {}).map((s) => s.id)).toEqual(["b", "a"]);
    expect(recentProjects(spaces, { a: 100 }).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("after Clear Recent, lists only projects opened since", () => {
    expect(recentProjects(spaces, {}, 50)).toEqual([]);
    expect(
      recentProjects(spaces, { a: 40, b: 60 }, 50).map((s) => s.id),
    ).toEqual(["b"]);
  });

  it("finds the project for a folder, ignoring a trailing slash", () => {
    expect(projectForFolder(spaces, "/w/b/")?.id).toBe("b");
    expect(projectForFolder(spaces, "/w/z")).toBeUndefined();
  });

  it("formats names and home-relative paths", () => {
    expect(folderName("/Users/me/code/app")).toBe("app");
    expect(shortPath("/Users/me/code/app", "/Users/me")).toBe("~/code/app");
    expect(shortPath("/Users/me", "/Users/me")).toBe("~");
    expect(shortPath("/Users/meow/x", "/Users/me")).toBe("/Users/meow/x");
  });
});
