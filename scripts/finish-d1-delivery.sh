#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f _extract_docs.py .write-test docs/qa/.agent-tmp cursor-cli-override.json
corepack pnpm install
corepack pnpm exec playwright install chromium
corepack pnpm format
corepack pnpm verify
corepack pnpm test:e2e
corepack pnpm test:e2e:screenshots
git add -A
git status
git log -5 --oneline
git commit -m "$(cat <<'EOF'
Add D1 playable morning UI on secure D0 foundation.

Ship setup/sign-in/onboarding and Today/Character/Chronicle with
persistent planning APIs, deterministic briefing, Playwright/axe
coverage, and responsive visual evidence.
EOF
)"
git status
git rev-parse HEAD
