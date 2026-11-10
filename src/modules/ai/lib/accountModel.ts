/**
 * Estate: a language model that runs through a signed-in coding agent, so the
 * Estate AI panel can use a Claude or ChatGPT account instead of an API key.
 *
 * Each turn runs the agent's own CLI once (Claude Code `claude -p`, Codex
 * `codex exec`) through the agent chat backend, read only, in the workspace
 * folder. Estate never sees the account's credentials: the CLI signs itself in.
 * The agent uses its own read-only tools; Estate's panel tools aren't offered.
 */
import { Channel, invoke } from "@tauri-apps/api/core";
import type { LanguageModel } from "ai";
import { createTurnAdapter } from "@/modules/agent-chat/adapters";
import { checkAgentAuth } from "@/modules/agent-chat/auth";
import { newChatId } from "@/modules/agent-chat/ids";
import {
  CHAT_AGENT_LABEL,
  type ChatAgentId,
  type ChatEvent,
} from "@/modules/agent-chat/model";
import {
  effectiveEffort,
  effortsFor,
  loadAgentModels,
} from "@/modules/agent-chat/effort";
import { useAccountTuning } from "./accountTuning";
import { native } from "./native";

type ModelV3 = Extract<LanguageModel, { specificationVersion: "v3" }>;
type StreamOptions = Parameters<ModelV3["doStream"]>[0];
type StreamResult = Awaited<ReturnType<ModelV3["doStream"]>>;
type StreamPart =
  StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type GenerateResult = Awaited<ReturnType<ModelV3["doGenerate"]>>;
type Usage = Extract<StreamPart, { type: "finish" }>["usage"];

type BackendEvent =
  | { kind: "line"; line: string }
  | { kind: "dropped"; bytes: number }
  | { kind: "exit"; code: number | null; cancelled: boolean; stderr: string };

const NOTE = `[Estate]
You are answering in Estate's AI panel through your own CLI, with read-only access to the project folder. Estate's own tools are not available here; use your built-in read-only tools when you need to look at files. Reply to the last user message.`;

function partText(part: unknown): string {
  const p = part as { type?: string; text?: string; output?: unknown };
  if (p.type === "text" || p.type === "reasoning") return p.text ?? "";
  if (p.type === "tool-result") {
    const out = p.output as { value?: unknown } | undefined;
    const value = out?.value ?? out;
    return `(tool result) ${typeof value === "string" ? value : JSON.stringify(value)}`;
  }
  if (p.type === "file") return "(attached file)";
  return "";
}

/** The whole conversation as one prompt (each turn is a fresh process). */
export function promptFromMessages(prompt: StreamOptions["prompt"]): string {
  const system: string[] = [];
  const turns: string[] = [];
  for (const m of prompt) {
    if (m.role === "system") {
      system.push(m.content);
      continue;
    }
    const text = (m.content as unknown[])
      .map(partText)
      .filter(Boolean)
      .join("\n");
    if (!text.trim()) continue;
    const who =
      m.role === "user"
        ? "User"
        : m.role === "assistant"
          ? "Assistant"
          : "Tool";
    turns.push(`${who}:\n${text.trim()}`);
  }
  const head = system.length
    ? `[Instructions]\n${system.join("\n\n")}\n\n`
    : "";
  return `${head}${NOTE}\n\n[Conversation]\n${turns.join("\n\n")}`;
}

function usageOf(input: number | undefined, output: number | undefined): Usage {
  return {
    inputTokens: {
      total: input,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: output, text: undefined, reasoning: undefined },
  } as Usage;
}

async function workFolder(): Promise<string> {
  const { useChatStore } = await import("../store/chatStore");
  const live = useChatStore.getState().live;
  const cwd = live.getWorkspaceRoot() ?? live.getCwd();
  if (!cwd) throw new Error("Open a project folder first.");
  await native.workspaceAuthorize(cwd);
  return cwd;
}

