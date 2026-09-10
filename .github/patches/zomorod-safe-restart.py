from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)


p = Path('install.sh')
s = p.read_text(encoding='utf-8')

s = replace_once(
    s,
    'MODE="install"\n',
    'MODE="install"\nRESTART_PANEL="auto"\n',
    'restart mode variable',
)

s = replace_once(
    s,
    '''Safety:\n  The installer never restarts, recreates, stops, or starts PasarGuard/Docker services.\n  Docker installations are hot-patched in the already-running backend container.\n  Python subscription namespace routes become active on the next normal PasarGuard process start.\n''',
    '''Safety:\n  The installer may restart only the PasarGuard panel through the official `pasarguard restart` command.\n  It never calls Docker restart/down/up/recreate directly and never reboots the server.\n  Use --no-restart to defer the panel restart when needed.\n''',
    'usage safety text',
)

s = replace_once(
    s,
    '    update|--update) MODE="update"; VERSION="latest"; SOURCE_REF="main"; shift ;;\n',
    '    update|--update) MODE="update"; VERSION="latest"; SOURCE_REF="main"; shift ;;\n    --no-restart) RESTART_PANEL="never"; shift ;;\n',
    'no restart argument',
)

anchor = '''install_systemd_units() {\n  command -v systemctl >/dev/null 2>&1 || { warn "systemd not detected; integration will run once only"; return 0; }\n  log "updating Zomorod self-healing integration units"\n  local unit\n  for unit in zomorod-integrator.service zomorod-integrator.path zomorod-integrator.timer; do\n    download "$(raw_url "systemd/${unit}")" "${TMP_DIR}/${unit}" || fail "could not download systemd/${unit}"\n    install -m 0644 "${TMP_DIR}/${unit}" "/etc/systemd/system/${unit}"\n  done\n  systemctl daemon-reload\n  systemctl enable --now zomorod-integrator.path >/dev/null 2>&1 || warn "path watcher could not be enabled"\n  systemctl enable --now zomorod-integrator.timer >/dev/null 2>&1 || warn "fallback timer could not be enabled"\n}\n\nmain() {\n'''

replacement = '''install_systemd_units() {\n  command -v systemctl >/dev/null 2>&1 || { warn "systemd not detected; integration will run once only"; return 0; }\n  log "updating Zomorod self-healing integration units"\n  local unit\n  for unit in zomorod-integrator.service zomorod-integrator.path zomorod-integrator.timer; do\n    download "$(raw_url "systemd/${unit}")" "${TMP_DIR}/${unit}" || fail "could not download systemd/${unit}"\n    install -m 0644 "${TMP_DIR}/${unit}" "/etc/systemd/system/${unit}"\n  done\n  systemctl daemon-reload\n  systemctl enable --now zomorod-integrator.path >/dev/null 2>&1 || warn "path watcher could not be enabled"\n  systemctl enable --now zomorod-integrator.timer >/dev/null 2>&1 || warn "fallback timer could not be enabled"\n}\n\nsafe_restart_pasarguard() {\n  if [[ "${RESTART_PANEL}" == "never" ]]; then\n    warn "PasarGuard restart skipped by --no-restart; admin subscription routes will activate on the next normal panel restart"\n    return 0\n  fi\n\n  if ! command -v pasarguard >/dev/null 2>&1; then\n    warn "official pasarguard CLI was not found; not falling back to raw Docker lifecycle commands"\n    warn "run 'pasarguard restart' later after the CLI is available to activate Python routes"\n    return 0\n  fi\n\n  log "restarting only the PasarGuard panel through the official 'pasarguard restart' command"\n  if ! pasarguard restart; then\n    warn "official PasarGuard restart failed; installation is kept and routes will activate after a later successful panel restart"\n    return 0\n  fi\n\n  log "waiting for PasarGuard to become available again"\n  local attempt ready=0\n  for attempt in $(seq 1 20); do\n    if pasarguard status >/dev/null 2>&1; then\n      ready=1\n      break\n    fi\n    sleep 1\n  done\n  [[ "${ready}" -eq 1 ]] || warn "PasarGuard status did not report ready yet; continuing with integration retries"\n\n  log "re-applying Zomorod integration after the safe panel restart"\n  for attempt in $(seq 1 15); do\n    if "${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh" >/dev/null 2>&1; then\n      log "Zomorod integration is active after PasarGuard restart"\n      return 0\n    fi\n    sleep 1\n  done\n\n  warn "PasarGuard restarted, but Zomorod post-restart integration is still pending; the self-heal timer will retry automatically"\n  return 0\n}\n\nmain() {\n'''

