# LifeMax

A personal character-operating-system app: real-life progress becomes quests,
life domains become character stats, weekly reflection surfaces imbalance —
without reducing a person to one score. Single-owner, for the founder.

## Current status

Backend/core-loop built, not yet daily-driven. Authentication, persistence,
onboarding, and the core loop (character, quests, chronicle, a "today" view)
exist and are tested (`pnpm verify`), built on a privacy/security foundation.
The founder has not yet used it personally for a real stretch of days.

## Current phase

D1 — see ROADMAP.md "Current milestone."

## How work flows here

Real implementation work happens in git worktrees off task branches
(`task/d0-foundation`, `task/d1-playable`), not directly on `main`. An
agent's shell may be blocked from running installs/verify/commit directly in
a given worktree — see MEMORY.md. The original v0 prototype lives as a
separate, unrelated git history on GitHub (`7thcapitalist/lifemax`); this
repo's `context/` carries its product thinking forward, adapted to current
reality, not copied blindly.

## Map

- `VISION.md` — why this exists, the long bet, non-goals
- `MISSION.md` — what we are doing now and how we measure it
- `ROADMAP.md` — milestones and what is deferred
- `MEMORY.md` — hard-won facts
- `TECH_CONTEXT.md` — stack, constraints, "do not do"
- `USERS.md` — users and their sensitivities
- `COMPETITIVE_CONTEXT.md` — alternatives and our wedge
- `ownership.json` — the machine mirror
