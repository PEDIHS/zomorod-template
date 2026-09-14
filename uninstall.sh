#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run with sudo/root" >&2; exit 1; }

ZOMOROD_ROOT="/opt/zomorod"
PASARGUARD_ROOT="/opt/pasarguard"
TEMPLATE_FILE="/var/lib/pasarguard/templates/subscription/index.html"

if command -v systemctl >/dev/null 2>&1; then
  systemctl disable --now zomorod-integrator.service zomorod-integrator.path zomorod-integrator.timer >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/zomorod-integrator.service \
        /etc/systemd/system/zomorod-integrator.path \
        /etc/systemd/system/zomorod-integrator.timer
  systemctl daemon-reload
  systemctl reset-failed zomorod-integrator.service >/dev/null 2>&1 || true
fi

find "${PASARGUARD_ROOT}" -maxdepth 5 -type f \( \
  -path '*/dashboard/build/index.html' -o \
  -path '*/dashboard/build/404.html' \
\) -print 2>/dev/null | while read -r html; do
  python3 - "${html}" <<'PY'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
text = re.sub(r'\s*<script id="zomorod-special-loader"[^>]*></script>\s*', '\n', text)
text = re.sub(r'\s*<script id="zomorod-pasarguard-theme-guard">.*?</script>\s*', '\n', text, flags=re.S)
p.write_text(text, encoding='utf-8')
PY
done

find "${PASARGUARD_ROOT}" -maxdepth 6 -type f -path '*/dashboard/build/statics/zomorod-special.js' -delete 2>/dev/null || true

if [[ -f "${TEMPLATE_FILE}" ]]; then
  python3 - "${TEMPLATE_FILE}" <<'PY'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
text = re.sub(r'\s*<script id="zomorod-runtime-inline">.*?</script>\s*', '\n', text, flags=re.S)
p.write_text(text, encoding='utf-8')
PY
fi

rm -f /usr/local/bin/zomorod
rm -rf "${ZOMOROD_ROOT}"
echo "Zomorod host integration removed. PasarGuard subscription settings and user data were intentionally kept."
