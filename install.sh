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
MODE="install"
RESTART_PANEL="auto"

usage() {
  cat <<'EOF'
Zomorod Template + Special Plugin installer for PasarGuard

Usage:
  install.sh [--lang fa|en|ru|zh] [--version latest|<tag>]
  install.sh --update [--lang fa|en|ru|zh]

After the first install:
  sudo zomorod update

Safety:
  The installer restarts only the PasarGuard panel through PasarGuard's official CLI.
  It never calls Docker restart/down/up/recreate directly and never reboots the server.
  Use --no-restart to defer the panel restart when needed.

Examples:
  install.sh
  install.sh --lang fa
  install.sh --version v4.0.0
EOF
}

log() { printf '\033[1;32m[Zomorod]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[Zomorod]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[Zomorod]\033[0m %s\n' "$*" >&2; exit 1; }

on_error() {
  local rc=$?
  local line=${BASH_LINENO[0]:-unknown}
  local cmd=${BASH_COMMAND:-unknown}
  printf '\033[1;31m[Zomorod]\033[0m installer failed at line %s (exit %s): %s\n' "$line" "$rc" "$cmd" >&2
  exit "$rc"
}
trap on_error ERR

cleanup() {
  if [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]]; then rm -rf "${TMP_DIR}" || true; fi
  return 0
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    update|--update) MODE="update"; VERSION="latest"; SOURCE_REF="main"; shift ;;
    --no-restart) RESTART_PANEL="never"; shift ;;
    --lang) [[ $# -ge 2 ]] || fail "--lang needs a value"; LANG_CODE="$2"; shift 2 ;;
    --version) [[ $# -ge 2 ]] || fail "--version needs a value"; VERSION="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

case "${LANG_CODE}" in fa|en|ru|zh) ;; *) fail "invalid language: ${LANG_CODE}" ;; esac
[[ ${EUID} -eq 0 ]] || fail "run with sudo/root"
[[ -d "${PASARGUARD_ROOT}" ]] || fail "PasarGuard was not found in ${PASARGUARD_ROOT}"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"
[[ "${VERSION}" != "latest" ]] && SOURCE_REF="${VERSION}"

TMP_DIR="$(mktemp -d)"
BACKUP_DIR="${ZOMOROD_ROOT}/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "${BACKUP_DIR}" "${ZOMOROD_ROOT}/plugin" "${ZOMOROD_ROOT}/backend" "${TEMPLATE_DIR}" "/var/lib/pasarguard/zomorod"

if command -v curl >/dev/null 2>&1; then
  download() { curl -fL --show-error --connect-timeout 20 --max-time 120 --retry 3 --retry-delay 2 -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -q --timeout=20 --tries=3 "$1" -O "$2"; }
else
  fail "curl or wget is required"
fi

raw_url() { printf 'https://raw.githubusercontent.com/%s/%s/%s/%s?zomorod=%s' "${REPO_OWNER}" "${REPO_NAME}" "${SOURCE_REF}" "$1" "$(date +%s)"; }

backup_existing() {
  log "backing up existing Zomorod/PasarGuard files"
  if [[ -f "${TEMPLATE_FILE}" ]]; then
    cp -a "${TEMPLATE_FILE}" "${BACKUP_DIR}/subscription-index.html" || warn "could not back up subscription template; continuing update"
  fi
  if [[ -f "${ENV_FILE}" ]]; then
    cp -a "${ENV_FILE}" "${BACKUP_DIR}/pasarguard.env" || warn "could not back up PasarGuard .env; continuing update"
  fi
  if [[ -f "/var/lib/pasarguard/zomorod/admin-subscriptions.json" ]]; then
    cp -a "/var/lib/pasarguard/zomorod/admin-subscriptions.json" "${BACKUP_DIR}/admin-subscriptions.json" || warn "could not back up namespace state; continuing update"
  fi
  log "backup stage complete"
  return 0
}

install_repo_prebuilt() {
  local manifest="${TMP_DIR}/index.parts" archive="${TMP_DIR}/index.html.gz" part_file part count index
  log "using repository prebuilt UI to preserve the original Zomorod appearance"
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

isolate_subscription_theme_storage() {
  python3 - "${TMP_DIR}/template.html" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); html=path.read_text(encoding="utf-8"); marker="zomorod-theme-storage-isolation"
html=re.sub(rf'\s*<script id="{marker}">.*?</script>\s*','\n',html,flags=re.S)
block=r'''<script id="zomorod-theme-storage-isolation">
(() => {
  if (window.__zomorodThemeStorageIsolated) return;
  window.__zomorodThemeStorageIsolated = true;
  const sourceKey='theme', scopedKey='zomorod-theme', proto=Storage.prototype;
  const nativeGet=proto.getItem, nativeSet=proto.setItem, nativeRemove=proto.removeItem;
  proto.getItem=function(key){ return nativeGet.call(this,key===sourceKey?scopedKey:key); };
  proto.setItem=function(key,value){ return nativeSet.call(this,key===sourceKey?scopedKey:key,value); };
  proto.removeItem=function(key){ return nativeRemove.call(this,key===sourceKey?scopedKey:key); };
})();
</script>'''
head=re.search(r'<head\b[^>]*>',html,flags=re.I)
if head: html=html[:head.end()]+'\n'+block+html[head.end():]
elif '</head>' in html.lower(): html=re.sub(r'</head>',block+'\n</head>',html,count=1,flags=re.I)
else: html=block+'\n'+html
path.write_text(html,encoding="utf-8")
PY
}

install_template() {
  local release_path asset url
  log "downloading Zomorod subscription UI (${LANG_CODE})"
  if [[ "${LANG_CODE}" == "fa" && "${VERSION}" == "latest" ]]; then
    install_repo_prebuilt || fail "could not download the repository prebuilt template"
  else
    release_path="latest/download"; [[ "${VERSION}" != "latest" ]] && release_path="download/${VERSION}"
    asset="${LANG_CODE}.html"; [[ "${LANG_CODE}" == "fa" ]] && asset="index.html"
    url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/${release_path}/${asset}"
    download "${url}" "${TMP_DIR}/template.html" || fail "release asset ${asset} was not found"
  fi
  grep -qi '<!doctype html' "${TMP_DIR}/template.html" || fail "downloaded template is not valid HTML"
  [[ $(wc -c < "${TMP_DIR}/template.html") -gt 100000 ]] || fail "downloaded template is unexpectedly small"
  isolate_subscription_theme_storage
  install -m 0644 "${TMP_DIR}/template.html" "${TEMPLATE_FILE}"
}

install_plugin_files() {
  local file
  log "downloading Zomorod plugin and backend files"
  for file in plugin/zomorod-special.js plugin/zomorod-runtime.js plugin/integrate-dashboard.sh backend/zomorod_admin_subscriptions.py; do
    download "$(raw_url "${file}")" "${TMP_DIR}/$(basename "${file}")" || fail "could not download ${file}"
  done
  install -m 0644 "${TMP_DIR}/zomorod-special.js" "${ZOMOROD_ROOT}/plugin/zomorod-special.js"
  install -m 0644 "${TMP_DIR}/zomorod-runtime.js" "${ZOMOROD_ROOT}/plugin/zomorod-runtime.js"
  install -m 0755 "${TMP_DIR}/integrate-dashboard.sh" "${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh"
  install -m 0644 "${TMP_DIR}/zomorod_admin_subscriptions.py" "${ZOMOROD_ROOT}/backend/zomorod_admin_subscriptions.py"
}

install_cli() {
  log "installing Zomorod update command"
  download "$(raw_url cli/zomorod)" "${TMP_DIR}/zomorod-cli" || fail "could not download cli/zomorod"
  chmod +x "${TMP_DIR}/zomorod-cli"
  install -m 0755 "${TMP_DIR}/zomorod-cli" /usr/local/bin/zomorod
}

configure_pasarguard() {
  log "checking PasarGuard template configuration"
  mkdir -p "$(dirname "${ENV_FILE}")"; touch "${ENV_FILE}"
  python3 - "${ENV_FILE}" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); text=path.read_text(encoding="utf-8") if path.exists() else ""
values={"CUSTOM_TEMPLATES_DIRECTORY":'"/var/lib/pasarguard/templates/"',"SUBSCRIPTION_PAGE_TEMPLATE":'"subscription/index.html"'}
for key,value in values.items():
    pattern=re.compile(rf"(?m)^\s*{re.escape(key)}\s*=.*$"); line=f"{key}={value}"
    text=pattern.sub(line,text) if pattern.search(text) else text.rstrip()+"\n"+line+"\n"
path.write_text(text,encoding="utf-8")
PY
}

