// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { usePresence } from "@/lib/usePresence";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MENTION_TEXTAREA_ACTIVE,
  MentionHighlights,
} from "@/modules/mentions/MentionHighlights";
import { useMentionComposer } from "@/modules/mentions/useMentionComposer";
import { useComposer } from "../lib/composer";
import { SLASH_COMMANDS } from "../lib/slashCommands";
import { useChatStore } from "../store/chatStore";
import { useSnippetsStore } from "../store/snippetsStore";
import { useAgentsStore } from "../store/agentsStore";
import { ORCHESTRATOR_AGENT_ID } from "../lib/agents";
import { AgentSwitcher } from "./AgentSwitcher";
import { AccountTuningPicker } from "./AccountTuningPicker";
import { ModelDropdown } from "./AiStatusBarControls";
import { PlannerPicker } from "@/modules/orchestrator/PlannerPicker";
import { FilePickerContent } from "./FilePicker";
import { SnippetPickerContent, type PickerItem } from "./SnippetPicker";

type SnippetTrigger = {
  start: number;
  end: number;
  query: string;
  char: "#" | "/";
};

function detectSnippetTrigger(
  value: string,
  caret: number,
): SnippetTrigger | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "#" || ch === "/") {
      const prev = i === 0 ? " " : value[i - 1];
      if (!/\s/.test(prev)) return null;
      const slice = value.slice(i + 1, caret);
      if (!/^[a-z0-9-]*$/i.test(slice)) return null;
      return { start: i, end: caret, query: slice.toLowerCase(), char: ch };
    }
    if (/\s/.test(ch)) return null;
    if (!/[a-z0-9-]/i.test(ch)) return null;
  }
  return null;
}

/** The textarea's box, shared with the mention chip layer behind it. */
const TEXTAREA_BOX = "text-[13px] leading-relaxed";

