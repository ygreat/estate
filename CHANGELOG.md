<!-- Estate file; not part of Terax. -->
# Changelog

Changes in Estate since it started from Terax 0.9.0 (commit `a2c0877`, 6 November 2026). Estate has no release yet; everything below is in the first one, 0.1.0.

## Unreleased (0.1.0)

### Enhancements

**Split view of tabs**
- Split the workspace into up to four panes, each showing any kind of tab: terminal, editor, browser, git, diff or markdown.
- Splits are groups, like Chrome and Arc split view. Clicking a tab in a group shows the whole split with that pane focused; any other tab shows on its own. New tabs open on their own and never replace a pane.
- Drag a tab down from the tab bar onto a pane: an edge splits the pane, the center swaps the tab in. Dragging the visible tab onto its own pane's edge splits it with the next tab. Right-click a tab for Split right, Split down and Close pane.
- A group's tabs sit together in the tab bar and share a background. Dividers resize. Terminals, editors and browser pages keep their state when the layout changes.
- Groups are saved per project and come back after a restart.

**Agent chat** (Claude Code, Codex, Gemini CLI, OpenCode)
- Open a coding agent as a chat instead of a terminal. Replies stream in, tool calls show as expandable cards, and follow-ups continue the same agent session. Stop ends the agent and anything it started.
- Access level per chat: Read only (the default), Edit files or Full access, mapped to each agent's own permission settings. Blocked actions show an "Allow and retry" card.
- Sessions sidebar: a Claude Code chat lists the project folder's own Claude Code sessions (the ones `claude` uses in a terminal there), with title, time and branch. Open one to see its recent messages and continue it. An empty chat lists recent sessions too.
- Model menu in the chat header (Default, Opus, Sonnet, Haiku or any model name).
- Typing `/` lists commands: `/clear` and `/model` are handled by Estate; the agent's own commands (`/compact`, `/context`, `/init`, skills) go to the agent.
- Status line under the message box: folder, branch and worktree, model, access, context, tokens, cost, and gauges for how much of the 5-hour and 7-day usage limits is left. Choose the items in Settings > Agents.
- Sign-in screen: if the agent isn't installed or signed in, the chat shows how to fix it. Sign in opens a terminal running the agent's own login; Estate reads only whether you're signed in, never your account details.
- Chats work in split view and are saved with their project.

**Agents sidebar panel**
- A third sidebar view next to Files and Git lists every coding agent you have going, in terminals and in chats.
- Each is colour-coded: Needs you, Working, Idle or Ready, with how long ago it changed. Agents in other projects are listed with the project's name. Click one to jump to it.
- The folder's saved Claude Code sessions are listed below and resume in a new chat. The Agents tab shows how many agents need you.

### Quality of life

- The files and source control sidebar sits on the right by default; Settings > General > Layout moves it. The sidebar toggle follows it to the same side of the header.
- The agent launcher (+ > Launch agents) opens chats by default; Terminal is the second choice.
- A new block tab keeps its welcome screen (logo and key hints) until you start typing.
- When a breadcrumb `cd` can't run, the message says why: an agent or full-screen program is running, a command is still running, or the shell isn't at a prompt. It offers to open the folder in a new tab.
- A chat tab shows its folder in the status bar, and the file explorer follows it.
- Settings > About credits Terax 0.9.0 as the base, with a link to the project.
- Estate's own app icon and logo.

### Platform and build

- Runs on Intel Macs with macOS 12 Monterey: binaries declare macOS 12.0, the web code targets Safari 16.4, and Rust is pinned to 1.99.1.
- Renamed from Terax: app, bundle identifier (`io.github.ygreat.estate`), crates (`estate`, `estate-cli`, `estate-control-protocol`), command-line tool, settings and storage names. Versions restart at 0.1.0.
- No network calls you didn't ask for: Estate no longer checks for updates at launch.
- CI runs on GitHub's Intel macOS runner with Node 22 and the pinned Rust. Dependabot sends one grouped minor/patch update per month per ecosystem.
- Several timing limits in tests, set for faster hardware, were loosened for Intel Macs.

### Not yet verified

Nothing has run on the Monterey reference Mac yet. Gemini CLI and OpenCode chat support follows their published output formats and hasn't been run. See [ROADMAP.md](ROADMAP.md).