install_systemd_units() {
  command -v systemctl >/dev/null 2>&1 || { warn "systemd not detected; integration will run once only"; return 0; }
  log "updating Zomorod self-healing integration units"
  local unit
  for unit in zomorod-integrator.service zomorod-integrator.path zomorod-integrator.timer; do
    download "$(raw_url "systemd/${unit}")" "${TMP_DIR}/${unit}" || fail "could not download systemd/${unit}"
    install -m 0644 "${TMP_DIR}/${unit}" "/etc/systemd/system/${unit}"
  done
  systemctl daemon-reload
  systemctl enable --now zomorod-integrator.path >/dev/null 2>&1 || warn "path watcher could not be enabled"
  systemctl enable --now zomorod-integrator.timer >/dev/null 2>&1 || warn "fallback timer could not be enabled"
}

safe_restart_pasarguard() {
  if [[ "${RESTART_PANEL}" == "never" ]]; then
    warn "PasarGuard restart skipped by --no-restart; admin subscription routes will activate on the next normal panel restart"
    return 0
  fi

  local pasarguard_cli
  pasarguard_cli="$(command -v pasarguard)" || true
  if [[ -z "${pasarguard_cli}" || ! -x "${pasarguard_cli}" ]]; then
    warn "official pasarguard CLI was not found; no raw Docker fallback will be used"
    warn "run 'pasarguard restart' later after the CLI is available to activate Python routes"
    return 0
  fi

  log "restarting only the PasarGuard panel through its official CLI"
  if ! "${pasarguard_cli}" restart; then
    warn "official PasarGuard restart failed; installation is kept and routes will activate after a later successful panel restart"
    return 0
  fi

  log "waiting for PasarGuard to become available again"
  local attempt ready=0
  for attempt in $(seq 1 20); do
    if "${pasarguard_cli}" status >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  [[ "${ready}" -eq 1 ]] || warn "PasarGuard status did not report ready yet; continuing with integration retries"

  log "re-applying Zomorod integration after the safe panel restart"
  for attempt in $(seq 1 15); do
    if "${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh" >/dev/null 2>&1; then
      log "Zomorod integration is active after PasarGuard restart"
      return 0
    fi
    sleep 1
  done

  warn "PasarGuard restarted, but Zomorod post-restart integration is still pending; the self-heal timer will retry automatically"
  return 0
}

