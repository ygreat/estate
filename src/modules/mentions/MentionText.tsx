import { type ReactNode, useMemo } from "react";
import { FileChip } from "@/modules/agent-chat/FileChip";
import { useMentionChips } from "./useMentionChips";

/**
 * Sent message text with `@` mentions of files inside `base` drawn as file
 * chips; everything else stays plain text. Without a base, or before the
 * mentioned files are confirmed, it renders the text as is.
 */
export function MentionText({
  text,
  base,
  chipClassName,
}: {
  text: string;
  base: string | null;
  chipClassName?: string;
}) {
  const chips = useMentionChips(text, base);
  const parts = useMemo(() => {
    if (chips.length === 0) return [text];
    const out: ReactNode[] = [];
    let at = 0;
    for (const m of chips) {
      if (m.start > at) out.push(text.slice(at, m.start));
      out.push(
        <FileChip key={m.start} path={m.path} className={chipClassName} />,
      );
      at = m.end;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  }, [text, chips, chipClassName]);
  return <>{parts}</>;
}
