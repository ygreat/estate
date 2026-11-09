import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { type AgentAuth, INSTALL_HINT, runInNewTerminal } from "./auth";
import { CHAT_AGENT_LABEL, type ChatAgentId } from "./model";

type Props = {
  agent: ChatAgentId;
  cwd: string;
  auth: AgentAuth;
  checking: boolean;
  onRecheck: () => void;
};

/** Estate: shown instead of the chat until the agent is installed and signed in. */
export function AuthScreen({ agent, cwd, auth, checking, onRecheck }: Props) {
  const label = CHAT_AGENT_LABEL[agent];
  const missing = auth.state === "missing";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <AgentIcon agent={agent} size={30} />
      <h2 className="text-[14px] font-medium">
        {missing ? `${label} isn't installed` : `Sign in to ${label}`}
      </h2>
      <p className="max-w-sm text-[12px] leading-5 text-muted-foreground">
        {missing
          ? `Estate couldn't find ${label} on your PATH. Install it, then check again.`
          : `${label} needs you to sign in before it can chat. Sign-in opens in a terminal and may continue in your browser. Come back here when it's done.`}
      </p>
      {missing ? (
        <code className="max-w-full overflow-x-auto rounded-md bg-muted px-2.5 py-1.5 font-mono text-[11.5px]">
          {INSTALL_HINT[agent]}
        </code>
      ) : (
        <code className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-[11.5px]">
          {auth.loginCommand}
        </code>
      )}
      <div className="mt-1 flex gap-2">
        {!missing && (
          <Button
            size="sm"
            onClick={() =>
              runInNewTerminal({ command: auth.loginCommand, cwd })
            }
          >
            Sign in in a terminal
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onRecheck}
          disabled={checking}
        >
          {checking && <Spinner className="size-3" />}
          Check again
        </Button>
      </div>
    </div>
  );
}
