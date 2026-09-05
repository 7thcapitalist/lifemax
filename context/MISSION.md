# Mission

## Right now, we are

Getting the real backend working end to end — authentication, persistence,
onboarding, and the core game loop (character sheet, quests, chronicle, a
daily "today" view) — on top of the privacy/security foundation
(`task/d0-foundation`), so the founder can actually use LifeMax daily instead
of it staying a mock-data prototype. This is the transition from the original
v0 prototype (client-side mock state only, no backend) to a real, tested,
locally-run application.

## Success looks like

- The app runs locally end to end (auth → onboarding → character/quests/
  chronicle/today) with `pnpm verify` green (lint, typecheck, unit,
  integration, architecture tests, build).
- The founder uses it personally for 7 consecutive days and it feels useful
  enough to want to keep opening it — not something kept out of guilt.
- No external AI calls and no telemetry happen unless `AI_MODE` and the
  telemetry flag are deliberately turned on (both default to disabled).

## Explicitly not this quarter

- Calendar, GitHub, health-provider, or finance-aggregation integrations
  (Phase 2 in the original roadmap).
- An AI game master beyond scripted/local logic.
- Notifications.
- Any move toward "5 friends use it for 2 weeks" or a company decision — that
  is explicitly a later-phase product test, not now.
