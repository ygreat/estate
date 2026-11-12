import { describe, expect, it } from "vitest";
import { claudeInfo } from "./adapters";
import { commandSuggestions, parseComposerInput } from "./ChatComposer";
import {
  skillsMarkdown,
  statusMarkdown,
  terminalCommandLine,
  terminalOnlyCommands,
} from "./localCommands";
import {
  type AgentInfo,
  appendLocal,
  EMPTY_TRANSCRIPT,
  ZERO_TOTALS,
} from "./model";

const info: AgentInfo = {
  version: "2.1.322",
  model: "claude-opus-5-5",
  cwd: "/work/app",
  permissionMode: "default",
  outputStyle: "default",
  skills: ["debug", "verify", "anthropic-skills:pdf", "anthropic-skills:docx"],
  agents: ["Explore", "Plan"],
  plugins: ["cc-plugin-easel"],
  mcpServers: [{ name: "github", status: "connected" }],
  terminalCommands: ["doctor", "color", "focus"],
};

describe("claudeInfo", () => {
  it("reads Claude Code's init event and drops internal names", () => {
    const parsed = claudeInfo({
      type: "system",
      subtype: "init",
      claude_code_version: "2.1.322",
      model: "claude-opus-5-5",
      cwd: "/work/app",
      permissionMode: "default",
      output_style: "default",
      skills: ["debug", "__hidden"],
      agents: ["Explore"],
      plugins: [{ name: "cc-plugin-easel", path: "builtin" }, { path: "x" }],
      mcp_servers: [{ name: "github", status: "pending" }, { name: "bad" }],
      terminal_slash_commands: ["doctor", 7],
    });
    expect(parsed).toEqual({
      version: "2.1.322",
      model: "claude-opus-5-5",
      cwd: "/work/app",
      permissionMode: "default",
      outputStyle: "default",
      skills: ["debug"],
      agents: ["Explore"],
      plugins: ["cc-plugin-easel"],
      mcpServers: [{ name: "github", status: "pending" }],
      terminalCommands: ["doctor"],
    });
  });

  it("tolerates a bare event", () => {
    expect(claudeInfo({}).skills).toEqual([]);
  });
});

describe("terminalOnlyCommands", () => {
  it("joins reported and known terminal-only commands, minus headless ones", () => {
    const list = terminalOnlyCommands("claude", info, ["context", "doctor"]);
    expect(list).toContain("color");
    expect(list).toContain("permissions");
    // Runs headless, so it is sent to the agent as usual.
    expect(list).not.toContain("doctor");
    // Estate answers these itself.
    expect(list).not.toContain("status");
    expect(list).not.toContain("skills");
    expect(list).toEqual([...list].sort());
  });

  it("is empty for agents other than Claude Code", () => {
    expect(terminalOnlyCommands("codex", info, [])).toEqual([]);
  });
});

describe("terminalCommandLine", () => {
  it("resumes the chat's session with the command", () => {
    expect(terminalCommandLine("c4e61347-931f-4e95", "/doctor")).toBe(
      "claude --resume c4e61347-931f-4e95 /doctor",
    );
  });

  it("starts fresh without a session", () => {
    expect(terminalCommandLine(undefined, "/color blue")).toBe(
      "claude /color blue",
    );
  });

  it("drops anything a shell would interpret", () => {
    expect(terminalCommandLine("id; rm -rf ~", "/doctor && curl x | sh")).toBe(
      "claude /doctor curl x sh",
    );
    expect(terminalCommandLine(undefined, "/theme $(whoami) `id`")).toBe(
      "claude /theme whoami id",
    );
  });
});

describe("statusMarkdown", () => {
  const base = {
    agentLabel: "Claude Code",
    expectsInfo: true,
    info,
    sessionId: "abc-123",
    model: undefined,
    cwd: "/work/app",
    access: "read" as const,
    totals: ZERO_TOTALS,
    contextTokens: undefined,
  };

  it("shows the session, agent and extensions", () => {
    const md = statusMarkdown(base);
    expect(md).toContain("**Claude Code** 2.1.322");
    expect(md).toContain("`abc-123`");
    expect(md).toContain("claude-opus-5-5");
    expect(md).toContain("github (connected)");
    expect(md).toContain("4 skills, 2 agents, 1 plugin");
    expect(md).not.toContain("This chat");
    expect(md).not.toContain("_Reported");
  });

  it("notes details reported for another folder", () => {
    expect(statusMarkdown({ ...base, cwd: "/work/other" })).toContain(
      "last started in app",
    );
  });

  it("treats Windows spellings of the same folder as the same", () => {
    const md = statusMarkdown({
      ...base,
      info: { ...info, cwd: "D:\\work\\app" },
      cwd: "d:/work/app/",
    });
    expect(md).not.toContain("_Reported");
  });

  it("says when nothing was reported yet, only for agents that report", () => {
    expect(statusMarkdown({ ...base, info: undefined })).toContain(
      "hasn't reported",
    );
    expect(
      statusMarkdown({ ...base, info: undefined, expectsInfo: false }),
    ).not.toContain("hasn't reported");
  });

  it("adds this chat's totals and escapes table cells", () => {
    const md = statusMarkdown({
      ...base,
      cwd: "/work/a|b",
      totals: { costUsd: 0.5, inputTokens: 1000, outputTokens: 234, turns: 2 },
      contextTokens: 12000,
    });
    expect(md).toContain("2 turns, 1,234 tokens, $0.50");
    expect(md).toContain("12,000 tokens");
    expect(md).toContain("/work/a\\|b");
  });
});

describe("skillsMarkdown", () => {
  it("groups plugin skills under their plugin", () => {
    const md = skillsMarkdown(info, "/work/app");
    expect(md).toContain("**4 skills**");
    expect(md).toContain("- `debug`\n- `verify`");
    expect(md).toContain("**anthropic-skills**\n\n- `docx`\n- `pdf`");
  });

  it("handles no info and no skills", () => {
    expect(skillsMarkdown(undefined, "/w")).toContain("hasn't reported");
    expect(skillsMarkdown({ ...info, skills: [] }, "/work/app")).toBe(
      "No skills are available in this folder.",
    );
  });
});

describe("composer routing", () => {
  const routes = {
    local: [{ name: "status", hint: "Session details" }],
    terminal: ["doctor"],
  };

  it("routes local and terminal commands, sends the rest", () => {
    expect(parseComposerInput("/status", routes)).toEqual({
      kind: "local",
      name: "status",
      text: "/status",
    });
    expect(parseComposerInput("/doctor --verbose", routes)).toEqual({
      kind: "terminal",
      command: "/doctor --verbose",
    });
    expect(parseComposerInput("/statusline", routes)).toEqual({
      kind: "send",
      text: "/statusline",
    });
    expect(parseComposerInput("tell me the /status", routes)).toEqual({
      kind: "send",
      text: "tell me the /status",
    });
  });

  it("lists terminal commands with a hint, once", () => {
    const list = commandSuggestions("/doc", ["doctor"], routes);
    expect(list).toEqual([{ name: "doctor", hint: "Opens in a terminal" }]);
    expect(commandSuggestions("/st", [], routes)[0]).toEqual({
      name: "status",
      hint: "Session details",
    });
  });
});

describe("appendLocal", () => {
  it("adds the typed command and Estate's answer", () => {
    const t = appendLocal(EMPTY_TRANSCRIPT, "l1", "/status", "**ok**");
    expect(t.items).toEqual([
      { kind: "user", id: "l1-cmd", text: "/status" },
      { kind: "local", id: "l1", command: "/status", markdown: "**ok**" },
    ]);
  });
});
