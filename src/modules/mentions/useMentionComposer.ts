import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useWorkspaceFiles } from "@/modules/ai/hooks/useWorkspaceFiles";
import { checkReadable } from "@/modules/ai/lib/security";
import { filterMentionFiles } from "./lib/mentionFiles";
import {
  backspaceMention,
  formatMention,
  type MentionTrigger,
  mentionTrigger,
  pathInside,
  spliceMention,
} from "./lib/mentions";
import { registerMentionTarget } from "./lib/mentionTargets";
import { rememberMention, useMentionChips } from "./useMentionChips";

const PICKER_CAP = 30;

type Options = {
  value: string;
  setValue: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** The chat's folder: mentions are relative to it and must stay inside it. */
  base: string | null;
  /** The composer is on screen (for "Mention in Chat" from the sidebar). */
  visible: boolean;
};

/**
 * `@` file mentions for a chat composer: the picker, chips, Backspace over a
 * chip, and mentions sent from the Files sidebar.
 */
export function useMentionComposer({
  value,
  setValue,
  textareaRef,
  base,
  visible,
}: Options) {
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const chips = useMentionChips(value, base);
  const open = trigger !== null && trigger.start !== dismissedAt;
  const workspace = useWorkspaceFiles(base, open);

  const [query, setQuery] = useState("");
  useEffect(() => {
    const q = trigger?.query ?? "";
    const t = window.setTimeout(() => setQuery(q), 50);
    return () => window.clearTimeout(t);
  }, [trigger]);

  const files = useMemo(
    () => (open ? filterMentionFiles(workspace.files, query, PICKER_CAP) : []),
    [open, workspace.files, query],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts at the top
  useEffect(() => setActiveIndex(0), [open, query]);

  const updateTrigger = useCallback(() => {
    const el = textareaRef.current;
    const next = el ? mentionTrigger(value, el.selectionStart ?? 0) : null;
    setTrigger(next);
    if (!next) setDismissedAt(null);
  }, [textareaRef, value]);
  useEffect(updateTrigger, [updateTrigger]);

  const place = useCallback(
    (next: { value: string; caret: number }) => {
      setValue(next.value);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      });
    },
    [setValue, textareaRef],
  );

  const pick = (rel: string) => {
    if (!trigger || !base) return;
    rememberMention(`${base.replace(/\/+$/, "")}/${rel}`);
    setTrigger(null);
    place(spliceMention(value, trigger.start, trigger.end, formatMention(rel)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (e.nativeEvent.isComposing) return false;
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        const n = Math.max(1, files.length);
        setActiveIndex((i) => (i + step + n) % n);
        return true;
      }
      if ((e.key === "Enter" || e.key === "Tab") && files.length > 0) {
        e.preventDefault();
        pick(files[Math.min(activeIndex, files.length - 1)]);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissedAt(trigger?.start ?? null);
        return true;
      }
    }
    if (e.key === "Backspace" && !e.altKey && !e.metaKey && !e.ctrlKey) {
      const el = e.currentTarget;
      if (el.selectionStart !== el.selectionEnd) return false;
      const next = backspaceMention(value, el.selectionStart ?? 0, chips);
      if (next) {
        e.preventDefault();
        place(next);
        return true;
      }
    }
    return false;
  };

  // "Mention in Chat" from the Files sidebar.
  const latest = useRef({ value, base, visible, place });
  latest.current = { value, base, visible, place };
  const registration = useRef<ReturnType<typeof registerMentionTarget> | null>(
    null,
  );
  useEffect(() => {
    const reg = registerMentionTarget({
      visible: () => latest.current.visible && !!latest.current.base,
      insert: (paths) => {
        const { value: current, base: root, place: put } = latest.current;
        if (!root) return 0;
        const accepted: string[] = [];
        const refused: string[] = [];
        for (const abs of paths) {
          const rel = pathInside(abs, root);
          if (rel === null || !checkReadable(abs).ok) {
            refused.push(abs.slice(abs.lastIndexOf("/") + 1) || abs);
            continue;
          }
          rememberMention(abs);
          accepted.push(formatMention(rel));
        }
        if (refused.length > 0) {
          toast.warning("Not mentioned", {
            description: `${refused.join(", ")}: outside this chat's folder or a protected file.`,
          });
        }
        if (accepted.length === 0) return 0;
        const el = textareaRef.current;
        const focused = el !== null && document.activeElement === el;
        const start = focused
          ? (el.selectionStart ?? current.length)
          : current.length;
        const end = focused
          ? (el.selectionEnd ?? current.length)
          : current.length;
        put(spliceMention(current, start, end, accepted.join(" ")));
        return accepted.length;
      },
    });
    registration.current = reg;
    return () => {
      reg.unregister();
      registration.current = null;
    };
  }, [textareaRef]);

  const onFocus = useCallback(() => registration.current?.focused(), []);

  return {
    chips,
    picker: {
      open,
      files,
      activeIndex,
      setActiveIndex,
      indexing: workspace.indexing,
      truncated: workspace.truncated,
      hasWorkspace: base !== null,
      pick,
    },
    onKeyDown,
    updateTrigger,
    onFocus,
  };
}
