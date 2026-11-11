import { ArrowUp02Icon, SquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FilePickerContent } from "@/modules/ai/components/FilePicker";
import {
  MENTION_TEXTAREA_ACTIVE,
  MentionHighlights,
} from "@/modules/mentions/MentionHighlights";
import { useMentionComposer } from "@/modules/mentions/useMentionComposer";

/** The textarea's box, shared with the mention chip layer behind it. */
const TEXTAREA_BOX = "border px-3 py-2 text-[13px] leading-5";

/** Commands Estate handles itself, for every agent. */
const LOCAL_COMMANDS: { name: string; hint: string }[] = [
  { name: "clear", hint: "Start a new session" },
  { name: "model", hint: "Choose the model" },
];

/** What a submitted message means. Pure, so it can be tested. */
export type ComposerAction =
  | { kind: "send"; text: string }
  | { kind: "clear" }
  | { kind: "model"; model?: string };

export function parseComposerInput(input: string): ComposerAction | null {
  const text = input.trim();
  if (!text) return null;
  const m = /^\/(clear|model)(?:\s+(\S+))?\s*$/.exec(text);
  if (m?.[1] === "clear") return { kind: "clear" };
  if (m?.[1] === "model") return { kind: "model", model: m[2] };
  return { kind: "send", text };
}

/** Command suggestions for a draft that is a bare "/name" being typed. */
export function commandSuggestions(
  draft: string,
  agentCommands: readonly string[],
): { name: string; hint?: string }[] {
  const m = /^\/([\w:.-]*)$/.exec(draft);
  if (!m) return [];
  const q = m[1].toLowerCase();
  const local = LOCAL_COMMANDS.filter((c) => c.name.startsWith(q));
  const seen = new Set(local.map((c) => c.name));
  const remote = agentCommands
    .filter((c) => !seen.has(c) && c.toLowerCase().includes(q))
    .sort((a, b) => {
      const ap = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp || a.localeCompare(b);
    })
    .map((name) => ({ name }));
  return [...local, ...remote].slice(0, 8);
}

type Props = {
  placeholder: string;
  /** The chat's folder: `@` mentions are relative to it. */
  cwd: string;
  /** The chat is on screen, so the Files sidebar can mention into it. */
  visible: boolean;
  disabled: boolean;
  running: boolean;
  agentCommands: readonly string[];
  onAction: (action: ComposerAction) => void;
  onStop: () => void;
};

export const ChatComposer = forwardRef<HTMLTextAreaElement, Props>(
  function ChatComposer(
    {
      placeholder,
      cwd,
      visible,
      disabled,
      running,
      agentCommands,
      onAction,
      onStop,
    },
    ref,
  ) {
    const [draft, setDraft] = useState("");
    const areaRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => areaRef.current as HTMLTextAreaElement);
    const resize = useCallback((el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, []);
    const setDraftAndFit = useCallback(
      (value: string) => {
        setDraft(value);
        requestAnimationFrame(() => resize(areaRef.current));
      },
      [resize],
    );
    const mention = useMentionComposer({
      value: draft,
      setValue: setDraftAndFit,
      textareaRef: areaRef,
      base: cwd || null,
      visible: visible && !disabled,
    });
    const [selected, setSelected] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const suggestions = useMemo(
      () => (dismissed ? [] : commandSuggestions(draft, agentCommands)),
      [draft, agentCommands, dismissed],
    );
    const menuOpen = suggestions.length > 0 && !mention.picker.open;
    const index = Math.min(selected, Math.max(0, suggestions.length - 1));

    const complete = (name: string) => {
      setDraft(`/${name} `);
      setSelected(0);
    };

    const submit = () => {
      if (disabled || running) return;
      const action = parseComposerInput(draft);
      if (!action) return;
      setDraftAndFit("");
      setDismissed(false);
      onAction(action);
    };

    return (
      <div className="relative mx-auto flex max-w-3xl items-end gap-2">
        {menuOpen && (
          <div
            role="listbox"
            aria-label="Commands"
            className="absolute right-12 bottom-full left-0 z-20 mb-1.5 overflow-hidden rounded-lg border border-border/70 bg-popover p-1 shadow-lg"
          >
            {suggestions.map((s, i) => (
              <button
                key={s.name}
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseDown={(e) => {
                  e.preventDefault();
                  complete(s.name);
                }}
                onMouseEnter={() => setSelected(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px]",
                  i === index && "bg-accent",
                )}
              >
                <span className="font-mono">/{s.name}</span>
                {s.hint && (
                  <span className="text-[11px] text-muted-foreground">
                    {s.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <Popover open={mention.picker.open}>
          <PopoverAnchor asChild>
            <div className="relative min-w-0 flex-1 rounded-lg bg-card">
              <MentionHighlights
                value={draft}
                chips={mention.chips}
                textareaRef={areaRef}
                className={TEXTAREA_BOX}
              />
              <textarea
                ref={areaRef}
                value={draft}
                rows={1}
                disabled={disabled}
                placeholder={placeholder}
                aria-autocomplete="list"
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDismissed(false);
                  setSelected(0);
                  resize(e.target);
                }}
                onSelect={mention.updateTrigger}
                onFocus={mention.onFocus}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (mention.onKeyDown(e)) return;
                  if (menuOpen) {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const step = e.key === "ArrowDown" ? 1 : -1;
                      setSelected(
                        (index + step + suggestions.length) %
                          suggestions.length,
                      );
                      return;
                    }
                    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                      const pick = suggestions[index];
                      // Enter on an exact match runs it; otherwise it completes.
                      if (
                        e.key === "Enter" &&
                        draft.trim() === `/${pick.name}`
                      ) {
                        e.preventDefault();
                        submit();
                        return;
                      }
                      e.preventDefault();
                      complete(pick.name);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setDismissed(true);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                className={cn(
                  TEXTAREA_BOX,
                  "relative block max-h-[200px] min-h-9 w-full resize-none rounded-lg border-border/70 bg-transparent outline-none placeholder:text-muted-foreground focus-visible:border-ring",
                  mention.chips.length > 0 && MENTION_TEXTAREA_ACTIVE,
                )}
              />
            </div>
          </PopoverAnchor>
          {mention.picker.open && (
            <FilePickerContent
              files={mention.picker.files}
              activeIndex={mention.picker.activeIndex}
              indexing={mention.picker.indexing}
              truncated={mention.picker.truncated}
              hasWorkspace={mention.picker.hasWorkspace}
              onPick={mention.picker.pick}
              onHover={mention.picker.setActiveIndex}
            />
          )}
        </Popover>
        {running ? (
          <Button
            size="icon"
            variant="outline"
            className="size-9 shrink-0"
            onClick={onStop}
            aria-label="Stop"
            title="Stop"
          >
            <HugeiconsIcon icon={SquareIcon} size={14} strokeWidth={2} />
          </Button>
        ) : (
          <Button
            size="icon"
            className="size-9 shrink-0"
            onClick={submit}
            disabled={!draft.trim() || disabled}
            aria-label="Send"
            title="Send (Enter). Type / for commands, @ for files."
          >
            <HugeiconsIcon icon={ArrowUp02Icon} size={15} strokeWidth={2} />
          </Button>
        )}
      </div>
    );
  },
);
