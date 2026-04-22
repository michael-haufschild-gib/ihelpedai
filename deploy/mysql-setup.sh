#!/usr/bin/env bash
# ihelped.ai — idempotent MySQL provisioning on calmerapy.
#
# Flow:
#   1. Parse MYSQL_URL from .env.deploy. Reject anything that points outside
#      127.0.0.1/localhost or names a system schema.
#   2. On the server, use Unix-socket root auth (sudo mysql) to ensure the
#      database exists and the scoped user has ALL PRIVILEGES on it.
#      ALTER USER is always issued so rotating the password here replaces the
#      server-side password on the next run.
#   3. Apply deploy/schema/001-init.mysql.sql as the scoped user (DDL only).
#   4. Rewrite /etc/ihelped.env: STORE=mysql, MYSQL_URL=..., remove SQLITE_PATH.
#   5. Restart ihelped-api and health-check.
#
# Safe to re-run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${REPO_ROOT}/.env.deploy" ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/.env.deploy"
  set +o allexport
fi

: "${MYSQL_URL:?MYSQL_URL must be set in .env.deploy}"
HOST="${IHELPED_DEPLOY_HOST:-calmerapy}"
ENV_FILE="${IHELPED_REMOTE_ENV_FILE:-/etc/ihelped.env}"

# Parse MYSQL_URL via Node so we don't hand-roll URL regex.
PARSED_JSON="$(node -e "
  const u = new URL(process.env.MYSQL_URL);
  process.stdout.write(JSON.stringify({
    user: decodeURIComponent(u.username),
    pass: decodeURIComponent(u.password),
    host: u.hostname,
    port: u.port || '3306',
    db:   u.pathname.replace(/^\//, ''),
  }));
")"
DB_USER="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).user)" "${PARSED_JSON}")"
DB_PASS="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).pass)" "${PARSED_JSON}")"
DB_HOST="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).host)" "${PARSED_JSON}")"
DB_NAME="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).db)"   "${PARSED_JSON}")"

# Guardrails — fail noisily rather than wipe a neighbour schema.
case "${DB_HOST}" in
  127.0.0.1|localhost) ;;
  *) echo "[mysql-setup] refusing: MYSQL_URL host '${DB_HOST}' must be 127.0.0.1 or localhost" >&2; exit 1 ;;
esac
case "${DB_NAME}" in
  ''|mysql|information_schema|performance_schema|sys)
    echo "[mysql-setup] refusing: database name '${DB_NAME}' is empty or a system schema" >&2; exit 1 ;;
esac
if ! [[ "${DB_NAME}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "[mysql-setup] refusing: database '${DB_NAME}' contains characters other than [A-Za-z0-9_-]" >&2; exit 1
fi
if ! [[ "${DB_USER}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "[mysql-setup] refusing: user '${DB_USER}' contains characters other than [A-Za-z0-9_-]" >&2; exit 1
fi
if [[ "${DB_PASS}" == *"'"* ]]; then
  echo "[mysql-setup] refusing: password contains a single-quote (would break IDENTIFIED BY quoting)" >&2; exit 1
fi

# Provision grants for both 'localhost' (Unix socket) and '127.0.0.1' (TCP) so
# whichever MYSQL_URL host the app ends up using resolves to a real account.
echo "[mysql-setup] provisioning ${DB_USER}@{localhost,127.0.0.1}/${DB_NAME} on ${HOST}"
ssh "${HOST}" sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

echo "[mysql-setup] applying schema"
# Ship the schema first (no secrets in argv) …
rsync -az "${SCRIPT_DIR}/schema/001-init.mysql.sql" "${HOST}:/tmp/ihelped-schema.sql"
# … then run mysql over ssh with the password delivered as a positional arg
# to the remote sh -s. MYSQL_PWD is only ever set inside the remote shell's
# env, so DB_PASS never shows up in either host's `ps` argv or the outer
# ssh command string.
ssh "${HOST}" sh -s -- "${DB_USER}" "${DB_NAME}" "${DB_PASS}" <<'REMOTE_SCRIPT'
set -eu
db_user="$1"
db_name="$2"
MYSQL_PWD="$3"
export MYSQL_PWD
mysql -u "$db_user" "$db_name" < /tmp/ihelped-schema.sql
rm -f /tmp/ihelped-schema.sql
REMOTE_SCRIPT

echo "[mysql-setup] updating ${ENV_FILE}: STORE=mysql, MYSQL_URL=..."
# Pass values via positional args so the remote shell does not parse the URL
# contents as shell syntax.
ssh "${HOST}" sudo sh -s -- "${ENV_FILE}" "${MYSQL_URL}" <<'REMOTE_SCRIPT'
set -eu
env_file="$1"
mysql_url="$2"

[ -f "$env_file" ] || { echo "[remote] ${env_file} not present; run deploy/bootstrap.sh first" >&2; exit 1; }

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
# Strip any existing STORE / MYSQL_URL / SQLITE_PATH lines; keep everything
# else as-is (IP_HASH_SALT, ADMIN_SESSION_SECRET, APP_VERSION, …). Use awk so
# this succeeds even if the env file only contained the filtered keys (grep -v
# with zero survivors would return 1 and abort under set -e).
awk '!/^(STORE|MYSQL_URL|SQLITE_PATH)=/' "$env_file" > "$tmp"
{
  printf 'STORE=mysql\n'
  printf 'MYSQL_URL=%s\n' "$mysql_url"
} >> "$tmp"
install -m 600 -o www-data -g www-data "$tmp" "$env_file"
REMOTE_SCRIPT

echo "[mysql-setup] restarting ihelped-api"
ssh "${HOST}" 'sudo systemctl restart ihelped-api'

echo "[mysql-setup] health check via nginx"
ssh "${HOST}" 'curl --fail --silent --show-error --max-time 5 --retry 10 --retry-delay 1 --retry-all-errors http://127.0.0.1:3001/api/health'
echo
echo "[mysql-setup] done."
