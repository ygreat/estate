import { describe, expect, it } from "vitest";
import { projectNameProblem, projectPath } from "./NewProjectDialog";

describe("new project", () => {
  it("accepts ordinary names and rejects unsafe ones", () => {
    expect(projectNameProblem("my-app")).toBeNull();
    expect(projectNameProblem("My App 2")).toBeNull();
    expect(projectNameProblem("  ")).not.toBeNull();
    expect(projectNameProblem("..")).not.toBeNull();
    expect(projectNameProblem("a/b")).not.toBeNull();
    expect(projectNameProblem(".hidden")).not.toBeNull();
    expect(projectNameProblem("x".repeat(101))).not.toBeNull();
  });

  it("joins the root and the name", () => {
    expect(projectPath("/Users/me/Projects/", " my-app ")).toBe(
      "/Users/me/Projects/my-app",
    );
  });
});
