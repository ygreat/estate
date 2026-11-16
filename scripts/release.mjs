#!/usr/bin/env node
// Estate file; not part of Terax.
/**
 * Release helpers for the macOS (Intel and Apple Silicon) and Windows builds.
 *
 *   node scripts/release.mjs bump 0.1.1
 *     Sets the version in package.json, src-tauri/tauri.conf.json,
 *     src-tauri/Cargo.toml (package and workspace) and src-tauri/Cargo.lock.
 *
 *   node scripts/release.mjs updater --tag estate-0.1.1 [--notes "..."] [--merge <latest.json>]
 *     After `pnpm tauri build` with the signing key set, for each platform
 *     built on this machine (see updaterArtifacts): checks the update artifact
 *     was signed with the key the app trusts and for this version, then writes
 *     latest.json and versioned copies of the artifacts to
 *     src-tauri/target/updater/, ready to upload. --merge adds the platforms of
 *     a latest.json written the same way on another machine (the Windows PC).
 *
 * The functions below are pure and tested in src/app/release-script.test.ts;
 * only `main` touches the file system.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function isVersion(v) {
  return typeof v === "string" && VERSION.test(v);
}

/** Negative, zero or positive, like a sort comparator (pre-releases sort first). */
export function compareVersions(a, b) {
  const [coreA, preA] = a.split("-", 2);
  const [coreB, preB] = b.split("-", 2);
  const x = coreA.split(".").map(Number);
  const y = coreB.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  if (preA === preB) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  return preA < preB ? -1 : 1;
}

function replaceOnce(text, pattern, replacement, what) {
  let hits = 0;
  const out = text.replace(pattern, (...m) => {
    hits += 1;
    return typeof replacement === "function" ? replacement(...m) : replacement;
  });
  if (hits !== 1)
    throw new Error(`expected one ${what}, found ${hits}`);
  return out;
}

/** package.json or tauri.conf.json: the top-level "version". */
export function setJsonVersion(text, version) {
  return replaceOnce(
    text,
    /^( {2}"version":\s*")[^"]*(")/m,
    (_m, a, b) => `${a}${version}${b}`,
    'top-level "version"',
  );
}

/** Cargo.toml: `version` in [package] and [workspace.package] only. */
export function setCargoTomlVersion(text, version) {
  let section = "";
  let changed = 0;
  const lines = text.split("\n").map((line) => {
    const header = line.match(/^\[([^\]]+)\]\s*$/);
    if (header) section = header[1];
    if (
      (section === "package" || section === "workspace.package") &&
      /^version\s*=\s*"[^"]*"/.test(line)
    ) {
      changed += 1;
      return line.replace(/"[^"]*"/, `"${version}"`);
    }
    return line;
  });
  if (changed === 0) throw new Error("no [package] version in Cargo.toml");
  return lines.join("\n");
}

/** Cargo.lock: the version of each named (workspace) package. */
export function setCargoLockVersion(text, names, version) {
  let out = text;
  for (const name of names) {
    out = replaceOnce(
      out,
      new RegExp(`(name = "${name}"\\nversion = ")[^"]*(")`),
      (_m, a, b) => `${a}${version}${b}`,
      `Cargo.lock entry for ${name}`,
    );
  }
  return out;
}

/** The key ID (as minisign prints it) of a base64 Tauri public key. */
export function publicKeyId(pubkeyB64) {
  const lines = Buffer.from(pubkeyB64, "base64").toString("utf8").split("\n");
  return keyIdOf(Buffer.from(lines[1].trim(), "base64"));
}

/** Key ID and trusted comment of a Tauri `.sig` file's contents. */
export function readSignature(sigText) {
  const lines = Buffer.from(sigText.trim(), "base64")
    .toString("utf8")
    .split("\n");
  const trusted = (lines[2] ?? "").replace(/^trusted comment:\s*/, "");
  const version = trusted.match(/(?:^|\t)version:(\S+)/)?.[1] ?? null;
  return {
    keyId: keyIdOf(Buffer.from(lines[1].trim(), "base64")),
    version,
  };
}

function keyIdOf(bytes) {
  // Two bytes of algorithm, then the 8-byte key ID, little-endian.
  return Buffer.from(bytes.subarray(2, 10)).reverse().toString("hex").toUpperCase();
}

/** "owner/repo" from the updater endpoint (github.com/owner/repo/releases/...). */
export function repoFromEndpoint(endpoint) {
  const m = endpoint.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\//);
  if (!m) throw new Error(`not a GitHub releases endpoint: ${endpoint}`);
  return m[1];
}

/** The macOS update archive's name on the release: x64 (Intel) or aarch64 (Apple Silicon). */
export function archiveName(version, arch) {
  return `Estate_${version}_${arch}.app.tar.gz`;
}

/**
 * Every platform's signed update artifact. `bundled` is where `tauri build`
 * leaves it under the bundle folder of one of `targets` (null: a build without
 * --target, as on the Windows PC); `upload` is its name on the release;
 * `platforms` are the updater keys that point at it; `installer` is what
 * testers download, when that isn't the artifact itself.
 */
