import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AgentPicker } from "@/modules/agent-chat/AgentPicker";
import { useAgentStatuses } from "@/modules/agent-chat/auth";
import {
  CHAT_AGENT_LABEL,
  CHAT_AGENTS,
  type ChatAgentId,
} from "@/modules/agent-chat/model";

type Props = {
  /** The goal waiting for an agent; null keeps the dialog closed. */
  goal: string | null;
  cwd: string;
  onPlan: (goal: string, agent: ChatAgentId, remember: boolean) => void;
  onCancel: () => void;
};

/** Estate: which agent plans, when Settings > Agents says "Ask me each time". */
export function AgentChoiceDialog({ goal, cwd, onPlan, onCancel }: Props) {
  const { auth, checking } = useAgentStatuses();
  const [picked, setPicked] = useState<ChatAgentId | null>(null);
  const [remember, setRemember] = useState(false);
  const agent =
    picked ??
    CHAT_AGENTS.find((a) => auth[a]?.state === "signed-in") ??
    "claude";
  return (
    <Dialog open={goal !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Which agent should plan this?</DialogTitle>
          <DialogDescription className="line-clamp-2">{goal}</DialogDescription>
        </DialogHeader>
        <AgentPicker
          value={agent}
          onChange={setPicked}
          auth={auth}
          checking={checking}
          cwd={cwd}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="orchestrator-remember"
            checked={remember}
            onCheckedChange={(v) => setRemember(v === true)}
          />
          <Label
            htmlFor="orchestrator-remember"
            className="text-[11.5px] font-normal text-muted-foreground"
          >
            Remember my choice (change it in Settings &gt; Agents)
          </Label>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={auth[agent]?.state === "missing"}
            onClick={() => goal && onPlan(goal, agent, remember)}
          >
            Plan with {CHAT_AGENT_LABEL[agent]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
