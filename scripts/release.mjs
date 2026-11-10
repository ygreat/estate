#!/usr/bin/env node
// Estate file; not part of Terax.
/**
 * Release helpers for the macOS (Intel) build.
 *
 *   node scripts/release.mjs bump 0.1.1
 *     Sets the version in package.json, src-tauri/tauri.conf.json,
 *     src-tauri/Cargo.toml (package and workspace) and src-tauri/Cargo.lock.
 *
 *   node scripts/release.mjs updater --tag estate-0.1.1 [--notes "..."]
 *     After `pnpm tauri build --target x86_64-apple-darwin` with the signing
 *     key set: checks the update archive was signed with the key the app
 *     trusts and for this version, then writes latest.json and a versioned
 *     copy of the archive to bundle/updater/, ready to upload.
 *
 * The functions below are pure and tested in src/app/release-script.test.ts;
 * only `main` touches the file system.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

export function archiveName(version) {
  return `Estate_${version}_x64.app.tar.gz`;
}

/** The manifest Estate's updater reads (platform darwin-x86_64). */
export function latestJson({ version, notes, pubDate, repo, tag, signature }) {
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      "darwin-x86_64": {
        signature: signature.trim(),
        url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${archiveName(version)}`,
      },
    },
  };
}

// ---- CLI ---------------------------------------------------------------------

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  pkg: join(ROOT, "package.json"),
  conf: join(ROOT, "src-tauri/tauri.conf.json"),
  toml: join(ROOT, "src-tauri/Cargo.toml"),
  lock: join(ROOT, "src-tauri/Cargo.lock"),
  bundle: join(ROOT, "src-tauri/target/x86_64-apple-darwin/release/bundle"),
};
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

  const archive = join(P.bundle, "macos/Estate.app.tar.gz");
  let sigText;
  try {
    sigText = readFileSync(`${archive}.sig`, "utf8");
  } catch {
    fail(
      `no ${archive}.sig. Build with the signing key set: pnpm tauri build --target x86_64-apple-darwin`,
    );
  }
  const sig = readSignature(sigText);
  const trusted = publicKeyId(updaterConf.pubkey);
  if (sig.keyId !== trusted)
    fail(
      `the archive is signed with key ${sig.keyId}, but the app trusts ${trusted}. Rebuild with the right TAURI_SIGNING_PRIVATE_KEY.`,
    );
  if (sig.version && sig.version !== version)
    fail(
      `the archive is version ${sig.version}, but tauri.conf.json says ${version}. Rebuild after bumping.`,
    );

  const out = join(P.bundle, "updater");
  mkdirSync(out, { recursive: true });
  copyFileSync(archive, join(out, archiveName(version)));
  const manifest = latestJson({
    version,
    notes: arg(args, "--notes") ?? `Estate ${version}`,
    pubDate: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    repo: repoFromEndpoint(updaterConf.endpoints[0]),
    tag,
    signature: sigText,
  });
  writeFileSync(join(out, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const rel = (p) => p.slice(ROOT.length + 1);
  process.stdout.write(
    [
      `Signed with ${sig.keyId} (trusted by the app). Wrote:`,
      `  ${rel(join(out, archiveName(version)))}`,
      `  ${rel(join(out, "latest.json"))}`,
      "",
      "Publish as a normal release (not a pre-release), so it counts as latest:",
      `  gh release create ${tag} --target <commit> --title "Estate ${version}" --notes-file <notes.md> \\`,
      `    ${rel(join(P.bundle, `dmg/Estate_${version}_x64.dmg`))} \\`,
      `    ${rel(join(out, archiveName(version)))} ${rel(join(out, "latest.json"))} \\`,
      "    LICENSE NOTICE MODIFICATIONS.md",
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
