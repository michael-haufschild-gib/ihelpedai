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

resolve_app_version() {
  if [[ -n "${IHELPED_APP_VERSION:-}" ]]; then
    printf '%s\n' "${IHELPED_APP_VERSION}"
    return
  fi

  local version
  version="$(git rev-parse --short HEAD)"
  if ! git diff --quiet ||
    ! git diff --cached --quiet ||
    [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    version="${version}-dirty"
  fi
  printf '%s\n' "${version}"
}

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

APP_VERSION="$(resolve_app_version)"
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

echo "[deploy] applying MySQL schema upgrades when configured"
ssh "${HOST}" sh -s -- "${REMOTE_ROOT}" "${ENV_FILE}" <<'REMOTE_SCRIPT'
set -eu

remote_root="$1"
env_file="$2"
schema_path="${remote_root}/server/deploy/schema/001-init.mysql.sql"

if [ ! -f "$env_file" ]; then
  echo "[deploy] ${env_file} not present; skipping schema upgrade"
  exit 0
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

if [ "${STORE:-}" != "mysql" ]; then
  echo "[deploy] STORE is not mysql; skipping schema upgrade"
  exit 0
fi
if [ -z "${MYSQL_URL:-}" ]; then
  echo "[deploy] STORE=mysql but MYSQL_URL is empty" >&2
  exit 1
fi
if [ ! -f "$schema_path" ]; then
  echo "[deploy] schema file missing at ${schema_path}" >&2
  exit 1
fi

db_user="$(node -e 'const u = new URL(process.env.MYSQL_URL); process.stdout.write(decodeURIComponent(u.username));')"
db_pass="$(node -e 'const u = new URL(process.env.MYSQL_URL); process.stdout.write(decodeURIComponent(u.password));')"
db_host="$(node -e 'const u = new URL(process.env.MYSQL_URL); process.stdout.write(u.hostname || "localhost");')"
db_port="$(node -e 'const u = new URL(process.env.MYSQL_URL); process.stdout.write(u.port || "3306");')"
db_name="$(node -e 'const u = new URL(process.env.MYSQL_URL); process.stdout.write(u.pathname.replace(/^\//, ""));')"

if [ -z "$db_user" ] || [ -z "$db_name" ]; then
  echo "[deploy] MYSQL_URL must include user and database name" >&2
  exit 1
fi

MYSQL_PWD="$db_pass"
export MYSQL_PWD
mysql -h "$db_host" -P "$db_port" -u "$db_user" "$db_name" < "$schema_path"
REMOTE_SCRIPT

echo "[deploy] restarting systemd unit and reloading nginx"
ssh "${HOST}" 'sudo systemctl restart ihelped-api && sudo nginx -s reload'

# Default verifies through nginx at HTTPS, pinning the SNI/Host to localhost so
# it does not depend on public DNS. Override before certbot has been run with:
#   IHELPED_HEALTH_URL=http://127.0.0.1:3001/api/health
#   IHELPED_HEALTH_CURL_OPTS=''    # unset the default --resolve flag when pre-TLS
HEALTH_URL="${IHELPED_HEALTH_URL:-https://ihelped.ai/api/health}"
HEALTH_CURL_OPTS="${IHELPED_HEALTH_CURL_OPTS:---resolve ihelped.ai:443:127.0.0.1}"
echo "[deploy] verifying health endpoint: ${HEALTH_URL}"
# shellcheck disable=SC2029  # intentional: expand variables locally
ssh "${HOST}" "curl --fail --silent --show-error --max-time 5 --retry 5 --retry-delay 1 --retry-all-errors ${HEALTH_CURL_OPTS} ${HEALTH_URL} >/dev/null"

echo "[deploy] done"