/** `model`: the agent's model name (e.g. "sonnet"), or undefined for its default. */
export function createAccountModel(
  agent: ChatAgentId,
  model: string | undefined,
): ModelV3 {
  const label = CHAT_AGENT_LABEL[agent];

  const doStream = async (options: StreamOptions): Promise<StreamResult> => {
    const auth = await checkAgentAuth(agent);
    if (auth.state === "missing")
      throw new Error(`${label} isn't installed. See Settings > Models.`);
    if (auth.state === "signed-out")
      throw new Error(
        `Sign in to ${label} first: Settings > Models > Accounts.`,
      );
    const cwd = await workFolder();
    // Estate: the account's chosen effort (and Codex model), read per request.
    // Resolved before the run is set up, so nothing is awaited between
    // listening for an abort and starting the agent.
    const tuning = useAccountTuning.getState();
    const runModel = agent === "codex" ? (tuning.codexModel ?? model) : model;
    const effort =
      agent === "claude" || agent === "codex"
        ? effectiveEffort(
            tuning.effort[agent],
            effortsFor(agent, runModel, await loadAgentModels(agent)),
          )
        : undefined;
    const chatId = newChatId();
    const adapter = createTurnAdapter(agent);
    const channel = new Channel<BackendEvent>();

    let controller!: ReadableStreamDefaultController<StreamPart>;
    const stream = new ReadableStream<StreamPart>({
      start(c) {
        controller = c;
      },
      cancel() {
        void invoke("agent_chat_cancel", { chatId }).catch(() => {});
      },
    });
    controller.enqueue({ type: "stream-start", warnings: [] });

    const open = new Set<string>();
    const streamed = new Map<string, string>();
    let reasoningOpen = false;
    let input: number | undefined;
    let output: number | undefined;
    let error: string | null = null;
    let closed = false;

    const text = (id: string, delta: string) => {
      if (!delta) return;
      if (!open.has(id)) {
        open.add(id);
        controller.enqueue({ type: "text-start", id });
      }
      streamed.set(id, (streamed.get(id) ?? "") + delta);
      controller.enqueue({ type: "text-delta", id, delta });
    };
    const note = (line: string) => {
      if (!reasoningOpen) {
        reasoningOpen = true;
        controller.enqueue({ type: "reasoning-start", id: "agent-steps" });
      }
      controller.enqueue({
        type: "reasoning-delta",
        id: "agent-steps",
        delta: `${line}\n`,
      });
    };
    const apply = (events: ChatEvent[]) => {
      for (const e of events) {
        if (e.type === "text") {
          const before = streamed.get(e.id) ?? "";
          if (!e.final) text(e.id, e.text);
          else if (e.text.startsWith(before))
            text(e.id, e.text.slice(before.length));
          else if (!before) text(e.id, e.text);
        } else if (e.type === "tool" && e.status === "running") {
          note(e.title);
        } else if (e.type === "usage") {
          input = e.inputTokens ?? input;
          output = e.outputTokens ?? output;
        } else if (e.type === "error") {
          error = e.message;
        }
      }
    };
    const finish = (reason: "stop" | "error" | "other") => {
      if (closed) return;
      closed = true;
      if (reasoningOpen)
        controller.enqueue({ type: "reasoning-end", id: "agent-steps" });
      for (const id of open) controller.enqueue({ type: "text-end", id });
      if (reason === "error" && error && open.size === 0)
        controller.enqueue({ type: "error", error: new Error(error) });
      controller.enqueue({
        type: "finish",
        usage: usageOf(input, output),
        finishReason: { unified: reason, raw: undefined },
      });
      controller.close();
    };

    channel.onmessage = (event) => {
      if (closed) return;
      if (event.kind === "line") {
        try {
          apply(adapter.push(JSON.parse(event.line)));
        } catch {
          // Not JSON (a progress line): skip it.
        }
        return;
      }
      if (event.kind === "dropped") return;
      apply(adapter.finish());
      if (event.cancelled) return finish("other");
      if (event.code !== 0 && event.code !== null && !error)
        error = `${label} exited with code ${event.code}. ${event.stderr.trim().split("\n").slice(-3).join(" ")}`;
      finish(error ? "error" : "stop");
    };

    // Aborted while checking sign-in or loading models: don't start at all.
    if (options.abortSignal?.aborted) {
      finish("other");
      return { stream };
    }
    options.abortSignal?.addEventListener("abort", () => {
      void invoke("agent_chat_cancel", { chatId }).catch(() => {});
    });

    // Not awaited: the run resolves when the agent exits; events stream first.
    void invoke("agent_chat_run", {
      request: {
        chatId,
        agent,
        access: "read",
        sessionId: null,
        model: runModel ?? null,
        effort: effort ?? null,
        prompt: promptFromMessages(options.prompt),
        cwd,
      },
      onEvent: channel,
    }).catch((err) => {
      if (closed) return;
      error = String(err);
      finish("error");
    });
    return { stream };
  };

  return {
    specificationVersion: "v3",
    provider: `${agent}-account`,
    modelId: model ?? "default",
    supportedUrls: {},
    doStream,
    async doGenerate(options): Promise<GenerateResult> {
      const { stream } = await doStream(options);
      const reader = stream.getReader();
      let out = "";
      let finish: Extract<StreamPart, { type: "finish" }> | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "text-delta") out += value.delta;
        else if (value.type === "finish") finish = value;
        else if (value.type === "error") throw value.error;
      }
      return {
        content: out ? [{ type: "text", text: out }] : [],
        finishReason: finish?.finishReason ?? {
          unified: "stop",
          raw: undefined,
        },
        usage: finish?.usage ?? usageOf(undefined, undefined),
        warnings: [],
      } as GenerateResult;
    },
  };
}
