# Architecture

Lifemaxing is a single-process modular monolith: Next.js route handlers call application services, application services coordinate domain policy and ports, and infrastructure adapters implement SQLite, Argon2id sessions, configuration, and time.

```text
app -> application -> domain
          |
          v
    infrastructure adapters
```

The domain cannot import Next.js, Drizzle, environment configuration, or provider/network clients. Every personal row carries `owner_id`; repository/service operations require the authenticated owner ID. SQLite enables foreign keys, WAL, and a busy timeout. SQL migrations are ordered and transactional. Ordinary record deletion remains subject to append-only triggers. The future delete-all operation must use the dedicated privacy deletion port, whose connection-scoped guard is enabled only around one owner-delete transaction and is reset in a `finally` block.

The D0/D1 schema includes owner credentials/sessions, character aspects, North Stars, chapters/milestones, guardrails, check-ins, quests/outcomes, and deterministic briefings. Evidence, evidence links, the XP ledger, and provider-neutral observations remain pre-created only because D0 now enforces their owner-safe and append-only contracts; mutable XP projection, level candidates, weekly reviews, generation runs, and privacy operations are deliberately deferred until their delivery migrations. SQL migrations and Drizzle declarations cover the same tables and columns.

Only one deterministic briefing generator exists. Configuration accepts only `AI_MODE=disabled`; there is no external-AI dependency, implementation, credential, provider configuration, egress call, or runtime enablement path.

Application services depend on owner/session repository and transaction ports. SQLite adapters live in infrastructure, while route handlers assemble runtime dependencies. Sessions use atomic compare-and-swap token rotation, a 30-minute idle limit capped by a 12-hour absolute expiry, and route-level cookie/Origin/CSRF controls. SQLite atomically rotates the current token and retains at most three prior generations, each with a 10-second, eight-use grace solely for already in-flight requests. Prior-token requests do not rotate or emit a cookie, so cross-generation delayed arrivals authenticate without allowing out-of-order responses to restore an old token. Expiry and revocation are checked while atomically consuming a prior-token use. Login throttling is source-scoped so one caller cannot lock out the owner; a TLS reverse proxy must replace client-supplied forwarding headers before the app trusts them for this boundary.
