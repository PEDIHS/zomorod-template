#!/usr/bin/env bash
set -euo pipefail

ZOMOROD_ROOT="${ZOMOROD_ROOT:-/opt/zomorod}"
PASARGUARD_ROOT="${PASARGUARD_ROOT:-/opt/pasarguard}"
SUB_TEMPLATE="${SUB_TEMPLATE:-/var/lib/pasarguard/templates/subscription/index.html}"
ADMIN_JS="${ZOMOROD_ROOT}/plugin/zomorod-special.js"
RUNTIME_JS="${ZOMOROD_ROOT}/plugin/zomorod-runtime.js"
BACKEND_PY="${ZOMOROD_ROOT}/backend/zomorod_admin_subscriptions.py"
COMPOSE_FILE="${PASARGUARD_ROOT}/docker-compose.yml"
COMPOSE_PROJECT="${PASARGUARD_COMPOSE_PROJECT:-pasarguard}"
MARKER_ADMIN="zomorod-special-loader"
MARKER_RUNTIME="zomorod-runtime-inline"
MARKER_THEME="zomorod-pasarguard-theme-guard"
ROUTER_MARKER="zomorod-admin-subscriptions"

log() { printf '[Zomorod] %s\n' "$*"; }
warn() { printf '[Zomorod] WARNING: %s\n' "$*" >&2; }

compose_available() { command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; }
admin_asset_version() { sha256sum "${ADMIN_JS}" | awk '{print substr($1,1,12)}'; }

detect_backend_service() {
  [[ -f "${COMPOSE_FILE}" ]] || return 1
  compose_available || return 1
  local services candidate rendered service
  services="$(docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" config --services 2>/dev/null || true)"
  for candidate in panel pasarguard; do
    if grep -Fxq "${candidate}" <<<"${services}"; then printf '%s\n' "${candidate}"; return 0; fi
  done
  rendered="$(docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" config 2>/dev/null || true)"
  service="$(awk '
    BEGIN { in_services=0; service=""; is_backend=0 }
    function flush() { if (service != "" && is_backend) { print service; exit } }
    /^services:[[:space:]]*$/ { in_services=1; next }
    in_services && /^[^[:space:]]/ { flush(); in_services=0; next }
    !in_services { next }
    /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ { flush(); service=$0; sub(/^  /,"",service); sub(/:[[:space:]]*$/,"",service); is_backend=0; next }
    /^[[:space:]]+image:[[:space:]]*pasarguard\/panel([:@].*)?$/ { is_backend=1; next }
    /^[[:space:]]+ROLE:[[:space:]]*backend([[:space:]]|$)/ { is_backend=1; next }
    /^[[:space:]]+-[[:space:]]*ROLE=backend([[:space:]]|$)/ { is_backend=1; next }
    END { flush() }
  ' <<<"${rendered}" | head -n 1)"
  [[ -n "${service}" ]] || return 1
  printf '%s\n' "${service}"
}

get_backend_container() {
  local service="$1" cid
  cid="$(docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" ps -q "${service}" 2>/dev/null || true)"
  [[ -n "${cid}" ]] || return 1
  [[ "$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || true)" == "true" ]] || return 1
  printf '%s\n' "${cid}"
}

find_dashboard_build() {
  local candidate
  for candidate in "${PASARGUARD_ROOT}/dashboard/build" "${PASARGUARD_ROOT}/panel/dashboard/build"; do
    if [[ -f "${candidate}/index.html" ]]; then printf '%s\n' "${candidate}"; return 0; fi
  done
  find "${PASARGUARD_ROOT}" -maxdepth 5 -type f -path '*/dashboard/build/index.html' -print -quit 2>/dev/null | sed 's#/index.html$##'
}

find_host_router_init() {
  local candidate
  for candidate in "${PASARGUARD_ROOT}/app/routers/__init__.py" "${PASARGUARD_ROOT}/panel/app/routers/__init__.py"; do
    if [[ -f "${candidate}" ]]; then printf '%s\n' "${candidate}"; return 0; fi
  done
  return 1
}

find_container_dashboard_build() {
  local cid="$1" candidate found
  for candidate in /code/dashboard/build /app/dashboard/build /opt/pasarguard/dashboard/build; do
    if docker exec "${cid}" test -f "${candidate}/index.html" >/dev/null 2>&1; then printf '%s\n' "${candidate}"; return 0; fi
  done
  found="$(docker exec "${cid}" sh -c "find /code /app /opt -maxdepth 5 -type f -path '*/dashboard/build/index.html' -print -quit 2>/dev/null" 2>/dev/null || true)"
  [[ -n "${found}" ]] || return 1
  printf '%s\n' "${found%/index.html}"
}

