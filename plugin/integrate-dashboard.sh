#!/usr/bin/env bash
set -euo pipefail

ZOMOROD_ROOT="${ZOMOROD_ROOT:-/opt/zomorod}"
PASARGUARD_ROOT="${PASARGUARD_ROOT:-/opt/pasarguard}"
SUB_TEMPLATE="${SUB_TEMPLATE:-/var/lib/pasarguard/templates/subscription/index.html}"
ADMIN_JS="${ZOMOROD_ROOT}/plugin/zomorod-special.js"
RUNTIME_JS="${ZOMOROD_ROOT}/plugin/zomorod-runtime.js"
COMPOSE_FILE="${PASARGUARD_ROOT}/docker-compose.yml"
COMPOSE_PROJECT="${PASARGUARD_COMPOSE_PROJECT:-pasarguard}"
MARKER_ADMIN="zomorod-special-loader"
MARKER_RUNTIME="zomorod-runtime-inline"

log() { printf '[Zomorod] %s\n' "$*"; }
warn() { printf '[Zomorod] WARNING: %s\n' "$*" >&2; }

compose_available() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

detect_backend_service() {
  [[ -f "${COMPOSE_FILE}" ]] || return 1
  compose_available || return 1

  local services candidate rendered service
  services="$(docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" config --services 2>/dev/null || true)"
  for candidate in panel pasarguard; do
    if grep -Fxq "${candidate}" <<<"${services}"; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  rendered="$(docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" config 2>/dev/null || true)"
  service="$(awk '
    BEGIN { in_services=0; service=""; is_backend=0 }
    function flush() {
      if (service != "" && is_backend) { print service; exit }
    }
    /^services:[[:space:]]*$/ { in_services=1; next }
    in_services && /^[^[:space:]]/ { flush(); in_services=0; next }
    !in_services { next }
    /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ {
      flush(); service=$0; sub(/^  /,"",service); sub(/:[[:space:]]*$/,"",service); is_backend=0; next
    }
    /^[[:space:]]+image:[[:space:]]*pasarguard\/panel([:@].*)?$/ { is_backend=1; next }
    /^[[:space:]]+ROLE:[[:space:]]*backend([[:space:]]|$)/ { is_backend=1; next }
    /^[[:space:]]+-[[:space:]]*ROLE=backend([[:space:]]|$)/ { is_backend=1; next }
    END { flush() }
  ' <<<"${rendered}" | head -n 1)"
  [[ -n "${service}" ]] || return 1
  printf '%s\n' "${service}"
}

