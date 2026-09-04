# Privacy contract

- Runtime defaults bind to `127.0.0.1`, store data in an ignored explicit directory, disable telemetry, and reject every `AI_MODE` except `disabled`.
- No personal records, database files, cookies, password hashes, request bodies, prompts, provider payloads, or credentials belong in Git or logs.
- Owner setup is one-time and localhost-only. Sessions use random opaque tokens, store only SHA-256 token hashes, use HttpOnly/SameSite=Strict cookies, idle and absolute expiry, CSRF tokens, revocation, and generic login failure.
- Personal records are owner-scoped in tables and joins. Synthetic tests exercise cross-owner rejection even though the product permits one owner.
- External AI and provider egress are absent. Adding either requires a separate approved privacy decision, allowlisted egress, minimized inspectable payloads, and security review.
- SQLite/backups require volume encryption and restrictive host permissions in deployments. Use the online backup script; do not copy a live database file.
- Export and production deletion are later delivery phases and are not implied by this foundation.