export function AiComposerInput({ active }: { active: boolean }) {
  const c = useComposer();
  const orchestrating = useAgentsStore(
    (s) => s.activeId === ORCHESTRATOR_AGENT_ID,
  );
  const snippets = useSnippetsStore((s) => s.snippets);
  const workspaceRoot = useChatStore((s) => s.live.getWorkspaceRoot());

  const [trigger, setTrigger] = useState<SnippetTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const mention = useMentionComposer({
    value: c.value,
    setValue: c.setValue,
    textareaRef: c.textareaRef,
    base: workspaceRoot,
    visible: active,
  });

  useEffect(() => {
    autoresize(c.textareaRef.current);
  }, [c.value, c.textareaRef]);

  const updateTrigger = () => {
    const el = c.textareaRef.current;
    if (!el) {
      setTrigger(null);
      return;
    }
    setTrigger(detectSnippetTrigger(c.value, el.selectionStart ?? 0));
    mention.updateTrigger();
  };

  // The mention hook follows the value itself; this tracks `#` and `/`.
  useEffect(() => {
    const el = c.textareaRef.current;
    setTrigger(
      el ? detectSnippetTrigger(c.value, el.selectionStart ?? 0) : null,
    );
  }, [c.value, c.textareaRef]);

  const filteredItems = useMemo<PickerItem[]>(() => {
    if (!trigger) return [];
    const q = trigger.query;
    const cmdItems: PickerItem[] = Object.values(SLASH_COMMANDS)
      .filter(
        (c) => !q || c.name.includes(q) || c.label.toLowerCase().includes(q),
      )
      .map((command) => ({ kind: "command", command }));
    if (trigger.char === "/") return cmdItems;
    const snipItems: PickerItem[] = snippets
      .filter(
        (s) =>
          !q ||
          s.handle.includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
      .map((snippet) => ({ kind: "snippet", snippet }));
    return [...cmdItems, ...snipItems];
  }, [trigger, snippets]);

  const snippetTriggerOpen = trigger !== null;
  useEffect(() => {
    setActiveIndex(0);
  }, [snippetTriggerOpen]);

  const pickerOpen = trigger !== null || mention.picker.open;

  const onPickItem = (item: PickerItem) => {
    if (!trigger) return;
    const before = c.value.slice(0, trigger.start);
    const afterRaw = c.value.slice(trigger.end);
    let insert = "";
    if (item.kind === "snippet") {
      const needsSpace = afterRaw.length === 0 || !/^\s/.test(afterRaw);
      insert = `#${item.snippet.handle}${needsSpace ? " " : ""}`;
      c.addSnippet(item.snippet);
    } else {
      c.addCommand(item.command);
    }
    const after =
      item.kind === "command" ? afterRaw.replace(/^\s+/, "") : afterRaw;
    c.setValue(`${before}${insert}${after}`);
    setTrigger(null);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = c.textareaRef.current;
      if (!el) return;
      const caret = before.length + insert.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const pickActive = () => {
    const it = filteredItems[activeIndex];
    if (it) onPickItem(it);
  };

  const voiceLabel = c.voice.recording
    ? "Listening…"
    : c.voice.transcribing
      ? "Transcribing…"
      : null;
  const voiceRow = usePresence(Boolean(voiceLabel), 180);
  const lastVoiceLabel = useRef("");
  if (voiceLabel) lastVoiceLabel.current = voiceLabel;

  return (
    <>
      <Popover open={pickerOpen}>
        <PopoverAnchor asChild>
          <div
            className="flex items-start gap-2"
            data-path-drop
            data-path-drop-base={workspaceRoot ?? undefined}
          >
            {/* Estate: the Orchestrator plans with a coding agent, not the
                panel's model, so its agent takes the model picker's place. */}
            {orchestrating ? (
              <PlannerPicker cwd={workspaceRoot ?? ""} />
            ) : (
              <>
                <ModelDropdown />
                <AccountTuningPicker />
              </>
            )}
            <div className="relative min-w-0 flex-1">
              <MentionHighlights
                value={c.value}
                chips={mention.chips}
                textareaRef={c.textareaRef}
                className={TEXTAREA_BOX}
              />
              <textarea
                ref={c.textareaRef}
                value={c.value}
                onChange={(e) => c.setValue(e.target.value)}
                onKeyUp={updateTrigger}
                onClick={updateTrigger}
                onSelect={updateTrigger}
                onFocus={mention.onFocus}
                onKeyDown={(e) => {
                  if (mention.onKeyDown(e)) return;
                  if (trigger !== null) {
                    const items = filteredItems;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveIndex((i) =>
                        Math.min(i + 1, Math.max(0, items.length - 1)),
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.max(0, i - 1));
                      return;
                    }
                    if (e.key === "Tab" || e.key === "Enter") {
                      if (items.length > 0) {
                        e.preventDefault();
                        pickActive();
                        return;
                      }
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setTrigger(null);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    c.submit();
                  }
                }}
                placeholder={
                  orchestrating
                    ? "Describe a goal for the Orchestrator to plan and delegate"
                    : "Ask Estate anything   -   # for snippets and commands, @ for files"
                }
                rows={1}
                className={cn(
                  TEXTAREA_BOX,
                  "relative block max-h-40 w-full resize-none bg-transparent outline-none",
                  "placeholder:text-muted-foreground/60",
                  mention.chips.length > 0 && MENTION_TEXTAREA_ACTIVE,
                )}
              />
            </div>
            <AgentSwitcher />
          </div>
        </PopoverAnchor>
        {mention.picker.open ? (
          <FilePickerContent
            files={mention.picker.files}
            activeIndex={mention.picker.activeIndex}
            indexing={mention.picker.indexing}
            truncated={mention.picker.truncated}
            hasWorkspace={mention.picker.hasWorkspace}
            onPick={mention.picker.pick}
            onHover={mention.picker.setActiveIndex}
          />
        ) : (
          <SnippetPickerContent
            items={filteredItems}
            activeIndex={activeIndex}
            onPick={onPickItem}
            onHover={setActiveIndex}
          />
        )}
      </Popover>

      {voiceRow.mounted && (
        <div data-state={voiceRow.state} className="estate-reveal">
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            {c.voice.recording ? (
              <span className="size-1.5 estate-blink rounded-full bg-destructive" />
            ) : (
              <Spinner className="size-3" />
            )}
            <span className="truncate">
              {voiceLabel || lastVoiceLabel.current}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function autoresize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}
