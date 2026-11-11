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
- Open a coding agent as a chat instead of a terminal. Replies stream in, tool calls show as expandable groups, and follow-ups continue the same agent session. Stop ends the agent and anything it started.
- Access level per chat: Read only (the default), Edit files or Full access, mapped to each agent's own permission settings. Blocked actions show an "Allow and retry" card, and the chat shows as Blocked (orange) in the Agents panel until you retry. Codex counts as blocked when it says the folder is read-only, or when its sandbox refuses a command or edit.
- Sessions sidebar: a Claude Code chat lists the project folder's own Claude Code sessions (the ones `claude` uses in a terminal there), with title, time and branch. Open one to see its recent messages and continue it. An empty chat lists recent sessions too.
- Drag files or folders from the Files sidebar into a chat box (a chat tab or the AI panel) to insert them as `@` mentions, relative to the chat's folder. The box outlines while you hover it. Dropping on a terminal still pastes the shell-quoted path.
- Type `@` in a chat box (a chat tab or the AI panel) to pick a file from the project; it shows as a chip and one Backspace removes it. Typed paths become chips once the file is found. Only the path is sent, never the file's contents, and secret files can't be mentioned. Right-click in the Files sidebar for Mention in Chat when a chat is on screen. Sent messages show mentions as file chips.
- Links in chat replies open in your browser without a confirmation window. Hovering a link shows its address with Open in browser and Preview in Estate (a new Preview tab).
- Working animations, adapted from beautiful-ui (MIT): a "Thinking" indicator in the theme's primary color with a timer, tool calls grouped into a run that folds to a count when the agent moves on, chips for the files it edited with lines added and removed (click to open), streamed words that fade in, and new messages that rise into place. Markdown checklists in replies show as a task card. Opening a past session doesn't animate.
- Rename a chat tab from its right-click menu, like a terminal tab. The name belongs to the tab's session: the sessions sidebar and the Agents panel show it, and right-clicking a session there renames it too (the tab follows). Opening another session in the tab shows that session's name; a new session starts unnamed. Clearing a name goes back to the agent's own title.
- The chat's model picker also sets effort: Low, Medium, High, Extra high or Max (Default leaves it to the agent), shown as "Opus · High". Each level has its own color, from sky (Low) to rose (Max), in the picker and on its button. Claude Code takes every level except on Haiku; Codex lists its own models with the levels each takes, up to Extra high (Codex has no Max). Each chat remembers its choice.
- Model menu in the chat header (Default, Opus, Sonnet, Haiku or any model name).
- Typing `/` lists commands: `/clear` and `/model` are handled by Estate; the agent's own commands (`/compact`, `/context`, `/init`, skills) go to the agent.
- Status line under the message box: folder, branch and worktree, model, access, context, tokens, cost, and gauges for how much of the 5-hour and 7-day usage limits is left. Choose the items in Settings > Agents.
- Sign-in screen: if the agent isn't installed or signed in, the chat shows how to fix it. Sign in opens a terminal running the agent's own login; Estate reads only whether you're signed in, never your account details.
- Chats work in split view and are saved with their project.

**Agents sidebar panel**
- A third sidebar view next to Files and Git lists every coding agent you have going, in terminals and in chats.
- Each is colour-coded: Needs you, Working, Idle or Ready, with how long ago it changed. Agents in other projects are listed with the project's name. Click one to jump to it.
- The folder's saved Claude Code sessions are listed below and resume in a new chat. The Agents tab shows how many agents need you.

**Orchestrator**
- Describe a goal on the welcome screen and choose Plan with Orchestrator. The agent set in Settings > Agents (or the one picked on the welcome screen) (Claude Code, Codex, Gemini CLI or OpenCode) reads the project and splits the goal into up to six tasks that can run at the same time.
- The plan shows as a card you can edit before anything runs: each task's title, instructions, agent, model size (Fast, Balanced, Deep) and whether it edits code.
- Run starts every task in its own agent chat tab. Tasks that edit code get their own git worktree and branch and "Edit files" access; the others are read only. The card shows each task's progress and opens its chat.
- When every task has finished, their results go back to the Orchestrator, which summarizes what was done, what's left and how to review and merge each branch.
- The Estate AI panel's agent switcher has an Orchestrator entry. With it selected, a message becomes a goal for an Orchestrator chat instead of a question for the panel's model. When Settings > Agents is set to ask, a dialog shows the agents with their sign-in state and can remember the choice.
- Settings > Agents: the Orchestrator's instructions (editable, with Reset to default), which agent plans (or ask each time, with "remember my choice"), and whether editing tasks get worktrees.