find_container_subscription_template() {
  local cid="$1" candidate found
  for candidate in /code/app/templates/subscription/index.html /app/app/templates/subscription/index.html /opt/pasarguard/app/templates/subscription/index.html; do
    if docker exec "${cid}" test -f "${candidate}" >/dev/null 2>&1; then printf '%s\n' "${candidate}"; return 0; fi
  done
  found="$(docker exec "${cid}" sh -c "find /code /app /opt -maxdepth 6 -type f -path '*/app/templates/subscription/index.html' -print -quit 2>/dev/null" 2>/dev/null || true)"
  [[ -n "${found}" ]] || return 1
  printf '%s\n' "${found}"
}

find_container_router_init() {
  local cid="$1" candidate found
  for candidate in /code/app/routers/__init__.py /app/app/routers/__init__.py /opt/pasarguard/app/routers/__init__.py; do
    if docker exec "${cid}" test -f "${candidate}" >/dev/null 2>&1; then printf '%s\n' "${candidate}"; return 0; fi
  done
  found="$(docker exec "${cid}" sh -c "find /code /app /opt -maxdepth 5 -type f -path '*/app/routers/__init__.py' -print -quit 2>/dev/null" 2>/dev/null || true)"
  [[ -n "${found}" ]] || return 1
  printf '%s\n' "${found}"
}

inject_theme_guard() {
  local html="$1"
  [[ -f "${html}" ]] || return 0
  python3 - "${html}" "${MARKER_THEME}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]; original=path.read_text(encoding="utf-8")
if f'id="{marker}"' in original: raise SystemExit(0)
guard=f'''<script id="{marker}">
(() => {{
  try {{
    const key='theme', backupKey='zomorod-pasarguard-theme';
    const valid=(v)=>['light','dark','system'].includes(v);
    const proto=Storage.prototype, nativeGet=proto.getItem, nativeSet=proto.setItem, nativeRemove=proto.removeItem;
    const saved=nativeGet.call(localStorage,backupKey), current=nativeGet.call(localStorage,key);
    if (valid(saved) && current!==saved) nativeSet.call(localStorage,key,saved);
    else if (!valid(saved) && valid(current)) nativeSet.call(localStorage,backupKey,current);
    proto.setItem=function(name,value){{ const result=nativeSet.call(this,name,value); if(this===localStorage&&name===key&&valid(String(value))) nativeSet.call(this,backupKey,String(value)); return result; }};
    proto.removeItem=function(name){{ const result=nativeRemove.call(this,name); if(this===localStorage&&name===key) nativeRemove.call(this,backupKey); return result; }};
  }} catch (_) {{}}
}})();
</script>'''
head=re.search(r'<head\b[^>]*>',original,flags=re.I)
html=original[:head.end()]+'\n'+guard+original[head.end():] if head else guard+'\n'+original
path.write_text(html,encoding="utf-8")
PY
}

inject_theme_guard_container() {
  local cid="$1" html="$2"
  docker exec "${cid}" test -f "${html}" >/dev/null 2>&1 || return 0
  docker exec -i "${cid}" python3 - "${html}" "${MARKER_THEME}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]; original=path.read_text(encoding="utf-8")
if f'id="{marker}"' in original: raise SystemExit(0)
guard=f'''<script id="{marker}">
(() => {{
  try {{
    const key='theme', backupKey='zomorod-pasarguard-theme';
    const valid=(v)=>['light','dark','system'].includes(v);
    const proto=Storage.prototype, nativeGet=proto.getItem, nativeSet=proto.setItem, nativeRemove=proto.removeItem;
    const saved=nativeGet.call(localStorage,backupKey), current=nativeGet.call(localStorage,key);
    if (valid(saved) && current!==saved) nativeSet.call(localStorage,key,saved);
    else if (!valid(saved) && valid(current)) nativeSet.call(localStorage,backupKey,current);
    proto.setItem=function(name,value){{ const result=nativeSet.call(this,name,value); if(this===localStorage&&name===key&&valid(String(value))) nativeSet.call(this,backupKey,String(value)); return result; }};
    proto.removeItem=function(name){{ const result=nativeRemove.call(this,name); if(this===localStorage&&name===key) nativeRemove.call(this,backupKey); return result; }};
  }} catch (_) {{}}
}})();
</script>'''
head=re.search(r'<head\b[^>]*>',original,flags=re.I)
html=original[:head.end()]+'\n'+guard+original[head.end():] if head else guard+'\n'+original
path.write_text(html,encoding="utf-8")
PY
}

