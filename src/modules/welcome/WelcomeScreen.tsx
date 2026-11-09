import {
  AiChat02Icon,
  Cancel01Icon,
  CommandIcon,
  ComputerTerminal02Icon,
  Folder01Icon,
  FolderAddIcon,
  Rocket01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CHAT_AGENT_LABEL,
  CHAT_AGENTS,
  type ChatAgentId,
} from "@/modules/agent-chat/model";
import { availableChatAgents } from "@/modules/agent-chat/store";
import type { OrchestratorDelegate } from "@/modules/orchestrator/instructions";
import { folderName, shortPath } from "@/modules/spaces/lib/projects";
import type { SpaceMeta } from "@/modules/spaces/lib/store";

type Props = {
  /** The open project, if it has a folder. */
  current: SpaceMeta | null;
  recent: SpaceMeta[];
  home: string | null;
  showOnStartup: boolean;
  onShowOnStartupChange: (show: boolean) => void;
  /** Resolves true when a folder was picked and opened. */
  onOpenFolder: () => Promise<boolean>;
  onSwitchProject: (spaceId: string) => void;
  /** Starts an agent chat, optionally with a first message. */
  onStartChat: (prompt: string) => void;
  /** Which agent plans: a fixed one, or "ask" to choose each time. */
  planAgent: OrchestratorDelegate;
  /** Plans the goal with the Orchestrator; `remember` saves the agent choice. */
  onPlan: (goal: string, agent: ChatAgentId, remember: boolean) => void;
  onNewTerminal: () => void;
  onOpenCommandPalette: () => void;
  onClose: () => void;
};

