#!/usr/bin/env bash
set -Eeuo pipefail

LANG_CODE="fa"
VERSION="latest"
REPO_OWNER="PEDIHS"
REPO_NAME="zomorod-template"
PASARGUARD_ROOT="/opt/pasarguard"
ZOMOROD_ROOT="/opt/zomorod"
TEMPLATE_DIR="/var/lib/pasarguard/templates/subscription"
TEMPLATE_FILE="${TEMPLATE_DIR}/index.html"
ENV_FILE="${PASARGUARD_ROOT}/.env"
TMP_DIR=""
BACKUP_DIR=""
SOURCE_REF="main"

usage() {
  cat <<'EOF'
Zomorod Template + Special Plugin installer for PasarGuard

Usage:
  install.sh [--lang fa|en|ru|zh] [--version latest|<tag>]

Examples:
  install.sh
  install.sh --lang fa
  install.sh --version v4.0.0
EOF
}

log() { printf '\033[1;32m[Zomorod]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[Zomorod]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[Zomorod]\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]] && rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang)
      [[ $# -ge 2 ]] || fail "--lang needs a value"
      LANG_CODE="$2"; shift 2 ;;
    --version)
      [[ $# -ge 2 ]] || fail "--version needs a value"
      VERSION="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      fail "unknown argument: $1" ;;
  esac
done

case "${LANG_CODE}" in fa|en|ru|zh) ;; *) fail "invalid language: ${LANG_CODE}" ;; esac
[[ ${EUID} -eq 0 ]] || fail "run with sudo/root"
[[ -d "${PASARGUARD_ROOT}" ]] || fail "PasarGuard was not found in ${PASARGUARD_ROOT}"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"

if [[ "${VERSION}" != "latest" ]]; then
  SOURCE_REF="${VERSION}"
fi

TMP_DIR="$(mktemp -d)"
BACKUP_DIR="${ZOMOROD_ROOT}/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "${BACKUP_DIR}" "${ZOMOROD_ROOT}/plugin" "${TEMPLATE_DIR}"

if command -v curl >/dev/null 2>&1; then
  download() { curl -fsSL --connect-timeout 20 --retry 3 --retry-delay 2 "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -q --timeout=20 --tries=3 "$1" -O "$2"; }
else
  fail "curl or wget is required"
fi

raw_url() {
  printf 'https://raw.githubusercontent.com/%s/%s/%s/%s' "${REPO_OWNER}" "${REPO_NAME}" "${SOURCE_REF}" "$1"
}

backup_existing() {
  [[ -f "${TEMPLATE_FILE}" ]] && cp -a "${TEMPLATE_FILE}" "${BACKUP_DIR}/subscription-index.html"
  [[ -f "${ENV_FILE}" ]] && cp -a "${ENV_FILE}" "${BACKUP_DIR}/pasarguard.env"
}

install_prebuilt_fallback() {
  local manifest="${TMP_DIR}/index.parts"
  local archive="${TMP_DIR}/index.html.gz"
  local part_file part count index

  log "release asset unavailable; using repository prebuilt fallback"
  download "$(raw_url prebuilt/index.parts)" "${manifest}" || return 1
  read -r count < "${manifest}"
  [[ "${count}" =~ ^[1-9][0-9]?$ ]] || return 1
  : > "${archive}"
  for ((index=0; index<count; index++)); do
    printf -v part '%02d' "${index}"
    part_file="${TMP_DIR}/part-${part}"
    download "$(raw_url prebuilt/index.html.gz.part-${part})" "${part_file}" || return 1
    cat "${part_file}" >> "${archive}"
  done
  gzip -t "${archive}" || return 1
  gzip -dc "${archive}" > "${TMP_DIR}/template.html"
}

install_template() {
  local release_path asset url
  release_path="latest/download"
  [[ "${VERSION}" != "latest" ]] && release_path="download/${VERSION}"
  asset="${LANG_CODE}.html"
  [[ "${LANG_CODE}" == "fa" ]] && asset="index.html"
  url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/${release_path}/${asset}"

  log "downloading Zomorod subscription UI (${LANG_CODE})"
  if ! download "${url}" "${TMP_DIR}/template.html"; then
    [[ "${LANG_CODE}" == "fa" && "${VERSION}" == "latest" ]] || fail "release asset ${asset} was not found"
    install_prebuilt_fallback || fail "could not download a valid prebuilt template"
  fi

  grep -qi '<!doctype html' "${TMP_DIR}/template.html" || fail "downloaded template is not valid HTML"
  [[ $(wc -c < "${TMP_DIR}/template.html") -gt 100000 ]] || fail "downloaded template is unexpectedly small"
  install -m 0644 "${TMP_DIR}/template.html" "${TEMPLATE_FILE}"
}

install_plugin_files() {
  local file
  for file in plugin/zomorod-special.js plugin/zomorod-runtime.js plugin/integrate-dashboard.sh; do
    download "$(raw_url "${file}")" "${TMP_DIR}/$(basename "${file}")" || fail "could not download ${file}"
  done

  install -m 0644 "${TMP_DIR}/zomorod-special.js" "${ZOMOROD_ROOT}/plugin/zomorod-special.js"
  install -m 0644 "${TMP_DIR}/zomorod-runtime.js" "${ZOMOROD_ROOT}/plugin/zomorod-runtime.js"
  install -m 0755 "${TMP_DIR}/integrate-dashboard.sh" "${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh"
}

configure_pasarguard() {
  mkdir -p "$(dirname "${ENV_FILE}")"
  touch "${ENV_FILE}"

  python3 - "${ENV_FILE}" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8") if path.exists() else ""
values = {
    "CUSTOM_TEMPLATES_DIRECTORY": '"/var/lib/pasarguard/templates/"',
    "SUBSCRIPTION_PAGE_TEMPLATE": '"subscription/index.html"',
}
for key, value in values.items():
    pattern = re.compile(rf"(?m)^\s*{re.escape(key)}\s*=.*$")
    line = f"{key}={value}"
    if pattern.search(text):
        text = pattern.sub(line, text)
    else:
        text = text.rstrip() + "\n" + line + "\n"
path.write_text(text, encoding="utf-8")
PY
}

install_systemd_units() {
  command -v systemctl >/dev/null 2>&1 || { warn "systemd not detected; integration will run once only"; return 0; }
  local unit
  for unit in zomorod-integrator.service zomorod-integrator.path zomorod-integrator.timer; do
    download "$(raw_url "systemd/${unit}")" "${TMP_DIR}/${unit}" || fail "could not download systemd/${unit}"
    install -m 0644 "${TMP_DIR}/${unit}" "/etc/systemd/system/${unit}"
  done
  systemctl daemon-reload
  systemctl enable --now zomorod-integrator.path >/dev/null 2>&1 || warn "path watcher could not be enabled"
  systemctl enable --now zomorod-integrator.timer >/dev/null 2>&1 || warn "fallback timer could not be enabled"
}

restart_pasarguard() {
  if command -v pasarguard >/dev/null 2>&1; then
    log "restarting PasarGuard"
    if command -v timeout >/dev/null 2>&1; then
      timeout --signal=TERM --kill-after=5s 50s pasarguard restart >/dev/null 2>&1 || warn "restart command did not finish cleanly; verify with: pasarguard status"
    else
      pasarguard restart >/dev/null 2>&1 || warn "restart command failed; restart PasarGuard manually"
    fi
  else
    warn "pasarguard CLI not found; restart the panel manually"
  fi
}

main() {
  backup_existing
  install_template
  install_plugin_files
  configure_pasarguard
  install_systemd_units

  log "injecting Zomorod runtime and Special settings tab"
  "${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh" || warn "dashboard injection is pending and will be retried automatically"

  restart_pasarguard
  "${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh" || true

  printf '\n'
  log "installation completed"
  printf '  • Subscription template: %s\n' "${TEMPLATE_FILE}"
  printf '  • Plugin files:          %s\n' "${ZOMOROD_ROOT}/plugin"
  printf '  • Backup:                %s\n' "${BACKUP_DIR}"
  printf '  • Settings tab:          زمرد تمپلیت · Special\n'
  printf '\nOpen PasarGuard → Settings → Zomorod Template Special and save your preferences.\n'
}

main "$@"
