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
export function archiveName(version: string): string;
export function latestJson(input: {
  version: string;
  notes: string;
  pubDate: string;
  repo: string;
  tag: string;
  signature: string;
}): {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
};
