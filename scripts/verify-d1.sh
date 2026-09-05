#!/usr/bin/env bash
# Full D1 gate: install, verify, e2e journeys, screenshots/axe.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f .write-test _extract_docs.py
corepack pnpm install
corepack pnpm exec playwright install chromium
corepack pnpm verify
corepack pnpm test:e2e
corepack pnpm test:e2e:screenshots
