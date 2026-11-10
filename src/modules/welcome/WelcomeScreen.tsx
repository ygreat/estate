import {
  Cancel01Icon,
  Folder01Icon,
  FolderAddIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAgentStatuses } from "@/modules/agent-chat/auth";
import { CHAT_AGENTS, type ChatAgentId } from "@/modules/agent-chat/model";
import type { OrchestratorDelegate } from "@/modules/orchestrator/instructions";
import { useShortcutLabel } from "@/modules/shortcuts";
import { shortPath } from "@/modules/spaces/lib/projects";
import { NewProjectDialog } from "./NewProjectDialog";
import { WelcomeComposer } from "./WelcomeComposer";
import type { SpaceMeta } from "@/modules/spaces/lib/store";

type Props = {
  /** The open project, if it has a folder. */
  current: SpaceMeta | null;
  recent: SpaceMeta[];
  /** Clear Recent: empties the list; the projects are kept. */
  onClearRecent: () => void;
  home: string | null;
  showOnStartup: boolean;
  onShowOnStartupChange: (show: boolean) => void;
  /**
   * Open Project. Resolves true to show the chat box: a folder was opened
   * and it has no session yet (one with a session closes this screen).
   */
  onOpenFolder: () => Promise<boolean>;
  /** Creates `root/name`, opens it as a project; resolves an error or null. */
  onCreateProject: (name: string, root: string) => Promise<string | null>;
  /** A recent project. Resolves true to show the chat box, as above. */
  onSwitchProject: (spaceId: string) => Promise<boolean>;
  /** Opens a chat with `agent`, sending `prompt` first when it isn't empty. */
  onStartChat: (prompt: string, agent: ChatAgentId) => void;
  /** Which agent plans: a fixed one, or "ask" to use the one picked here. */
  planAgent: OrchestratorDelegate;
  onPlan: (goal: string, agent: ChatAgentId) => void;
  onNewTerminal: () => void;
  onOpenCommandPalette: () => void;
  onClose: () => void;
};

const AGENT_KEY = "estate:welcome-agent";

function readAgent(): ChatAgentId | null {
  try {
    const v = localStorage.getItem(AGENT_KEY);
    return CHAT_AGENTS.includes(v as ChatAgentId) ? (v as ChatAgentId) : null;
  } catch {
    return null;
  }
}

function writeAgent(agent: ChatAgentId): void {
  try {
    localStorage.setItem(AGENT_KEY, agent);
  } catch {
    // Private storage off: the choice just isn't remembered.
  }
}

