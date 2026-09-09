# 💎 Zomorod Template

### A premium Emerald + Gold subscription experience for PasarGuard with `Zomorod · Special` controls

<p align="center">
  <img alt="Zomorod" src="https://img.shields.io/badge/Zomorod-Special-065f46?style=for-the-badge&labelColor=0b2f26">
  <img alt="PasarGuard" src="https://img.shields.io/badge/PasarGuard-Compatible-b8860b?style=for-the-badge&labelColor=3a2d09">
  <img alt="CI" src="https://github.com/PEDIHS/zomorod-template/actions/workflows/ci.yml/badge.svg">
</p>

<p align="center">
  <a href="README.md">فارسی — Primary documentation</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a>
</p>

Zomorod keeps the original subscription UI as the primary experience and adds a separate, persistent integration layer for PasarGuard. The dashboard integration provides a native-looking **Zomorod · Special** settings tab without introducing another management database.

## 📱 Real UI preview — Light / Dark

The images below are documentation-ready captures based on the real Zomorod interface, with browser chrome and panel address elements removed for a cleaner GitHub presentation.

<p align="center">
  <img src="screenshots/light-dashboard.webp" alt="Zomorod light dashboard" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-dashboard.webp" alt="Zomorod dark dashboard" width="44%">
</p>

<p align="center"><sub>Main subscription dashboard in light and dark mode</sub></p>

---

## 🛡️ Subscription dashboard

The main page focuses on the information users need immediately:

- account/service status
- total, used and remaining traffic
- usage percentage and remaining time
- quick connect action
- manual refresh
- responsive mobile-first layout
- independent Light / Dark / System theme support

<p align="center">
  <img src="screenshots/light-dashboard.webp" alt="Light subscription overview" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-dashboard.webp" alt="Dark subscription overview" width="44%">
</p>

---

## 📊 Usage, account details and announcements

Zomorod presents usage and account data in dedicated readable cards:

- remaining traffic visualizer
- used and total traffic
- expiration date and last connection
- usage chart with multiple time ranges
- native PasarGuard announcement
- optional Zomorod Special announcement treatment
- always-on or scheduled announcement windows

<p align="center">
  <img src="screenshots/light-usage-announcement.webp" alt="Light usage and announcement" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-usage-announcement.webp" alt="Dark usage and announcement" width="44%">
</p>

### Special announcement behavior

The Special announcement style is only applied when an actual PasarGuard announcement exists. In scheduled mode it is only visible inside the configured time windows. The Emerald + Gold highlight uses a subtle animated sweep/glow, and animation is automatically disabled for users with `prefers-reduced-motion`.

---

## 🔗 Subscription link and configurations

The connection section keeps the original template structure while allowing Zomorod to control visibility safely:

- dedicated subscription-link card
- copy and QR actions
- Copy All
- per-config protocol detection
- estimated per-server ping display
- names, flags and server labels
- independent control for normal configuration visibility

<p align="center">
  <img src="screenshots/light-configs.webp" alt="Light configuration list" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-configs.webp" alt="Dark configuration list" width="44%">
</p>

### Real WireGuard rows only

Zomorod does not create a fake WireGuard card. WireGuard is displayed only when the user's actual subscription contains a `WireGuard / WG` link. That real WG item appears alongside VLESS and other protocols.

The base template already supports preparing and downloading a WireGuard `.conf` payload for real WG links. If no WG link exists in the subscription, nothing synthetic is shown.

---

## 📲 Recommended applications

Applications are read from PasarGuard's native subscription settings, so administrators do not need to hard-code app cards into the HTML.

- PasarGuard-defined applications
- native import URLs
- device-aware presentation
- independent Zomorod visibility control

---

## ⚙️ `Zomorod · Special`

Installation adds an English **Zomorod** tab with a small **Special** badge to PasarGuard Settings. It renders inside the normal Settings content area; it is not a popup or overlay.

There is no global "Runtime" master switch. Each feature is controlled independently.

### Zomorod controls

- store name
- normal configuration visibility
- WireGuard visibility
- ping visibility
- Applications visibility
- Special announcement visibility
- `Always / Scheduled` announcement mode
- multiple daily display times
- duration for each scheduled window

### Shared native PasarGuard settings

Zomorod reads and writes the existing `/api/settings` resource for native values such as:

```text
subscription.announce
subscription.announce_url
subscription.applications
subscription.allow_browser_config
subscription.manual_sub_request.links
subscription.manual_sub_request.wireguard
```

