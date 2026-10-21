#!/bin/sh
# Production build served locally (no dev overlay) for screenshots and Lighthouse.
set -e
cd "$(dirname "$0")/.."
npx next build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/
cd .next/standalone
rm -f .env
set -a; . ../../.env; set +a
SHIELD_DB_PATH=../../data/shield.db PORT=${PORT:-3300} HOSTNAME=127.0.0.1 exec node server.js