main() {
  if [[ "${MODE}" == "update" ]]; then log "updating Zomorod from latest main (cache bypass enabled)"; else log "installing Zomorod"; fi
  backup_existing
  install_template
  install_plugin_files
  install_cli
  configure_pasarguard
  install_systemd_units

  log "activating Zomorod integration before the panel restart"
  if ! "${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh"; then warn "initial live integration is pending and will be retried automatically"; fi

  safe_restart_pasarguard

  printf '\n'
  log "installation completed"
  printf '  • Subscription template: %s\n' "${TEMPLATE_FILE}"
  printf '  • Plugin files:          %s\n' "${ZOMOROD_ROOT}/plugin"
  printf '  • Backend addon:         %s\n' "${ZOMOROD_ROOT}/backend/zomorod_admin_subscriptions.py"
  printf '  • Namespace data:        %s\n' "/var/lib/pasarguard/zomorod/admin-subscriptions.json"
  printf '  • Backup:                %s\n' "${BACKUP_DIR}"
  printf '  • Settings tab:          Zomorod · Special (Owner only)\n'
  printf '  • Theme storage:         isolated as zomorod-theme\n'
  printf '  • Service lifecycle:     safe PasarGuard CLI restart only; no raw Docker lifecycle commands\n'
  printf '  • Update command:        sudo zomorod update\n'
  printf '\nOwner-only /sub/<admin>/<subscription-hash> routes are activated by the safe PasarGuard restart when its official CLI is available.\n'
  printf 'Open PasarGuard → Settings → Zomorod to manage namespaces and preferences.\n'
}

main "$@"