Zomorod-specific UI flags are stored as namespaced entries in `subscription.response_headers`, including:

```text
x-zomorod-store-name-b64
x-zomorod-show-configs
x-zomorod-show-wireguard
x-zomorod-show-ping
x-zomorod-show-apps
x-zomorod-show-announcement
x-zomorod-announcement-mode
x-zomorod-announcement-times
x-zomorod-announcement-duration
```

The UTF-8 store name is encoded as Base64 so it remains compatible with PasarGuard's response-header validation.

### Current defaults for new installs

| Feature | Default |
| --- | --- |
| Ping | ✅ On |
| Applications | ✅ On |
| Normal configurations | ⛔ Off |
| WireGuard | ⛔ Off |
| Special announcement | ⛔ Off |

Special features are intentionally opt-in, while normal non-invasive template behavior remains available by default.

---

## 🌗 Theme isolation from the PasarGuard dashboard

The subscription page and the PasarGuard admin dashboard can share the same origin, so using the generic `localStorage` key `theme` in both places can cause one UI to overwrite the other.

Zomorod now isolates subscription theme persistence under:

```text
zomorod-theme
```

The PasarGuard dashboard keeps using its own theme key. As a result, switching the subscription page to Light/Dark no longer resets the admin dashboard theme. The source build uses the scoped key directly, and the installer also isolates the repository prebuilt template before deployment.

---

## 🚀 Quick install

Run on an existing PasarGuard server:

```bash
curl -fsSL https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/install.sh | sudo bash
```

Select another language:

```bash
curl -fsSL https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/install.sh | sudo bash -s -- --lang en
```

Install a tagged release:

```bash
curl -fsSL https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/install.sh | sudo bash -s -- --version v4.0.0
```

Supported languages: `fa`, `en`, `ru`, `zh`.

### Restart-free installation

The installer intentionally does **not** restart, recreate, stop or start the PasarGuard Docker stack. On the current Docker deployment it hot-applies the subscription template and dashboard loader inside the already-running backend container.

Key paths:

```text
/opt/zomorod/
/opt/zomorod/plugin/zomorod-special.js
/opt/zomorod/plugin/zomorod-runtime.js
/opt/zomorod/plugin/integrate-dashboard.sh
/var/lib/pasarguard/templates/subscription/index.html
```

Existing template and `.env` files are backed up before replacement.

---

## 🔄 Update resilience

PasarGuard currently does not expose a formal third-party dashboard plugin API. Zomorod therefore uses a small self-healing loader for the Settings tab.

- integration files live outside the PasarGuard source tree under `/opt/zomorod`
- a systemd path watcher and timer re-check the generated dashboard build
- integration is idempotent
- no service restart/recreate is required
- major future PasarGuard DOM/router changes may still require a compatibility update

Manual reintegration:

```bash
sudo /opt/zomorod/plugin/integrate-dashboard.sh
```

Inspect watchers:

```bash
systemctl status zomorod-integrator.path
systemctl status zomorod-integrator.timer
```

---

## 🗑️ Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/uninstall.sh | sudo bash
```

The uninstaller removes Zomorod integration files while intentionally leaving PasarGuard database settings intact.

---

## 🧪 Development

```bash
git clone https://github.com/PEDIHS/zomorod-template.git
cd zomorod-template
bun install --frozen-lockfile
bun run build
```

Syntax checks:

```bash
node --check plugin/zomorod-special.js
node --check plugin/zomorod-runtime.js
bash -n install.sh uninstall.sh plugin/integrate-dashboard.sh
```

## Project layout

```text
zomorod-template/
├── src/                         # Subscription UI
├── plugin/
│   ├── zomorod-special.js       # PasarGuard Settings integration
│   ├── zomorod-runtime.js       # Subscription feature controls
│   └── integrate-dashboard.sh   # Self-healing loader
├── systemd/
├── prebuilt/
├── screenshots/                 # Documentation-ready Light/Dark previews
├── install.sh
├── uninstall.sh
├── README.md                    # Primary Persian documentation
└── README.en.md
```

## Security model

- no external Zomorod control server
- no second management database
- dashboard token is only reused for same-origin native `/api/settings` requests
- PasarGuard API permissions remain authoritative
- Zomorod-specific values are UI behavior flags, not a second credential store

## Brand palette

| Role | Color |
| --- | --- |
| Emerald Deep | `#065F46` |
| Emerald | `#047857` |
| Gold Accent | `#B8860B` |
| Dark Surface | `#0B1814` |

**Zomorod Template · Built for PasarGuard**
