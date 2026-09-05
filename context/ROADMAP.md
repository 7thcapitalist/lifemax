# Roadmap

## Current milestone

D1: the playable core loop on a real backend — character sheet, weekly
quests, chronicle, and a daily "today" view, backed by real auth, persistence
(SQLite via Drizzle), and onboarding, built on the D0 privacy/security
foundation. Built, not yet daily-driven: the founder has not yet run this
personally for a stretch of real days. No named blocker beyond that.

## Next

- Run the app locally after install and fix any remaining build/type issues.
- Use it personally for 7 days; record what is actually useful vs.
  performative (per the original v0 experiment plan).
- Add a lightweight weekly review flow.
- Define XP rules that resist gaming (open question, unresolved).
- A basic AI game master — kept behind `AI_MODE` (disabled by default) until
  this is a deliberate decision, not a silent default.

## Later

- Evidence-layer integrations: Google Calendar, GitHub (builder evidence),
  a health-provider feasibility spike, a finance-aggregation feasibility
  spike, manual evidence upload/check-in.
- An intelligence layer: detect imbalance over time, adaptive quest
  generation, personal pattern memory, explainable recommendations, and the
  ability to reject/override the model.

## Deferred / explicitly not doing

- A product test with outside users ("5 friends for 2 weeks") — premature
  before the founder has used it personally.
- Deciding whether this stays personal software or becomes a company —
  explicitly deferred until after real personal use.
- Notifications, social features, a public leaderboard, or one universal
  life score — see VISION.md non-goals.
