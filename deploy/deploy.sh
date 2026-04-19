#!/usr/bin/env bash
# ihelped.ai — deploy to calmerapy.
# Assumes: (1) SSH key already set up for the `calmerapy` host alias,
#          (2) target dirs exist on the server, (3) systemd unit installed.

set -euo pipefail

HOST="${IHELPED_DEPLOY_HOST:-calmerapy}"
REMOTE_ROOT="${IHELPED_DEPLOY_ROOT:-/var/www/ihelped.ai}"

echo "[deploy] building frontend + server"
pnpm build
pnpm build:server

echo "[deploy] rsyncing to ${HOST}:${REMOTE_ROOT}"
rsync -az --delete \
  dist/            "${HOST}:${REMOTE_ROOT}/dist/"
rsync -az --delete \
  server/dist/     "${HOST}:${REMOTE_ROOT}/server/dist/"
rsync -az --delete \
  deploy/schema/   "${HOST}:${REMOTE_ROOT}/schema/"

echo "[deploy] restarting systemd unit and reloading nginx"
ssh "${HOST}" 'sudo systemctl restart ihelped-api && sudo nginx -s reload'

echo "[deploy] done"
