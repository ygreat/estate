// Estate file; not part of Terax.
import { cn } from "@/lib/utils";
import { type ChatEffort, EFFORT_LABEL } from "./effort";

/** One color per level, cool to warm as the agent thinks harder. */
const TONE: Record<ChatEffort | "default", { dot: string; active: string }> = {
  default: {
    dot: "bg-muted-foreground/45",
    active: "bg-foreground/[0.07] text-foreground ring-foreground/25",
  },
  low: {
    dot: "bg-sky-500",
    active: "bg-sky-500/12 text-sky-700 ring-sky-500/45 dark:text-sky-300",
  },
  medium: {
    dot: "bg-emerald-500",
    active:
      "bg-emerald-500/12 text-emerald-700 ring-emerald-500/45 dark:text-emerald-300",
  },
  high: {
    dot: "bg-amber-500",
    active:
      "bg-amber-500/12 text-amber-700 ring-amber-500/45 dark:text-amber-300",
  },
  xhigh: {
    dot: "bg-orange-500",
    active:
      "bg-orange-500/12 text-orange-700 ring-orange-500/45 dark:text-orange-300",
  },
  max: {
    dot: "bg-rose-500",
    active: "bg-rose-500/12 text-rose-700 ring-rose-500/45 dark:text-rose-300",
  },
};

/** The level's color as text, for the picker's button label. */
export const EFFORT_TEXT: Record<ChatEffort, string> = {
  low: "text-sky-600 dark:text-sky-400",
  medium: "text-emerald-600 dark:text-emerald-400",
  high: "text-amber-600 dark:text-amber-400",
  xhigh: "text-orange-600 dark:text-orange-400",
  max: "text-rose-600 dark:text-rose-400",
};

/** Estate: Default plus the levels this model takes, as a grid of chips. */
export function EffortSelector({
  efforts,
  value,
  onChange,
  className,
}: {
  efforts: readonly ChatEffort[];
  value: ChatEffort | undefined;
  onChange: (effort: ChatEffort | undefined) => void;
  className?: string;
}) {
  return (
    <div className={cn("px-1.5 pt-2 pb-1.5", className)}>
      <div className="px-0.5 pb-2.5 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
        Effort
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[undefined, ...efforts].map((e) => {
          const tone = TONE[e ?? "default"];
          const active = value === e;
          return (
            <button
              key={e ?? "default"}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(e)}
              className={cn(
                "flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11.5px] ring-1 ring-inset transition-colors",
                active
                  ? cn("font-medium", tone.active)
                  : "text-muted-foreground ring-border/60 hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <span
                className={cn("size-1.5 shrink-0 rounded-full", tone.dot)}
                aria-hidden
              />
              <span className="truncate">
                {e ? EFFORT_LABEL[e] : "Default"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