s = replace_once(s, anchor, replacement, 'safe restart function')

s = replace_once(
    s,
    '  log "activating Zomorod live; PasarGuard/Docker services will NOT be restarted or recreated"\n  if ! "${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh"; then warn "live integration is pending and will be retried automatically by the timer"; fi\n\n  printf \'\\n\'\n  log "installation completed without restarting/recreating PasarGuard"\n',
    '  log "activating Zomorod integration before the panel restart"\n  if ! "${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh"; then warn "initial live integration is pending and will be retried automatically"; fi\n\n  safe_restart_pasarguard\n\n  printf \'\\n\'\n  log "installation completed"\n',
    'main restart sequence',
)

s = replace_once(
    s,
    "  printf '  • Service lifecycle:     untouched (no restart / recreate / stop / start)\\n'\n",
    "  printf '  • Service lifecycle:     official pasarguard restart only; no raw Docker restart/recreate\\n'\n",
    'service lifecycle summary',
)

s = replace_once(
    s,
    "  printf '\\nOwner-only /sub/<admin>/<subscription-hash> routes become active after the next normal PasarGuard process start.\\n'\n",
    "  printf '\\nOwner-only /sub/<admin>/<subscription-hash> routes are activated by the safe PasarGuard restart when the official CLI is available.\\n'\n",
    'route activation summary',
)

p.write_text(s, encoding='utf-8')

ci = Path('.github/workflows/ci.yml')
c = ci.read_text(encoding='utf-8')
old = '''      - name: Enforce restart-free installer safety\n        run: |\n          set -euo pipefail\n          files=(install.sh plugin/integrate-dashboard.sh)\n          forbidden='docker[[:space:]]+(restart|stop|kill|rm)([[:space:]]|$)|docker[[:space:]]+compose[^\\n]*(up|down|restart|stop|kill|rm)([[:space:]]|$)|pasarguard[[:space:]]+(restart|down|up)([[:space:]]|$)'\n          if grep -En "$forbidden" "${files[@]}"; then\n            echo 'Unsafe service lifecycle command found in install/integration path.' >&2\n            exit 1\n          fi\n'''
new = '''      - name: Enforce official-only PasarGuard restart safety\n        run: |\n          set -euo pipefail\n          files=(install.sh plugin/integrate-dashboard.sh)\n          forbidden='docker[[:space:]]+(restart|stop|kill|rm)([[:space:]]|$)|docker[[:space:]]+compose[^\\n]*(up|down|restart|stop|kill|rm)([[:space:]]|$)|pasarguard[[:space:]]+(down|up)([[:space:]]|$)|systemctl[[:space:]]+restart[[:space:]]+pasarguard'\n          if grep -En "$forbidden" "${files[@]}"; then\n            echo 'Unsafe direct service lifecycle command found in install/integration path.' >&2\n            exit 1\n          fi\n          grep -q 'if ! pasarguard restart; then' install.sh\n          grep -q 'command -v pasarguard' install.sh\n'''
if old not in c:
    raise SystemExit('missing patch anchor: CI lifecycle safety block')
c = c.replace(old, new, 1)
ci.write_text(c, encoding='utf-8')
