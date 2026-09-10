from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)


# ---- Dashboard plugin: only exist inside PasarGuard Settings ----
p = Path('plugin/zomorod-special.js')
js = p.read_text(encoding='utf-8')
js = replace_once(js, "const VERSION = '4.3.0';", "const VERSION = '4.4.0';", 'plugin version')

anchor = "  const checked = (id) => Boolean(field(id)?.checked);\n\n  async function api(path, options = {}) {"
insert = """  const checked = (id) => Boolean(field(id)?.checked);\n\n  function currentPanelPath() {\n    const hashPath = String(location.hash || '').replace(/^#/, '').split('?')[0];\n    if (hashPath.startsWith('/')) return hashPath;\n    return location.pathname || '/';\n  }\n\n  function isSettingsRoute() {\n    return /^\\/settings(?:\\/|$)/.test(currentPanelPath());\n  }\n\n  async function api(path, options = {}) {"""
js = replace_once(js, anchor, insert, 'settings route helper')

js = replace_once(
    js,
    "  function findSettingsTabBar() {\n    const preferred = document.querySelector('.scrollbar-hide.flex.overflow-x-auto.border-b');",
    "  function findSettingsTabBar() {\n    if (!isSettingsRoute()) return null;\n    const preferred = document.querySelector('.scrollbar-hide.flex.overflow-x-auto.border-b');",
    'tabbar route gate',
)

js = replace_once(
    js,
    "  function ensureTab() {\n    if (!ownerResolved || !ownerAllowed) return;",
    "  function ensureTab() {\n    if (!isSettingsRoute() || !ownerResolved || !ownerAllowed) return;",
    'ensureTab route gate',
)

old_maintain = """  function maintain() {\n    maintainQueued = false;\n    if (!ownerResolved || !ownerAllowed) {\n      removeOwnerOnlyUi();\n      return;\n    }\n    const tabBar = findSettingsTabBar();"""
new_maintain = """  function maintain() {\n    maintainQueued = false;\n    if (!isSettingsRoute()) {\n      active = false;\n      document.getElementById(ROOT_ID)?.remove();\n      document.getElementById(NAV_ID)?.remove();\n      return;\n    }\n    if (!ownerResolved || !ownerAllowed) {\n      removeOwnerOnlyUi();\n      return;\n    }\n    const tabBar = findSettingsTabBar();"""
js = replace_once(js, old_maintain, new_maintain, 'maintain route gate')

js = replace_once(
    js,
    "  window.addEventListener('popstate', () => { if (active) deactivate(); scheduleMaintain(); });\n  const observer = new MutationObserver(scheduleMaintain);",
    "  window.addEventListener('popstate', () => { if (active) deactivate(); scheduleMaintain(); });\n  window.addEventListener('hashchange', () => { if (!isSettingsRoute()) active = false; scheduleMaintain(); });\n  const observer = new MutationObserver(scheduleMaintain);",
    'hashchange listener',
)
p.write_text(js, encoding='utf-8')


# ---- Installer: explicit update mode + visible no-cache downloads + CLI ----
p = Path('install.sh')
sh = p.read_text(encoding='utf-8')
sh = replace_once(sh, 'SOURCE_REF="main"\n', 'SOURCE_REF="main"\nMODE="install"\n', 'installer mode')
sh = replace_once(
    sh,
    "Usage:\n  install.sh [--lang fa|en|ru|zh] [--version latest|<tag>]",
    "Usage:\n  install.sh [--lang fa|en|ru|zh] [--version latest|<tag>]\n  install.sh --update [--lang fa|en|ru|zh]\n\nAfter the first install:\n  sudo zomorod update",
    'usage update',
)
sh = replace_once(
    sh,
    "    --lang) [[ $# -ge 2 ]] || fail \"--lang needs a value\"; LANG_CODE=\"$2\"; shift 2 ;;",
    "    update|--update) MODE=\"update\"; VERSION=\"latest\"; SOURCE_REF=\"main\"; shift ;;\n    --lang) [[ $# -ge 2 ]] || fail \"--lang needs a value\"; LANG_CODE=\"$2\"; shift 2 ;;",
    'update arg',
)
sh = replace_once(
    sh,
    "  download() { curl -fsSL --connect-timeout 20 --retry 3 --retry-delay 2 \"$1\" -o \"$2\"; }",
    "  download() { curl -fL --show-error --connect-timeout 20 --max-time 120 --retry 3 --retry-delay 2 -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \"$1\" -o \"$2\"; }",
    'curl no-cache',
)
sh = replace_once(
    sh,
    "raw_url() { printf 'https://raw.githubusercontent.com/%s/%s/%s/%s' \"${REPO_OWNER}\" \"${REPO_NAME}\" \"${SOURCE_REF}\" \"$1\"; }",
    "raw_url() { printf 'https://raw.githubusercontent.com/%s/%s/%s/%s?zomorod=%s' \"${REPO_OWNER}\" \"${REPO_NAME}\" \"${SOURCE_REF}\" \"$1\" \"$(date +%s)\"; }",
    'raw cache buster',
)

