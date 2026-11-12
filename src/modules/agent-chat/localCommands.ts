/**
 * Slash commands a headless chat can't pass to the agent. Claude Code answers
 * `/status` and `/skills` only in its own terminal interface, so Estate
 * answers them from the agent's startup report; other terminal-only commands
 * open in a terminal tab on the same session. Pure, so it can be tested.
 */
import type { AgentInfo, ChatAccess, ChatTotals } from "./model";
import { ACCESS_LABEL } from "./model";

/** Commands Estate answers itself in the chat. */
export const LOCAL_INFO_COMMANDS = ["status", "skills"] as const;
export type LocalInfoCommand = (typeof LOCAL_INFO_COMMANDS)[number];

export function isLocalInfoCommand(name: string): name is LocalInfoCommand {
  return (LOCAL_INFO_COMMANDS as readonly string[]).includes(name);
}

/**
 * Claude Code built-ins that need its interactive interface. Headless mode
 * replies "isn't available in this environment" to them. Used together with
 * the `terminal_slash_commands` Claude Code reports, and only for names its
 * headless command list does not include.
 */
const CLAUDE_INTERACTIVE_ONLY = [
  "add-dir",
  "bashes",
  "bug",
  "cost",
  "doctor",
  "export",
  "feedback",
  "help",
  "hooks",
  "ide",
  "install-github-app",
  "keybindings",
  "login",
  "logout",
  "memory",
  "permissions",
  "plugin",
  "privacy-settings",
  "release-notes",
  "resume",
  "rewind",
  "statusline",
  "terminal-setup",
  "theme",
  "todos",
  "upgrade",
  "vim",
];

/** Commands to open in a terminal instead of sending: sorted, no duplicates. */
export function terminalOnlyCommands(
  agent: string,
  info: AgentInfo | undefined,
  headless: readonly string[],
): string[] {
  if (agent !== "claude") return [];
  const runsHeadless = new Set(headless);
  const out = new Set<string>();
  for (const name of [
    ...(info?.terminalCommands ?? []),
    ...CLAUDE_INTERACTIVE_ONLY,
  ]) {
    if (!runsHeadless.has(name) && !isLocalInfoCommand(name)) out.add(name);
  }
  return [...out].sort();
}

/** The command line that resumes this chat's session with `command` typed. */
export function terminalCommandLine(
  sessionId: string | undefined,
  command: string,
): string {
  // Session ids are UUIDs and commands are `/name` plus words; anything else
  // is dropped rather than quoted, so no shell needs escaping rules here.
  const id =
    sessionId && /^[A-Za-z0-9-]{1,64}$/.test(sessionId) ? sessionId : null;
  const safe = command.replace(/[^\w\s/:.@-]/g, "").trim();
  const args = safe.split(/\s+/).filter(Boolean);
  return ["claude", ...(id ? ["--resume", id] : []), ...args].join(" ");
}

/** Text for a markdown table cell. */
function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** A folder's last segment, for short notes. */
function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Info gathered for another folder, or none yet: a note saying so. */
function staleNote(info: AgentInfo, cwd: string): string | null {
  if (!info.cwd) return null;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  if (norm(info.cwd).toLowerCase() === norm(cwd).toLowerCase()) return null;
  return `_Reported when Claude Code last started in ${folderName(info.cwd)}. Send a message here to refresh it for this folder._`;
}

const NO_INFO =
  "Claude Code hasn't reported its details in Estate yet. Send a message in this chat, then run the command again.";

export type StatusContext = {
  agentLabel: string;
  /** The agent reports startup details (Claude Code), so missing ones are noted. */
  expectsInfo: boolean;
  info: AgentInfo | undefined;
  sessionId: string | undefined;
  /** The model the chat will use (the menu's choice, else the agent's). */
  model: string | undefined;
  cwd: string;
  access: ChatAccess;
  totals: ChatTotals;
  contextTokens: number | undefined;
};

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** `/status`: the session, the agent and what Estate is running it with. */
export function statusMarkdown(c: StatusContext): string {
  const info = c.info;
  const rows: [string, string][] = [
    [
      "Session",
      c.sessionId ? `\`${c.sessionId}\`` : "Starts with your first message",
    ],
    ["Model", c.model ?? info?.model ?? "Agent default"],
    ["Folder", `\`${c.cwd}\``],
    ["Access (Estate)", ACCESS_LABEL[c.access]],
  ];
  if (info) {
    if (info.permissionMode)
      rows.push(["Permission mode", info.permissionMode]);
    if (info.outputStyle) rows.push(["Output style", info.outputStyle]);
    rows.push([
      "MCP servers",
      info.mcpServers.length > 0
        ? info.mcpServers.map((m) => `${m.name} (${m.status})`).join(", ")
        : "None",
    ]);
    rows.push([
      "Extensions",
      [
        count(info.skills.length, "skill"),
        count(info.agents.length, "agent"),
        count(info.plugins.length, "plugin"),
      ].join(", "),
    ]);
  }
  const t = c.totals;
  if (t.turns > 0) {
    const parts = [
      count(t.turns, "turn"),
      `${(t.inputTokens + t.outputTokens).toLocaleString("en-US")} tokens`,
    ];
    if (t.costUsd > 0) parts.push(`$${t.costUsd.toFixed(2)}`);
    rows.push(["This chat", parts.join(", ")]);
  }
  if (c.contextTokens !== undefined) {
    rows.push([
      "Context",
      `${c.contextTokens.toLocaleString("en-US")} tokens (run /context for detail)`,
    ]);
  }
  const head = info?.version
    ? `**${c.agentLabel}** ${info.version}`
    : `**${c.agentLabel}**`;
  const table = [
    "| | |",
    "|---|---|",
    ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`),
  ].join("\n");
  const notes = [
    info ? staleNote(info, c.cwd) : c.expectsInfo ? NO_INFO : null,
  ].filter(Boolean);
  return [head, table, ...notes].join("\n\n");
}

/** `/skills`: the skills Claude Code can use here, grouped by plugin. */
export function skillsMarkdown(
  info: AgentInfo | undefined,
  cwd: string,
): string {
  if (!info) return NO_INFO;
  if (info.skills.length === 0)
    return "No skills are available in this folder.";
  const own: string[] = [];
  const byPlugin = new Map<string, string[]>();
  for (const skill of info.skills) {
    const at = skill.indexOf(":");
    if (at <= 0) {
      own.push(skill);
      continue;
    }
    const plugin = skill.slice(0, at);
    const list = byPlugin.get(plugin) ?? [];
    list.push(skill.slice(at + 1));
    byPlugin.set(plugin, list);
  }
  const list = (names: string[]) =>
    names
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((n) => `- \`${n}\``)
      .join("\n");
  const sections = [`**${count(info.skills.length, "skill")}**`];
  if (own.length > 0) sections.push(list(own));
  for (const [plugin, names] of [...byPlugin].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    sections.push(`**${plugin}**\n\n${list(names)}`);
  }
  sections.push("Ask for a skill by name, or type `/` and its name to run it.");
  const note = staleNote(info, cwd);
  if (note) sections.push(note);
  return sections.join("\n\n");
}
