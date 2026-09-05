# LifeMax Decision Log

## LFX-2026-001 — No external AI or provider egress through D2

- Date: 2026-09 (accepted for D0–D2; exact acceptance date not recorded)
- Status: Accepted
- Decision: The application registers only a deterministic local briefing
  generator. `AI_MODE` is validated as the literal value `disabled`; startup
  refuses any other value. No AI SDK, provider host, key field, or outbound
  network adapter is included in the codebase.
- Rationale: Privacy is part of the product (see VISION.md), and personal
  behavioral data should not leave the machine by default. A future external
  AI adapter is a real product decision, not a default to slip in.
- Consequences: Any future external AI/provider integration is a separate,
  explicit, high-risk delivery requiring founder privacy approval before it
  is built — not a routine feature PR.
- Links: `docs/decisions/0001-no-external-ai.md`, `docs/privacy-contract.md`
  (both in the app repo).

## LFX-2026-002 — Runtime and data-handling privacy contract

- Date: 2026-09 (exact acceptance date not recorded)
- Status: Accepted
- Decision: Runtime defaults bind to `127.0.0.1` only, store data in an
  ignored explicit directory, disable telemetry by default, and reject any
  `AI_MODE` other than `disabled`. No personal records, database files,
  cookies, password hashes, request bodies, or credentials may be committed
  to git or written to logs. Owner setup is disabled by default and only
  opens a short, explicitly-enabled, direct-loopback provisioning window.
  Sessions use random opaque tokens (SHA-256 hashes stored, not raw tokens),
  rotate after authenticated requests, and cookies are
  HttpOnly/SameSite=Strict (Secure on HTTPS).
- Rationale: The data here is personal and behavioral; the product's whole
  premise depends on that staying private and locally controlled.
- Consequences: Any change that would relax these defaults (binding beyond
  localhost, enabling telemetry, weakening session/cookie handling) needs a
  new decision here, not a quiet config change.
- Links: `docs/privacy-contract.md` (in the app repo).
