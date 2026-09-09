#!/usr/bin/env bash
set -euo pipefail

ZOMOROD_ROOT="${ZOMOROD_ROOT:-/opt/zomorod}"
PASARGUARD_ROOT="${PASARGUARD_ROOT:-/opt/pasarguard}"
SUB_TEMPLATE="${SUB_TEMPLATE:-/var/lib/pasarguard/templates/subscription/index.html}"
ADMIN_JS="${ZOMOROD_ROOT}/plugin/zomorod-special.js"
RUNTIME_JS="${ZOMOROD_ROOT}/plugin/zomorod-runtime.js"
MARKER_ADMIN="zomorod-special-loader"
MARKER_RUNTIME="zomorod-runtime-inline"

log() { printf '[Zomorod] %s\n' "$*"; }
warn() { printf '[Zomorod] WARNING: %s\n' "$*" >&2; }

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
html = pattern.sub("\n", original)
block = f'\n<script id="{marker}">\n{runtime}\n</script>\n'
if "</body>" in html:
    html = html.replace("</body>", block + "</body>", 1)
else:
    html += block
if html != original:
    template_path.write_text(html, encoding="utf-8")
PY
}

main() {
  [[ ${EUID} -eq 0 ]] || { warn "run as root"; exit 1; }
  [[ -s "${ADMIN_JS}" ]] || { warn "admin integration JS not found: ${ADMIN_JS}"; exit 1; }

  inject_subscription_runtime

  local build_dir
  build_dir="$(find_dashboard_build || true)"
  if [[ -z "${build_dir}" || ! -f "${build_dir}/index.html" ]]; then
    warn "PasarGuard dashboard build not found yet; subscription runtime is active and dashboard integration will be retried by the timer."
    exit 0
  fi

  mkdir -p "${build_dir}/statics"
  if ! cmp -s "${ADMIN_JS}" "${build_dir}/statics/zomorod-special.js" 2>/dev/null; then
    install -m 0644 "${ADMIN_JS}" "${build_dir}/statics/zomorod-special.js"
  fi
  inject_admin_loader "${build_dir}/index.html"
  inject_admin_loader "${build_dir}/404.html"
  log "dashboard integration is healthy at ${build_dir}"
}

main "$@"
