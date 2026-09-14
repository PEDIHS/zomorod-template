# 💎 Zomorod Template

### Emerald + Gold subscription experience for PasarGuard with `Zomorod · Special` controls

<p align="center">
  <img alt="Zomorod" src="https://img.shields.io/badge/Zomorod-Special-065f46?style=for-the-badge&labelColor=0b2f26">
  <img alt="PasarGuard" src="https://img.shields.io/badge/PasarGuard-Compatible-b8860b?style=for-the-badge&labelColor=3a2d09">
  <img alt="CI" src="https://github.com/PEDIHS/zomorod-template/actions/workflows/ci.yml/badge.svg">
</p>

## 🚀 One-step install

Run this on an existing PasarGuard server:

```bash
curl -fL --show-error -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/install.sh?install=$(date +%s)" -o /tmp/zomorod-install.sh && sudo bash /tmp/zomorod-install.sh
```

The installer is downloaded completely before execution and cache is bypassed. To defer the normal PasarGuard restart:

```bash
sudo bash /tmp/zomorod-install.sh --no-restart
```

> The installer never runs raw `docker restart`, `docker compose down/up`, container recreation, or host reboot commands. If a process restart is required it uses PasarGuard's official CLI only.

Future updates:

```bash
sudo zomorod update
```

Verify the live installation:

```bash
zomorod doctor
```

---

## What Zomorod adds

Zomorod keeps the subscription UI as the primary experience and adds a separate self-healing integration layer:

- Emerald + Gold subscription page
- native-looking `Zomorod · Special` Settings tab
- store name and support identity
- normal configuration visibility
- real WireGuard visibility only when the subscription actually contains WG
- Ping and Applications visibility
- Special announcements with Always / Scheduled modes
- Owner and reseller-scoped preferences
- reseller namespace routes such as `/sub/<admin>/<subscription-hash>`
- independent subscription theme storage under `zomorod-theme`

Zomorod does not add a second management database. Native PasarGuard settings and Admin fields remain the source of truth where possible.

---

## 📱 Preview

<p align="center">
  <img src="screenshots/light-dashboard.webp" alt="Zomorod light dashboard" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-dashboard.webp" alt="Zomorod dark dashboard" width="44%">
</p>

<p align="center">
  <img src="screenshots/light-configs.webp" alt="Light configuration list" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-configs.webp" alt="Dark configuration list" width="44%">
</p>

---

## ⚙️ `Zomorod · Special`

Installation adds a `Zomorod` tab with a small `Special` badge inside PasarGuard Settings. It renders in the normal Settings content area and is not a popup.

Current defaults:

| Feature | Default |
|---|---|
| Ping | ✅ On |
| Applications | ✅ On |
| Normal configurations | ⛔ Off |
| WireGuard | ⛔ Off |
| Special announcement | ⛔ Off |

Owner-level native values continue to use `/api/settings`. Reseller preferences use PasarGuard Admin fields and namespaced `custom_variables`, so each reseller only affects its own users.

---

## 🔗 Real WireGuard rows only

Zomorod never synthesizes a WireGuard configuration. A WG row can be shown only when the user's real subscription already contains a `WG / WireGuard` item.

---

## 🌗 Theme isolation

The subscription UI stores its theme under:

```text
zomorod-theme
```

The PasarGuard dashboard keeps its own theme state. The current integrator also removes the old Zomorod dashboard theme hook so the plugin no longer overrides dashboard `localStorage` behavior.

---

## 🧩 Persistence and self-healing

PasarGuard currently has no formal third-party dashboard plugin API, so Zomorod uses a small idempotent integration layer.

The current guard:

- detects running `pasarguard/panel` containers directly
- does not depend on the Docker Compose project name
- reconciles immediately when the active container changes
- performs periodic health reconciliation instead of re-running the whole integration every few seconds
- is independent from HS-PG and never executes `/opt/hs-pg`
- verifies the dashboard loader by SHA after injection
- verifies the subscription template after hot-copy
- fails safely when the panel container is temporarily unavailable

---

## 🩺 Doctor

```bash
zomorod doctor
```

It verifies:

```text
Plugin files
Subscription runtime
Container guard
Dashboard injection
Subscription injection
Backend route
Installed ref
```

`Backend route: active (401)` without a valid token is expected: it proves that the route exists in the running PasarGuard process and authentication is being enforced.

---

## 📂 Main paths

```text
/opt/zomorod/
/opt/zomorod/plugin/zomorod-special.js
/opt/zomorod/plugin/zomorod-runtime.js
/opt/zomorod/plugin/integrate-dashboard.sh
/opt/zomorod/plugin/zomorod-guard.sh
/opt/zomorod/backend/zomorod_admin_subscriptions.py
/usr/local/bin/zomorod
/var/lib/pasarguard/templates/subscription/index.html
/var/lib/pasarguard/zomorod/admin-subscriptions.json
```

Backups are stored under `/opt/zomorod/backups` with restricted permissions; sensitive backups such as `.env` are kept private.

---

## ♻️ Update

```bash
sudo zomorod update
```

The updater resolves the exact latest `main` commit SHA, then installs all files from that immutable snapshot so files from different revisions cannot be mixed.

```bash
zomorod version
zomorod status
zomorod doctor
```

---

## 🗑️ Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/uninstall.sh | sudo bash
```

The uninstaller removes Zomorod files, CLI, and persistence guards while intentionally preserving PasarGuard user data and native settings.

---

<p align="center">
  <a href="README.md">فارسی — Primary documentation</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a>
</p>
