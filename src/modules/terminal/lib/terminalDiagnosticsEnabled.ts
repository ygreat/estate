// Modified by ygreat for Estate, 2026. Originally part of Terax.
export function terminalDiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage.getItem("estate:terminal-diagnostics") === "1";
  } catch {
    return false;
  }
}
