from pathlib import Path

p = Path('install.sh')
s = p.read_text(encoding='utf-8')
old = "    warn \"run 'pasarguard restart' later after the CLI is available to activate Python routes\"\n"
new = "    warn \"run the official PasarGuard panel restart command later to activate Python routes\"\n"
if old not in s:
    raise SystemExit('missing restart warning anchor')
p.write_text(s.replace(old, new, 1), encoding='utf-8')
