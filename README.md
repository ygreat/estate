<!-- Modified by ygreat for Estate, 2026. Originally part of Terax. -->
<div align="center">
  <h1>Estate</h1>

  <p><strong>A focused developer workspace for Intel Macs on macOS 12 Monterey.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/platform-macOS%2012%2B%20Intel-lightgrey" alt="platform" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="license" />
  </p>
</div>

---

Estate is an open-source developer workspace with seven tools: terminal, SSH/SFTP, database browser, editor, AI agent, in-app browser and Git. It is built on Tauri 2 and Rust, runs on Intel Macs with macOS 12 Monterey, and sends no telemetry.

Modern agent workspaces and CLIs are dropping Monterey, and Intel Macs that stop at Monterey can't upgrade their way out. Estate keeps a current, lightweight workspace running on those machines. The reference machine is a 15-inch 2015 MacBook Pro on macOS 12.7.

> [!NOTE]
> Estate is an independent project built on Tauri, starting from [Terax](https://github.com/crynta/terax-ai) 0.9.0 (commit `a2c0877`, 6 November 2026). It is developed on its own from there, and later Terax releases are not merged or ported. It is not affiliated with or endorsed by the Terax project.

> [!IMPORTANT]
> Estate is in early development and has no release yet. SSH/SFTP and the database browser are not built yet. See [ROADMAP.md](ROADMAP.md).

## Tools

| Tool | What it does |
| --- | --- |
| **Terminal** | Native PTY backend with tabs and splits, rendered by libghostty-vt in WebAssembly. WebGPU where available, WebGL2 on Monterey. |
| **SSH/SFTP** *(planned)* | Saved hosts, `~/.ssh/config` import, key, agent and password login with host key checks; browse and transfer remote files and open them in the editor. |
| **Database browser** *(planned)* | PostgreSQL, MySQL/MariaDB and SQLite, directly or over SSH, with a schema tree, SQL editor, paged results and a guard on destructive statements. |
| **Editor** | CodeMirror 6 with a file explorer, AI edit diffs and opt-in language servers. |
| **AI agent** | Built-in agent with your own API keys, plus CLI agents (such as Claude Code) in local or SSH terminals, with versions you can pin. |
| **In-app browser** | Local dev servers and external URLs in a child webview. Cutting it off from the app's commands is planned and not yet verified. |
| **Git** | Stage hunks, commit, push, pull, branches and a history graph. |

## Platform support

| Platform | Support |
| --- | --- |
| macOS 12.7, Intel x86_64 | Primary. Every release is tested here. |
| macOS 12.x below 12.7, Intel | Best effort. Depends on the installed Safari version (16.4 or later is required). |
| macOS 13 to 15, Intel | Secondary. Should work; smoke-tested when a Mac is available. |
| Apple Silicon | Not targeted. Use [Terax](https://github.com/crynta/terax-ai). |
| Windows, Linux | Not supported. The code inherited from Terax may still build, but Estate doesn't test or package it. |

## Install

Estate has its own version numbers, starting at 0.1.0. The 0.9.0 mentioned elsewhere is the Terax version Estate started from.

There are no releases yet. When there are, they'll be on the [Releases](https://github.com/ygreat/estate/releases) page.

Estate is not notarized by Apple. After moving the app to Applications, clear the download quarantine:

```bash
xattr -dr com.apple.quarantine /Applications/Estate.app
```

## Security on Monterey

Apple's last macOS 12 update was in July 2024, and its WebKit will not be patched again. **Don't use the in-app browser for banking or personal accounts.** Keep it to local dev servers and sites you trust. See [SECURITY.md](SECURITY.md).

## Privacy

- No telemetry, analytics or crash reports.
- Network calls happen only for things you start: AI requests, SSH and database connections, update checks, and pages you open.
- API keys are stored in the macOS Keychain, never on disk or in `localStorage`. SSH passphrases and database passwords will be stored the same way when those tools are built.

## Configure AI

1. Open **Settings -> AI**.
2. Pick a provider and paste your API key, or point Estate at a local or LAN endpoint (LM Studio, Ollama, or any OpenAI-compatible server).

Local model inference on the Intel Mac itself isn't a goal; run the model on another machine and connect to it.

For CLI agents, install a version known to launch on Monterey and turn off its auto-update, or run a current version over SSH on a Linux host.

## Build from source

**Prerequisites**

- Xcode Command Line Tools (14.2 is the last for Monterey): `xcode-select --install`
- Rust, the version pinned in `rust-toolchain.toml`: https://rustup.rs
- Node 22 (Node 24 requires macOS 13.5) and [pnpm](https://pnpm.io)

**Run**

```bash
pnpm install
pnpm tauri dev
```

**Build for Intel**

```bash
export MACOSX_DEPLOYMENT_TARGET=12.0
pnpm install --frozen-lockfile
pnpm tauri build --target x86_64-apple-darwin
```

The first build can take 20 to 40 minutes on a 2015 Mac.

**Checks**

```bash
pnpm lint
pnpm check-types
pnpm test
cd src-tauri && cargo clippy --all-targets --locked -- -D warnings
cd src-tauri && cargo nextest run --locked    # or: cargo test --locked
```

## Tech stack

Tauri 2, Rust, `portable-pty`, libghostty-vt (WebAssembly), React 19, TypeScript, Vite, CodeMirror 6, Vercel AI SDK, Tailwind v4, shadcn/ui, Zustand.

## Contributing

Issues and PRs are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [architecture docs](docs/README.md) first.

## Credits

Estate started from [Terax](https://github.com/crynta/terax-ai) 0.9.0 (commit `a2c0877`), copyright 2026 Crynta, licensed under the Apache License 2.0. Most of Estate's starting code comes from that version: the terminal, editor, AI agent, web preview, Git tools and the app shell. Thanks to Crynta and the Terax contributors, whose commits are kept in this repository's history.

Estate also includes code and fonts from these projects, under their own licenses. Their license files stay in the source tree and ship with the app.

| Component | Copyright | License | License file |
| --- | --- | --- | --- |
| [Terax](https://github.com/crynta/terax-ai) | 2026 Crynta | Apache-2.0 | [`LICENSE`](LICENSE), [`NOTICE`](NOTICE) |
| [Ghostty](https://github.com/ghostty-org/ghostty) (terminal core, adapted) | 2024 Mitchell Hashimoto, Ghostty contributors | MIT | [`packages/ghostty-core/adapted/LICENSE.ghostty`](packages/ghostty-core/adapted/LICENSE.ghostty) |
| [ghostty-web](https://github.com/coder/ghostty-web) | 2025 Coder | MIT | [`packages/ghostty-core/LICENSE`](packages/ghostty-core/LICENSE) |
| [restty](https://github.com/wiedymi/restty) (adapted) | 2026 Wiedy Mi | MIT | [`packages/ghostty-core/adapted/LICENSE.restty`](packages/ghostty-core/adapted/LICENSE.restty) |
| [xterm.js](https://github.com/xtermjs/xterm.js) (WebGL renderer, adapted) | 2017-2019 The xterm.js authors, and others | MIT | [`src/modules/terminal/ghostty/webgl/LICENSE.xterm-js`](src/modules/terminal/ghostty/webgl/LICENSE.xterm-js) |
| Terminal symbol fonts, subset from [Nerd Fonts](https://github.com/ryanoasis/nerd-fonts) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | 2014 Ryan L McIntyre; 2020 The JetBrains Mono Project Authors; and others | SIL OFL 1.1, MIT and others | [`src/assets/fonts/LICENSE.nerd-fonts`](src/assets/fonts/LICENSE.nerd-fonts), [`src/assets/fonts/OFL.txt`](src/assets/fonts/OFL.txt), [`public/licenses/terminal-symbols.txt`](public/licenses/terminal-symbols.txt) |

npm and Cargo dependencies keep their own licenses; see each package.

"Terax" is used here only to describe where Estate's code comes from. Estate is not affiliated with or endorsed by the Terax project or Crynta.

## License

Estate is licensed under the [Apache License 2.0](LICENSE), the same license as Terax. The Terax copyright and attribution notices are kept; see [NOTICE](NOTICE). Changes Estate makes to files from Terax are marked in those files or listed in [MODIFICATIONS.md](MODIFICATIONS.md).

Estate is provided as is, without warranty of any kind. See sections 7 and 8 of the license.
