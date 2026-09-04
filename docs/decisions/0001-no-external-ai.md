# Decision 0001: external AI unavailable

Status: accepted for D0–D2

The application registers only the deterministic briefing generator. Configuration validates `AI_MODE` as the literal value `disabled`; startup also refuses any other value. No AI SDK, provider host, key field, or outbound network adapter is included.

A future external adapter is a separate high-risk delivery requiring explicit founder privacy approval.