export function updaterArtifacts(version) {
  return [
    {
      name: "macOS Intel",
      targets: ["x86_64-apple-darwin"],
      bundled: "macos/Estate.app.tar.gz",
      upload: archiveName(version, "x64"),
      platforms: ["darwin-x86_64"],
      installer: `dmg/Estate_${version}_x64.dmg`,
    },
    {
      name: "macOS Apple Silicon",
      targets: ["aarch64-apple-darwin"],
      bundled: "macos/Estate.app.tar.gz",
      upload: archiveName(version, "aarch64"),
      platforms: ["darwin-aarch64"],
      installer: `dmg/Estate_${version}_aarch64.dmg`,
    },
    {
      // The NSIS installer is Estate's Windows default, so the generic key points at it.
      name: "Windows (NSIS)",
      targets: ["x86_64-pc-windows-msvc", null],
      bundled: `nsis/Estate_${version}_x64-setup.exe`,
      upload: `Estate_${version}_x64-setup.exe`,
      platforms: ["windows-x86_64", "windows-x86_64-nsis"],
      installer: null,
    },
    {
      name: "Windows (MSI)",
      targets: ["x86_64-pc-windows-msvc", null],
      bundled: `msi/Estate_${version}_x64_en-US.msi`,
      upload: `Estate_${version}_x64_en-US.msi`,
      platforms: ["windows-x86_64-msi"],
      installer: null,
    },
  ];
}

/** CFBundleShortVersionString of an Info.plist, or null. */
export function plistVersion(text) {
  return (
    text.match(
      /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/,
    )?.[1] ?? null
  );
}

export function releaseUrl(repo, tag, file) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${file}`;
}

/**
 * The manifest Estate's updater reads. `entries` are the signed artifacts found
 * ({ platforms, upload, signature }); each platform key points at its upload.
 */
export function latestJson({ version, notes, pubDate, repo, tag, entries }) {
  const platforms = {};
  for (const entry of entries)
    for (const key of entry.platforms)
      platforms[key] = {
        signature: entry.signature.trim(),
        url: releaseUrl(repo, tag, entry.upload),
      };
  return { version, notes, pub_date: pubDate, platforms };
}

/**
 * Adds another machine's manifest to this one. It must be for the same version
 * and release, and may not repeat a platform this one already has.
 */
export function mergeManifests(local, other, { repo, tag }) {
  if (other?.version !== local.version)
    throw new Error(
      `the merged manifest is version ${other?.version}, this release is ${local.version}`,
    );
  const prefix = releaseUrl(repo, tag, "");
  const platforms = { ...local.platforms };
  for (const [key, entry] of Object.entries(other.platforms ?? {})) {
    if (key in platforms)
      throw new Error(`both manifests have ${key}; build each platform once`);
    if (typeof entry?.url !== "string" || !entry.url.startsWith(prefix))
      throw new Error(`the merged ${key} isn't on release ${tag}: ${entry?.url}`);
    if (typeof entry.signature !== "string" || !entry.signature)
      throw new Error(`the merged ${key} has no signature`);
    platforms[key] = entry;
  }
  return { ...local, platforms };
}

// ---- CLI ---------------------------------------------------------------------

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  pkg: join(ROOT, "package.json"),
  conf: join(ROOT, "src-tauri/tauri.conf.json"),
  toml: join(ROOT, "src-tauri/Cargo.toml"),
  lock: join(ROOT, "src-tauri/Cargo.lock"),
  target: join(ROOT, "src-tauri/target"),
};

function bundleDir(target) {
  return target
    ? join(P.target, target, "release/bundle")
    : join(P.target, "release/bundle");
}
const WORKSPACE_CRATES = ["estate", "estate-cli", "estate-control-protocol"];

function fail(message) {
  process.stderr.write(`release: ${message}\n`);
  process.exit(1);
}

function bump(version) {
  if (!isVersion(version)) fail(`"${version}" isn't a version like 0.1.1`);
  const current = JSON.parse(readFileSync(P.conf, "utf8")).version;
  if (compareVersions(version, current) <= 0)
    fail(`${version} must be higher than the current ${current}`);
  const edits = [
    [P.pkg, (t) => setJsonVersion(t, version)],
    [P.conf, (t) => setJsonVersion(t, version)],
    [P.toml, (t) => setCargoTomlVersion(t, version)],
    [P.lock, (t) => setCargoLockVersion(t, WORKSPACE_CRATES, version)],
  ];
  // Compute every edit before writing any, so a failure changes nothing.
  const next = edits.map(([path, edit]) => [path, edit(readFileSync(path, "utf8"))]);
  for (const [path, text] of next) writeFileSync(path, text);
  process.stdout.write(
    `Version ${current} → ${version} in package.json, tauri.conf.json, Cargo.toml and Cargo.lock.\n`,
  );
}

