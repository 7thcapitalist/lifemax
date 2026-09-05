# Architecture

## Current

- Next.js 16.3.3 (App Router)
- React 19.2
- TypeScript
- Tailwind CSS 4
- Client-side mock state

## Why web/PWA first

The long-term product may deserve native mobile apps because health and notification integrations matter. The first risk, however, is product psychology—not native APIs. A responsive PWA makes the core game loop cheap to iterate.

## Future shape

- `app/`: routes and server boundaries
- `components/`: UI and interaction
- `lib/`: domain model and services
- `data/`: temporary fixtures; later replaced by repositories
- `docs/`: source of truth for product and architecture

## Likely later services

- Postgres for profile, quest, event, and reflection data
- OAuth connector layer for external evidence
- Background ingestion jobs
- AI orchestration layer that receives normalized evidence, not unrestricted raw account access

## Data principle

Store the minimum raw sensitive data necessary. Prefer normalized facts such as “workout completed” or “sleep duration” over retaining entire upstream payloads when possible.
