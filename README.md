<!-- Modified by ygreat for Estate, 2026. Originally part of Terax. -->
<div align="center">
  <img src="design/logo-estate.png" alt="Estate" width="112" height="112" />
  <h1>Estate</h1>

  <p><strong>A lightweight, frictionless workspace for agentic development, built to run well on older machines.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/platform-macOS%20Intel-lightgrey" alt="platform" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="license" />
  </p>
</div>

---

Estate brings your terminal, editor, git and AI coding agents together in one small, fast app. It is made for people who build with agents, from seasoned developers to someone writing their first project with Claude Code, and it stays light enough to run smoothly on machines and operating systems that newer tools have left behind.

Estate is an independent project, built with Tauri and Rust on top of [Terax](https://github.com/crynta/terax-ai) 0.9.0.

> [!IMPORTANT]
> Estate is in early development and has no release yet. See [ROADMAP.md](ROADMAP.md) for what's next and [CHANGELOG.md](CHANGELOG.md) for what's new.

## Why Estate

- **Frictionless.** Open a folder and start: talk to an agent, open a terminal, or split the window to watch both. Nothing to configure first.
- **Agent-first.** Run Claude Code, Codex, Gemini CLI or OpenCode as a clean chat or in a terminal, and see every agent you have going in one place.
- **Light on old hardware.** A small native app, not a bundled browser. Built and tested for Intel Macs back to macOS 12, with a renderer that keeps working on older GPUs.
- **Private.** No telemetry, no analytics, no background update checks. Your keys stay in the system keychain.

## What you can do

**Work with coding agents**
- Chat with an agent instead of reading a terminal UI: streaming replies, tool calls you can expand, and a Stop button.
- Pick up where you left off: chats share the project's own Claude Code sessions, listed in a sidebar.
- Stay in control: each chat has an access level (Read only, Edit files, Full access), and anything blocked shows an "Allow and retry" button.
- Switch models, use `/` commands, and keep an eye on your 5-hour and 7-day usage limits in the chat's status line.
- See every agent at a glance in the Agents panel: who's working, who needs you, who's done.

**Arrange your workspace**
- Split the window into up to four panes of any kind: terminals, chats, files, browser previews.
- Split groups stay put: opening a new tab never replaces a pane, and your layout is saved per project.
- Switch projects from the status bar, with recent projects one click away.

**The everyday tools**
- A fast terminal with tabs and splits, and a block mode that groups each command with its output.
- A code editor with a file explorer, language support and AI edit diffs.
- Git: stage hunks, commit, push, pull, branches and history.
- A browser pane for your local dev server.
- A built-in AI assistant with your own API keys, or a local or LAN model.

**Make it yours**
- Themes including Estate Default (green-to-lime accents) and Estate OLED (true black).
- The sidebar on either side, and a status line you choose.

## Runs on

| Platform | Support |
| --- | --- |
| macOS 12.7 or later, Intel | Primary. Every release is tested on a 2015 MacBook Pro. |
| Older macOS 12, Intel | Best effort; needs Safari 16.4 or later. |
| Apple Silicon | Not targeted yet. |
| Windows, Linux | Not supported. |

## Install

There are no releases yet. When there are, they'll be on the [Releases](https://github.com/ygreat/estate/releases) page.

Estate isn't notarized by Apple. After moving it to Applications, clear the download quarantine once:

```bash
xattr -dr com.apple.quarantine /Applications/Estate.app
```

## Using AI

- **Coding agents:** install Claude Code, Codex, Gemini CLI or OpenCode and sign in. Estate finds them on your PATH and shows a sign-in screen if one isn't ready.
- **Built-in assistant:** open **Settings → Models**, pick a provider and paste your API key, or point Estate at LM Studio, Ollama or any OpenAI-compatible server on your network.

On an older OS, pin an agent version that still launches there and turn off its auto-update, or run a current version on a remote machine over SSH.

## Privacy and security

- No telemetry, analytics or crash reports. Network calls happen only for things you start.
- API keys live in the macOS Keychain, never in files or `localStorage`.
- Older macOS versions no longer get security updates, so keep the browser pane to your own dev servers and sites you trust. See [SECURITY.md](SECURITY.md).

## Build from source

You need Xcode Command Line Tools (`xcode-select --install`), Rust (the version in `rust-toolchain.toml`, via [rustup](https://rustup.rs)), Node 22 and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm tauri dev                      # run in development

export MACOSX_DEPLOYMENT_TARGET=12.0
pnpm tauri build --target x86_64-apple-darwin   # build the app and DMG
```

Checks: `pnpm lint`, `pnpm check-types`, `pnpm test`, and in `src-tauri`, `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked`.

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