install_cli_fn = r'''
install_cli() {
  log "installing Zomorod update command"
  download "$(raw_url cli/zomorod)" "${TMP_DIR}/zomorod-cli" || fail "could not download cli/zomorod"
  chmod +x "${TMP_DIR}/zomorod-cli"
  install -m 0755 "${TMP_DIR}/zomorod-cli" /usr/local/bin/zomorod
}

'''
sh = replace_once(sh, "configure_pasarguard() {\n", install_cli_fn + "configure_pasarguard() {\n", 'install cli function')
sh = replace_once(
    sh,
    "  install_plugin_files\n  configure_pasarguard",
    "  install_plugin_files\n  install_cli\n  configure_pasarguard",
    'call install cli',
)
sh = replace_once(
    sh,
    "main() {\n  backup_existing",
    "main() {\n  if [[ \"${MODE}\" == \"update\" ]]; then log \"updating Zomorod from latest main (cache bypass enabled)\"; else log \"installing Zomorod\"; fi\n  backup_existing",
    'update log',
)
sh = replace_once(
    sh,
    "  printf '  • Service lifecycle:     untouched (no restart / recreate / stop / start)\\n'\n",
    "  printf '  • Service lifecycle:     untouched (no restart / recreate / stop / start)\\n'\n  printf '  • Update command:        sudo zomorod update\\n'\n",
    'show update command',
)
p.write_text(sh, encoding='utf-8')


# ---- Stable updater command ----
cli = Path('cli/zomorod')
cli.parent.mkdir(parents=True, exist_ok=True)
cli.write_text(r'''#!/usr/bin/env bash
set -Eeuo pipefail

REPO="PEDIHS/zomorod-template"
RAW="https://raw.githubusercontent.com/${REPO}/main/install.sh"

usage() {
  cat <<'EOF'
Zomorod command

Usage:
  sudo zomorod update          Download and apply the newest Zomorod version
  zomorod version              Show locally installed plugin version
  zomorod status               Show installed files and integration status
EOF
}

run_root() {
  if [[ ${EUID} -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

case "${1:-}" in
  update)
    shift
    tmp="$(mktemp /tmp/zomorod-update.XXXXXX.sh)"
    trap 'rm -f "$tmp"' EXIT
    stamp="$(date +%s)"
    echo "[Zomorod] checking latest main..."
    curl -fL --show-error --connect-timeout 20 --max-time 120 --retry 3 --retry-delay 2 \
      -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
      "${RAW}?update=${stamp}" -o "$tmp"
    grep -q 'Zomorod Template + Special Plugin installer' "$tmp" || { echo '[Zomorod] invalid installer received' >&2; exit 1; }
    echo "[Zomorod] latest installer downloaded; applying update..."
    run_root bash "$tmp" --update "$@"
    echo "[Zomorod] update finished. Close old PasarGuard tabs and reopen Settings."
    ;;
  version)
    file="/opt/zomorod/plugin/zomorod-special.js"
    [[ -f "$file" ]] || { echo 'Zomorod is not installed'; exit 1; }
    grep -m1 "const VERSION" "$file" | sed -E "s/.*'([^']+)'.*/Zomorod \\1/"
    ;;
  status)
    echo "Zomorod root: /opt/zomorod"
    test -s /opt/zomorod/plugin/zomorod-special.js && echo 'Plugin: installed' || echo 'Plugin: missing'
    test -s /opt/zomorod/backend/zomorod_admin_subscriptions.py && echo 'Admin namespaces backend: installed' || echo 'Admin namespaces backend: missing'
    test -s /var/lib/pasarguard/templates/subscription/index.html && echo 'Subscription template: installed' || echo 'Subscription template: missing'
    if command -v systemctl >/dev/null 2>&1; then
      systemctl is-enabled zomorod-integrator.timer >/dev/null 2>&1 && echo 'Self-heal timer: enabled' || echo 'Self-heal timer: not enabled'
    fi
    ;;
  -h|--help|help|'') usage ;;
  *) echo "Unknown command: $1" >&2; usage >&2; exit 2 ;;
esac
''', encoding='utf-8')
