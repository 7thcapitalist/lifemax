# LifeMax Agent Instructions

Read `docs/PRODUCT.md` before making product decisions, `docs/ARCHITECTURE.md` before architecture changes, and `docs/STATE.md` at the start of every new work session.

## Mission
Build LifeMax as a character operating system: the user plays their real life as a multidimensional RPG. Optimize for a product people want to use, not a maximal feature checklist.

## Non-negotiables
- Never create a universal “life score.”
- Relationships, recovery, and Life Lived are as legitimate as productivity and money.
- AI acts as a game master: it interprets evidence, proposes quests, notices imbalance, and explains recommendations.
- The user has final control over goals, domains, and recommendations.
- Treat health and financial data as sensitive. Minimize collection and never commit secrets.
- Do not add a third-party dependency unless it clearly reduces complexity.

## Engineering
- TypeScript, strict mode.
- Prefer small composable React components.
- Keep domain concepts typed in `lib/` rather than buried in UI strings.
- Keep external-provider code behind adapters so integrations are replaceable.
- Run `npm run typecheck` and `npm run build` before claiming a change is finished once dependencies are installed.
- Update docs when a product or architecture decision changes.
- Update `docs/STATE.md` after meaningful work so another coding agent can continue cleanly.

## Workflow
For significant features: explain the intended user behavior first, implement the smallest coherent version, verify it, then note the next experiment.
