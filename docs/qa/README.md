# D1 QA evidence

Responsive screenshots from Playwright land here as:

- `today-320.png`, `today-390.png`, `today-768.png`, `today-1440.png`
- `character-320.png`, `character-390.png`, `character-768.png`, `character-1440.png`

```sh
bash scripts/verify-d1.sh
# or separately:
corepack pnpm test:e2e
corepack pnpm test:e2e:screenshots
```

Suggested commit message:

```
Add D1 playable UI, Playwright/axe E2E, and responsive screenshots.

Ship the quiet morning-ritual surfaces (setup through Today/Character/Chronicle), synthetic seed helpers, and browser QA evidence while keeping D0 privacy invariants and excluding XP, AI egress, and integrations.
```
