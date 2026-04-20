#!/usr/bin/env bash
# ihelped.ai — deploy to calmerapy.
# Assumes: (1) SSH key already set up for the `calmerapy` host alias,
#          (2) target dirs exist on the server, (3) systemd unit installed.

set -euo pipefail

HOST="${IHELPED_DEPLOY_HOST:-calmerapy}"
REMOTE_ROOT="${IHELPED_DEPLOY_ROOT:-/var/www/ihelped.ai}"

# `rsync --delete` with a dangerous REMOTE_ROOT (empty or "/") would wipe the
# target host. Fail fast before any rsync touches the remote.
if [[ -z "${REMOTE_ROOT}" || "${REMOTE_ROOT}" == "/" || "${REMOTE_ROOT}" == "." ]]; then
  echo "[deploy] refusing to deploy: unsafe REMOTE_ROOT='${REMOTE_ROOT}'" >&2
  exit 1
fi

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

APP_VERSION="${IHELPED_APP_VERSION:-$(git rev-parse --short HEAD)}"
ENV_FILE="${IHELPED_REMOTE_ENV_FILE:-/etc/ihelped.env}"

echo "[deploy] publishing APP_VERSION=${APP_VERSION} to ${ENV_FILE}"
# Pass ENV_FILE and APP_VERSION as positional args so the remote shell never
# parses their literal contents — prevents injection from unusual values.
ssh "${HOST}" sudo sh -s -- "${ENV_FILE}" "${APP_VERSION}" <<'REMOTE_SCRIPT'
set -eu

env_file="$1"
app_version="$2"
if [ -f "$env_file" ]; then
  sed -i '/^APP_VERSION=/d' "$env_file"
fi
printf 'APP_VERSION=%s\n' "$app_version" >> "$env_file"
REMOTE_SCRIPT

echo "[deploy] restarting systemd unit and reloading nginx"
ssh "${HOST}" 'sudo systemctl restart ihelped-api && sudo nginx -s reload'

echo "[deploy] verifying health endpoint via nginx"
# Hit nginx (not the private Fastify port) so a bad nginx reload or broken
# /api/ proxy rule surfaces here instead of passing silently. `--resolve`
# pins the SNI/Host to localhost without relying on public DNS.
ssh "${HOST}" 'curl --fail --silent --show-error --max-time 5 --retry 5 --retry-delay 1 --retry-all-errors --resolve ihelped.ai:443:127.0.0.1 https://ihelped.ai/api/health >/dev/null'

echo "[deploy] done"
