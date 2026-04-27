# ihelped.ai Deploy Access Allowlist

Live nginx on `calmerapy` now matches repo intent with a map include, but the include path is `/etc/nginx/snippets/ihelped-allowlist.conf` (not `/etc/nginx/conf.d/...`). Do not put raw allowlist entries in `/etc/nginx/conf.d` because `/etc/nginx/nginx.conf` includes `conf.d/*.conf` at `http{}` scope; raw `<ip> 1;` map entries would be invalid there.

On 2026-04-26, remote site config `/etc/nginx/sites-available/ihelped.ai.conf` was synced to the repo nginx config with CSP enabled for public/API/admin locations and HTTP/2 enabled via the backwards-compatible `listen 443 ssl http2;` form (kept in lockstep with distro nginx ≥ 1.18 so the standalone `http2 on;` 1.25.1+ directive is not required). Backups created:

- `/etc/nginx/sites-available/ihelped.ai.conf.bak-codex-20260426151649`
- `/etc/nginx/sites-available/ihelped.ai.conf.bak-codex-20260426151716`

Current allowlist snippet:

- `195.244.212.162  1;`
- `104.30.165.193   1;`
- `178.208.215.209  1;`
- `109.74.199.233  1;` (calmerapy public IPv4, so public-domain self-health checks do not hairpin into a 403)

Verification:

- `sudo nginx -t` passed before reload; remaining warnings belong to other hosted sites/certs.
- `systemctl is-active nginx` and `systemctl is-active ihelped-api` both returned `active`.
- `https://ihelped.ai/api/health` returned HTTP 200 with `{ "ok": true, "version": "fa31aec" }` and now includes `Content-Security-Policy`.
- On 2026-04-26, backup `/etc/nginx/snippets/ihelped-allowlist.conf.bak-codex-20260426213752` was created, `109.74.199.233  1;` was appended, `sudo nginx -t` passed, nginx reloaded, and `curl -4 --http1.1 https://ihelped.ai/api/health` from calmerapy returned HTTP 200 with CSP/HSTS headers and `{ "ok": true, "version": "cf41c2c-dirty" }`.
