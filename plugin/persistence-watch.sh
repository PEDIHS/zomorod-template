#!/usr/bin/env bash
set -u

ZOMOROD_INTEGRATOR="${ZOMOROD_INTEGRATOR:-/opt/zomorod/plugin/integrate-dashboard.sh}"
HS_INTEGRATOR="${HS_INTEGRATOR:-/opt/hs-pg/plugin/integrate-dashboard.sh}"
RETRY_COUNT="${ZOMOROD_PERSIST_RETRIES:-30}"

log(){ printf '[Zomorod Persist] %s\n' "$*"; }

reconcile_once(){
  local ok=0
  if [[ -x "$ZOMOROD_INTEGRATOR" ]]; then
    "$ZOMOROD_INTEGRATOR" >/dev/null 2>&1 && ok=1 || ok=0
  fi

  # HS-PG is optional, but when installed we re-apply it too. This prevents a
  # PasarGuard restart initiated by Zomorod from leaving the HS dashboard tab
  # behind after the container is recreated.
  if [[ -x "$HS_INTEGRATOR" ]]; then
    "$HS_INTEGRATOR" >/dev/null 2>&1 || ok=0
  fi

  [[ $ok -eq 1 ]]
}

reconcile(){
  local attempt
  for attempt in $(seq 1 "$RETRY_COUNT"); do
    if reconcile_once; then
      log "PasarGuard plugin integrations are healthy"
      return 0
    fi
    sleep 1
  done
  log "integration is still pending; waiting for the next lifecycle event"
  return 1
}

# Repair an already-running panel when the watcher starts.
reconcile || true

while true; do
  if ! command -v docker >/dev/null 2>&1; then
    sleep 20
    continue
  fi

  # Listen on the host Docker daemon. Files under /opt survive PasarGuard
  # container replacement, so every new panel container gets re-integrated.
  docker events --filter type=container --filter event=start --format '{{.ID}}' 2>/dev/null | while read -r cid; do
    [[ -n "$cid" ]] || continue
    image="$(docker inspect -f '{{.Config.Image}}' "$cid" 2>/dev/null || true)"
    case "$image" in
      *pasarguard/panel*)
        log "detected PasarGuard container start (${cid:0:12}); re-applying persistent plugins"
        sleep 2
        reconcile || true
        ;;
    esac
  done

  # docker events exits when Docker itself restarts; reconnect automatically.
  sleep 2
done
