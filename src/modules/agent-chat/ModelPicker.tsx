import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ChatAgentId } from "./model";

/** Model choices per agent; "" means the agent's own default. */
export const MODEL_PRESETS: Record<
  ChatAgentId,
  { value: string; label: string }[]
> = {
  claude: [
    { value: "", label: "Default" },
    { value: "opus", label: "Opus" },
    { value: "sonnet", label: "Sonnet" },
    { value: "haiku", label: "Haiku" },
  ],
  codex: [{ value: "", label: "Default" }],
  gemini: [
    { value: "", label: "Default" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  opencode: [{ value: "", label: "Default" }],
};

/** Same rule as the Rust side: a plain model token. */
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/[\]-]{0,99}$/;

type Props = {
  agent: ChatAgentId;
  /** The chat's chosen model ("" or undefined: default). */
  value: string | undefined;
  /** The model the agent last reported, shown next to "Default". */
  reported: string | undefined;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (model: string | undefined) => void;
};

export function ModelPicker({
  agent,
  value,
  reported,
  disabled,
  open,
  onOpenChange,
  onChange,
}: Props) {
  const presets = MODEL_PRESETS[agent];
  const current = value ?? "";
  const known = presets.find((p) => p.value === current);
  const label = known ? known.label : current;
  const [custom, setCustom] = useState("");
  const customValid = MODEL_PATTERN.test(custom.trim());

  const choose = (model: string) => {
    onChange(model || undefined);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-7 max-w-40 gap-1 px-2 text-[11.5px]"
          title={reported ? `Model: ${reported}` : "Model"}
          aria-label="Model"
        >
          <span className="truncate">{label}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1">
        {presets.map((p) => (
          <button
            key={p.value || "default"}
            type="button"
            onClick={() => choose(p.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent",
              p.value === current && "font-medium",
            )}
          >
            <span className="w-3.5">
              {p.value === current && (
                <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
              )}
            </span>
            <span className="flex-1">{p.label}</span>
            {p.value === "" && reported && (
              <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                {reported}
              </span>
            )}
          </button>
        ))}
        {!known && current && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] font-medium">
            <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
            <span className="truncate font-mono">{current}</span>
          </div>
        )}
        <form
          className="mt-1 flex gap-1 border-t border-border/60 px-1 pt-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (customValid) {
              choose(custom.trim());
              setCustom("");
            }
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Other model name"
            spellCheck={false}
            className="h-7 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2 font-mono text-[11.5px] outline-none focus-visible:border-ring"
          />
          <Button
            type="submit"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={!customValid}
          >
            Use
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
