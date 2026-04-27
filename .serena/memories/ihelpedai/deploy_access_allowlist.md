# ihelped.ai Deploy Access Allowlist

Live nginx on `calmerapy` now matches repo intent with a map include, but the include path is `/etc/nginx/snippets/ihelped-allowlist.conf` (not `/etc/nginx/conf.d/...`). Do not put raw allowlist entries in `/etc/nginx/conf.d` because `/etc/nginx/nginx.conf` includes `conf.d/*.conf` at `http{}` scope; raw `<ip> 1;` map entries would be invalid there.

On 2026-04-26, remote site config `/etc/nginx/sites-available/ihelped.ai.conf` was synced to the repo nginx config with CSP enabled for public/API/admin locations and HTTP/2 enabled via the backwards-compatible `listen 443 ssl http2;` form (kept in lockstep with distro nginx ≥ 1.18 so the standalone `http2 on;` 1.25.1+ directive is not required). Backups created:

- `/etc/nginx/sites-available/ihelped.ai.conf.bak-codex-20260426151649`
- `/etc/nginx/sites-available/ihelped.ai.conf.bak-codex-20260426151716`

## Where allowlisted IPs live

Allowlisted IPs are operational access-control data; they live ONLY on the
server at `/etc/nginx/snippets/ihelped-allowlist.conf` (one `<ip>  1;`
entry per line) and are deliberately NOT tracked in this repo. Do not paste
individual addresses into git — keep this file as a procedure reference,
not a snapshot.

Special case: the calmerapy public IPv4 stays in the snippet so that
self-health checks against the public domain don't hairpin into a 403.

## Update / verify procedure

1. SSH to calmerapy.
2. `sudo cp /etc/nginx/snippets/ihelped-allowlist.conf{,.bak-$(date +%Y%m%d%H%M%S)}`.
3. Edit `/etc/nginx/snippets/ihelped-allowlist.conf`; add or remove a
   single `<ip>  1;` line.
4. `sudo nginx -t` to validate. Proceed only if it exits 0. The only
   warnings safe to ignore are clearly identified certificate warnings
   referencing other vhosts; any error, syntax issue, or warning naming
   `ihelped.ai` aborts the procedure — restore the backup and re-run.
   Restore command (replace `<timestamp>` with the suffix from step 2):
   ```sh
   sudo cp /etc/nginx/snippets/ihelped-allowlist.conf.bak-<timestamp> \
           /etc/nginx/snippets/ihelped-allowlist.conf
   sudo nginx -t
   ```
5. Only after step 4 exited 0: `sudo systemctl reload nginx`; confirm
   `systemctl is-active nginx` and `systemctl is-active ihelped-api`
   both report `active`.
6. From calmerapy, run both curls — the default-protocol check confirms
   HTTP/2 is actually negotiated (matching the listen-line `http2`
   directive), and the `--http1.1` check exercises the fallback path:
   ```sh
   curl -4 https://ihelped.ai/api/health             # negotiates h2
   curl -4 --http1.1 https://ihelped.ai/api/health   # explicit fallback
   ```
   Both should return HTTP 200 with `Content-Security-Policy` and
   `Strict-Transport-Security` headers and a JSON body that includes
   `"ok": true`.
