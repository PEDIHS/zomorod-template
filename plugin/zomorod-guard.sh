#!/usr/bin/env bash
set -Eeuo pipefail

ZOMOROD_ROOT="${ZOMOROD_ROOT:-/opt/zomorod}"
INTEGRATOR="${ZOMOROD_ROOT}/plugin/integrate-dashboard.sh"
POLL_SECONDS="${ZOMOROD_GUARD_POLL_SECONDS:-5}"
HEALTH_SECONDS="${ZOMOROD_GUARD_HEALTH_SECONDS:-300}"
RETRY_SECONDS="${ZOMOROD_GUARD_RETRY_SECONDS:-30}"
LOCK_FILE="${ZOMOROD_GUARD_LOCK_FILE:-/run/zomorod-guard.lock}"

log() { printf '[Zomorod Guard] %s\n' "$*"; }
warn() { printf '[Zomorod Guard] WARNING: %s\n' "$*" >&2; }

[[ ${EUID} -eq 0 ]] || { warn 'run as root'; exit 1; }
[[ -x "${INTEGRATOR}" ]] || { warn "integrator not found: ${INTEGRATOR}"; exit 1; }
[[ "${POLL_SECONDS}" =~ ^[1-9][0-9]*$ ]] || POLL_SECONDS=5
[[ "${HEALTH_SECONDS}" =~ ^[1-9][0-9]*$ ]] || HEALTH_SECONDS=300
[[ "${RETRY_SECONDS}" =~ ^[1-9][0-9]*$ ]] || RETRY_SECONDS=30

mkdir -p "$(dirname "${LOCK_FILE}")"
exec 9>"${LOCK_FILE}"
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || { log 'another guard instance is already active'; exit 0; }
fi

panel_rows() {
  command -v docker >/dev/null 2>&1 || return 0
  local cid image project
  while IFS='|' read -r cid image; do
    [[ -n "${cid}" ]] || continue
    case "${image}" in
      pasarguard/panel:*|pasarguard/panel@*|pasarguard/panel)
        project="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "${cid}" 2>/dev/null || true)"
        [[ -n "${project}" && "${project}" != '<no value>' ]] || project=pasarguard
        printf '%s|%s|%s\n' "${cid}" "${project}" "${image}"
        ;;
    esac
  done < <(docker ps --format '{{.ID}}|{{.Image}}' 2>/dev/null || true)
}

reconcile() {
  local rows="$1" cid project image
  if [[ -n "${rows}" ]]; then
    while IFS='|' read -r cid project image; do
      [[ -n "${cid}" ]] || continue
      log "reconciling ${cid:0:12} compose-project=${project}"
      if ! PASARGUARD_CONTAINER_ID="${cid}" PASARGUARD_COMPOSE_PROJECT="${project}" "${INTEGRATOR}"; then
        warn "integration failed for ${cid:0:12}"
        return 1
      fi
    done <<<"${rows}"
  else
    log 'no running pasarguard/panel container detected; checking host integration'
    if ! "${INTEGRATOR}"; then
      warn 'host integration is not ready yet'
      return 1
    fi
  fi
  return 0
}

last_signature='__unset__'
next_run=0
log "started (poll=${POLL_SECONDS}s health=${HEALTH_SECONDS}s retry=${RETRY_SECONDS}s)"

while true; do
  rows="$(panel_rows || true)"
  signature="${rows:-none}"
  now="$(date +%s)"

  if [[ "${signature}" != "${last_signature}" ]]; then
    next_run=0
    last_signature="${signature}"
  fi

  if (( now >= next_run )); then
    if reconcile "${rows}"; then
      next_run=$((now + HEALTH_SECONDS))
    else
      warn "reconciliation failed; retrying in ${RETRY_SECONDS}s"
      next_run=$((now + RETRY_SECONDS))
    fi
  fi

  sleep "${POLL_SECONDS}"
done