inject_admin_loader() {
  local html="$1" version
  [[ -f "${html}" ]] || return 0
  version="$(admin_asset_version)"
  python3 - "${html}" "${MARKER_ADMIN}" "${version}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]; version=sys.argv[3]; original=path.read_text(encoding="utf-8")
tag=f'<script id="{marker}" src="/statics/zomorod-special.js?v={version}" defer></script>'
pattern=re.compile(rf'<script\s+id=["\']{re.escape(marker)}["\'][^>]*>\s*</script>',re.I)
if pattern.search(original): html=pattern.sub(tag,original,count=1)
elif '</body>' in original: html=original.replace('</body>',f'  {tag}\n</body>',1)
else: html=original+'\n'+tag+'\n'
if html!=original: path.write_text(html,encoding="utf-8")
PY
}

inject_admin_loader_container() {
  local cid="$1" html="$2" version
  docker exec "${cid}" test -f "${html}" >/dev/null 2>&1 || return 0
  version="$(admin_asset_version)"
  docker exec -i "${cid}" python3 - "${html}" "${MARKER_ADMIN}" "${version}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]; version=sys.argv[3]; original=path.read_text(encoding="utf-8")
tag=f'<script id="{marker}" src="/statics/zomorod-special.js?v={version}" defer></script>'
pattern=re.compile(rf'<script\s+id=["\']{re.escape(marker)}["\'][^>]*>\s*</script>',re.I)
if pattern.search(original): html=pattern.sub(tag,original,count=1)
elif '</body>' in original: html=original.replace('</body>',f'  {tag}\n</body>',1)
else: html=original+'\n'+tag+'\n'
if html!=original: path.write_text(html,encoding="utf-8")
PY
}

inject_subscription_runtime() {
  [[ -f "${SUB_TEMPLATE}" ]] || { warn "subscription template not found: ${SUB_TEMPLATE}"; return 1; }
  [[ -s "${RUNTIME_JS}" ]] || { warn "runtime JS not found: ${RUNTIME_JS}"; return 1; }
  python3 - "${SUB_TEMPLATE}" "${RUNTIME_JS}" "${MARKER_RUNTIME}" <<'PY'
from pathlib import Path
import re, sys
template_path=Path(sys.argv[1]); runtime_path=Path(sys.argv[2]); marker=sys.argv[3]
original=template_path.read_text(encoding="utf-8"); runtime=runtime_path.read_text(encoding="utf-8")
pattern=re.compile(rf'\s*<script id="{re.escape(marker)}">.*?</script>\s*',re.S)
html=pattern.sub('',original); block=f'\n<script id="{marker}">\n{runtime}\n</script>\n'
html=html.replace('</body>',block+'</body>',1) if '</body>' in html else html+block
if html!=original: template_path.write_text(html,encoding="utf-8")
PY
}

patch_router_file() {
  local file="$1"
  [[ -f "${file}" && -s "${BACKEND_PY}" ]] || return 1
  local target_dir="$(dirname "${file}")"
  install -m 0644 "${BACKEND_PY}" "${target_dir}/zomorod_admin_subscriptions.py"
  python3 - "${file}" "${ROUTER_MARKER}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]; original=path.read_text(encoding='utf-8'); text=original
text=re.sub(rf'\n?# {re.escape(marker)}-start.*?# {re.escape(marker)}-end\n?', '\n', text, flags=re.S)
text=text.replace('for router in (([zomorod_admin_subscriptions.router] if zomorod_admin_subscriptions else []) + routers):','for router in routers:')
if 'api_router = APIRouter()' not in text or 'for router in routers:' not in text:
    raise SystemExit('unsupported PasarGuard router layout')
block=f'''# {marker}-start\ntry:\n    from . import zomorod_admin_subscriptions\nexcept Exception:\n    zomorod_admin_subscriptions = None\n# {marker}-end\n\n'''
text=text.replace('api_router = APIRouter()',block+'api_router = APIRouter()',1)
text=text.replace('for router in routers:','for router in (([zomorod_admin_subscriptions.router] if zomorod_admin_subscriptions else []) + routers):',1)
if text!=original: path.write_text(text,encoding='utf-8')
PY
}

patch_router_container() {
  local cid="$1" file="$2" target_dir
  [[ -s "${BACKEND_PY}" ]] || return 1
  target_dir="${file%/__init__.py}"
  docker cp "${BACKEND_PY}" "${cid}:${target_dir}/zomorod_admin_subscriptions.py" >/dev/null
  docker exec -i "${cid}" python3 - "${file}" "${ROUTER_MARKER}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]; original=path.read_text(encoding='utf-8'); text=original
text=re.sub(rf'\n?# {re.escape(marker)}-start.*?# {re.escape(marker)}-end\n?', '\n', text, flags=re.S)
text=text.replace('for router in (([zomorod_admin_subscriptions.router] if zomorod_admin_subscriptions else []) + routers):','for router in routers:')
if 'api_router = APIRouter()' not in text or 'for router in routers:' not in text:
    raise SystemExit('unsupported PasarGuard router layout')
block=f'''# {marker}-start\ntry:\n    from . import zomorod_admin_subscriptions\nexcept Exception:\n    zomorod_admin_subscriptions = None\n# {marker}-end\n\n'''
text=text.replace('api_router = APIRouter()',block+'api_router = APIRouter()',1)
text=text.replace('for router in routers:','for router in (([zomorod_admin_subscriptions.router] if zomorod_admin_subscriptions else []) + routers):',1)
if text!=original: path.write_text(text,encoding='utf-8')
PY
}

