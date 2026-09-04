# Architecture

Lifemaxing is a single-process modular monolith: Next.js route handlers call application services, application services coordinate domain policy and ports, and infrastructure adapters implement SQLite, Argon2id sessions, configuration, and time.

```text
app -> application -> domain
          |
          v
    infrastructure adapters
```

The domain cannot import Next.js, Drizzle, environment configuration, or provider/network clients. Every personal row carries `owner_id`; repository/service operations require the authenticated owner ID. SQLite enables foreign keys, WAL, and a busy timeout. SQL migrations are ordered and transactional.

The D0/D1 schema includes owner credentials/sessions, character aspects, North Stars, chapters/milestones, guardrails, check-ins, quests/outcomes, deterministic briefings, and stable later-phase evidence/progression/review/privacy records. Provider-neutral observations use typed value columns, provenance, quality, source revision idempotency, and correction/deletion lifecycle fields.

Only one deterministic briefing generator exists. There is no external-AI implementation or runtime enablement path.