/** Estate: the first thing you see. Pick a project, then start. */
export function WelcomeScreen({
  current,
  recent,
  onClearRecent,
  home,
  showOnStartup,
  onShowOnStartupChange,
  onOpenFolder,
  onCreateProject,
  onSwitchProject,
  onStartChat,
  planAgent,
  onPlan,
  onNewTerminal,
  onOpenCommandPalette,
  onClose,
}: Props) {
  // The open project counts as chosen only once the user confirms it here.
  const [chosen, setChosen] = useState(false);
  const [creating, setCreating] = useState(false);
  const { auth, checking } = useAgentStatuses();
  const [picked, setPicked] = useState<ChatAgentId | null>(readAgent);
  const goalRef = useRef<HTMLTextAreaElement | null>(null);
  const creatingRef = useRef(creating);
  creatingRef.current = creating;
  // A click outside the open agent menu only closes the menu, not the screen.
  const menuOpen = useRef(false);
  const clickClosedMenu = useRef(false);
  const project = chosen ? current : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The New Project dialog handles its own Escape.
      // Menus close on their own Escape (and mark it handled).
      if (e.key === "Escape" && !e.defaultPrevented && !creatingRef.current)
        onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (project) goalRef.current?.focus();
  }, [project]);

  // Without a remembered choice, the first signed-in agent.
  const agent: ChatAgentId =
    picked ??
    CHAT_AGENTS.find((a) => auth[a]?.state === "signed-in") ??
    "claude";
  const pick = (a: ChatAgentId) => {
    setPicked(a);
    writeAgent(a);
  };
  const planner = planAgent === "ask" ? agent : planAgent;

  // The open project first, then the most recent others.
  const recentList = [
    ...(current?.root ? [current] : []),
    ...recent.filter((p) => p.id !== current?.id && p.root),
  ].slice(0, 5);

  return (
    // Clicking anywhere outside the content skips straight to the editor.
    // biome-ignore lint/a11y/noStaticElementInteractions: Esc and the "Go to editor" button do the same from the keyboard.
    // biome-ignore lint/a11y/useKeyWithClickEvents: as above.
    <div
      onPointerDownCapture={() => {
        clickClosedMenu.current = menuOpen.current;
      }}
      onClick={() => {
        if (clickClosedMenu.current) clickClosedMenu.current = false;
        else onClose();
      }}
      className="fade-in-0 fixed inset-0 z-50 flex animate-in flex-col bg-background/60 backdrop-blur-xl duration-200"
    >
      <div
        data-tauri-drag-region
        className="flex h-10 shrink-0 items-center justify-end px-3"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close welcome"
          title="Close (Esc)"
          className="text-muted-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.75} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center px-8 py-12">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: only stops clicks inside from skipping. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: as above. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[460px] flex-col items-center gap-10"
          >
            <div className="flex flex-col items-center gap-5 text-center">
              <img
                src="/logo.png"
                alt=""
                draggable={false}
                className="size-20 rounded-3xl shadow-lg shadow-black/25"
              />
              <h1 className="text-[17px] font-semibold tracking-tight">
                What are we building today?
              </h1>
            </div>

            {!project ? (
              <div className="flex w-full flex-col gap-8">
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    className="h-10 gap-2"
                    onClick={() => setCreating(true)}
                  >
                    <HugeiconsIcon
                      icon={FolderAddIcon}
                      size={15}
                      strokeWidth={1.75}
                    />
                    Create New Project
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 gap-2"
                    onClick={() => {
                      void onOpenFolder().then((opened) => {
                        if (opened) setChosen(true);
                      });
                    }}
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={15}
                      strokeWidth={1.75}
                    />
                    Open Project
                  </Button>
                </div>

                {recentList.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <SectionLabel>Recent</SectionLabel>
                      {/* The open project stays listed, so only others clear. */}
                      {recent.some((p) => p.id !== current?.id) && (
                        <button
                          type="button"
                          onClick={onClearRecent}
                          className="rounded px-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
                          title="Clear the list. Projects aren't deleted, and come back when opened again."
                        >
                          Clear Recent
                        </button>
                      )}
                    </div>
                    {recentList.map((p) => (
                      <Row
                        key={p.id}
                        icon={<HugeiconsIcon icon={Folder01Icon} size={14} />}
                        title={p.name}
                        hint={p.root ? shortPath(p.root, home) : undefined}
                        mono
                        trailing={
                          p.id === current?.id ? (
                            <span className="text-[10.5px] text-muted-foreground">
                              Open now
                            </span>
                          ) : undefined
                        }
                        onClick={() => {
                          void onSwitchProject(p.id).then((fresh) => {
                            if (fresh) setChosen(true);
                          });
                        }}
                      />
                    ))}
                  </div>
                )}

                <NewProjectDialog
                  open={creating}
                  home={home}
                  onOpenChange={setCreating}
                  onCreate={async (name, root) => {
                    const failure = await onCreateProject(name, root);
                    if (!failure) setChosen(true);
                    return failure;
                  }}
                />
              </div>
            ) : (
              <div className="flex w-full flex-col gap-8">
                <Row
                  icon={<HugeiconsIcon icon={Folder01Icon} size={14} />}
                  title={project.name}
                  hint={
                    project.root ? shortPath(project.root, home) : undefined
                  }
                  mono
                  trailing={
                    <span className="text-[11px] text-muted-foreground">
                      Change
                    </span>
                  }
                  onClick={() => setChosen(false)}
                />

                <WelcomeComposer
                  ref={goalRef}
                  agent={agent}
                  onAgentChange={pick}
                  auth={auth}
                  checking={checking}
                  planner={planner}
                  cwd={project.root ?? ""}
                  onStartChat={onStartChat}
                  onPlan={onPlan}
                  onMenuOpenChange={(open) => {
                    menuOpen.current = open;
                  }}
                />

                <div className="grid grid-cols-[auto_auto] items-center justify-center gap-x-12 gap-y-3 text-[12px]">
                  <Hint
                    label="New terminal"
                    shortcut="tab.new"
                    onClick={onNewTerminal}
                  />
                  <Hint
                    label="Command palette"
                    shortcut="commandPalette.open"
                    onClick={onOpenCommandPalette}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: only stops clicks inside from skipping. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: as above. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex shrink-0 flex-col items-center gap-4 pb-6"
      >
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-2">
          Go to editor
          <Kbd>Esc</Kbd>
        </Button>
        <div className="flex items-center gap-2">
          <Checkbox
            id="welcome-on-startup"
            checked={showOnStartup}
            onCheckedChange={(v) => onShowOnStartupChange(v === true)}
          />
          <Label
            htmlFor="welcome-on-startup"
            className="text-[11.5px] font-normal text-muted-foreground"
          >
            Show this when Estate opens
          </Label>
        </div>
        <span className="text-[10.5px] text-muted-foreground/60">
          Or click anywhere outside to skip
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="px-0.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** The card row used by the AI panel's suggestions. */
function Row({
  icon,
  title,
  hint,
  mono,
  trailing,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  mono?: boolean;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-card/70 px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors group-hover:bg-foreground/5 group-hover:text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">{title}</span>
        {hint && (
          <span
            className={cn(
              "block truncate text-[10.5px] text-muted-foreground",
              mono && "font-mono",
            )}
          >
            {hint}
          </span>
        )}
      </span>
      {trailing}
    </button>
  );
}

/** A shortcut hint like the block terminal's, but clickable. */
function Hint({
  label,
  shortcut,
  onClick,
}: {
  label: string;
  shortcut: Parameters<typeof useShortcutLabel>[0];
  onClick: () => void;
}) {
  const keys = useShortcutLabel(shortcut).split(" ").filter(Boolean);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group col-span-2 grid grid-cols-subgrid items-center text-left"
    >
      <span className="text-muted-foreground/70 transition-colors group-hover:text-foreground">
        {label}
      </span>
      <KbdGroup className="justify-self-end">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </KbdGroup>
    </button>
  );
}
