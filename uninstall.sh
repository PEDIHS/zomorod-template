#!/usr/bin/env bash
# Deliberately keeps PasarGuard users, subscriptions, database, and Zomorod user data.
set -Eeuo pipefail

usage() { echo 'Usage: sudo zomorod uninstall [--yes]'; }
[[ ${EUID} -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }
case "${1:-}" in --yes) ;; -h|--help) usage; exit 0 ;; *) echo 'Explicit --yes required; use the zomorod CLI to confirm.' >&2; exit 2 ;; esac
[[ $# -eq 1 ]] || { usage >&2; exit 2; }

ZROOT=/opt/zomorod
PGROOT=/opt/pasarguard
DATA=/var/lib/pasarguard/zomorod
TEMPLATE=/var/lib/pasarguard/templates/subscription/index.html
ENV_FILE="$PGROOT/.env"
DEST="$DATA/uninstall-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
chmod 0700 "$DEST"
for pair in "$TEMPLATE:subscription-current.html" "$ENV_FILE:pasarguard.env" "$DATA/install-state.json:install-state.json"; do
  file="${pair%%:*}"; name="${pair#*:}"
  [[ ! -f "$file" ]] || cp -a "$file" "$DEST/$name"
done

# Stop Zomorod only. No other PasarGuard or HS-PG unit is touched.
if command -v systemctl >/dev/null 2>&1; then
  systemctl disable --now zomorod-integrator.path zomorod-integrator.timer \
    zomorod-panel-update.path >/dev/null 2>&1 || true
  systemctl stop zomorod-integrator.service zomorod-panel-update.service >/dev/null 2>&1 || true
fi

# Remove only exact Zomorod injection markers; never replace the whole dashboard.
strip_html() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  python3 - "$file" <<'PY'
from pathlib import Path
import re, sys
p=Path(sys.argv[1]); old=p.read_text(encoding='utf-8'); s=old
for marker in ('zomorod-special-loader','zomorod-pasarguard-theme-guard','zomorod-runtime-inline',
               'zomorod-runtime-boot-script','zomorod-pwa-loader','zomorod-theme-storage-isolation'):
    s=re.sub(r'\s*<script\b(?=[^>]*\bid=["\']'+re.escape(marker)+r'["\'])[^>]*>.*?</script>\s*','\n',s,flags=re.I|re.S)
s=re.sub(r'\s*<style\b(?=[^>]*\bid=["\']zomorod-runtime-boot-style["\'])[^>]*>.*?</style>\s*','\n',s,flags=re.I|re.S)
if s!=old: p.write_text(s,encoding='utf-8')
PY
}

strip_router() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  python3 - "$file" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]); old=p.read_text(encoding='utf-8'); s=old
s=re.sub(r'\n?# zomorod-admin-subscriptions-start\n.*?# zomorod-admin-subscriptions-end\n?', '\n', s, flags=re.S)
s=s.replace('for router in (([zomorod_admin_subscriptions.router] if zomorod_admin_subscriptions else []) + routers):','for router in routers:')
if s!=old: p.write_text(s,encoding='utf-8')
PY
  python3 -m py_compile "$file"
}

for base in "$PGROOT/dashboard/build" "$PGROOT/panel/dashboard/build"; do
  strip_html "$base/index.html"
  strip_html "$base/404.html"
  rm -f "$base/statics/zomorod-special.js"
done
for router in "$PGROOT/app/routers/__init__.py" "$PGROOT/panel/app/routers/__init__.py"; do
  strip_router "$router"
done
strip_html "$TEMPLATE"

# Dashboard/router inside the running container may not be host-mounted.
if command -v docker >/dev/null 2>&1 && [[ -f "$PGROOT/docker-compose.yml" ]]; then
  for service in pasarguard panel; do
    cid="$(docker compose -f "$PGROOT/docker-compose.yml" -p pasarguard ps -q "$service" 2>/dev/null || true)"
    [[ -n "$cid" ]] || continue
    # Reuse our exact marker-cleanup functions within the container.
    for file in /code/dashboard/build/index.html /code/dashboard/build/404.html \
      /app/dashboard/build/index.html /app/dashboard/build/404.html; do
      if docker exec "$cid" test -f "$file" >/dev/null 2>&1; then
        # The uninstaller applies a surgical sed-free Python cleanup in-place.
        docker exec -i "$cid" python3 - "$file" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]); old=p.read_text(); s=old