integrate_host_dashboard() {
  local build_dir="$1"
  mkdir -p "${build_dir}/statics"
  if ! cmp -s "${ADMIN_JS}" "${build_dir}/statics/zomorod-special.js" 2>/dev/null; then install -m 0644 "${ADMIN_JS}" "${build_dir}/statics/zomorod-special.js"; fi
  inject_theme_guard "${build_dir}/index.html"
  inject_theme_guard "${build_dir}/404.html"
  inject_admin_loader "${build_dir}/index.html"
  inject_admin_loader "${build_dir}/404.html"
  log "dashboard integration is healthy at ${build_dir}"
}

activate_live_docker_subscription() {
  local cid="$1" service="$2" live_template
  [[ -s "${SUB_TEMPLATE}" ]] || return 1
  live_template="$(find_container_subscription_template "${cid}" || true)"
  [[ -n "${live_template}" ]] || return 1
  docker cp "${SUB_TEMPLATE}" "${cid}:${live_template}" >/dev/null
  docker exec "${cid}" grep -q "${MARKER_RUNTIME}" "${live_template}" >/dev/null 2>&1 || return 1
  log "subscription UI activated live inside Docker service ${service} (${live_template}); no restart/recreate used"
}

integrate_docker() {
  compose_available || return 1
  [[ -f "${COMPOSE_FILE}" ]] || return 1
  local service cid build_dir router_init subscription_ok=0 dashboard_ok=0 backend_ok=0
  service="$(detect_backend_service || true)"; [[ -n "${service}" ]] || return 1
  cid="$(get_backend_container "${service}" || true)"; [[ -n "${cid}" ]] || return 1

  if activate_live_docker_subscription "${cid}" "${service}"; then subscription_ok=1; else warn "could not hot-activate subscription template"; fi

  router_init="$(find_container_router_init "${cid}" || true)"
  if [[ -n "${router_init}" && -s "${BACKEND_PY}" ]]; then
    if patch_router_container "${cid}" "${router_init}"; then
      backend_ok=1
      log "owner-only admin subscription namespace backend installed at ${router_init%/__init__.py}"
      warn "new /sub/<admin>/<token> routes require one normal PasarGuard process start to become active; no restart was attempted"
    else
      warn "could not patch PasarGuard router registry for admin subscription namespaces"
    fi
  fi

  build_dir="$(find_container_dashboard_build "${cid}" || true)"
  if [[ -n "${build_dir}" ]]; then
    docker exec "${cid}" mkdir -p "${build_dir}/statics"
    docker cp "${ADMIN_JS}" "${cid}:${build_dir}/statics/zomorod-special.js" >/dev/null
    inject_theme_guard_container "${cid}" "${build_dir}/index.html"
    inject_theme_guard_container "${cid}" "${build_dir}/404.html"
    inject_admin_loader_container "${cid}" "${build_dir}/index.html"
    inject_admin_loader_container "${cid}" "${build_dir}/404.html"
    log "dashboard integration is healthy inside Docker service ${service} (${build_dir})"
    dashboard_ok=1
  else
    warn "dashboard build was not found inside Docker service ${service}"
  fi
  [[ ${subscription_ok} -eq 1 || ${dashboard_ok} -eq 1 || ${backend_ok} -eq 1 ]]
}

main() {
  [[ ${EUID} -eq 0 ]] || { warn "run as root"; exit 1; }
  [[ -s "${ADMIN_JS}" ]] || { warn "admin integration JS not found: ${ADMIN_JS}"; exit 1; }
  inject_subscription_runtime || true

  local host_router build_dir
  host_router="$(find_host_router_init || true)"
  if [[ -n "${host_router}" && -s "${BACKEND_PY}" ]]; then
    patch_router_file "${host_router}" || warn "could not patch host PasarGuard router registry"
  fi

  build_dir="$(find_dashboard_build || true)"
  if [[ -n "${build_dir}" && -f "${build_dir}/index.html" ]]; then integrate_host_dashboard "${build_dir}"; fi
  if integrate_docker; then exit 0; fi
  if [[ -n "${build_dir}" && -f "${build_dir}/index.html" ]]; then exit 0; fi
  warn "PasarGuard dashboard/container is not available yet; integration will be retried automatically. No service restart was attempted."
}

main "$@"
