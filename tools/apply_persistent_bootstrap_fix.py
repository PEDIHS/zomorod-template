from pathlib import Path

install = Path('install.sh')
text = install.read_text(encoding='utf-8')

replacements = [
    (
        'ZOMOROD_ROOT="/opt/zomorod"\nTEMPLATE_DIR=',
        'ZOMOROD_ROOT="/opt/zomorod"\nPYTHON_BOOTSTRAP_DIR="/var/lib/pasarguard/zomorod/python"\nTEMPLATE_DIR=',
    ),
    (
        'mkdir -p "${BACKUP_DIR}" "${ZOMOROD_ROOT}/plugin" "${ZOMOROD_ROOT}/backend" "${TEMPLATE_DIR}" "/var/lib/pasarguard/zomorod"',
        'mkdir -p "${BACKUP_DIR}" "${ZOMOROD_ROOT}/plugin" "${ZOMOROD_ROOT}/backend" "${TEMPLATE_DIR}" "/var/lib/pasarguard/zomorod" "${PYTHON_BOOTSTRAP_DIR}"',
    ),
    (
        'for file in plugin/zomorod-special.js plugin/zomorod-runtime.js plugin/integrate-dashboard.sh plugin/update-from-panel.sh backend/zomorod_admin_subscriptions.py; do',
        'for file in plugin/zomorod-special.js plugin/zomorod-runtime.js plugin/integrate-dashboard.sh plugin/update-from-panel.sh plugin/sitecustomize.py backend/zomorod_admin_subscriptions.py; do',
    ),
    (
        '  install -m 0644 "${TMP_DIR}/zomorod_admin_subscriptions.py" "${ZOMOROD_ROOT}/backend/zomorod_admin_subscriptions.py"\n}',
        '  install -m 0644 "${TMP_DIR}/zomorod_admin_subscriptions.py" "${ZOMOROD_ROOT}/backend/zomorod_admin_subscriptions.py"\n  # Persist Python routing across container recreation. /var/lib/pasarguard is\n  # already the official PasarGuard host volume, so these files exist before\n  # python main.py starts in every newly-created panel container.\n  install -m 0644 "${TMP_DIR}/sitecustomize.py" "${PYTHON_BOOTSTRAP_DIR}/sitecustomize.py"\n  install -m 0644 "${TMP_DIR}/zomorod_admin_subscriptions.py" "${PYTHON_BOOTSTRAP_DIR}/zomorod_admin_subscriptions.py"\n}',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'install.sh patch anchor missing: {old[:80]!r}')
    text = text.replace(old, new, 1)

old_block = '''values={"CUSTOM_TEMPLATES_DIRECTORY":'"/var/lib/pasarguard/templates/"',"SUBSCRIPTION_PAGE_TEMPLATE":'"subscription/index.html"'}
for key,value in values.items():
    pattern=re.compile(rf"(?m)^\\s*{re.escape(key)}\\s*=.*$"); line=f"{key}={value}"
    text=pattern.sub(line,text) if pattern.search(text) else text.rstrip()+"\\n"+line+"\\n"
path.write_text(text,encoding="utf-8")'''
new_block = '''values={"CUSTOM_TEMPLATES_DIRECTORY":'"/var/lib/pasarguard/templates/"',"SUBSCRIPTION_PAGE_TEMPLATE":'"subscription/index.html"'}
for key,value in values.items():
    pattern=re.compile(rf"(?m)^\\s*{re.escape(key)}\\s*=.*$"); line=f"{key}={value}"
    text=pattern.sub(line,text) if pattern.search(text) else text.rstrip()+"\\n"+line+"\\n"
bootstrap="/var/lib/pasarguard/zomorod/python"
pattern=re.compile(r"(?m)^\\s*PYTHONPATH\\s*=.*$")
match=pattern.search(text)
if match:
    raw=match.group(0).split("=",1)[1].strip().strip('"').strip("'")
    parts=[part for part in raw.split(":") if part and part != bootstrap]
    value=":".join([bootstrap]+parts)
    text=pattern.sub(f'PYTHONPATH="{value}"',text,count=1)
else:
    text=text.rstrip()+f'\\nPYTHONPATH="{bootstrap}"\\n'
path.write_text(text,encoding="utf-8")'''
if old_block not in text:
    raise SystemExit('configure_pasarguard Python block not found')
text = text.replace(old_block, new_block, 1)

text = text.replace(
    "  printf '  • Persistence:           host systemd guard + Docker start event reconciliation\\n'",
    "  printf '  • Persistence:           pre-start Python bootstrap + host integration guard\\n'",
    1,
)
install.write_text(text, encoding='utf-8')

ci = Path('.github/workflows/ci.yml')
ci_text = ci.read_text(encoding='utf-8')
anchor = '          python3 -m py_compile backend/zomorod_admin_subscriptions.py\n'
if anchor not in ci_text:
    raise SystemExit('CI Python compile anchor not found')
if 'python3 -m py_compile plugin/sitecustomize.py' not in ci_text:
    ci_text = ci_text.replace(anchor, anchor + '          python3 -m py_compile plugin/sitecustomize.py\n', 1)
ci.write_text(ci_text, encoding='utf-8')
