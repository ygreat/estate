<!-- Modified by ygreat for Estate, 2026. Originally part of Terax. -->
<div align="center">
  <img src="design/logo-estate.png" alt="Estate" width="112" height="112" />
  <h1>Estate</h1>

  <p><strong>Your workspace for building software together with AI agents.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/status-closed%20testing-orange" alt="status: closed testing" />
    <img src="https://img.shields.io/badge/platform-macOS%2012%2B%20%7C%20Windows%20(testing)-lightgrey" alt="platform: macOS 12+, Windows in testing" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="license" />
  </p>
</div>

---

Estate is for developers who work alongside coding agents. You describe what you want, agents like Claude Code, Codex, Gemini CLI and OpenCode do the work, and you stay in charge: you plan with them, watch them, review what they changed and decide what ships. The terminal, editor and git you need for your part sit in the same window.

It's a small native app that stays fast on machines newer tools have left behind, including Intel Macs back to macOS 12. A native Apple Silicon build is planned, and Windows is in testing. Estate is an independent project, built with Tauri and Rust on top of [Terax](https://github.com/crynta/terax-ai) 0.9.0.

> [!NOTE]
> **Estate is in closed testing.** There are no public downloads right now; builds go to a small group of testers directly. You can still [build it from source](#build-from-source). See [ROADMAP.md](ROADMAP.md) for what's next and [CHANGELOG.md](CHANGELOG.md) for what's changed.

## How you work with agents in Estate

1. **Start from an idea.** Open a project and the welcome screen asks "What are we building today?". Pick an agent and describe it, and you're in a chat.
2. **Plan big work with the Orchestrator.** Give it a goal and it splits the work into tasks that can run at the same time. You edit the plan, choose an agent for each task, then run it. Tasks that change code each get their own git worktree and branch, so agents don't step on each other.
3. **Keep an eye on everything.** The Agents panel shows every agent you have going, in chats and in terminals: who's working, who needs you, who's blocked and who's done.
4. **Stay in control.** Every chat has an access level: Read only, Edit files or Full access. When an agent is blocked, you see what it tried and can allow it and retry.
5. **Review and ship.** Read the diffs, stage the hunks you want, commit and push, without leaving the window.

## Why Estate

- **Built around agents.** Agents are where the work starts, not a plugin bolted onto an editor. Chat with one, run several in parallel, or orchestrate a whole plan.
- **Any agent you already use.** Claude Code, Codex, Gemini CLI and OpenCode, with your existing sign-ins. Estate shows whether each one is installed and signed in, and never sees your account details.
- **You stay the developer.** Clear access levels, visible tool calls, a Stop button, and a review step before anything is merged.
- **Light on old hardware.** A small native app (the installer is about 8 MB), not a bundled browser. Built and tested for Intel Macs back to macOS 12.
- **Private.** No telemetry, no analytics, no background update checks. Your keys stay in the system keychain.

## What you can do

**Work with coding agents**
- Chat with an agent instead of reading a terminal UI: streaming replies, tool calls you can expand, and a Stop button. Press Esc to interrupt, as in the agent's CLI.
- Choose the model and how hard it thinks (effort from Low to Max), per chat.
- Pick up where you left off: chats share the project's own Claude Code sessions, listed in a sidebar, and you can name them.
- Type `@` to mention a project file, or drag files from the sidebar into the chat box. Mentions show as file chips, in the chat and in the AI assistant.
- Select and copy text from any message.
- Use `/` commands, including `/status` and `/skills` for Claude Code. Commands that only work in the agent's own terminal, like `/doctor`, open in a terminal tab on the same session.
- Keep an eye on context, cost and your 5-hour and 7-day usage limits in the chat's status line.

**Plan and delegate**
- The Orchestrator turns a goal into up to six parallel tasks, runs each in its own chat, then sums up what was done and how to review and merge each branch.
- The Agents panel lists every agent with its state, colored so you can tell at a glance which one needs you.

**The everyday tools**
- A fast terminal with tabs, splits and a block mode that groups each command with its output.
- A code editor with a file explorer, language support and AI edit diffs.
- Git: stage hunks, commit, push, pull, branches and history.
- A browser pane for your local dev server.
- A built-in AI assistant using your Claude or ChatGPT account, your own API keys, or a local model.

**Arrange your workspace**
- Split the window into up to four panes of any kind: terminals, chats, files, browser previews. Layouts are saved per project.
- Switch projects from the status bar, with recent projects one click away.
- Themes including Estate Default (green-to-lime accents) and Estate OLED (true black), and the sidebar on either side.

## Runs on

| Platform | Support |
| --- | --- |
| macOS 12.7 or later, Intel | Primary. The reference machine is a 2015 MacBook Pro. |
| Older macOS 12, Intel | Best effort; needs Safari 16.4 or later. |
| macOS 12 or later, Apple Silicon | Planned: a separate native (arm64) DMG with the same macOS 12 minimum. Not built yet. |
| Windows 10 and 11, x64 | In testing. Builds and runs from source; no installer is published yet. |
| Linux | Not supported. |

## Install

Estate is in closed testing, so there's no public download yet. Windows testers build from source for now (see [Windows](#windows)). If you're a Mac tester:

1. Get the DMG (`Estate_<version>_x64.dmg`) you were sent.
2. Open it and drag **Estate** to **Applications**.
3. Estate isn't signed with an Apple certificate yet, so macOS blocks the first launch. Right-click Estate in Applications, choose **Open**, then **Open** again. You only do this once. Or clear the download quarantine from a terminal:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Estate.app
   ```

To check the download, compare `shasum -a 256` of the DMG with the `SHA256SUMS.txt` that came with it.

## Updating

Estate updates itself, but only when you ask: open **Settings → About** and click **Check for updates**. If there's a newer release, **Install** downloads it, checks that it's signed with Estate's release key, and restarts on the new version. Estate never checks for updates in the background.

During closed testing there are no public releases, so **Check for updates** won't find anything. Testers get new builds directly.

## Using AI

- **Coding agents:** install Claude Code, Codex, Gemini CLI or OpenCode and sign in. Estate finds them on your PATH and shows a sign-in screen if one isn't ready.
- **Built-in assistant:** open **Settings → Models**, pick a provider and paste your API key, or point Estate at LM Studio, Ollama or any OpenAI-compatible server on your network.

On an older OS, pin an agent version that still launches there and turn off its auto-update, or run a current version on a remote machine over SSH.

## Privacy and security

- No telemetry, analytics or crash reports. Network calls happen only for things you start.
- API keys live in the macOS Keychain or the Windows Credential Manager, never in files or `localStorage`.
- Older macOS versions no longer get security updates, so keep the browser pane to your own dev servers and sites you trust. See [SECURITY.md](SECURITY.md).

## Build from source

### macOS

You need Xcode Command Line Tools (`xcode-select --install`), Rust (the version in `rust-toolchain.toml`, via [rustup](https://rustup.rs)), Node 22 and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm tauri dev                      # run in development

export MACOSX_DEPLOYMENT_TARGET=12.0
pnpm tauri build --target x86_64-apple-darwin   # build the app and DMG
```

Apple Silicon builds use `--target aarch64-apple-darwin` (planned; add the target with `rustup target add aarch64-apple-darwin`).

### Windows

You need [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload, [Git for Windows](https://git-scm.com), Rust via [rustup](https://rustup.rs) (default MSVC toolchain), Node 22 and pnpm (`npm install -g pnpm@11.9.0`). WebView2 comes with Windows 10 and 11.

Clone with `core.autocrlf=false`, so the shell scripts built into the app keep Unix line endings:

```powershell
git clone -c core.autocrlf=false https://github.com/ygreat/estate.git
cd estate
pnpm install --frozen-lockfile
pnpm tauri dev                      # run in development
```

To build an installer for your own testing without the release signing key, turn off the updater artifacts:

```powershell
'{"bundle":{"createUpdaterArtifacts":false}}' | Out-File -Encoding ascii ..\local-build.json
pnpm tauri build --config ..\local-build.json
```

The installers land in `src-tauri\target\release\bundle\nsis` and `msi`. They aren't code-signed, so SmartScreen warns on first run (**More info → Run anyway**).

### Checks

Checks: `pnpm lint`, `pnpm check-types`, `pnpm test`, and in `src-tauri`, `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked`.

To publish a signed release that installed copies can update to, see [Releasing a macOS build](docs/contributing/releasing.md).

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [architecture docs](docs/README.md) first.

## Credits

Estate is built on [Terax](https://github.com/crynta/terax-ai) 0.9.0 (commit `a2c0877`), copyright 2026 Crynta, licensed under the Apache License 2.0. Thanks to Crynta and the Terax contributors; their commits are kept in this repository's history. Estate is not affiliated with or endorsed by the Terax project.

Estate also includes code and fonts from these projects, under their own licenses, which stay in the source tree and ship with the app:

| Component | Copyright | License | License file |
| --- | --- | --- | --- |
| [Terax](https://github.com/crynta/terax-ai) | 2026 Crynta | Apache-2.0 | [`LICENSE`](LICENSE), [`NOTICE`](NOTICE) |
| [Ghostty](https://github.com/ghostty-org/ghostty) (terminal core, adapted) | 2024 Mitchell Hashimoto, Ghostty contributors | MIT | [`packages/ghostty-core/adapted/LICENSE.ghostty`](packages/ghostty-core/adapted/LICENSE.ghostty) |
| [ghostty-web](https://github.com/coder/ghostty-web) | 2025 Coder | MIT | [`packages/ghostty-core/LICENSE`](packages/ghostty-core/LICENSE) |
| [restty](https://github.com/wiedymi/restty) (adapted) | 2026 Wiedy Mi | MIT | [`packages/ghostty-core/adapted/LICENSE.restty`](packages/ghostty-core/adapted/LICENSE.restty) |
| [xterm.js](https://github.com/xtermjs/xterm.js) (WebGL renderer, adapted) | 2017-2019 The xterm.js authors, and others | MIT | [`src/modules/terminal/ghostty/webgl/LICENSE.xterm-js`](src/modules/terminal/ghostty/webgl/LICENSE.xterm-js) |
| Terminal symbol fonts, subset from [Nerd Fonts](https://github.com/ryanoasis/nerd-fonts) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | 2014 Ryan L McIntyre; 2020 The JetBrains Mono Project Authors; and others | SIL OFL 1.1, MIT and others | [`src/assets/fonts/LICENSE.nerd-fonts`](src/assets/fonts/LICENSE.nerd-fonts), [`src/assets/fonts/OFL.txt`](src/assets/fonts/OFL.txt), [`public/licenses/terminal-symbols.txt`](public/licenses/terminal-symbols.txt) |

npm and Cargo dependencies keep their own licenses.

## License

Estate is licensed under the [Apache License 2.0](LICENSE). Attribution notices are in [NOTICE](NOTICE), and changed files from the base project are marked in place or listed in [MODIFICATIONS.md](MODIFICATIONS.md).

Estate is provided as is, without warranty of any kind. See sections 7 and 8 of the license.
