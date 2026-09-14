#!/usr/bin/env bash
set -Eeuo pipefail

ZOMOROD_ROOT="${ZOMOROD_ROOT:-/opt/zomorod}"
PASARGUARD_ROOT="${PASARGUARD_ROOT:-/opt/pasarguard}"
SUB_TEMPLATE="${SUB_TEMPLATE:-/var/lib/pasarguard/templates/subscription/index.html}"
ADMIN_JS="${ZOMOROD_ROOT}/plugin/zomorod-special.js"
RUNTIME_JS="${ZOMOROD_ROOT}/plugin/zomorod-runtime.js"
BACKEND_PY="${ZOMOROD_ROOT}/backend/zomorod_admin_subscriptions.py"
TARGET_CONTAINER="${PASARGUARD_CONTAINER_ID:-}"
MARKER_ADMIN="zomorod-special-loader"
MARKER_RUNTIME="zomorod-runtime-inline"
MARKER_THEME="zomorod-pasarguard-theme-guard"
ROUTER_MARKER="zomorod-admin-subscriptions"

log() { printf '[Zomorod] %s\n' "$*"; }
warn() { printf '[Zomorod] WARNING: %s\n' "$*" >&2; }
admin_asset_version() { sha256sum "${ADMIN_JS}" | awk '{print substr($1,1,12)}'; }

find_dashboard_build() {
  local candidate
  for candidate in "${PASARGUARD_ROOT}/dashboard/build" "${PASARGUARD_ROOT}/panel/dashboard/build"; do
    [[ -f "${candidate}/index.html" ]] && { printf '%s\n' "${candidate}"; return 0; }
  done
  find "${PASARGUARD_ROOT}" -maxdepth 5 -type f -path '*/dashboard/build/index.html' -print -quit 2>/dev/null | sed 's#/index.html$##'
}

find_host_router_init() {
  local candidate
  for candidate in "${PASARGUARD_ROOT}/app/routers/__init__.py" "${PASARGUARD_ROOT}/panel/app/routers/__init__.py"; do
    [[ -f "${candidate}" ]] && { printf '%s\n' "${candidate}"; return 0; }
  done
  return 1
}

container_is_pasarguard() {
  local cid="$1" image running
  command -v docker >/dev/null 2>&1 || return 1
  running="$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || true)"
  image="$(docker inspect -f '{{.Config.Image}}' "${cid}" 2>/dev/null || true)"
  [[ "${running}" == "true" ]] || return 1
  [[ "${image}" == pasarguard/panel || "${image}" == pasarguard/panel:* || "${image}" == pasarguard/panel@* ]]
}

panel_containers() {
  command -v docker >/dev/null 2>&1 || return 0
  local cid image
  while IFS='|' read -r cid image; do
    [[ -n "${cid}" ]] || continue
    case "${image}" in
      pasarguard/panel|pasarguard/panel:*|pasarguard/panel@*) printf '%s\n' "${cid}" ;;
    esac
  done < <(docker ps --format '{{.ID}}|{{.Image}}' 2>/dev/null || true)
}

find_container_dashboard_build() {
  local cid="$1" candidate found
  for candidate in /code/dashboard/build /app/dashboard/build /opt/pasarguard/dashboard/build; do
    if docker exec "${cid}" test -f "${candidate}/index.html" >/dev/null 2>&1; then printf '%s\n' "${candidate}"; return 0; fi
  done
  found="$(docker exec "${cid}" sh -c "find /code /app /opt -maxdepth 6 -type f -path '*/dashboard/build/index.html' -print -quit 2>/dev/null" 2>/dev/null || true)"
  [[ -n "${found}" ]] || return 1
  printf '%s\n' "${found%/index.html}"
}

find_container_subscription_template() {
  local cid="$1" candidate found
  for candidate in /code/app/templates/subscription/index.html /app/app/templates/subscription/index.html /opt/pasarguard/app/templates/subscription/index.html; do
    if docker exec "${cid}" test -f "${candidate}" >/dev/null 2>&1; then printf '%s\n' "${candidate}"; return 0; fi
  done
  found="$(docker exec "${cid}" sh -c "find /code /app /opt -maxdepth 7 -type f -path '*/app/templates/subscription/index.html' -print -quit 2>/dev/null" 2>/dev/null || true)"
  [[ -n "${found}" ]] || return 1
  printf '%s\n' "${found}"
}

find_container_router_init() {
  local cid="$1" candidate found
  for candidate in /code/app/routers/__init__.py /app/app/routers/__init__.py /opt/pasarguard/app/routers/__init__.py; do
    if docker exec "${cid}" test -f "${candidate}" >/dev/null 2>&1; then printf '%s\n' "${candidate}"; return 0; fi
  done
  found="$(docker exec "${cid}" sh -c "find /code /app /opt -maxdepth 6 -type f -path '*/app/routers/__init__.py' -print -quit 2>/dev/null" 2>/dev/null || true)"
  [[ -n "${found}" ]] || return 1
  printf '%s\n' "${found}"
}

