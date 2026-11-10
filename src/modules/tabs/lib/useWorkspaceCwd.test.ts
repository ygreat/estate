import { describe, expect, it } from "vitest";
import { lastTerminalCwdFor } from "./useWorkspaceCwd";

describe("lastTerminalCwdFor", () => {
  const last = { cwd: "/work/api", spaceId: "api" };

  it("uses the last terminal folder within its own project", () => {
    expect(lastTerminalCwdFor(last, "api")).toBe("/work/api");
  });

  it("ignores another project's terminal after switching projects", () => {
    expect(lastTerminalCwdFor(last, "web")).toBeNull();
  });

  it("keeps the old behavior when no project is known", () => {
    expect(lastTerminalCwdFor(last, null)).toBe("/work/api");
    expect(lastTerminalCwdFor(null, "api")).toBeNull();
  });
});
