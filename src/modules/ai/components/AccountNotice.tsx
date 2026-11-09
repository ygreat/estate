import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  getModel,
  getProvider,
  isKnownModelId,
  type ProviderId,
} from "../config";
import { useChatStore } from "../store/chatStore";

/** Estate: what changes when the panel runs on a Claude or ChatGPT account. */
export const ACCOUNT_TRADEOFFS: readonly string[] = [
  "Read only: it can look at your project but can't edit files or run commands. Use agent chat or the Orchestrator for changes.",
  "Estate's own tools (terminal, approvals, file edits) aren't used; the agent reads files with its own tools.",
  "Slower start: each reply starts the app fresh, so the first words take a few seconds.",
  "Counts toward your plan's usage limits; no cost is shown.",
];

const VIA: Partial<Record<ProviderId, string>> = {
  "claude-account": "Claude account, through Claude Code",
  "chatgpt-account": "ChatGPT account, through Codex",
};

/** The short version, for tight spaces. */
export const ACCOUNT_SUMMARY =
  "Read only · no Estate tools · slower start · uses your plan's limits";

/** The trade-offs as a list (Settings, the picker). */
export function AccountTradeoffs({ className }: { className?: string }) {
  return (
    <ul
      className={cn(
        "flex list-disc flex-col gap-0.5 pl-4 text-[10.5px] leading-4 text-muted-foreground",
        className,
      )}
    >
      {ACCOUNT_TRADEOFFS.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

const DISMISS_KEY = "estate:account-notice-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * A strip above the chat while an account model is selected. Collapses to one
 * line; expanding shows the full trade-offs.
 */
export function AccountModelStrip() {
  const selected = useChatStore((s) => s.selectedModelId);
  const [open, setOpen] = useState(readOpen);
  if (!isKnownModelId(selected)) return null;
  const provider = getModel(selected).provider;
  if (!getProvider(provider).account) return null;
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(DISMISS_KEY, v ? "0" : "1");
      } catch {
        // Private storage off: the choice isn't remembered.
      }
      return !v;
    });
  };
  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-border/40 bg-muted/40 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={InformationCircleIcon}
          size={12}
          strokeWidth={1.75}
          className="shrink-0 text-muted-foreground"
        />
        <span className="truncate text-[11px] text-foreground">
          {VIA[provider]}
        </span>
        {!open && (
          <span className="truncate text-[10.5px] text-muted-foreground">
            · {ACCOUNT_SUMMARY}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {open ? "Hide" : "Details"}
        </button>
      </div>
      {open && <AccountTradeoffs className="pb-0.5" />}
    </div>
  );
}
