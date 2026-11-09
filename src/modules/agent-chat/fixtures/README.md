# Agent chat fixtures

Output of each agent's headless JSON mode, used by the adapter tests.

- `claude-*.jsonl`, `codex-*.jsonl`: recorded from Claude Code 2.1.319 and Codex 0.164.0 on 9 November 2026 with a one-line prompt in an empty folder, then stripped to the fields the adapters read (user hooks, MCP/plugin config, account fields and local paths removed).
- `gemini-synthetic.jsonl`, `opencode-synthetic.jsonl`: written by hand from the published stream formats (Gemini CLI `--output-format stream-json`, `opencode run --format json`). Neither CLI was installed when these were made; replace them with recordings when possible.
- `claude-history.jsonl`: the main-thread user and assistant lines of the same recorded Claude Code session as saved under `~/.claude/projects/`, including a `/context` command, stripped the same way.
