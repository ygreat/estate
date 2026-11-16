import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  archiveName,
  compareVersions,
  isVersion,
  latestJson,
  mergeManifests,
  plistVersion,
  publicKeyId,
  readSignature,
  repoFromEndpoint,
  setCargoLockVersion,
  setCargoTomlVersion,
  setJsonVersion,
  updaterArtifacts,
} from "../../scripts/release.mjs";

const ROOT = join(import.meta.dirname, "../..");
const conf = JSON.parse(
  readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"),
);

/** A Tauri-style .sig: base64 of a minisign signature file. */
function fakeSig(keyIdHex: string, trusted: string): string {
  const keyBytes = Buffer.from(keyIdHex, "hex").reverse();
  const sigLine = Buffer.concat([
    Buffer.from("ED"),
    keyBytes,
    Buffer.alloc(64, 1),
  ]).toString("base64");
  const text = [
    "untrusted comment: signature from tauri secret key",
    sigLine,
    `trusted comment: ${trusted}`,
    Buffer.alloc(64, 2).toString("base64"),
    "",
  ].join("\n");
  return Buffer.from(text).toString("base64");
}

describe("versions", () => {
  it("accepts plain and pre-release versions only", () => {
    expect(isVersion("0.1.1")).toBe(true);
    expect(isVersion("1.2.3-beta.1")).toBe(true);
    expect(isVersion("v0.1.1")).toBe(false);
    expect(isVersion("0.1")).toBe(false);
  });

  it("orders versions numerically, pre-releases before the release", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.2.0", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("0.1.1-beta", "0.1.1")).toBeLessThan(0);
    expect(compareVersions("0.1.1", "0.1.1")).toBe(0);
  });
});

describe("bumping", () => {
  it("changes only the top-level version of a JSON file", () => {
    const text =
      '{\n  "name": "x",\n  "version": "0.1.0",\n  "deps": {\n    "version": "9.9.9"\n  }\n}\n';
    expect(setJsonVersion(text, "0.1.1")).toBe(
      text.replace('"version": "0.1.0"', '"version": "0.1.1"'),
    );
  });

  it("bumps the real package.json and tauri.conf.json", () => {
    for (const file of ["package.json", "src-tauri/tauri.conf.json"]) {
      const text = readFileSync(join(ROOT, file), "utf8");
      const next = JSON.parse(setJsonVersion(text, "9.8.7"));
      expect(next.version).toBe("9.8.7");
    }
  });

  it("changes [package] and [workspace.package] in Cargo.toml, not dependencies", () => {
    const text = [
      "[package]",
      'name = "estate"',
      'version = "0.1.0"',
      "",
      "[workspace.package]",
      'version = "0.1.0"',
      "",
      "[dependencies]",
      'tokio = { version = "1" }',
      "",
      "[dependencies.serde]",
      'version = "1.0.0"',
    ].join("\n");
    const out = setCargoTomlVersion(text, "0.1.1");
    expect(out.match(/version = "0\.1\.1"/g)).toHaveLength(2);
    expect(out).toContain('tokio = { version = "1" }');
    expect(out).toContain('version = "1.0.0"');
  });

  it("bumps the workspace crates in the real Cargo.lock", () => {
    const text = readFileSync(join(ROOT, "src-tauri/Cargo.lock"), "utf8");
    const out = setCargoLockVersion(
      text,
      ["estate", "estate-cli", "estate-control-protocol"],
      "9.8.7",
    );
    for (const name of ["estate", "estate-cli", "estate-control-protocol"])
      expect(out).toContain(`name = "${name}"\nversion = "9.8.7"`);
    expect(out.split("\n").length).toBe(text.split("\n").length);
  });

  it("refuses a file it can't find the version in", () => {
    expect(() => setJsonVersion("{}", "0.1.1")).toThrow();
    expect(() => setCargoTomlVersion("[dependencies]\n", "0.1.1")).toThrow();
  });
});

describe("signatures", () => {
  it("reads the key ID of the app's updater key", () => {
    expect(publicKeyId(conf.plugins.updater.pubkey)).toBe("1B030B03EAEAC126");
  });

  it("reads the key ID and version a .sig records", () => {
    const sig = fakeSig(
      "1B030B03EAEAC126",
      "timestamp:1\tfile:Estate.app.tar.gz\tversion:0.1.1",
    );
    expect(readSignature(sig)).toEqual({
      keyId: "1B030B03EAEAC126",
      version: "0.1.1",
    });
  });

  it("has no version when the trusted comment doesn't record one", () => {
    expect(
      readSignature(fakeSig("0011223344556677", "timestamp:1")).version,
    ).toBeNull();
  });
});

