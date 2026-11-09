// Modified by ygreat for Estate, 2026. Originally part of Terax.
/**
 * Experiment toggles for the app lab. They are plain `localStorage` entries named
 * `estate:bench:<name>` that scripts/app-lab/run.py sets through the scenario, and they only
 * exist in builds made with ESTATE_BENCH=1: callers guard with `__ESTATE_BENCH__`, which is a
 * literal `false` in a normal build, so neither the lookup nor the branch it guards is shipped.
 */
export const BENCH_FLAG_PREFIX = "estate:bench:";

export function benchFlag(name: string): string | null {
  if (!__ESTATE_BENCH__) return null;
  try {
    return window.localStorage.getItem(BENCH_FLAG_PREFIX + name);
  } catch {
    return null;
  }
}

export function benchFlagOn(name: string): boolean {
  const value = benchFlag(name);
  return value !== null && value !== "" && value !== "0" && value !== "off";
}
