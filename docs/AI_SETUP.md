# AI Coding Setup

The goal is to let Cursor, Codex, and Claude Code work on the same repository without creating three separate versions of the product context.

## Shared context
- `docs/PRODUCT.md` — what the product is and is not
- `docs/ARCHITECTURE.md` — technical boundaries
- `docs/ROADMAP.md` — product sequence
- `docs/STATE.md` — current handoff between coding sessions
- `AGENTS.md` — shared coding-agent contract

## Cursor
Open the repository folder in Cursor. The repo includes `.cursor/rules/core.mdc`; Cursor also supports `AGENTS.md` and `CLAUDE.md` as project instructions.

Recommended first prompt:
> Read AGENTS.md, docs/PRODUCT.md, docs/STATE.md, and the current dashboard. Do not code yet. Tell me the single highest-leverage next product experiment and why.

## Codex
Install the Codex CLI if needed:
```bash
npm i -g @openai/codex
```
Then, from the repository root:
```bash
codex
```
Sign in with your ChatGPT account when prompted. Codex uses `AGENTS.md` for repository instructions.

Recommended first prompt:
> Read AGENTS.md and docs/STATE.md. Implement the next unchecked Phase 0 task with the smallest coherent diff. Verify it and update docs/STATE.md.

## Claude Code
Install Claude Code if needed:
```bash
npm install -g @anthropic-ai/claude-code
```
Then, from the repository root:
```bash
claude
```
Claude Code reads `CLAUDE.md` automatically.

Recommended first prompt:
> Read CLAUDE.md, AGENTS.md, docs/PRODUCT.md, and docs/STATE.md. Critique the current product loop before proposing code. Then implement only the strongest improvement.

## Working across all three
Do not ask multiple agents to edit the same feature simultaneously on the same branch. Give each agent a branch/worktree or a distinct task.

For every meaningful session:
1. Start by reading `docs/STATE.md`.
2. Keep the change scoped to one hypothesis.
3. Run verification when dependencies are installed.
4. Update `docs/STATE.md` with what changed, what was learned, and the next best task.
5. Commit with a descriptive message.