describe("latest.json", () => {
  const repo = repoFromEndpoint(conf.plugins.updater.endpoints[0]);
  const base = {
    version: "0.1.1",
    notes: "Fixes",
    pubDate: "2026-11-11T00:00:00Z",
    repo,
    tag: "estate-0.1.1",
  };
  const download =
    "https://github.com/ygreat/estate/releases/download/estate-0.1.1/";

  it("points each platform at its versioned artifact on the release", () => {
    expect(repo).toBe("ygreat/estate");
    const entries = updaterArtifacts("0.1.1").map((a, i) => ({
      ...a,
      signature: `sig${i}\n`,
    }));
    expect(latestJson({ ...base, entries })).toEqual({
      version: "0.1.1",
      notes: "Fixes",
      pub_date: "2026-11-11T00:00:00Z",
      platforms: {
        "darwin-x86_64": {
          signature: "sig0",
          url: `${download}Estate_0.1.1_x64.app.tar.gz`,
        },
        "darwin-aarch64": {
          signature: "sig1",
          url: `${download}Estate_0.1.1_aarch64.app.tar.gz`,
        },
        "windows-x86_64": {
          signature: "sig2",
          url: `${download}Estate_0.1.1_x64-setup.exe`,
        },
        "windows-x86_64-nsis": {
          signature: "sig2",
          url: `${download}Estate_0.1.1_x64-setup.exe`,
        },
        "windows-x86_64-msi": {
          signature: "sig3",
          url: `${download}Estate_0.1.1_x64_en-US.msi`,
        },
      },
    });
  });

  it("gives every platform its own upload name, so artifacts never overwrite each other", () => {
    const artifacts = updaterArtifacts("0.1.1");
    const uploads = artifacts.map((a) => a.upload);
    expect(new Set(uploads).size).toBe(uploads.length);
    const keys = artifacts.flatMap((a) => a.platforms);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("lists only the platforms that were built", () => {
    const [intel] = updaterArtifacts("0.1.1");
    const json = latestJson({
      ...base,
      entries: [{ ...intel, signature: "s" }],
    });
    expect(Object.keys(json.platforms)).toEqual(["darwin-x86_64"]);
    expect(intel.upload).toBe(archiveName("0.1.1", "x64"));
  });

  it("reads the version of a built macOS app", () => {
    const plist =
      "<dict>\n\t<key>CFBundleName</key>\n\t<string>Estate</string>\n\t<key>CFBundleShortVersionString</key>\n\t<string>0.1.1</string>\n</dict>";
    expect(plistVersion(plist)).toBe("0.1.1");
    expect(plistVersion("<dict></dict>")).toBeNull();
  });

  it("rejects an endpoint that isn't a GitHub release", () => {
    expect(() => repoFromEndpoint("https://example.com/latest.json")).toThrow();
  });
});

describe("merging another machine's latest.json", () => {
  const release = { repo: "ygreat/estate", tag: "estate-0.1.1" };
  const download =
    "https://github.com/ygreat/estate/releases/download/estate-0.1.1/";
  const mac = {
    version: "0.1.1",
    notes: "Fixes",
    pub_date: "2026-11-11T00:00:00Z",
    platforms: {
      "darwin-x86_64": {
        signature: "m",
        url: `${download}Estate_0.1.1_x64.app.tar.gz`,
      },
    },
  };
  const windows = {
    version: "0.1.1",
    notes: "Windows",
    pub_date: "2026-11-10T00:00:00Z",
    platforms: {
      "windows-x86_64": {
        signature: "w",
        url: `${download}Estate_0.1.1_x64-setup.exe`,
      },
    },
  };

  it("adds its platforms and keeps this machine's notes and date", () => {
    const out = mergeManifests(mac, windows, release);
    expect(out.notes).toBe("Fixes");
    expect(out.pub_date).toBe("2026-11-11T00:00:00Z");
    expect(Object.keys(out.platforms)).toEqual([
      "darwin-x86_64",
      "windows-x86_64",
    ]);
  });

  it("refuses another version", () => {
    expect(() =>
      mergeManifests(mac, { ...windows, version: "0.1.0" }, release),
    ).toThrow(/version 0\.1\.0/);
  });

  it("refuses a platform both have", () => {
    expect(() => mergeManifests(mac, mac, release)).toThrow(/darwin-x86_64/);
  });

  it("refuses an artifact on another release or without a signature", () => {
    const elsewhere = {
      ...windows,
      platforms: {
        "windows-x86_64": {
          signature: "w",
          url: "https://github.com/ygreat/estate/releases/download/estate-0.1.0/x.exe",
        },
      },
    };
    expect(() => mergeManifests(mac, elsewhere, release)).toThrow(
      /estate-0\.1\.1/,
    );
    const unsigned = {
      ...windows,
      platforms: {
        "windows-x86_64": { signature: "", url: `${download}x.exe` },
      },
    };
    expect(() => mergeManifests(mac, unsigned, release)).toThrow(/signature/);
  });
});
