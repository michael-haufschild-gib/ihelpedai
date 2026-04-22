#!/usr/bin/env bash
# ihelped.ai — deploy to calmerapy.
# Assumes: (1) SSH key already set up for the `calmerapy` host alias,
#          (2) target dirs exist on the server, (3) systemd unit installed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Workstation-local deploy config (SSH host, remote root, health URL override).
# Committed template at .env.deploy.example; real values in .env.deploy (gitignored).
if [[ -f "${REPO_ROOT}/.env.deploy" ]]; then
  set -o allexport
  # shellcheck disable=SC1091  # sourced at runtime
  source "${REPO_ROOT}/.env.deploy"
  set +o allexport
fi

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
# Runtime resolves schema relative to server/dist/store/, which lands at
# server/deploy/schema/. Keep the target in sync with sqlite-store.ts.
rsync -az --delete \
  deploy/schema/   "${HOST}:${REMOTE_ROOT}/server/deploy/schema/"
# Ship lockfile + manifest so the server can reproduce the prod dep tree.
# `pnpm install --prod --frozen-lockfile` rebuilds native bindings (better-sqlite3,
# bcrypt) against the server's libc and architecture.
rsync -az package.json pnpm-lock.yaml "${HOST}:${REMOTE_ROOT}/"

echo "[deploy] installing runtime deps on ${HOST}"
ssh "${HOST}" "cd ${REMOTE_ROOT} && pnpm install --prod --frozen-lockfile --config.confirmModulesPurge=false"

echo "[deploy] chown ${REMOTE_ROOT} to www-data"
ssh "${HOST}" "chown -R www-data:www-data ${REMOTE_ROOT}"

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

# Default verifies through nginx at HTTPS, pinning the SNI/Host to localhost so
# it does not depend on public DNS. Override before certbot has been run with:
#   IHELPED_HEALTH_URL=http://127.0.0.1:3001/api/health
HEALTH_URL="${IHELPED_HEALTH_URL:---resolve ihelped.ai:443:127.0.0.1 https://ihelped.ai/api/health}"
echo "[deploy] verifying health endpoint: ${HEALTH_URL}"
# shellcheck disable=SC2029  # intentional: expand HEALTH_URL locally
ssh "${HOST}" "curl --fail --silent --show-error --max-time 5 --retry 5 --retry-delay 1 --retry-all-errors ${HEALTH_URL} >/dev/null"

echo "[deploy] done"
