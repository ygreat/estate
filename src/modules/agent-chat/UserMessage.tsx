import { MentionText } from "@/modules/mentions/MentionText";

/** A sent message, with mentions of files in the chat's folder as file chips. */
export function UserMessage({ text, cwd }: { text: string; cwd: string }) {
  return (
    <div className="ml-auto w-fit max-w-[85%] select-text whitespace-pre-wrap break-words rounded-xl bg-muted px-3 py-2 text-[13px] leading-5">
      <MentionText text={text} base={cwd} chipClassName="bg-background" />
    </div>
  );
}
