# Privacy contract

- Runtime defaults bind to `127.0.0.1`, store data in an ignored explicit directory, disable telemetry, and reject every `AI_MODE` except `disabled`.
- No personal records, database files, cookies, password hashes, request bodies, prompts, provider payloads, or credentials belong in Git or logs.
- Owner setup is disabled by default and requires a short, explicitly enabled, direct-loopback provisioning window with exact host and Origin checks; close the window immediately after the database accepts its one owner. Never proxy or tunnel setup. Sessions use random opaque tokens, store only SHA-256 token hashes, rotate after authenticated requests, use HttpOnly/SameSite=Strict cookies (Secure on HTTPS), idle and absolute expiry, CSRF tokens, revocation, generic login failure, and bounded login attempts.
- Personal records are owner-scoped in tables and joins. Synthetic tests exercise cross-owner rejection even though the product permits one owner.
- External AI and provider egress are absent. Adding either requires a separate approved privacy decision, allowlisted egress, minimized inspectable payloads, and security review.
- SQLite/backups require volume encryption and restrictive host permissions in deployments. Use the online backup command and the read-only restore integrity command; do not copy a live database file. Backup targets must be new, must not alias the source or traverse symlink parents, and are forced to mode 0600.
- Export and production deletion are later delivery phases and are not implied by this foundation.
