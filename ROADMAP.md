<!-- Modified by ygreat for Estate, 2026. Originally part of Terax. -->
# Roadmap

Estate's direction, what's planned, and what's deliberately out of scope. The full product requirements are in [PRD Estate.md](PRD%20Estate.md). For day-to-day work, see [GitHub Issues](https://github.com/ygreat/estate/issues).

## What Estate is

A focused developer workspace with seven tools (terminal, SSH/SFTP, database browser, editor, AI agent, in-app browser and Git) that runs on Intel Macs with macOS 12 Monterey and sends no telemetry. It is built on Tauri 2 and Rust. Estate started from Terax 0.9.0 (commit `a2c0877`, 6 November 2026) and is developed independently from there, for older macOS. Later Terax releases are not merged or ported.

The first release succeeds when one x86_64 build launches on Monterey and all seven tools complete a real work session on the reference Mac (15-inch 2015 MacBook Pro, macOS 12.7, Safari 17.6).

## Principles

1. **Compatibility first.** A change that breaks launch on Monterey does not ship. Every binary declares macOS 12.0 or lower; the web floor is Safari 16.4.
2. **Seven tools, no more.** Features outside them are removed or left dormant, not extended.
3. **Light on old hardware.** No continuous redraw or polling while idle; the terminal's WebGL2 path is treated as primary.
4. **Private by default.** No telemetry. Secrets live in the Keychain.
5. **Safe with untrusted input.** Remote terminal output, database results and web pages are treated as hostile.

## Starting point: Terax 0.9.0

These came with the Terax 0.9.0 code Estate started from, and need verifying on Monterey:

- Terminal: tabs, splits, shell integration, libghostty-vt with WebGPU and a WebGL2 fallback
- Editor: CodeMirror 6, file explorer, AI edit diffs, opt-in language servers
- AI agent: BYOK providers, local and LAN endpoints, approval-gated tools, Claude Code orchestration in a terminal
- In-app browser: local dev server and external URL preview in a child webview
- Git: source control panel, hunk staging, history graph
- Keychain storage for API keys

## Phase 0: Prove the base on Monterey

- [x] Set up ygreat/estate from Terax 0.9.0 (commit `a2c0877`) and confirm licensing
- [x] Pin the Rust toolchain (1.99.1)
- [x] Rename to Estate: product name, bundle identifier `io.github.ygreat.estate`, minimum macOS `12.0`
- [x] Point the updater at ygreat/estate and stop checking for updates at launch
- [ ] Give the updater Estate's own signing key, or turn it off
- [x] Set the Vite build target to `safari16.4`
- [ ] Add polyfills for Iterator helpers, `Promise.try` and ReadableStream async iteration, and test AI streaming
- [x] Build an x86_64 DMG whose binaries declare macOS 12.0 (built on a macOS 15.7 Intel Mac, 9 November 2026)
- [ ] Build on the reference Mac and confirm the build tools (Rolldown, Lightning CSS, Tailwind) run on Monterey
- [ ] Launch on macOS 12.7 from a clean install with no dyld errors
- [ ] Measure the WebGL2 terminal on the reference GPU
- [ ] **Gate 1:** go or no-go for the whole approach

## Phase 1: Core tools on Monterey

- [ ] Show a clear message instead of a blank window when WebKit is older than Safari 16.4
- [ ] Remove Terax branding from the UI
- [ ] Confirm no telemetry with a network capture
- [ ] Terminal: vim, htop and tmux render and resize correctly
- [ ] Terminal: automatic WebGPU-to-WebGL2 fallback and recovery from WebGL2 context loss
- [ ] Editor, Git and the built-in AI agent work under Safari 17.6
- [ ] In-app browser: no Tauri command access, warning bar on external sites

## Workspace and agents (built ahead of the phases)

- [x] Split view of tabs, saved per project (up to four panes)
- [x] Sidebar on the right by default, configurable
- [x] Chat mode for Claude Code and Codex (tested), Gemini CLI and OpenCode (built from published formats, untested)
- [ ] Verify split view and chat mode on the reference Mac

## Phase 2: New tools

- [ ] SSH: saved hosts, `~/.ssh/config` import, key/agent/password login, host key checks
- [ ] SFTP: browse, upload, download, rename, delete; open remote files in the editor; cancellable transfers
- [ ] Database: PostgreSQL, MySQL/MariaDB and SQLite, directly or over SSH, with passwords in the Keychain
- [ ] Database: schema tree, SQL editor, paged results grid, destructive-statement guard and read-only connections
- [ ] AI agent: CLI agents in local and SSH terminals with pinned versions
- [ ] Find the last Claude Code version that launches on the reference Mac

## Phase 3: First release

- [ ] Run the full release checklist on the reference Mac
- [ ] Ship `LICENSE`, `NOTICE`, `MODIFICATIONS.md` and a third-party license list in the release
- [ ] Publish a DMG on GitHub Releases

## Later

- SSH jump hosts and local port forwarding
- Agent compatibility check: list installed agents, versions and whether they launch
- Git over SSH sessions
- A last-resort non-GPU terminal renderer, only if WebGL2 fails on the reference GPU

## Out of scope

- Apple Silicon builds. Terax already serves those Macs.
- macOS below 12, and Windows or Linux packaging.
- Features outside the seven tools, such as voice input and custom backgrounds.
- Local model inference on the Intel Mac. Remote or LAN endpoints are supported.
- A bundled Chromium or other browser engine.
- Making a CLI agent run on Monterey after its vendor has dropped it.
- A separate background daemon in the first release.
