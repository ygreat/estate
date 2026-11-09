import { describe, expect, it } from "vitest";
import {
  MAX_PLAN_TASKS,
  modelFor,
  orchestratorPrompt,
  parsePlan,
  resultsMessage,
  shownUserText,
  taskSlug,
  withoutPlan,
} from "./plan";

const reply = (json: string) =>
  `Here's the plan.\n\n\`\`\`estate-plan\n${json}\n\`\`\`\n`;

describe("parsePlan", () => {
  it("reads tasks from the estate-plan block", () => {
    const plan = parsePlan(
      reply(
        JSON.stringify({
          tasks: [
            {
              title: "API",
              prompt: "Build the API",
              edits: true,
              model: "deep",
            },
            {
              title: "Docs",
              prompt: "Write docs",
              edits: false,
              model: "fast",
            },
          ],
        }),
      ),
    );
    expect(plan?.tasks).toEqual([
      { title: "API", prompt: "Build the API", edits: true, model: "deep" },
      { title: "Docs", prompt: "Write docs", edits: false, model: "fast" },
    ]);
  });

  it("fills defaults, skips incomplete tasks and caps the count", () => {
    const tasks = [
      { title: "Keep", prompt: "do it" },
      { title: "", prompt: "no title" },
      { title: "No prompt" },
      ...Array.from({ length: 20 }, (_, i) => ({
        title: `t${i}`,
        prompt: "p",
      })),
    ];
    const plan = parsePlan(reply(JSON.stringify({ tasks })));
    expect(plan?.tasks[0]).toEqual({
      title: "Keep",
      prompt: "do it",
      edits: true,
      model: "balanced",
    });
    expect(plan?.tasks).toHaveLength(MAX_PLAN_TASKS);
  });

  it("returns null without a valid plan", () => {
    expect(parsePlan("no plan here")).toBeNull();
    expect(parsePlan(reply("{not json"))).toBeNull();
    expect(parsePlan(reply('{"tasks": []}'))).toBeNull();
    expect(parsePlan(reply('{"steps": [1]}'))).toBeNull();
  });

  it("strips the plan block from the shown reply", () => {
    expect(withoutPlan(reply('{"tasks":[]}'))).toBe("Here's the plan.");
    expect(withoutPlan('Plan:\n```estate-plan\n{"tasks": [')).toBe("Plan:");
  });
});

describe("orchestrator helpers", () => {
  it("maps model sizes per agent", () => {
    expect(modelFor("claude", "fast")).toBe("haiku");
    expect(modelFor("claude", "balanced")).toBe("sonnet");
    expect(modelFor("claude", "deep")).toBe("opus");
    expect(modelFor("gemini", "fast")).toBe("gemini-2.5-flash");
    expect(modelFor("codex", "deep")).toBeUndefined();
  });

  it("builds the first message and worktree names", () => {
    expect(orchestratorPrompt(" Plan well. ", " Build a blog ")).toBe(
      "[Estate Orchestrator instructions]\nPlan well.\n\n[Goal]\nBuild a blog",
    );
    expect(taskSlug("Add Login Page (OAuth)!")).toBe("add-login-page-oauth");
    expect(taskSlug("***")).toBe("task");
    expect(shownUserText(orchestratorPrompt("Plan.", "Build a blog"))).toBe(
      "Build a blog",
    );
    expect(shownUserText("hello")).toBe("hello");
  });

  it("reports results back with each task's reply, clipped", () => {
    const msg = resultsMessage([
      {
        title: "API",
        agent: "claude",
        where: "branch api",
        ok: true,
        reply: "Done.",
      },
      {
        title: "UI",
        agent: "codex",
        where: "the project folder",
        ok: false,
        reply: "x".repeat(3000),
      },
    ]);
    expect(msg).toContain("### Task 1: API");
    expect(msg).toContain("Stopped with an error.");
    expect(msg).toContain(`${"x".repeat(2000)}…`);
  });
});
