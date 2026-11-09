<!-- Modified by ygreat for Estate, 2026. Originally part of Terax. -->
# Contributing to Estate

Estate is a solo-maintained hard fork of Terax with a narrow goal: a seven-tool developer workspace that runs on Intel Macs with macOS 12 Monterey and sends no telemetry. Contributions are welcome, but **fit with that goal matters more than volume**.

This document helps you decide *whether* and *how* to contribute so the work is likely to be merged.

## How this project is run

- Estate has one maintainer ([@ygreat](https://github.com/ygreat)).
- Review time is limited.
- A technically correct change can still be declined if it does not serve the goal. A "no" on a PR is not personal.
- For scope and direction, read [ROADMAP.md](ROADMAP.md) before opening anything non-trivial.

## Estate and Terax

Estate is an independent project derived from [Terax](https://github.com/crynta/terax-ai). It is not affiliated with or endorsed by the Terax project.

- Estate does not track Terax. There is no upstream remote, and Terax changes are ported by hand when they matter to Estate.
- Report Estate bugs here, not to Terax. If a bug also exists in Terax, you may report it there too, but don't ask Terax maintainers to support Estate.
- If you port a Terax fix, link the upstream commit or PR in your PR description and confirm it still works on macOS 12, since Terax targets macOS 13 and later.

## Quick start

```bash
pnpm install
pnpm tauri dev
```

Prerequisites: Rust (the version pinned in `rust-toolchain.toml`), Node 22, pnpm, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for macOS. Use Node 22, not 24: Node 24 requires macOS 13.5.

To build the release target on an Intel Mac:

```bash
export MACOSX_DEPLOYMENT_TARGET=12.0
pnpm install --frozen-lockfile
pnpm tauri build --target x86_64-apple-darwin
```

For the architecture, read [TERAX.md](TERAX.md) (the living architecture doc; the file keeps its upstream name because the app loads it as agent memory) and the [docs index](docs/README.md).

## Where to discuss

Use [GitHub Issues](https://github.com/ygreat/estate/issues) for bugs, feature proposals and "should I work on X?" questions.

## What makes a good contribution

These get merged fastest:

- **Bug fixes** with clear reproduction steps, especially Monterey or Intel-specific ones.
- **Compatibility fixes** that remove a dependency on macOS 13 or a web API newer than Safari 16.4.
- **Docs, typos and small UX fixes**. Open a PR directly.
- **Pre-discussed features** that were agreed in an issue first.
- **Small, focused changes** that are easy to review.

If your change is small and obvious, open a PR directly. No issue required.

## Keep changes focused

**Only change what is needed for your stated goal.**

If you're fixing a bug in one file, don't also:

- Reformat other files
- Clean up unrelated code
- Fix lint issues in files you didn't need to touch
- Combine several unrelated fixes in one PR

**One PR = one logical change.** Multi-concern PRs will be asked to split.

## Discuss first (required for larger changes)

Open an issue and agree on the approach before writing a PR for:

- New features, including work on the SSH/SFTP and database tools
- UI/UX changes or changes to default behavior
- Refactors or "cleanup" work
- Performance rewrites or architectural changes
- New dependencies, Rust or npm
- New AI providers
- Anything touching many files or systems

Large unsolicited PRs will be closed without detailed review.

## Compatibility rules

Compatibility comes first: a change that breaks launch on Monterey does not ship.

- **Binary floor:** every executable and bundled library must declare macOS 12.0 or lower and reference no newer system symbols. A declared minimum is not proof; the build has to launch on macOS 12.
- **Web floor:** Safari 16.4. A newer web API needs a polyfill or a feature check.
- **Terminal renderer:** on Monterey the terminal runs on the WebGL2 fallback. Treat that path as primary, not as an afterthought.
- **No telemetry:** no analytics, crash upload or usage ping. Network calls happen only for user-started actions.
- **Secrets** (API keys, SSH passphrases, database passwords) stay in the Keychain, never in files or `localStorage`.

If you can't test on macOS 12 Intel, say so in the PR. The maintainer will test it on the reference Mac.

## Quality bar

Every PR is reviewed against:

- `pnpm lint` clean
- `pnpm check-types` clean
- `pnpm test` clean
- `cargo clippy --all-targets --locked -- -D warnings` clean
- `cargo nextest run --locked` clean (or `cargo test --locked`)
- `cargo fmt` applied before pushing
- No performance regressions in hot paths: terminal renderer, PTY stream, AI streaming, source control, file explorer
- No continuous redraw or polling while idle or in hidden panels; the reference machine is a 2015 laptop on battery
- No new heavy dependencies (over 50 KB gzip in the client bundle, over 5 MB compiled on the Rust side) without justification
- Security review for changes to the AI tool surface, file system access, network paths, IPC commands and the in-app browser

## Changes to core subsystems require a test

The most common way a PR breaks this codebase is a **local fix with global blast radius**: the diff solves one case, reads fine, passes type-check and clippy, and silently breaks the same subsystem in every other case. Review alone does not catch these. A test does.

If your change touches behavior in any of these paths, the PR must add or extend a test that locks the invariant you rely on:

- **Shell/terminal spawn**: which shell launches, with which cwd, env and login flags.
- **Workspace authorization**: which directories spawns, git and AI tools may operate in. Both the allow and the deny side.
- **Git command layer**: repo-root resolution, pathspec/argument guards, status parsing.
- **Filesystem mutation**: atomic writes, symlink handling, no data loss on partial failure.
- **IPC command surface and AI tool surface**: anything the webview or the agent can invoke.
- **SSH and database connections**: host key checks, credential handling, destructive-statement guards.
- **Pure logic with wide reach**: cwd inheritance, tab/split tree transforms, OSC/prompt parsing, the command guard.

The test must cover the contract, not be a placeholder. Test the case that would actually break: the edge, the deny path, the "one level above home". See [docs/contributing/testing.md](docs/contributing/testing.md).

UI rendering, themes, syntax-highlight tables and anything the type-checker already guarantees do not need tests.

## What Estate is not

- Not a general IDE. Estate ships seven tools: terminal, SSH/SFTP, database browser, editor, AI agent, in-app browser and Git.
- Not for Apple Silicon. Terax already serves those Macs.
- Not targeting macOS below 12, and not changing Windows or Linux packaging.
- Not bundling Chromium or any other browser engine.
- Not running local model inference on the Intel Mac. Remote or LAN endpoints are supported.
- Not adding features outside the seven tools, such as voice input or custom backgrounds.
- Mechanical refactors, broad style changes and drive-by rewrites are not helpful.
- AI-assisted contributions are welcome, but the PR must show you understand the existing patterns. Generated code the author clearly didn't read will be closed.

## Branches

Branch off `main` in your fork. Use these prefixes (kebab-case):

| Prefix      | Use for                                 |
| ----------- | --------------------------------------- |
| `feat/`     | New feature                             |
| `fix/`      | Bug fix                                 |
| `chore/`    | Refactor, tooling, config, dependencies |
| `docs/`     | Docs-only changes                       |
| `perf/`     | Performance work                        |
| `security/` | Security fix or hardening               |

Examples: `feat/sftp-upload`, `fix/webgl-context-loss`, `security/browser-isolation`.

Don't open PRs from your fork's `main` branch.

## Commits and PRs

The **PR title becomes the squash commit**. It must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(ssh): import hosts from ~/.ssh/config
fix(terminal): recover from WebGL context loss
chore(deps): pin russh
security(browser): deny Tauri commands in the browser webview
```

Types: `feat`, `fix`, `chore`, `docs`, `perf`, `refactor`, `test`, `build`, `ci`, `security`.

Common scopes: `terminal`, `ssh`, `sftp`, `db`, `editor`, `explorer`, `pty`, `ai`, `agents`, `browser`, `git`, `settings`, `tabs`, `ui`, `macos`, `updater`.

Commit messages inside a PR can be free-form; they get squashed.

**Fill out the PR template**: what changed, why, how you tested. Screenshots or GIFs for UI changes. Say which macOS version and Mac you tested on.

**Open a draft PR early** if you want feedback mid-flight.

### What gets bounced back

- Mixed-concern PRs
- Large architectural PRs without prior discussion
- New dependencies without justification
- Anything that raises the macOS or Safari floor
- Breaking changes without migration notes
- Incidental reformatting unrelated to the change

## Code style

- Follow existing patterns. Read two or three nearby files before adding new ones.
- TypeScript: no `any` unless you mean it. Strict mode is on.
- Rust: `cargo fmt` and `clippy` clean.
- Comments explain *why*, not *what*. No multi-paragraph docstrings.
- No emojis in code or commit messages.
- American English in user-facing strings.
- Put new tools (SSH/SFTP, database) in their own modules rather than spreading them through existing ones.

## Licensing of changes to upstream files

Estate keeps Terax's Apache-2.0 license and notices. When you change a file that came from Terax:

- Don't remove existing copyright, license or attribution notices.
- Add this one-line notice near the top, in the file's comment style, if it isn't already there:

  ```
  Modified by ygreat for Estate, 2026. Originally part of Terax.
  ```

- For files that can't hold comments, such as JSON, add the path to `MODIFICATIONS.md`.

Code copied from another project must keep that project's license and notices.

## FAQ

**Should I ask before fixing a typo or obvious bug?**
No, open a PR directly.

**I have an idea for a new feature.**
Open an issue first. Check it against "What Estate is not" above.

**My PR was closed without detailed feedback.**
Usually it didn't fit the project's direction, or the scope was too large to review. You're welcome to reopen with a smaller scope.

**Can I work on an open issue?**
Comment first to confirm it's still relevant and nobody else is on it.

**I don't have a Monterey Mac. Can I still contribute?**
Yes. Say what you tested on, and the maintainer will check it on the reference Mac.

**Why did my PR for a new AI provider get closed?**
The `openai-compatible` provider and OpenRouter cover most providers. A new built-in provider needs to add something they can't.

## Security issues

Don't file them as public issues. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree your work is licensed under [Apache-2.0](LICENSE). No CLA required.
