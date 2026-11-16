export function isVersion(v: unknown): boolean;
export function compareVersions(a: string, b: string): number;
export function setJsonVersion(text: string, version: string): string;
export function setCargoTomlVersion(text: string, version: string): string;
export function setCargoLockVersion(
  text: string,
  names: string[],
  version: string,
): string;
export function publicKeyId(pubkeyB64: string): string;
export function readSignature(sigText: string): {
  keyId: string;
  version: string | null;
};
export function repoFromEndpoint(endpoint: string): string;
export function archiveName(version: string, arch: "x64" | "aarch64"): string;
export interface UpdaterArtifact {
  name: string;
  targets: (string | null)[];
  bundled: string;
  upload: string;
  platforms: string[];
  installer: string | null;
}
export function updaterArtifacts(version: string): UpdaterArtifact[];
export function plistVersion(text: string): string | null;
export function releaseUrl(repo: string, tag: string, file: string): string;
export interface UpdaterManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}
export function latestJson(input: {
  version: string;
  notes: string;
  pubDate: string;
  repo: string;
  tag: string;
  entries: { platforms: string[]; upload: string; signature: string }[];
}): UpdaterManifest;
export function mergeManifests(
  local: UpdaterManifest,
  other: unknown,
  release: { repo: string; tag: string },
): UpdaterManifest;
