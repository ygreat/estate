import {
  ArrowDown01Icon,
  Folder01Icon,
  FolderAddIcon,
  Home03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { shortPath } from "@/modules/spaces/lib/projects";
import type { SpaceMeta } from "@/modules/spaces/lib/store";

type Props = {
  /** Recent projects, most recent first. */
  projects: SpaceMeta[];
  activeSpaceId: string | null;
  activeName: string;
  home: string | null;
  onSwitch: (spaceId: string) => void;
  onOpenFolder: () => void;
  onShowWelcome?: () => void;
};

/** Estate: the current project, and a quick way to switch or open another. */
export function ProjectButton({
  projects,
  activeSpaceId,
  activeName,
  home,
  onSwitch,
  onOpenFolder,
  onShowWelcome,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Switch project"
          className="flex h-6 max-w-44 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[11.5px] font-medium text-foreground/90 hover:bg-foreground/[0.06]"
        >
          <HugeiconsIcon icon={Folder01Icon} size={13} strokeWidth={1.75} />
          <span className="truncate">{activeName}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={11}
            strokeWidth={2}
            className="shrink-0 text-muted-foreground"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
        {projects.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10.5px] font-medium text-muted-foreground">
              Recent projects
            </DropdownMenuLabel>
            {projects.slice(0, 8).map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => onSwitch(p.id)}
                className={cn(
                  "flex flex-col items-start gap-0 py-1.5",
                  p.id === activeSpaceId && "bg-accent/60",
                )}
              >
                <span className="text-[12px]">{p.name}</span>
                {p.root && (
                  <span className="max-w-full truncate font-mono text-[10.5px] text-muted-foreground">
                    {shortPath(p.root, home)}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={onOpenFolder} className="gap-2 text-[12px]">
          <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={1.75} />
          Open folder…
        </DropdownMenuItem>
        {onShowWelcome && (
          <DropdownMenuItem
            onSelect={onShowWelcome}
            className="gap-2 text-[12px]"
          >
            <HugeiconsIcon icon={Home03Icon} size={14} strokeWidth={1.75} />
            Welcome screen
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