for marker in ('zomorod-special-loader','zomorod-pasarguard-theme-guard'):
    s=re.sub(r'\s*<script\b(?=[^>]*\bid=["\']'+marker+r'["\'])[^>]*>.*?</script>\s*','\n',s,flags=re.I|re.S)
if s!=old:p.write_text(s)
PY
      fi
    done
    for base in /code/dashboard/build /app/dashboard/build; do
      docker exec "$cid" rm -f "$base/statics/zomorod-special.js" >/dev/null 2>&1 || true
    done
    # Source modules become unregistered when the official panel restart runs.
    for base in /code/app/routers /app/app/routers; do
      docker exec "$cid" rm -f "$base/zomorod_admin_subscriptions.py" "$base/zomorod_pwa.py" >/dev/null 2>&1 || true
    done
    for router in /code/app/routers/__init__.py /app/app/routers/__init__.py; do
      if docker exec "$cid" test -f "$router" >/dev/null 2>&1; then
        docker exec -i "$cid" python3 - "$router" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]);old=p.read_text();s=re.sub(r'\n?# zomorod-admin-subscriptions-start\n.*?# zomorod-admin-subscriptions-end\n?','\n',old,flags=re.S)
s=s.replace('for router in (([zomorod_admin_subscriptions.router] if zomorod_admin_subscriptions else []) + routers):','for router in routers:')
if s!=old:p.write_text(s)
PY
      fi
    done
    break
  done
fi

# Only remove exact entries created by this installer; retain unrelated .env keys.
if [[ -f "$ENV_FILE" ]]; then
  python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]); old=p.read_text(); lines=[]
for line in old.splitlines(keepends=True):
    stripped=line.strip().replace("'",'"')
    if re.fullmatch(r'CUSTOM_TEMPLATES_DIRECTORY\s*=\s*"?/var/lib/pasarguard/templates/?"?',stripped):continue
    if re.fullmatch(r'SUBSCRIPTION_PAGE_TEMPLATE\s*=\s*"?subscription/index.html"?',stripped):continue
    match=re.match(r'^(\s*PYTHONPATH\s*=\s*)(.*?)(\r?\n)?$',line)
    if match:
        raw=match.group(2).strip().strip('"').strip("'")
        parts=[part for part in raw.split(':') if part and part!='/var/lib/pasarguard/zomorod/python']
        if len(parts)!=len([part for part in raw.split(':') if part]):
            if parts: line=match.group(1)+'"'+':'.join(parts)+'"'+(match.group(3) or '')
            else: continue
    lines.append(line)
new=''.join(lines)
if new!=old:p.write_text(new)
PY
fi

if command -v systemctl >/dev/null 2>&1; then
  rm -f /etc/systemd/system/zomorod-integrator.service /etc/systemd/system/zomorod-integrator.path \
    /etc/systemd/system/zomorod-integrator.timer /etc/systemd/system/zomorod-panel-update.service \
    /etc/systemd/system/zomorod-panel-update.path
  systemctl daemon-reload
fi

# Preserve historical backups and configuration, never blindly delete them.
if [[ -d "$ZROOT/backups" ]]; then mv "$ZROOT/backups" "$DEST/previous-backups"; fi
if [[ -d "$ZROOT" ]]; then rm -rf -- "$ZROOT"; fi
mv -f "$DATA/install-state.json" "$DEST/uninstalled-state.json" 2>/dev/null || true
rm -f /usr/local/bin/zomorod

if command -v pasarguard >/dev/null 2>&1; then
  echo '[Zomorod] Restarting PasarGuard through the official CLI to unload removed routes.'
  pasarguard restart --no-logs || { echo '[Zomorod] Panel restart failed; run: sudo pasarguard restart --no-logs' >&2; exit 1; }
else
  echo '[Zomorod] Please restart PasarGuard normally to unload removed routes.' >&2
fi
printf '[Zomorod] Uninstalled; all user data kept. Recovery backups: %s\n' "$DEST"