function arg(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function updater(args) {
  const tag = arg(args, "--tag");
  if (!tag) fail("pass --tag <release tag>, e.g. --tag estate-0.1.1");
  const conf = JSON.parse(readFileSync(P.conf, "utf8"));
  const version = conf.version;
  const updaterConf = conf.plugins?.updater;
  if (!updaterConf?.pubkey || !updaterConf.endpoints?.[0])
    fail("tauri.conf.json has no updater pubkey or endpoint");
  const trusted = publicKeyId(updaterConf.pubkey);
  const repo = repoFromEndpoint(updaterConf.endpoints[0]);
  const rel = (p) => p.slice(ROOT.length + 1).replaceAll("\\", "/");

  const found = [];
  const missing = [];
  for (const artifact of updaterArtifacts(version)) {
    const bundle = artifact.targets
      .map(bundleDir)
      .find((dir) => existsSync(join(dir, artifact.bundled)));
    if (!bundle) {
      missing.push(artifact);
      continue;
    }
    const path = join(bundle, artifact.bundled);
    let sigText;
    try {
      sigText = readFileSync(`${path}.sig`, "utf8");
    } catch {
      fail(
        `no ${rel(path)}.sig. Rebuild ${artifact.name} with TAURI_SIGNING_PRIVATE_KEY set.`,
      );
    }
    const sig = readSignature(sigText);
    if (sig.keyId !== trusted)
      fail(
        `${artifact.name}: signed with key ${sig.keyId}, but the app trusts ${trusted}. Rebuild with the right TAURI_SIGNING_PRIVATE_KEY.`,
      );
    // The macOS archive's name has no version, so read the app it was made from.
    const plist = join(bundle, "macos/Estate.app/Contents/Info.plist");
    const built =
      sig.version ??
      (artifact.bundled.startsWith("macos/") && existsSync(plist)
        ? plistVersion(readFileSync(plist, "utf8"))
        : null);
    if (built && built !== version)
      fail(
        `${artifact.name}: the build is version ${built}, but tauri.conf.json says ${version}. Rebuild after bumping.`,
      );
    found.push({ ...artifact, path, bundle, signature: sigText, keyId: sig.keyId });
  }

  const mergePath = arg(args, "--merge");
  if (found.length === 0 && !mergePath)
    fail(
      `no signed update artifacts for ${version} under ${rel(P.target)}. Build with the signing key set first.`,
    );

  let manifest = latestJson({
    version,
    notes: arg(args, "--notes") ?? `Estate ${version}`,
    pubDate: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    repo,
    tag,
    entries: found,
  });
  let merged = [];
  if (mergePath) {
    let other;
    try {
      other = JSON.parse(readFileSync(resolve(mergePath), "utf8"));
    } catch (e) {
      fail(`can't read ${mergePath}: ${e.message}`);
    }
    try {
      manifest = mergeManifests(manifest, other, { repo, tag });
    } catch (e) {
      fail(e.message);
    }
    merged = Object.keys(other.platforms ?? {});
  }

  const out = join(P.target, "updater");
  mkdirSync(out, { recursive: true });
  for (const artifact of found) copyFileSync(artifact.path, join(out, artifact.upload));
  writeFileSync(join(out, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const has = new Set(Object.keys(manifest.platforms));
  const stillMissing = missing.filter((a) => !a.platforms.every((k) => has.has(k)));
  const installers = found
    .filter((a) => a.installer && existsSync(join(a.bundle, a.installer)))
    .map((a) => rel(join(a.bundle, a.installer)));
  const files = [
    ...installers,
    ...found.map((a) => rel(join(out, a.upload))),
    rel(join(out, "latest.json")),
  ];
  process.stdout.write(
    [
      `Signed with ${trusted} (trusted by the app).`,
      ...found.map((a) => `  ${a.name}: ${a.platforms.join(", ")}`),
      ...(merged.length ? [`  merged from ${mergePath}: ${merged.join(", ")}`] : []),
      ...(stillMissing.length
        ? [
            `Not in this release: ${stillMissing.map((a) => a.name).join(", ")}.`,
            "  Build them here, or run this on the machine that built them and pass its latest.json with --merge.",
          ]
        : []),
      `Wrote ${rel(out)}/.`,
      "",
      "Publish as a normal release (not a pre-release), so it counts as latest:",
      `  gh release create ${tag} --target <commit> --title "Estate ${version}" --notes-file <notes.md> \\`,
      ...files.map((f) => `    ${f} \\`),
      "    LICENSE NOTICE MODIFICATIONS.md",
      ...(merged.length
        ? ["Also attach the merged machine's installers and update artifacts."]
        : []),
      "",
    ].join("\n"),
  );
}

function main(argv) {
  const [command, ...args] = argv;
  if (command === "bump") return bump(args[0]);
  if (command === "updater") return updater(args);
  fail("usage: release.mjs bump <version> | updater --tag <tag> [--notes <text>]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
