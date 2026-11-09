# PRD: Estate

Nov 9, 2026 · @Yeremia Greatto

## Summary

Estate is a focused developer workspace with seven tools that runs on Intel Macs with macOS 12 Monterey and sends no telemetry.

It is an open-source Tauri 2 and Rust project at [ygreat/estate](https://github.com/ygreat/estate). It started from Terax 0.9.0 (the `main` branch at commit `a2c0877`, 6 November 2026, 50 commits after the v0.9.0 release) and is developed independently from there; later Terax releases are not relevant to Estate. The seven tools are terminal, SSH/SFTP, database browser, editor, AI agent, in-app browser and Git. The reference machine is a 15-inch 2015 MacBook Pro on Monterey with Safari 17.6.

Research found no blocker in the stack, but nothing has run on the Mac yet. A review of the fork's source on 9 November 2026 corrected several public-source assumptions (see Codebase findings); everything else must still be confirmed in Phase 0.

## Problem and context

Modern agent workspaces are leaving Monterey behind, and Intel Macs that stop at Monterey cannot upgrade their way out.

| Tool or runtime | Status on Monterey Intel |
| --- | --- |
| [Claude Code](https://claudeissues.com/issue/91309-bug-v2-1-257-aborts-at-launch-on-macos-12-dyld-dnsservicegetaddrinfoex-auto-upda) | macOS 13 is the documented minimum. Version 2.1.257 aborts at launch on a missing system symbol. |
| [Claude Desktop's bundled Claude Code](https://claudeissues.com/issue/91381-bug-desktop-apps-bundled-claude-code-crashes-on-macos-12-dyld-dnsservicegetaddri) | Reported crashing at 2.1.255, while standalone 2.1.258 ran on the same Mac. |
| [Cursor CLI](https://forum.cursor.com/t/macos-12-cli-agent-2026-09-02-c22c1a3-crashes-on-start-on-macbook-air-2017-intel-model/170984) | Crashes at start on a Monterey Intel Mac. |
| [Chromium](https://9to5google.com/?p=702309), and so Electron apps such as Orca | Chrome 150 is the last version for Monterey. Electron apps stay current only until they pass that line. |
| [Ghostty](https://dev.to/dansasser/ghostty-10-a-terminal-emulator-built-for-speed-features-and-native-integration-22ng) | The app requires macOS 13 or later. Estate uses only its terminal core, libghostty-vt, compiled to WebAssembly and run in the webview, so this floor does not apply. |
| [Tauri with WKWebView](https://v2.tauri.app/reference/webview-versions/) | Runs on the OS WebKit, which stops receiving updates when the OS loses support. |

Terax is the best base because it uses Tauri 2, Rust, portable-pty, a libghostty-vt WebAssembly terminal and CodeMirror 6, with no bundled browser engine. (Older public descriptions say [xterm.js](https://github.com/crynta/terax-ai); the current `main` has replaced it.) However, the official v0.8.6 Mac app [declares macOS 13.0 as its minimum](https://ai-heartland.com/tool/terax/), so Estate must lower that value and prove nothing actually depends on 13.

## Goals, non-goals and success metrics

The release succeeds when one x86\_64 build launches on Monterey and all seven tools complete a real work session on the reference Mac.

**Goals**

- Ship seven tools only: terminal, SSH/SFTP, database browser, editor, AI agent, in-app browser and Git.
- Run on macOS 12 Intel without any dependency on macOS 13 or later.
- Send no telemetry, analytics or crash reports.
- Let CLI agents run in a local or SSH terminal, with versions the user can pin.
- Develop Estate on its own from the Terax 0.9.0 starting point. Later Terax releases are not merged or ported.

**Non-goals**

- Apple Silicon builds. Terax already serves those Macs.
- macOS below 12, and Windows or Linux packaging changes.
- Voice input, custom backgrounds and other Terax features outside the seven tools.
- Local model inference on the Intel Mac. Remote or LAN endpoints stay supported.
- A bundled Chromium browser engine.
- Making any CLI agent run on Monterey when its vendor has dropped it.
- A separate background daemon in the first release.

**Success metrics** (proposed targets; replace with measured values after Phase 0)

| Metric | Target on reference Mac |
| --- | --- |
| Launch on macOS 12.7 from a clean install | 100% of test runs, no dyld errors |
| Cold start to usable prompt | Under 2 s |
| App memory, 1 window with 3 terminal tabs, excluding child processes | Under 500 MB |
| Terminal output, `cat` of a 50 MB log | No UI hang over 1 s |
| Eight-hour session with 3 terminals | No crash, no lost terminal session |

## Target users and support matrix

The primary user is a developer on an Intel Mac that cannot officially update past Monterey.

| Platform | Support level |
| --- | --- |
| macOS 12.7, Intel x86\_64, 15-inch 2015 MacBook Pro | Primary. Every release is tested here. |
| macOS 12.x below 12.7, Intel | Best effort. Depends on the installed Safari version. |
| macOS 13 to 15, Intel | Secondary. Should work and is smoke-tested when a Mac is available. |
| Apple Silicon | Not targeted. |

Plan for the reference Mac's limits: a quad-core Intel CPU, up to 16 GB of RAM, and either integrated graphics or an older AMD GPU, depending on the model. Confirm the exact configuration in Phase 0.

## Compatibility findings

Every layer has a workable path on Monterey Intel, and the frozen WebKit and agent CLIs carry the most risk.

| Layer | Finding | Verdict |
| --- | --- | --- |
| Tauri 2 | The v1 docs give a [10.13 minimum](https://v1.tauri.app/v1/guides/building/macos), and one Tauri 2 project [treats 11 as the effective floor](https://packetthrower.github.io/Baudrun/REQUIREMENTS/). Crashes on older macOS [do occur and get fixed case by case](https://github.2858349172.workers.dev/tauri-apps/wry/pull/1734). | Use, and lock versions |
| Rust | [macOS 10.12 is the x86 minimum](https://doc.rust-lang.org/stable/rustc/platform-support/apple-darwin.html). Intel Macs [moved to Tier 2 in Rust 1.90](https://blog.rust-lang.org/2025/08/19/demoting-x86-64-apple-darwin-to-tier-2-with-host-tools), so tests are no longer guaranteed. | Use, and pin the toolchain |
| Apple build tools | [Xcode 14.2 is the last for Monterey](https://developer.apple.com/forums/thread/757205). It [needs macOS 12.5 and ships the 13.1 SDK](https://www.junian.dev/downloads/xcode/). | Use on the reference Mac |
| Node | [Node 24 binaries require macOS 13.5](https://nodejs-hbt4jjs1l-openjs.vercel.app/en/blog/announcements/v22-to-v24). [Vite 8 accepts Node 22.12 or later](https://lilting.ch/en/articles/vite-8-rolldown). | Stay on Node 22 |
| Native npm build binaries | I found no stated macOS minimum for Rolldown, Lightning CSS or Tailwind's native engine. | Test in Phase 0 |
| WebKit | [Safari 17.6 is the last version for Monterey](https://discussions-jp-prz.apple.com/thread/256023791), released July 2024. | Usable but frozen |
| CSS | [Tailwind v4 requires Safari 16.4](https://tailwindcss.com/docs/compatibility). | Compatible |
| JavaScript syntax | [Vite 8 targets Safari 16.4 by default](https://www.mintlify.com/vitejs/vite/guides/migration). | Compatible |
| JavaScript APIs | Safari 17.6 lacks [ReadableStream async iteration](https://caniuse.com/mdn-api_readablestream_--asynciterator), [Iterator helpers](https://caniuse.com/mdn-javascript_builtins_iterator_iterator) and [Promise.try](https://caniuse.com/mdn-javascript_builtins_promise_try). Vite does not add these. | Polyfill; test AI streaming |
| Terminal | libghostty-vt runs as WebAssembly, drawing with WebGPU by default and a WebGL2 fallback adapted from xterm.js's WebGL renderer. There is no DOM or canvas 2D renderer. WebGPU is not on by default in Safari 17.6, so the reference Mac will run the WebGL2 fallback, which uses more CPU and allows at most 12 visible panes per window. | Use; WebGL2 is the primary path on Monterey |
| SSH and SFTP | [russh](https://github.com/Eugeny/russh) is async Rust with port forwarding, and [russh-sftp](https://openapps.pro/packages/russh-sftp) needs no libssh2. Crypto [needs only a C compiler on macOS](https://aws.github.io/aws-lc-rs/requirements/apple.html). | Use |
| Database | [sqlx powers Tauri's SQL plugin](https://docs.rs/crate/tauri-plugin-sql/2.4.0) for SQLite, MySQL and Postgres. [Tabularis](https://gh.r-mj.com/debba/tabularis) proves it on Tauri 2, React 19 and Tailwind v4. | Use |
| In-app browser | Terax already uses a [native child webview](https://ai-heartland.com/tool/terax/), a Tauri [unstable feature](https://docs.rs/tauri/2.2.0/tauri/webview/struct.WebviewBuilder.html). One app found [Google sign-in blocked](https://hackernews-dynamic.seasondane.workers.dev/news/48279242) in it. | Use for local development |
| Monterey CI | [The macos-15-intel runner is the last Intel image](https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/), ending fall 2027. [No hosted macOS 12 runner remains](https://tessl.io/registry/pantheon-ai/github-actions-toolkit/1.0.1/files/validator/references/runners.md). | Test on the real Mac |

## Codebase findings

A source review of the starting point (Terax 0.9.0, `main` at `a2c0877`), done on 9 November 2026, found these differences from the assumptions above. None blocks the goal, but each changes the work.

| Area | What the code has | What Estate needs |
| --- | --- | --- |
| Terminal | libghostty-vt WebAssembly with WebGPU, WebGL2 fallback and an Automatic/WebGPU/WebGL setting (`src/settings/sections/GeneralSection.tsx`). WebGL context loss already reports a failure after 3 s. | Make the WebGL2 path solid on the reference GPU; see FR-6. |
| Identity | `src-tauri/tauri.conf.json` has `productName` "Terax", identifier `app.crynta.terax` and `minimumSystemVersion` `13.0`. | Done in `9baae5c`. UI branding is still FR-3. |
| Updater | Points at `crynta/terax-ai` releases with upstream's signing key. | Endpoint now ygreat/estate and no check at launch (`9baae5c`). Still needs Estate's own signing key (FR-3). |
| Web build target | `vite.config.ts` targets `es2022` on macOS. | `safari16.4` done in `9baae5c`; polyfills still needed. |
| Toolchain | No `rust-toolchain.toml`. Node is `>=22`. | Rust 1.99.1 pinned in `9baae5c`; keep Node 22. |
| SSH/SFTP and database | No code or dependencies (no russh, sqlx or `tauri-plugin-sql`). | New modules, as planned. |
| Telemetry | No analytics or crash-reporting library found by search. | Confirm with the FR-4 network capture. |
| Licensing | Root `LICENSE` is Apache-2.0; no upstream `NOTICE`. Bundled third-party code carries its own licenses (MIT for xterm.js, Ghostty and restty; mixed for Nerd Fonts). | Keep those files; see Licensing. |

## Functional requirements

P0 items block the first release, P1 items should ship in it, and P2 items can follow.

| ID | Tool | Requirement | Acceptance check | Priority |
| --- | --- | --- | --- | --- |
| FR-1 | App | Install and launch on macOS 12.7 Intel from a DMG. | Clean user account, no dyld error, no Rosetta. | P0 |
| FR-2 | App | Check WebKit at startup. | Below Safari 16.4, show a plain message instead of a blank window. | P0 |
| FR-3 | App | Remove Terax branding and point updates at ygreat/estate. | No Terax name or icon in the UI; the app never offers an upstream build. | P0 |
| FR-4 | App | No telemetry. | A network capture of an idle session shows no outbound traffic except user-enabled update checks. | P0 |
| FR-5 | Terminal | Tabs, splits, zsh and bash. | vim, htop and tmux render and resize correctly. | P0 |
| FR-6 | Terminal | Automatic fallback from WebGPU to WebGL2, and recovery from WebGL2 context loss. | With WebGPU unavailable, Automatic picks WebGL2 with no error; a lost context recovers or shows a clear message instead of a blank pane; the setting forces either renderer. | P0 |
| FR-6a | Terminal | Last-resort renderer if WebGL2 fails on the reference GPU. | Only if Phase 0 shows WebGL2 failing: text still renders, without GPU. | P2 |
| FR-7 | SSH | Saved hosts, `~/.ssh/config` import, key, agent and password login, with host key checks. | Interactive session runs vim; an unknown or changed host key prompts the user. | P0 |
| FR-8 | SFTP | Browse, upload, download, rename and delete; open remote files in the editor. | A 1 GB transfer completes with progress and can be cancelled. | P0 |
| FR-9 | SSH | Jump hosts and local port forwarding. | A database reachable only through a bastion connects. | P1 |
| FR-10 | Database | Connect to PostgreSQL, MySQL/MariaDB and SQLite, directly or through SSH. | Each engine connects; passwords stay in Keychain. | P0 |
| FR-11 | Database | Schema tree, SQL editor and paged results grid. | A 1 million row table scrolls without loading it all into memory. | P0 |
| FR-12 | Database | Guard destructive statements. | DROP, DELETE, TRUNCATE and ALTER need confirmation; a connection can be read-only. | P0 |
| FR-13 | Editor | File explorer and CodeMirror editing. | Open, edit and save TS, Rust, Python, SQL, JSON and Markdown. | P0 |
| FR-14 | AI agent | Built-in agent with user-supplied keys. | Streamed reply and an approved file edit complete under Safari 17.6. | P0 |
| FR-15 | AI agent | CLI agents in local and SSH terminals. | A pinned local agent runs, and a current agent runs on a remote Linux host. | P0 |
| FR-16 | AI agent | Agent compatibility check. | Reports each installed agent, its version and whether it launches. | P1 |
| FR-17 | In-app browser | Open local dev servers and external URLs in a child webview. | A Vite app hot-reloads; back, forward, reload and open-externally work. | P0 |
| FR-18 | In-app browser | Isolate browsing from the app. | The browser webview has no Tauri command access; external sites show a warning bar. | P0 |
| FR-19 | Git | Stage hunks, commit, push, pull, branch and history, local first. | All complete using the Xcode tools Git. | P0 |
| FR-20 | Git | Git over SSH sessions. | Status, commit and push work on a remote repository. | P2 |
| FR-21 | Workspace | Split view of tabs as groups: up to four panes, each showing a tab of any kind; new tabs never replace a pane; saved per project. | Drag a tab onto a pane edge to split; dividers resize; a new tab shows alone and the split returns when a grouped tab is clicked; groups return after relaunch; terminals and browser frames keep their state. | P1 |
| FR-22 | Workspace | Files and source control sidebar on the right by default, configurable; its toggle sits on the same side. | Settings > General > Layout moves it to either side without reloading the workspace. | P1 |
| FR-23 | AI agent | Chat mode for Claude Code, Codex, Gemini CLI and OpenCode, as an alternative to the terminal, and the launcher's default. | The launcher opens a chat that streams replies and tool calls, resumes the agent's session on follow-ups, and can be stopped. | P1 |
| FR-24 | AI agent | Chat sessions shared with the agent's own history for the project folder (Claude Code first). | A sidebar lists the folder's sessions; opening one shows its messages and the next message continues it. | P1 |
| FR-25 | AI agent | Model choice and slash commands in chat. | The model menu changes the next turn's model; `/` lists the agent's commands; `/clear` starts a new session. | P1 |
| FR-26 | AI agent | Configurable chat status line with usage limits. | Shows folder, branch, model, access, context, tokens, cost and 5-hour / 7-day gauges, each toggled in Settings. | P2 |
| FR-27 | AI agent | Sign-in screen when a chat's agent isn't installed or signed in. | Signed-out agents show the screen with a terminal sign-in; account details are never read into the app. | P1 |
| FR-28 | Workspace | Agents sidebar panel for every running coding agent. | Lists terminal and chat agents colour-coded Needs you / Working / Idle / Ready; clicking one activates its tab and pane. | P1 |

FR-21 to FR-28 are enhancements and quality-of-life improvements added while building Estate, beyond the seven tools; [CHANGELOG.md](CHANGELOG.md) lists them with the smaller fixes.

## Non-functional requirements

Compatibility comes first: a feature that breaks launch on Monterey does not ship.

- **Binary floor:** every executable and bundled library declares macOS 12.0 or lower, and references no newer system symbols.
- **Web floor:** Safari 16.4. New web APIs need a polyfill or a feature check.
- **Performance:** meet the Success metrics targets, with no busy-looping while idle.
- **Battery and heat:** no continuous GPU redraw when the terminal is idle; poll nothing in hidden panels.
- **No telemetry:** no analytics, crash upload or usage ping. Update checks are manual or opt-in. Network calls happen only for user-started actions.
- **Secrets:** API keys, SSH passphrases and database passwords stay in Keychain, never in files or `localStorage`.
- **Untrusted output:** treat remote terminal output as hostile. Keep upstream's [fix for PTY output opening local files](https://newreleases.io/project/github/crynta/terax-ai/release/v0.6.4), and retest it over SSH.
- **Agent approval:** terminal agents keep their own approval prompts, including on remote hosts. In chat mode (FR-23) headless agents can't pause mid-turn to ask, so each chat has an access level the user sets: Read only (default), Edit files, or Full access, mapped to each agent's own permission flags. Blocked actions are shown in the chat with an "Allow and retry" choice; nothing is raised automatically.
- **Security disclosure:** the README states that Monterey [received its last update in July 2024](https://discussions.apple.com/thread/255745285), so the in-app browser is not for banking or personal accounts.
- **Licensing:** keep Apache-2.0 and upstream copyright notices, and mark modified files. Details are in the Licensing section.

## Technical approach

Build on Tauri 2 and Rust, keep Terax's structure, and add SSH/SFTP and database modules to one Rust process.

&#91;embedded content: Estate architecture · UI, Rust core, external systems\]

The browser pane is the only part that loads untrusted pages, so it is walled off from the Rust commands.

**Why one process.** A separate daemon would add memory use and a second release artifact on a 2015 Mac. Move to a daemon later only if long-running remote sessions need to outlive the app.

**Identity.** In `tauri.conf.json`, set `productName` to `Estate`, the identifier to `io.github.ygreat.estate`, and `bundle.macOS.minimumSystemVersion` to `12.0` (done; it was `13.0`). Replace `plugins.updater.endpoints` and `pubkey` with ygreat/estate's release URL and a new Estate signing key, or disable the updater until releases exist.

**Terminal rendering.** On Monterey the terminal runs on the WebGL2 fallback, so treat it as the primary renderer there: test it on the reference GPU in Phase 0, measure CPU and battery while idle and under heavy output, and keep the fallback's changes in its own module. Also confirm the libghostty-vt WebAssembly module loads in Safari 17.6.

**Build on the reference Mac first.** It uses the 13.1 SDK, so an API that is newer than Monterey tends to fail early. Pin Rust in `rust-toolchain.toml`, commit `Cargo.lock`, and build with:

```bash
export MACOSX_DEPLOYMENT_TARGET=12.0
pnpm install --frozen-lockfile
pnpm tauri build --target x86_64-apple-darwin
```

The first build can take [20 to 40 minutes](https://dev.to/0xkoji/build-terax-for-intel-mac-1j5a). If a native npm tool will not run on Monterey, build on a newer Intel runner and still test on the reference Mac.

**Launching is the only real proof.** A declared minimum does not settle it: Claude Code builds [marked 13.0 still ran on Monterey until one used a missing symbol](https://claudeissues.com/issue/91309-bug-v2-1-257-aborts-at-launch-on-macos-12-dyld-dnsservicegetaddrinfoex-auto-upda). Check the minimum, then launch every build:

```bash
APP="src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Estate.app"
find "$APP" -type f -perm +111 -exec otool -l {} \; | grep -A3 -E 'LC_BUILD_VERSION|LC_VERSION_MIN'
open "$APP"
```

**Web baseline.** Set Vite's `build.target` to `safari16.4` (done; it was `es2022`). Load polyfills for Iterator helpers, `Promise.try` and ReadableStream async iteration before any other code, and test AI streaming early.

**SSH and SFTP.** Build on russh and russh-sftp, with the crypto backend rustls already uses so only one compiles. A [community Terax SSH preview](https://github.com/crynta/terax-ai/issues/1276) covers similar ground, but it lists only Windows and states no license. Treat it as design input until its license is confirmed.

**Database.** Use sqlx with rustls, and reuse russh for tunnels. Page results in Rust, because [Tauri's JSON IPC gets costly with large lists](https://lilting.ch/en/articles/tauri-sftp-client-research).

**In-app browser.** Keep the child WKWebView, use a non-persistent data store, allow only http and https, and grant its window label no Tauri capabilities. Do not add CEF: it [adds about 170 MB](https://hackernews-dynamic.seasondane.workers.dev/news/48279242), and Chromium itself has already moved past Monterey.

**AI agent.** The built-in panel runs in the app, so it does not depend on agent binaries. For CLI agents, install a pinned version locally, with auto-update off. Running a current agent over SSH on a Linux host is the durable path.

```bash
curl -fsSL https://claude.ai/install.sh | bash -s <version>
export DISABLE_AUTOUPDATER=1
```

Reports conflict on the last working Claude Code version, so find it on the reference Mac. The variable name above is from memory; verify it against current docs.

**Independent development.** Estate started from Terax 0.9.0 and is developed from there on its own, for older macOS. It has no `upstream` remote, and later Terax releases are not merged or ported: Terax targets macOS 13 and later, so its future changes are not relevant to Estate. Put new tools in separate modules so the code stays easy to reason about.

## Setup: Git, repository and authorship

Install Git from Apple's Command Line Tools, clone the fork, and set ygreat as the only author of every new commit.

**1. Install Git and build tools.** Run this, then accept the installer prompt:

```bash
xcode-select --install
git --version
```

If the installer says no compatible tools are available, sign in at Apple's [developer downloads](https://developer.apple.com/download/all/) and install the newest Command Line Tools for Monterey. That is version 14.2, which needs macOS 12.5 or later. Avoid Homebrew as the first choice, since it treats Monterey on Intel as Tier 3.

**2. Install Rust, Node and pnpm.** Use Node 22, because Node 24 requires macOS 13.5:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add x86_64-apple-darwin

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
nvm install 22
npm install -g pnpm
```

**3. Set your identity before any commit.** This email will be visible in the public commit history:

```bash
git config --global user.name "ygreat"
git config --global user.email "ygreatto@gmail.com"
```

**4. Set up the repository.** Done on 9 November 2026. `ygreat/estate` exists on GitHub and is empty; the older GitHub fork `ygreat/terax-ai` is separate and unchanged. The local folder already held upstream `main` at `a2c0877`, so it was turned into a repository in place:

```bash
cd estate
git init -b main
git remote add origin https://github.com/ygreat/estate.git
git remote add upstream https://github.com/crynta/terax-ai.git
git fetch upstream
git reset upstream/main          # index only; working files unchanged
git config user.name "ygreat"
git config user.email "ygreatto@gmail.com"
```

Afterwards the `upstream` remote was removed (`git remote remove upstream`). `main` on ygreat/estate is the only working branch, and Terax is not tracked. Commit `a2c0877` (Terax 0.9.0 plus 50 commits) is Estate's starting point.

Still to do: publish with `git push -u origin main`. Because `ygreat/estate` is not a GitHub fork, GitHub shows no "forked from" link, so the README must name Terax as the origin (see Licensing). Archive or delete `ygreat/terax-ai` once Estate is pushed, to avoid two copies.

Pushing needs a GitHub login. Use a personal access token as the HTTPS password, or add an SSH key and run `git remote set-url origin git@github.com:ygreat/estate.git`.

**5. Block co-author lines.** Installed and tested on 9 November 2026. On a new clone, save this as `.git/hooks/commit-msg`, then run `chmod +x .git/hooks/commit-msg`:

```bash
#!/bin/sh
if grep -qi '^co-authored-by:' "$1"; then
  echo "Commit rejected: co-author lines are not allowed." >&2
  exit 1
fi
if [ "$(git config user.name)" != "ygreat" ]; then
  echo "Commit rejected: author must be ygreat." >&2
  exit 1
fi
```

In your IDE, turn off any AI co-author or attribution setting too, and add this rule to its project instructions: every commit is authored by ygreat, with no co-author trailer or AI attribution.

**6. Verify authorship.** This should print one line, your identity:

```bash
git log --format='%an <%ae>' a2c0877..HEAD | sort -u
```

**Authorship scope.** The rule covers all Estate work. Upstream commits keep their original authors, so GitHub's contributor list will still show upstream contributors. The license and copyright notices stay in place either way.

## Licensing

Estate stays under Apache-2.0, the license of its base, [Terax](https://github.com/crynta/terax-ai), and must keep Terax's notices even though its name and branding are removed.

| [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) term | What Estate does |
| --- | --- |
| 4(a) Give recipients a copy of the license | Keep `LICENSE` at the repository root, and include it in the DMG and the app's About screen. |
| 4(b) Mark modified files | Add a one-line notice to each changed upstream file. Files that cannot hold comments, such as JSON, are listed in `MODIFICATIONS.md`. |
| 4(c) Keep existing notices | Keep all copyright, patent, trademark and attribution notices in the source. The rebrand must not remove them. |
| 4(d) Carry the NOTICE file | If upstream has a `NOTICE` file, keep its attributions in Estate's `NOTICE`. |
| 4, closing paragraph: your own copyright | ygreat may add a copyright statement covering Estate's changes, beside Terax's. |
| 6 Trademarks | Use the Terax name only to describe where the code came from. Do not imply endorsement. |
| 7 and 8 No warranty or liability | State in the README that Estate is provided as is. |

Create a `NOTICE` file like this, copying the Terax copyright line exactly from upstream:

```text
Estate
Copyright 2026 ygreat

This product is derived from Terax (https://github.com/crynta/terax-ai),
licensed under the Apache License, Version 2.0.
<Copy upstream's copyright line and NOTICE contents here>
```

Use this notice on modified files, in each language's comment style:

```text
Modified by ygreat for Estate, 2026. Originally part of Terax.
```

**README line:** "Estate is an independent project derived from Terax. It is not affiliated with or endorsed by the Terax project."

**Third-party code.** Dependencies keep their own licenses. The source tree also contains code under other licenses, with its own license files that must stay (MIT for xterm.js, Ghostty, restty and ghostty-core; several licenses for Nerd Fonts): `src/modules/terminal/ghostty/webgl/LICENSE.xterm-js`, `packages/ghostty-core/adapted/LICENSE.ghostty`, `packages/ghostty-core/adapted/LICENSE.restty`, `packages/ghostty-core/LICENSE` and `src/assets/fonts/LICENSE.nerd-fonts`, plus whatever `public/licenses` holds. Generate a list for the About screen with `pnpm licenses list` and a Cargo license tool such as `cargo-about`. Code copied from another project, such as a database client, needs that project's license and notices too.

The license requires keeping file notices, and it does not address Git commit history.

- [x] Phase 0: confirm the fork's `LICENSE` and look for `NOTICE`. Root `LICENSE` is Apache-2.0, with no upstream `NOTICE`; the parts under other licenses are listed under Third-party code.
- [ ] Phase 3: confirm `LICENSE`, `NOTICE`, `MODIFICATIONS.md` and the third-party list ship in the release.

This is a working summary and not legal advice.

## Milestones and verification

The work runs in four phases, and Gate 1 is the go or no-go point for the whole approach.

&#91;embedded content: delivery roadmap · 4 phases, 3 gates, not to scale\]

If Gate 1 fails on a native dependency that cannot be patched, stop and reassess before building anything further.

**Release checklist**, run on the reference Mac for every build:

- [ ] DMG installs and Estate launches from a clean user account.
- [ ] The binary check shows no minimum above macOS 12.0.
- [ ] vim, htop and tmux render correctly in WebGL mode on the reference Mac, and in WebGPU mode on a macOS 13 or later smoke-test Mac when one is available.
- [ ] An SSH session runs vim, and a changed host key is rejected until confirmed.
- [ ] A large SFTP transfer completes and can be cancelled.
- [ ] PostgreSQL, MySQL and SQLite connect; a destructive query asks for confirmation.
- [ ] A file is edited and saved, then committed and pushed from the Git panel.
- [ ] The AI panel streams a reply and applies an approved edit.
- [ ] A pinned CLI agent runs locally, and a current one runs over SSH.
- [ ] A Vite app loads in the in-app browser, which cannot call Tauri commands.
- [ ] A network capture shows no telemetry.
- [ ] The updater offers only ygreat/estate releases, or is off.
- [ ] The authorship command prints only ygreat.
- [ ] Success metrics are measured and recorded.

## Risks and open questions

The largest risks are vendors dropping Monterey and a WebKit that will never be patched again.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| A CLI agent ships a build that aborts on Monterey | Agent stops launching after an update | Pin versions, turn off auto-update, use FR-16; run current agents over SSH |
| WebKit stays at Safari 17.6 permanently | New web APIs break the UI; browser pages carry unpatched flaws | Polyfills, FR-2 check, isolated browser pane, local-first use |
| A Rust or npm dependency needs macOS 13 | Launch or build failure | Lock versions; launch every build on the reference Mac |
| Rust and GitHub reduce Intel support | Toolchain bugs; no hosted Intel runner after fall 2027 | Pin Rust; keep the reference Mac as the build machine |
| Sign-in pages reject the embedded browser | OAuth flows fail in the pane | Open-externally button; hand off to the system browser |
| WebGL2 renders poorly on the old GPU | Missing text or heavy battery use; there is no renderer below WebGL2 | Test in Phase 0; FR-6 context-loss recovery; build FR-6a only if needed |
| WebGPU never available on Monterey | The less-tested WebGL2 path is the only one Estate users run | Treat WebGL2 as primary; measure it against the Success metrics |
| Remote output attacks the app | Local files or commands exposed | Treat PTY data as untrusted; retest upstream's fix over SSH |
| A flaw in the Terax 0.9.0 code Estate started from | Known flaw stays open in Estate | Estate owns that code now: review it as Estate's own, and fix reported issues in Estate |

**Open questions**

- [ ] Which Claude Code version is the last to launch on the reference Mac? One report stops at 2.1.252, and another ran 2.1.258. Test in Phase 2.
- [ ] Do Rolldown, Lightning CSS and Tailwind's native engine run on Monterey? Test in Phase 0.
- [ ] Does WebGPU stay unavailable in Monterey's WKWebView, and does the WebGL2 fallback meet the Success metrics on the reference GPU? Test in Phase 0.

**Decisions**

- Name and repository: Estate, at ygreat/estate.
- Stack: Tauri 2, Rust, one process, libghostty-vt (WebGL2 on Monterey), CodeMirror 6, russh, sqlx.
- Origin: started from Terax 0.9.0 (commit `a2c0877`); developed independently, with no `upstream` remote and no porting of later Terax changes. All work lands on `main` at ygreat/estate.
- Web floor: Safari 16.4, with the reference Mac on 17.6.
- Privacy: no telemetry.
- Distribution: open source under Apache-2.0, with no Apple notarization. The README tells users to clear the download quarantine after moving the app to Applications: `xattr -dr com.apple.quarantine /Applications/Estate.app`.

## Sources

Researched 9 November 2026. Sources are linked beside each finding. Three pages were read in full (the Rust blog post, the WKWebView-to-CEF article and the Terax SSH issue); the rest come from search extracts, so check any that drive a decision.
