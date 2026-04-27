#!/usr/bin/env bash
# ihelped.ai — run certbot once DNS points at the server, then swap in the
# HTTPS nginx config. Idempotent: re-running just renews / reinstalls.
#
# Pre-conditions:
#   - DNS A records for ihelped.ai and www.ihelped.ai point at this server's
#     public IP.
#   - deploy/bootstrap.sh has run (so nginx is serving HTTP and the target
#     HTTPS config is staged at /etc/nginx/sites-available/ihelped.ai.target.conf).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ -f "${REPO_ROOT}/.env.deploy" ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/.env.deploy"
  set +o allexport
fi

HOST="${IHELPED_DEPLOY_HOST:-calmerapy}"
CERTBOT_EMAIL="${IHELPED_CERTBOT_EMAIL:-admin@ihelped.ai}"

echo "[tls] running certbot on ${HOST} (email: ${CERTBOT_EMAIL})"
ssh "${HOST}" sudo sh -s -- "${CERTBOT_EMAIL}" <<'REMOTE_SCRIPT'
set -eu
email="$1"

# Sanity: DNS must resolve here. certbot will fail loudly if not, but we
# pre-check so the failure mode is readable.
server_ip="$(curl -s https://api.ipify.org)"
for host in ihelped.ai www.ihelped.ai; do
  resolved="$(dig +short "${host}" A | head -n 1 || true)"
  if [ "${resolved}" != "${server_ip}" ]; then
    echo "[remote] DNS check failed: ${host} -> '${resolved}', expected '${server_ip}'" >&2
    echo "[remote] update the A record at your registrar and re-run." >&2
    exit 1
  fi
done

echo "[remote] DNS verified; invoking certbot"
certbot --nginx \
  --non-interactive --agree-tos --email "${email}" \
  --redirect \
  -d ihelped.ai -d www.ihelped.ai

echo "[remote] swap to hand-curated HTTPS config"
if [ -f /etc/nginx/sites-available/ihelped.ai.target.conf ]; then
  install -m 0644 /etc/nginx/sites-available/ihelped.ai.target.conf \
                  /etc/nginx/sites-available/ihelped.ai.conf
  nginx -t
  nginx -s reload
fi

echo "[remote] tls-setup complete."
REMOTE_SCRIPT

echo "[tls] done — remove IHELPED_HEALTH_URL from .env.deploy to enable HTTPS health checks."