**Coding agent sign-in**
- Settings > Agents lists Claude Code, Codex, Gemini CLI and OpenCode with what each signs in with (Claude account, ChatGPT account, Google account or an API key) and whether you're signed in. Sign in opens a terminal in the main window running the agent's own login; a missing agent shows its install command to copy.
- The same status shows wherever you pick an agent (welcome screen, Orchestrator), with a Sign in button on agents that need it. Status refreshes when you come back to Estate after signing in.

**Claude and ChatGPT accounts for the Estate AI panel**
- Settings > Models has an Accounts section: sign in with a Claude account (through Claude Code) or a ChatGPT account (through Codex) instead of adding an API key. Each shows whether you're signed in, with a Sign in button that runs the agent's own login in a terminal.
- Once signed in, the panel's model picker offers Claude Sonnet, Opus and Haiku, or Codex's default model, marked "Account". Requests run through the signed-in app, read only, in the project folder; Estate never sees the account's credentials. The panel's own tools aren't used with these models; the agent uses its own read-only tools.
- The AI panel opens without any API key when one of these accounts is signed in, and starts on its model.
- The model picker lists signed-in account models first under "Your accounts". A model is greyed out only when its account isn't signed in. Browsing Anthropic or OpenAI while signed in with that account offers a shortcut to the account's models.
- A notice explains the trade-offs (read only, no Estate tools, slower start, uses your plan's limits): a strip in the AI chat while an account model is selected (collapsible), in the picker, and in Settings > Models.
- The model picker lives inside the chat box, a small label at its left with the provider's icon, so the box you type in is also where you switch models. It's no longer in the status bar.
- Account models: Claude Fable joins Sonnet, Opus and Haiku. Next to an account model, a small control sets its effort and, for a ChatGPT account, which Codex model it uses. Remembered per account and applied from the next message.

**Welcome screen**
- Opens on launch over the editor, which shows blurred behind it (Settings > General can turn it off). Go to editor, Esc or a click anywhere outside skips it.
- Two clear choices: Create New Project and Open Project, with recent projects below (the open one marked "Open now"). Clear Recent empties the list without deleting any project; a project comes back once it's opened again. The status bar's project menu still lists every project.
- Create New Project asks for a Project Name and a Root Directory (defaults to ~/Projects, remembers your last choice, with Choose… to pick another), shows the folder it will make, creates it and opens it.
- Then: "What are we building today?" One chat box with the agent switcher inside it on the left: Claude Code, Codex, Gemini CLI or OpenCode (each shows whether it's installed and signed in), or the Orchestrator to plan and delegate. A signed-out agent shows Sign in right in the box. Enter starts the chat, Shift+Enter adds a line. New terminal and Command palette sit below with their shortcuts.
- Opening a project that already has work, saved chat or editor tabs or Claude Code sessions in its folder, goes straight to it. The chat box shows for a project with neither (a terminal tab alone doesn't count as work).

**Themes**
- Estate Default now uses green to lime accents.
- New Estate OLED theme: true black (#000000) background with the same green to lime accents.

### Quality of life

- A terminal resized into a split no longer shows its prompt twice. With the bash that ships with macOS, a long prompt that wraps in a narrow pane also keeps the cursor where you type, and shell integration no longer turns itself off when several terminals start at once.
- Git History works in a split pane: the commit table fits the pane, dropping Changes, then Author, then Date as it narrows (the subject shows them on hover). It also stays loaded when you switch tabs or rearrange a split, keeping its place and search, and reloads only when there are new commits.
- Opening or switching to a project moves everything to it: the status bar folder, the Files sidebar and the window title. A project without tabs opens a terminal in its folder instead of leaving the previous project's tab in view.
- The files and source control sidebar sits on the right by default; Settings > General > Layout moves it. The sidebar toggle follows it to the same side of the header.
- The agent launcher (+ > Launch agents) opens chats by default; Terminal is the second choice.
- A new block tab keeps its welcome screen (logo and key hints) until you start typing.
- When a breadcrumb `cd` can't run, the message says why: an agent or full-screen program is running, a command is still running, or the shell isn't at a prompt. It offers to open the folder in a new tab.
- A chat tab shows its folder in the status bar, and the file explorer follows it.
- Switching projects: the project button at the bottom left lists recent projects and opens a folder as a project, instead of typing `cd` into the terminal. Folder menus offer Open as project, New terminal here and cd in this terminal.
- Editor, markdown and browser tabs keep the project folder in the status bar and explorer instead of showing "no directory".
- Settings > Agents is reorganized: Orchestrator first, the chat status line at the end below Snippets.
- Resuming a saved Claude Code session from the Agents panel opens it correctly.
- Settings > About describes Estate as lightweight and built for older Macs.
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