find_dashboard_build() {
  local candidate
  for candidate in \
    "${PASARGUARD_ROOT}/dashboard/build" \
    "${PASARGUARD_ROOT}/panel/dashboard/build"; do
    if [[ -f "${candidate}/index.html" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  find "${PASARGUARD_ROOT}" -maxdepth 5 -type f -path '*/dashboard/build/index.html' -print -quit 2>/dev/null | sed 's#/index.html$##'
}

find_container_dashboard_build() {
  local cid="$1" candidate found
  for candidate in /code/dashboard/build /app/dashboard/build /opt/pasarguard/dashboard/build; do
    if docker exec "${cid}" test -f "${candidate}/index.html" >/dev/null 2>&1; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  found="$(docker exec "${cid}" sh -c "find /code /app /opt -maxdepth 5 -type f -path '*/dashboard/build/index.html' -print -quit 2>/dev/null" 2>/dev/null || true)"
  [[ -n "${found}" ]] || return 1
  printf '%s\n' "${found%/index.html}"
}

inject_admin_loader() {
  local html="$1"
  [[ -f "${html}" ]] || return 0
  grep -q "${MARKER_ADMIN}" "${html}" && return 0

  python3 - "${html}" "${MARKER_ADMIN}" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
marker = sys.argv[2]
html = path.read_text(encoding="utf-8")
tag = f'<script id="{marker}" src="/statics/zomorod-special.js" defer></script>'
if marker in html:
    raise SystemExit(0)
if "</body>" in html:
    html = html.replace("</body>", f"  {tag}\n</body>", 1)
else:
    html += "\n" + tag + "\n"
path.write_text(html, encoding="utf-8")
PY
}

inject_admin_loader_container() {
  local cid="$1" html="$2"
  docker exec "${cid}" test -f "${html}" >/dev/null 2>&1 || return 0

  docker exec -i "${cid}" python3 - "${html}" "${MARKER_ADMIN}" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
marker = sys.argv[2]
html = path.read_text(encoding="utf-8")
tag = f'<script id="{marker}" src="/statics/zomorod-special.js" defer></script>'
if marker in html:
    raise SystemExit(0)
if "</body>" in html:
    html = html.replace("</body>", f"  {tag}\n</body>", 1)
else:
    html += "\n" + tag + "\n"
path.write_text(html, encoding="utf-8")
PY
}

inject_subscription_runtime() {
  [[ -f "${SUB_TEMPLATE}" ]] || { warn "subscription template not found: ${SUB_TEMPLATE}"; return 0; }
  [[ -s "${RUNTIME_JS}" ]] || { warn "runtime JS not found: ${RUNTIME_JS}"; return 0; }

  python3 - "${SUB_TEMPLATE}" "${RUNTIME_JS}" "${MARKER_RUNTIME}" <<'PY'
from pathlib import Path
import re
import sys

template_path = Path(sys.argv[1])
runtime_path = Path(sys.argv[2])
marker = sys.argv[3]
original = template_path.read_text(encoding="utf-8")
runtime = runtime_path.read_text(encoding="utf-8")
pattern = re.compile(rf'\s*<script id="{re.escape(marker)}">.*?</script>\s*', re.S)
html = pattern.sub("", original)
block = f'\n<script id="{marker}">\n{runtime}\n</script>\n'
if "</body>" in html:
    html = html.replace("</body>", block + "</body>", 1)
else:
    html += block
if html != original:
    template_path.write_text(html, encoding="utf-8")
PY
}

integrate_host_dashboard() {
  local build_dir="$1"
  mkdir -p "${build_dir}/statics"
  if ! cmp -s "${ADMIN_JS}" "${build_dir}/statics/zomorod-special.js" 2>/dev/null; then
    install -m 0644 "${ADMIN_JS}" "${build_dir}/statics/zomorod-special.js"
  fi
  inject_admin_loader "${build_dir}/index.html"
  inject_admin_loader "${build_dir}/404.html"
  log "dashboard integration is healthy at ${build_dir}"
}

integrate_docker_dashboard() {
  compose_available || return 1
  [[ -f "${COMPOSE_FILE}" ]] || return 1

  local service cid build_dir
  service="$(detect_backend_service || true)"
  [[ -n "${service}" ]] || return 1

  cid="$(docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" ps -q "${service}" 2>/dev/null || true)"
  [[ -n "${cid}" ]] || return 1
  [[ "$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || true)" == "true" ]] || return 1

  build_dir="$(find_container_dashboard_build "${cid}" || true)"
  [[ -n "${build_dir}" ]] || return 1

  docker exec "${cid}" mkdir -p "${build_dir}/statics"
  docker cp "${ADMIN_JS}" "${cid}:${build_dir}/statics/zomorod-special.js" >/dev/null
  inject_admin_loader_container "${cid}" "${build_dir}/index.html"
  inject_admin_loader_container "${cid}" "${build_dir}/404.html"
  log "dashboard integration is healthy inside Docker service ${service} (${build_dir})"
}

main() {
  [[ ${EUID} -eq 0 ]] || { warn "run as root"; exit 1; }
  [[ -s "${ADMIN_JS}" ]] || { warn "admin integration JS not found: ${ADMIN_JS}"; exit 1; }

  inject_subscription_runtime

  local build_dir
  build_dir="$(find_dashboard_build || true)"
  if [[ -n "${build_dir}" && -f "${build_dir}/index.html" ]]; then
    integrate_host_dashboard "${build_dir}"
    exit 0
  fi

  if integrate_docker_dashboard; then
    exit 0
  fi

  warn "PasarGuard dashboard build/container is not available yet; subscription runtime is active and dashboard integration will be retried automatically."
}

main "$@"