strip_legacy_theme_guard() {
  local html="$1"
  [[ -f "${html}" ]] || return 0
  python3 - "${html}" "${MARKER_THEME}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]
original=path.read_text(encoding='utf-8')
text=re.sub(rf'\s*<script id=["\']{re.escape(marker)}["\']>.*?</script>\s*', '\n', original, flags=re.S|re.I)
if text != original: path.write_text(text, encoding='utf-8')
PY
}

strip_legacy_theme_guard_container() {
  local cid="$1" html="$2"
  docker exec "${cid}" test -f "${html}" >/dev/null 2>&1 || return 0
  docker exec -i "${cid}" python3 - "${html}" "${MARKER_THEME}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]
original=path.read_text(encoding='utf-8')
text=re.sub(rf'\s*<script id=["\']{re.escape(marker)}["\']>.*?</script>\s*', '\n', original, flags=re.S|re.I)
if text != original: path.write_text(text, encoding='utf-8')
PY
}

inject_admin_loader() {
  local html="$1" version
  [[ -f "${html}" ]] || return 0
  version="$(admin_asset_version)"
  python3 - "${html}" "${MARKER_ADMIN}" "${version}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]; version=sys.argv[3]
original=path.read_text(encoding='utf-8')
tag=f'<script id="{marker}" src="/statics/zomorod-special.js?v={version}" defer></script>'
pattern=re.compile(rf'<script\s+id=["\']{re.escape(marker)}["\'][^>]*>\s*</script>', re.I)
if pattern.search(original): text=pattern.sub(tag, original, count=1)
elif re.search(r'</body>', original, re.I): text=re.sub(r'</body>', lambda _m: f'  {tag}\n</body>', original, count=1, flags=re.I)
else: text=original+'\n'+tag+'\n'
if text != original: path.write_text(text, encoding='utf-8')
PY
}

inject_admin_loader_container() {
  local cid="$1" html="$2" version
  docker exec "${cid}" test -f "${html}" >/dev/null 2>&1 || return 0
  version="$(admin_asset_version)"
  docker exec -i "${cid}" python3 - "${html}" "${MARKER_ADMIN}" "${version}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); marker=sys.argv[2]; version=sys.argv[3]
original=path.read_text(encoding='utf-8')
tag=f'<script id="{marker}" src="/statics/zomorod-special.js?v={version}" defer></script>'
pattern=re.compile(rf'<script\s+id=["\']{re.escape(marker)}["\'][^>]*>\s*</script>', re.I)
if pattern.search(original): text=pattern.sub(tag, original, count=1)
elif re.search(r'</body>', original, re.I): text=re.sub(r'</body>', lambda _m: f'  {tag}\n</body>', original, count=1, flags=re.I)
else: text=original+'\n'+tag+'\n'
if text != original: path.write_text(text, encoding='utf-8')
PY
}

inject_subscription_runtime() {
  [[ -f "${SUB_TEMPLATE}" ]] || { warn "subscription template not found: ${SUB_TEMPLATE}"; return 1; }
  [[ -s "${RUNTIME_JS}" ]] || { warn "runtime JS not found: ${RUNTIME_JS}"; return 1; }
  python3 - "${SUB_TEMPLATE}" "${RUNTIME_JS}" "${MARKER_RUNTIME}" <<'PY'
from pathlib import Path
import re, sys
template=Path(sys.argv[1]); runtime=Path(sys.argv[2]); marker=sys.argv[3]
original=template.read_text(encoding='utf-8'); js=runtime.read_text(encoding='utf-8')
text=re.sub(rf'\s*<script id=["\']{re.escape(marker)}["\']>.*?</script>\s*', '\n', original, flags=re.S|re.I)
block=f'\n<script id="{marker}">\n{js}\n</script>\n'
if re.search(r'</body>', text, re.I): text=re.sub(r'</body>', lambda _m: block+'</body>', text, count=1, flags=re.I)
else: text += block
if text != original: template.write_text(text, encoding='utf-8')
PY
}

patch_router_file() {
  local file="$1" target_dir
  [[ -f "${file}" && -s "${BACKEND_PY}" ]] || return 1
  target_dir="$(dirname "${file}")"
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
text=text.replace('api_router = APIRouter()', block+'api_router = APIRouter()', 1)
text=text.replace('for router in routers:', 'for router in (([zomorod_admin_subscriptions.router] if zomorod_admin_subscriptions else []) + routers):', 1)
if text != original: path.write_text(text, encoding='utf-8')
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
text=text.replace('api_router = APIRouter()', block+'api_router = APIRouter()', 1)
text=text.replace('for router in routers:', 'for router in (([zomorod_admin_subscriptions.router] if zomorod_admin_subscriptions else []) + routers):', 1)
if text != original: path.write_text(text, encoding='utf-8')
PY
}

integrate_host_dashboard() {
  local build="$1"
  mkdir -p "${build}/statics"
  if ! cmp -s "${ADMIN_JS}" "${build}/statics/zomorod-special.js" 2>/dev/null; then
    install -m 0644 "${ADMIN_JS}" "${build}/statics/zomorod-special.js"
  fi
  strip_legacy_theme_guard "${build}/index.html"
  strip_legacy_theme_guard "${build}/404.html"
  inject_admin_loader "${build}/index.html"
  inject_admin_loader "${build}/404.html"
  log "host dashboard integration healthy (${build})"
}

