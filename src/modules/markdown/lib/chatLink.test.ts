import { describe, expect, it } from "vitest";
import { isWebUrl, linkLabel } from "./chatLink";

describe("chat links", () => {
  it("gives hover actions to web links only", () => {
    expect(isWebUrl("https://example.com")).toBe(true);
    expect(isWebUrl("HTTP://localhost:4321/x")).toBe(true);
    for (const href of [
      "mailto:a@example.com",
      "tel:+1",
      "src/app.ts",
      "#heading",
      "javascript:alert(1)",
      "streamdown:incomplete-link",
    ]) {
      expect(isWebUrl(href)).toBe(false);
    }
  });

  it("labels a link without its scheme", () => {
    expect(linkLabel("https://example.com/")).toBe("example.com");
    expect(linkLabel("http://127.0.0.1:4321/")).toBe("127.0.0.1:4321");
    expect(linkLabel("https://github.com/a/b/")).toBe("github.com/a/b/");
    expect(linkLabel("https://x.dev/docs?q=1")).toBe("x.dev/docs?q=1");
  });
});
