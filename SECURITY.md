<!-- Modified by ygreat for Estate, 2026. Originally part of Terax. -->
# Security

Estate runs shells, opens SSH sessions, connects to databases, reads and writes files, and talks to AI providers, so security bugs matter. If you find one, please tell us before posting it publicly.

## Reporting

Report vulnerabilities privately through GitHub: [open a security advisory](https://github.com/ygreat/estate/security/advisories/new). Include:

- What the issue is and what it lets an attacker do
- Steps to reproduce (a small proof of concept helps)
- Estate version, macOS version and Mac model

You'll get a reply within a few days. Once it's fixed, you'll be credited in the release notes unless you'd rather stay anonymous.

Please **don't** open a public issue for security reports.

Estate started from Terax 0.9.0 and is developed independently, so Estate fixes its own copy of that code. If an issue may also affect Terax, say so in the report, and we'll let the Terax maintainers know before it's made public.

## Supported versions

Until `1.0.0`, only the latest release gets security fixes. See [Releases](https://github.com/ygreat/estate/releases).

## In scope

- The Rust backend in `src-tauri/` (PTY, SSH/SFTP, database, file system, IPC, plugins)
- The frontend in `src/`, anywhere untrusted input lands: terminal output (local or remote), file contents, database results, AI tool results, credentials
- The in-app browser's isolation from the app
- Release artifacts on the GitHub Releases page
- The auto-updater

## Out of scope

- Bugs in dependencies (Tauri, CodeMirror, AI SDKs, and so on). Report those to the project concerned; we'll ship the fix once it's released.
- Vulnerabilities in macOS 12 itself or its WebKit, which Apple no longer patches. See "What we can't promise".
- Anything that needs an already compromised machine or a local attacker with shell access.

## What we do to keep things safe

Estate is in early development. This section separates what the code does today from what is planned.

**Today**

- **API keys** live in the macOS Keychain, not on disk, not in `localStorage`, not in logs.
- **No telemetry.** Estate only talks to the network when you ask it to: AI requests, update checks you start, and pages you open in the browser.
- **AI tool approval.** File writes and shell commands from the agent need your approval before they run.
- **No Node in the renderer.** The frontend reaches the host only through allow-listed Tauri commands.
- **No automatic updates.** Estate checks for updates only when you choose to. It has no signed releases yet, so no update can be installed until Estate publishes releases signed with its own key.

**Planned, not built yet**

- SSH passphrases and database passwords stored in the Keychain.
- Host key checks: an unknown or changed SSH host key needs your confirmation.
- A guard on destructive SQL: `DROP`, `DELETE`, `TRUNCATE` and `ALTER` need confirmation, and connections can be read-only.
- Agent approval on remote hosts, with the same rules as local.
- A verified isolated browser: the in-app browser webview gets no access to Tauri commands, and external sites show a warning bar.
- Signed updates, verified before they're applied.

## What we can't promise

- **macOS 12 no longer gets security updates.** Apple's last Monterey update was in July 2024, and its WebKit will not be patched again. Don't use the in-app browser for banking or personal accounts, and keep browsing to local development servers and sites you trust.
- Estate runs whatever you (or the agent) tell it to run, with your permissions. That's what a terminal does.
- Treat output from remote hosts as untrusted. Estate does, but connect only to servers you trust.
- AI providers see whatever you send them. Read their retention policies.
- Local and LAN model endpoints (LM Studio, Ollama, OpenAI-compatible servers) are trusted at the network level. Only point Estate at servers you control.
