import { type ReactNode, useMemo } from "react";
import { useMentionChips } from "@/modules/mentions/useMentionChips";
import { FileChip } from "./FileChip";

/** A sent message, with mentions of files in the chat's folder as file chips. */
export function UserMessage({ text, cwd }: { text: string; cwd: string }) {
  const chips = useMentionChips(text, cwd);
  const parts = useMemo(() => {
    if (chips.length === 0) return [text];
    const out: ReactNode[] = [];
    let at = 0;
    for (const m of chips) {
      if (m.start > at) out.push(text.slice(at, m.start));
      out.push(
        <FileChip key={m.start} path={m.path} className="bg-background" />,
      );
      at = m.end;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  }, [text, chips]);
  return (
    <div className="ml-auto w-fit max-w-[85%] select-text whitespace-pre-wrap break-words rounded-xl bg-muted px-3 py-2 text-[13px] leading-5">
      {parts}
    </div>
  );
}
