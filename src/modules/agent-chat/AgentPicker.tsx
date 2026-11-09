import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { type AgentAuth, INSTALL_HINT, runInNewTerminal } from "./auth";
import { CHAT_AGENT_LABEL, CHAT_AGENTS, type ChatAgentId } from "./model";

export const AUTH_STATUS: Record<
  AgentAuth["state"],
  { label: string; dot: string }
> = {
  "signed-in": { label: "Signed in", dot: "bg-emerald-500" },
  "signed-out": { label: "Not signed in", dot: "bg-amber-500" },
  missing: { label: "Not installed", dot: "bg-muted-foreground/40" },
  unknown: { label: "Installed", dot: "bg-muted-foreground/60" },
};

/** A status dot and label, e.g. "Signed in · ChatGPT". */
export function AuthStatus({
  auth,
  checking,
  className,
}: {
  auth: AgentAuth | undefined;
  checking?: boolean;
  className?: string;
}) {
  const status = auth ? AUTH_STATUS[auth.state] : null;
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground",
        className,
      )}
    >
      {checking && !auth ? (
        <Spinner className="size-2.5" />
      ) : (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            status?.dot ?? "bg-muted-foreground/30",
          )}
        />
      )}
      <span className="truncate">
        {status?.label ?? "Checking…"}
        {auth?.state === "signed-in" && auth.method ? ` · ${auth.method}` : ""}
      </span>
    </span>
  );
}

/** Opens a terminal running the agent's own sign-in. */
export function signIn(auth: AgentAuth | undefined, cwd: string): void {
  if (auth?.loginCommand) runInNewTerminal({ command: auth.loginCommand, cwd });
}

type Props = {
  value: ChatAgentId;
  onChange: (agent: ChatAgentId) => void;
  auth: Partial<Record<ChatAgentId, AgentAuth>>;
  checking: readonly ChatAgentId[];
  /** Folder the sign-in terminal opens in ("" for the home folder). */
  cwd: string;
};

/** Estate: the chat agents as cards with their sign-in state. */
export function AgentPicker({ value, onChange, auth, checking, cwd }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {CHAT_AGENTS.map((a) => {
        const state = auth[a]?.state;
        const selected = a === value;
        return (
          <div
            key={a}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border bg-card/70 px-2.5 py-2 transition-colors",
              selected
                ? "border-primary/60 bg-primary/5"
                : "border-border hover:bg-muted/50",
              state === "missing" && "opacity-60",
            )}
          >
            <button
              type="button"
              aria-pressed={selected}
              disabled={state === "missing"}
              title={state === "missing" ? INSTALL_HINT[a] : undefined}
              onClick={() => onChange(a)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-not-allowed"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
                <AgentIcon agent={a} size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">
                  {CHAT_AGENT_LABEL[a]}
                </span>
                <AuthStatus auth={auth[a]} checking={checking.includes(a)} />
              </span>
            </button>
            {state === "signed-out" && (
              <Button
                size="xs"
                variant="outline"
                className="h-6 shrink-0 px-2 text-[10.5px]"
                onClick={() => signIn(auth[a], cwd)}
              >
                Sign in
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
