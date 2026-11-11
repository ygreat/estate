import { type RefObject, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Mention } from "./lib/mentions";

/**
 * Draws file mention chips behind a textarea. The textarea keeps the text,
 * caret, selection and IME; while chips exist its text is transparent and this
 * layer, laid out with the same box classes, shows the text with the chips.
 * Renders nothing (and costs nothing) without chips.
 */
export function MentionHighlights({
  value,
  chips,
  textareaRef,
  className,
}: {
  value: string;
  chips: readonly Mention[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** The textarea's box classes: padding, border width, font and line height. */
  className: string;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const active = chips.length > 0;

  useLayoutEffect(() => {
    const area = textareaRef.current;
    const layer = layerRef.current;
    if (!active || !area || !layer) return;
    const sync = () => {
      layer.scrollTop = area.scrollTop;
    };
    sync();
    area.addEventListener("scroll", sync, { passive: true });
    return () => area.removeEventListener("scroll", sync);
  });

  if (!active) return null;

  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const chip of chips) {
    if (chip.start > at) parts.push(value.slice(at, chip.start));
    parts.push(
      <span
        key={chip.start}
        className="rounded-[4px] bg-primary/15 text-primary ring-2 ring-primary/15 [box-decoration-break:clone]"
      >
        {value.slice(chip.start, chip.end)}
      </span>,
    );
    at = chip.end;
  }
  parts.push(value.slice(at));
  // A trailing newline needs a character after it to take up its line.
  if (value.endsWith("\n")) parts.push("​");

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden border-transparent whitespace-pre-wrap break-words text-foreground",
        className,
      )}
    >
      {parts}
    </div>
  );
}

/** Classes the textarea takes while chips are drawn behind it. */
export const MENTION_TEXTAREA_ACTIVE =
  "text-transparent caret-foreground selection:bg-primary/25 selection:text-transparent [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