/** Estate: the first thing you see, a calm place to pick a project and start. */
export function WelcomeScreen({
  current,
  recent,
  home,
  showOnStartup,
  onShowOnStartupChange,
  onOpenFolder,
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
  const [goal, setGoal] = useState("");
  // "ask": the agent chooser shows under the goal before planning.
  const [choosing, setChoosing] = useState(false);
  const [installed, setInstalled] = useState<ChatAgentId[] | null>(null);
  const [remember, setRemember] = useState(false);
  const plan = () => {
    if (!goal.trim()) return;
    if (planAgent !== "ask") {
      onPlan(goal.trim(), planAgent, false);
      return;
    }
    setChoosing(true);
    if (installed === null)
      void availableChatAgents()
        .then(setInstalled)
        .catch(() => setInstalled([...CHAT_AGENTS]));
  };
  const goalRef = useRef<HTMLTextAreaElement | null>(null);
  const project = chosen ? current : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (project) goalRef.current?.focus();
  }, [project]);

  const others = recent.filter((p) => p.id !== current?.id).slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
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
        <div className="mx-auto flex max-w-xl flex-col items-center px-6 pt-6 pb-10">
          <img
            src="/logo.png"
            alt=""
            className="size-16 rounded-2xl shadow-lg shadow-black/20"
          />
          <h1 className="mt-5 text-center text-[24px] font-semibold tracking-tight">
            What are we{" "}
            <span className="bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] bg-clip-text text-transparent">
              building today?
            </span>
          </h1>

          {!project ? (
            <>
              <p className="mt-2 text-center text-[13px] text-muted-foreground">
                Start by opening the folder your project lives in. Estate keeps
                each project's tabs, chats and layout together.
              </p>
              <div className="mt-6 flex w-full flex-col gap-2">
                {current?.root && (
                  <button
                    type="button"
                    onClick={() => setChosen(true)}
                    className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left hover:bg-primary/10"
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={18}
                      strokeWidth={1.75}
                      className="text-primary"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-medium">
                        Continue with {current.name}
                      </span>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {shortPath(current.root, home)}
                      </span>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void onOpenFolder().then((opened) => {
                      if (opened) setChosen(true);
                    });
                  }}
                  className="flex items-center gap-3 rounded-xl border border-border/70 px-4 py-3 text-left hover:bg-accent/60"
                >
                  <HugeiconsIcon
                    icon={FolderAddIcon}
                    size={18}
                    strokeWidth={1.75}
                  />
                  <span className="flex flex-col">
                    <span className="text-[13px] font-medium">
                      Open a project folder…
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Any folder works, even an empty one for a new idea.
                    </span>
                  </span>
                </button>
              </div>

              {others.length > 0 && (
                <div className="mt-6 w-full">
                  <p className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                    Recent projects
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {others.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSwitchProject(p.id);
                            setChosen(true);
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent/60"
                        >
                          <HugeiconsIcon
                            icon={Folder01Icon}
                            size={15}
                            strokeWidth={1.75}
                            className="text-muted-foreground"
                          />
                          <span className="text-[12.5px]">{p.name}</span>
                          {p.root && (
                            <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground">
                              {shortPath(p.root, home)}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-center text-[13px] text-muted-foreground">
                In{" "}
                <span className="font-medium text-foreground">
                  {project.name}
                </span>
                {project.root ? ` (${folderName(project.root)})` : ""}. Describe
                your idea, or pick a way to start.
              </p>

              <div className="mt-6 w-full rounded-2xl border border-border/70 bg-card p-3 shadow-sm focus-within:border-primary/50">
                <textarea
                  ref={goalRef}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={3}
                  placeholder="e.g. A to-do app with a login page and a dark mode"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      (e.metaKey || e.ctrlKey) &&
                      goal.trim()
                    ) {
                      e.preventDefault();
                      onStartChat(goal.trim());
                    }
                  }}
                  className="w-full resize-none bg-transparent text-[13.5px] leading-6 outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-end gap-2">
                  {!choosing && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!goal.trim()}
                      onClick={plan}
                      title="Break the goal into tasks and hand them to agents"
                      className="gap-1.5"
                    >
                      <HugeiconsIcon
                        icon={Rocket01Icon}
                        size={13}
                        strokeWidth={2}
                      />
                      Plan with Orchestrator
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={!goal.trim()}
                    onClick={() => onStartChat(goal.trim())}
                    className="gap-1.5 bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] text-white hover:opacity-90"
                  >
                    <HugeiconsIcon
                      icon={AiChat02Icon}
                      size={13}
                      strokeWidth={2}
                    />
                    Start building
                  </Button>
                </div>
                {choosing && (
                  <div className="mt-2 border-t border-border/60 pt-2.5">
                    <div className="mb-2 text-[12px] text-muted-foreground">
                      Which agent should plan this?
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CHAT_AGENTS.map((a) => {
                        const missing =
                          installed !== null && !installed.includes(a);
                        return (
                          <Button
                            key={a}
                            size="sm"
                            variant="outline"
                            disabled={missing || !goal.trim()}
                            title={missing ? "Not installed" : undefined}
                            onClick={() => onPlan(goal.trim(), a, remember)}
                          >
                            {CHAT_AGENT_LABEL[a]}
                          </Button>
                        );
                      })}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setChoosing(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                    <label className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      Remember my choice (change it in Settings &gt; Agents)
                    </label>
                  </div>
                )}
              </div>

              <div className="mt-5 grid w-full grid-cols-3 gap-2">
                <QuickAction
                  icon={AiChat02Icon}
                  label="New agent chat"
                  onClick={() => onStartChat("")}
                />
                <QuickAction
                  icon={ComputerTerminal02Icon}
                  label="New terminal"
                  onClick={onNewTerminal}
                />
                <QuickAction
                  icon={CommandIcon}
                  label="Command palette"
                  onClick={onOpenCommandPalette}
                />
              </div>

              <button
                type="button"
                onClick={() => setChosen(false)}
                className="mt-4 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Choose another project
              </button>
            </>
          )}
        </div>
      </div>

      <label className="flex shrink-0 items-center justify-center gap-2 pb-4 text-[11.5px] text-muted-foreground">
        <input
          type="checkbox"
          checked={showOnStartup}
          onChange={(e) => onShowOnStartupChange(e.target.checked)}
          className="accent-[var(--primary)]"
        />
        Show this when Estate opens
      </label>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border border-border/70 px-3 py-3 text-[12px] transition-colors hover:border-primary/40 hover:bg-accent/50",
      )}
    >
      <HugeiconsIcon icon={icon} size={18} strokeWidth={1.75} />
      {label}
    </button>
  );
}
