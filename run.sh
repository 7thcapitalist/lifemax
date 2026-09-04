#!/usr/bin/env sh
set -eu

export NEXT_TELEMETRY_DISABLED=1
: "${HOST:=127.0.0.1}"
: "${PORT:=3000}"
: "${DATABASE_PATH:=./data/lifemaxing.sqlite}"
: "${AI_MODE:=disabled}"

if [ "$AI_MODE" != "disabled" ]; then
  echo "Refusing to start: external AI is not available in this release." >&2
  exit 1
fi

mkdir -p "$(dirname "$DATABASE_PATH")"
chmod 700 "$(dirname "$DATABASE_PATH")"
pnpm db:migrate
exec pnpm next start -H "$HOST" -p "$PORT"
