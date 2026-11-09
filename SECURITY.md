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

If the issue comes from code Estate shares with Terax, it may affect Terax too. Tell us in the report, and we'll coordinate disclosure with the Terax maintainers.

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

- **Secrets** (API keys, SSH passphrases, database passwords) live in the macOS Keychain, not on disk, not in `localStorage`, not in logs.
- **No telemetry.** Estate only talks to the network when you ask it to: AI requests, SSH and database connections, update checks, and pages you open in the browser.
- **AI tool approval.** File writes and shell commands from the agent need your approval before they run, on local and remote hosts.
- **Host key checks.** An unknown or changed SSH host key needs your confirmation.
- **Destructive SQL guard.** `DROP`, `DELETE`, `TRUNCATE` and `ALTER` need confirmation, and connections can be read-only.
- **Isolated browser.** The in-app browser webview has no access to Tauri commands.
- **No Node in the renderer.** The frontend reaches the host only through allow-listed Tauri commands.
- **Signed updates.** Updates are verified before they're applied.

## What we can't promise

- **macOS 12 no longer gets security updates.** Apple's last Monterey update was in July 2024, and its WebKit will not be patched again. Don't use the in-app browser for banking or personal accounts, and keep browsing to local development servers and sites you trust.
- Estate runs whatever you (or the agent) tell it to run, with your permissions. That's what a terminal does.
- Treat output from remote hosts as untrusted. Estate does, but connect only to servers you trust.
- AI providers see whatever you send them. Read their retention policies.
- Local and LAN model endpoints (LM Studio, Ollama, OpenAI-compatible servers) are trusted at the network level. Only point Estate at servers you control.
