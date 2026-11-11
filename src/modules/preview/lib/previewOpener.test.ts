import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canOpenInPreview,
  openInPreview,
  registerPreviewOpener,
} from "./previewOpener";

describe("previewOpener", () => {
  let unregister: (() => void) | null = null;
  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("does nothing until a window registers an opener", () => {
    expect(canOpenInPreview("https://example.com")).toBe(false);
    expect(openInPreview("https://example.com")).toBe(false);
  });

  it("opens only URLs a Preview tab may load", () => {
    const open = vi.fn();
    unregister = registerPreviewOpener(open);

    expect(openInPreview("http://localhost:4321/")).toBe(true);
    expect(open).toHaveBeenCalledWith("http://localhost:4321/");

    for (const url of [
      "mailto:a@example.com",
      "javascript:alert(1)",
      "https://user:pw@example.com",
      "http://ipc.localhost/",
    ]) {
      expect(canOpenInPreview(url)).toBe(false);
      expect(openInPreview(url)).toBe(false);
    }
    expect(open).toHaveBeenCalledOnce();
  });

  it("a stale unregister leaves a newer opener in place", () => {
    const first = vi.fn();
    const second = vi.fn();
    const dropFirst = registerPreviewOpener(first);
    unregister = registerPreviewOpener(second);
    dropFirst();

    expect(openInPreview("https://example.com")).toBe(true);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
});
