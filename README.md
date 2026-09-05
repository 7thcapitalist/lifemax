# LifeMax

**Play your life. Build your character.**

LifeMax is an experimental character operating system: a personal dashboard where your real goals become quests, major life dimensions become character stats, and AI eventually acts as a game master that helps you progress without optimizing the life out of living.

## What exists now
The first build is deliberately small:
- multidimensional character sheet
- weekly quests
- quest completion
- balance warning
- weekly game-master reflection
- “Life Lived” side quest

No accounts are connected yet. v0 tests the core experience before integrations.

## Run locally
```bash
npm install
npm run dev
```
Then open `http://localhost:3000`.

## Build with AI coding tools
This repository is configured to keep different agents aligned:
- **Codex:** reads `AGENTS.md`
- **Claude Code:** reads `CLAUDE.md` (which points back to the shared contract)
- **Cursor:** reads `.cursor/rules/core.mdc`, and also supports `AGENTS.md` / `CLAUDE.md`

Start every substantial feature by reading `docs/PRODUCT.md`.

## Recommended first tasks
1. Make the dashboard feel irresistible to use daily.
2. Replace fixture identity with onboarding.
3. Persist quests and custom domains.
4. Build the Sunday weekly-review loop.
5. Only then add the first evidence integration.

See `docs/ROADMAP.md`.
