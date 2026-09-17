#!/usr/bin/env bash
set -Eeuo pipefail
DATA_DIR="${ZOMOROD_DATA_DIR:-/var/lib/pasarguard/zomorod}"
REQUEST_FILE="${DATA_DIR}/update-request.json"; STATUS_FILE="${DATA_DIR}/update-status.json"; LOG_FILE="${DATA_DIR}/panel-update.log"; LOCK_FILE="${DATA_DIR}/.panel-update.lock"; ZOMOROD_CLI="${ZOMOROD_CLI:-/usr/local/bin/zomorod}"
mkdir -p "${DATA_DIR}"; touch "${LOCK_FILE}"; chmod 600 "${LOCK_FILE}" || true; exec 9>"${LOCK_FILE}"; flock -n 9 || exit 0; [[ -s "${REQUEST_FILE}" ]] || exit 0
read_target() { python3 - "${REQUEST_FILE}" <<'PY2'
import json,re,sys
try: value=json.load(open(sys.argv[1],encoding='utf-8')).get('target_sha','')
except Exception: value=''
print(value if re.fullmatch(r'[0-9a-f]{40}',str(value)) else '')
PY2
}
write_status() { python3 - "${STATUS_FILE}" "$1" "$2" "${3:-}" "${4:-}" <<'PY2'
import json,sys
from datetime import datetime,timezone
from pathlib import Path
p=Path(sys.argv[1]); state=sys.argv[2]; message=sys.argv[3]; finished=sys.argv[4]; target=sys.argv[5] or None
try: old=json.loads(p.read_text(encoding='utf-8'))
except Exception: old={}
now=datetime.now(timezone.utc).isoformat(); payload={'status':state,'message':message,'started_at':old.get('started_at') or now,'finished_at':now if finished else None,'target_sha':target or old.get('target_sha')}; t=p.with_suffix('.json.tmp'); t.write_text(json.dumps(payload,indent=2)+'\n',encoding='utf-8'); t.chmod(0o600); t.replace(p)
PY2
}
target="$(read_target)"; write_status running "Zomorod update is running on the host" "" "$target"; rm -f "${LOG_FILE}"
if [[ ! -x "${ZOMOROD_CLI}" ]]; then write_status failed "Zomorod CLI was not found on the host" yes "$target"; rm -f "${REQUEST_FILE}"; exit 1; fi
set +e; "${ZOMOROD_CLI}" update >"${LOG_FILE}" 2>&1; rc=$?; set -e; chmod 600 "${LOG_FILE}" || true; rm -f "${REQUEST_FILE}"
if [[ $rc -eq 0 ]]; then write_status success "Zomorod update completed successfully" yes "$target"; exit 0; fi
write_status failed "Zomorod update failed; see panel-update.log" yes "$target"; exit "$rc"