verify_container_dashboard() {
  local cid="$1" build="$2" expected_sha expected_v remote_sha loader
  expected_sha="$(sha256sum "${ADMIN_JS}" | awk '{print $1}')"
  expected_v="${expected_sha:0:12}"
  remote_sha="$(docker exec "${cid}" sha256sum "${build}/statics/zomorod-special.js" 2>/dev/null | awk '{print $1}' || true)"
  loader="$(docker exec "${cid}" sh -c "grep -F 'id=\"${MARKER_ADMIN}\"' '${build}/index.html' 2>/dev/null | head -n1" 2>/dev/null || true)"
  [[ "${remote_sha}" == "${expected_sha}" && "${loader}" == *"v=${expected_v}"* ]]
}

activate_live_subscription() {
  local cid="$1" template live_sha host_sha
  [[ -s "${SUB_TEMPLATE}" ]] || return 1
  template="$(find_container_subscription_template "${cid}" || true)"
  [[ -n "${template}" ]] || return 1
  docker cp "${SUB_TEMPLATE}" "${cid}:${template}" >/dev/null
  docker exec "${cid}" grep -q "${MARKER_RUNTIME}" "${template}" >/dev/null 2>&1 || return 1
  host_sha="$(sha256sum "${SUB_TEMPLATE}" | awk '{print $1}')"
  live_sha="$(docker exec "${cid}" sha256sum "${template}" 2>/dev/null | awk '{print $1}' || true)"
  [[ "${live_sha}" == "${host_sha}" ]] || return 1
  log "subscription integration healthy (${cid:0:12}:${template})"
}

integrate_container() {
  local cid="$1" build router subscription_ok=0 dashboard_ok=0 backend_ok=0
  container_is_pasarguard "${cid}" || { warn "container ${cid} is not a running pasarguard/panel"; return 1; }

  if activate_live_subscription "${cid}"; then subscription_ok=1; else warn "subscription hot-activation failed for ${cid:0:12}"; fi

  router="$(find_container_router_init "${cid}" || true)"
  if [[ -n "${router}" ]]; then
    if patch_router_container "${cid}" "${router}"; then
      backend_ok=1
      log "backend addon installed (${cid:0:12}:${router%/__init__.py})"
    else
      warn "backend router patch failed for ${cid:0:12}"
    fi
  fi

  build="$(find_container_dashboard_build "${cid}" || true)"
  if [[ -n "${build}" ]]; then
    docker exec "${cid}" mkdir -p "${build}/statics"
    docker cp "${ADMIN_JS}" "${cid}:${build}/statics/zomorod-special.js" >/dev/null
    strip_legacy_theme_guard_container "${cid}" "${build}/index.html"
    strip_legacy_theme_guard_container "${cid}" "${build}/404.html"
    inject_admin_loader_container "${cid}" "${build}/index.html"
    inject_admin_loader_container "${cid}" "${build}/404.html"
    if verify_container_dashboard "${cid}" "${build}"; then
      dashboard_ok=1
      log "dashboard integration verified (${cid:0:12}:${build})"
    else
      warn "dashboard verification failed for ${cid:0:12}"
    fi
  else
    warn "dashboard build not found in ${cid:0:12}"
  fi

  [[ ${subscription_ok} -eq 1 && ${dashboard_ok} -eq 1 ]] || return 1
  [[ ${backend_ok} -eq 1 ]] || warn "dashboard/subscription are healthy but backend addon was not patched"
  return 0
}

main() {
  [[ ${EUID} -eq 0 ]] || { warn 'run as root'; exit 1; }
  [[ -s "${ADMIN_JS}" ]] || { warn "admin JS missing: ${ADMIN_JS}"; exit 1; }
  [[ -s "${RUNTIME_JS}" ]] || { warn "runtime JS missing: ${RUNTIME_JS}"; exit 1; }

  inject_subscription_runtime

  local host_router build cid any=0 failed=0
  host_router="$(find_host_router_init || true)"
  if [[ -n "${host_router}" && -s "${BACKEND_PY}" ]]; then
    patch_router_file "${host_router}" || warn 'host router patch skipped'
  fi

  build="$(find_dashboard_build || true)"
  if [[ -n "${build}" ]]; then integrate_host_dashboard "${build}"; fi

  if [[ -n "${TARGET_CONTAINER}" ]]; then
    integrate_container "${TARGET_CONTAINER}"
    exit $?
  fi

  while read -r cid; do
    [[ -n "${cid}" ]] || continue
    any=1
    integrate_container "${cid}" || failed=1
  done < <(panel_containers)

  if [[ ${any} -eq 1 ]]; then
    [[ ${failed} -eq 0 ]]
    exit $?
  fi

  if [[ -n "${build}" ]]; then exit 0; fi
  warn 'no running PasarGuard panel container or host dashboard was found; guard will retry later'
  return 1
}

main "$@"
