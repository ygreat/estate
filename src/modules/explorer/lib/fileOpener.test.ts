import { describe, expect, it, vi } from "vitest";
import { openFileInEditor, registerFileOpener } from "./fileOpener";

describe("fileOpener", () => {
  it("opens through the registered window and stops after unregistering", () => {
    expect(openFileInEditor("/a.ts")).toBe(false);
    const open = vi.fn();
    const unregister = registerFileOpener(open);
    expect(openFileInEditor("/a.ts")).toBe(true);
    expect(open).toHaveBeenCalledWith("/a.ts");
    unregister();
    expect(openFileInEditor("/a.ts")).toBe(false);
  });

  it("keeps a newer opener when an older one unregisters", () => {
    const first = registerFileOpener(vi.fn());
    const second = vi.fn();
    const unregister = registerFileOpener(second);
    first();
    expect(openFileInEditor("/b.ts")).toBe(true);
    expect(second).toHaveBeenCalledWith("/b.ts");
    unregister();
  });
});
