import { AiBrowserIcon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { openExternalUrl } from "@/lib/external-link";
import {
  canOpenInPreview,
  openInPreview,
} from "@/modules/preview/lib/previewOpener";
import { linkLabel, isWebUrl } from "./lib/chatLink";
import { MarkdownLink, type MarkdownLinkProps } from "./MarkdownLink";

/**
 * A link in a chat reply. A click opens it in the default browser with no
 * confirmation; hovering a web link offers the browser or a Preview tab.
 */
export function ChatLink(props: MarkdownLinkProps) {
  const { href, onSettled } = props;
  const [open, setOpen] = useState(false);
  if (!href || !isWebUrl(href)) return <MarkdownLink {...props} />;

  const preview = canOpenInPreview(href);
  const act = (run: () => void) => {
    setOpen(false);
    run();
  };

  return (
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={300}
      closeDelay={120}
    >
      <HoverCardTrigger asChild>
        <MarkdownLink {...props} />
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        sideOffset={6}
        className="flex w-auto max-w-80 flex-col gap-0.5 rounded-lg p-1 text-[12px]"
      >
        <span
          className="truncate px-2 pt-1 pb-0.5 font-mono text-[10.5px] text-muted-foreground"
          title={href}
        >
          {linkLabel(href)}
        </span>
        <div className="flex items-center gap-0.5">
          <LinkAction
            icon={LinkSquare02Icon}
            label="Open in browser"
            onClick={() => act(() => void openExternalUrl(href, onSettled))}
          />
          {preview && (
            <LinkAction
              icon={AiBrowserIcon}
              label="Preview in Estate"
              onClick={() =>
                act(() => {
                  openInPreview(href);
                  onSettled?.();
                })
              }
            />
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function LinkAction({
  icon,
  label,
  onClick,
}: {
  icon: typeof LinkSquare02Icon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 font-medium text-foreground/85 transition-colors hover:bg-accent hover:text-foreground"
    >
      <HugeiconsIcon icon={icon} size={13} strokeWidth={1.75} />
      {label}
    </button>
  );
}
