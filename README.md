<div dir="rtl" align="right">

# 💎 زمرد — Zomorod Template

### تم حرفه‌ای Subscription برای PasarGuard با کنترل‌های `Zomorod · Special`

<p align="center">
  <img alt="Zomorod" src="https://img.shields.io/badge/Zomorod-Special-065f46?style=for-the-badge&labelColor=0b2f26">
  <img alt="PasarGuard" src="https://img.shields.io/badge/PasarGuard-Compatible-b8860b?style=for-the-badge&labelColor=3a2d09">
  <img alt="CI" src="https://github.com/PEDIHS/zomorod-template/actions/workflows/ci.yml/badge.svg">
</p>

## 🚀 نصب تک‌مرحله‌ای

روی سروری که PasarGuard از قبل نصب است همین یک دستور را اجرا کنید:

```bash
curl -fL --show-error -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/install.sh?install=$(date +%s)" -o /tmp/zomorod-install.sh && sudo bash /tmp/zomorod-install.sh
```

این روش Installer را ابتدا کامل دانلود می‌کند، Cache را دور می‌زند و فقط در صورت دانلود موفق آن را اجرا می‌کند.

اگر نمی‌خواهید در همان لحظه از Restart رسمی PasarGuard استفاده شود:

```bash
sudo bash /tmp/zomorod-install.sh --no-restart
```

> Installer هیچ `docker restart`، `docker compose down/up`، recreate یا reboot خامی اجرا نمی‌کند. اگر Restart لازم باشد فقط از CLI رسمی خود PasarGuard استفاده می‌شود.

برای بروزرسانی بعدی:

```bash
sudo zomorod update
```

برای بررسی واقعی سلامت نصب:

```bash
zomorod doctor
```

---

## زمرد چه چیزی اضافه می‌کند؟

زمرد ظاهر اصلی Subscription را حفظ می‌کند و Integration خودش را به‌صورت جدا و self-healing اضافه می‌کند:

- صفحه اشتراک Emerald + Gold
- تب `Zomorod · Special` داخل Settings پاسارگارد
- نام فروشگاه و پشتیبانی
- نمایش/عدم نمایش کانفیگ‌های معمولی
- نمایش WireGuard فقط وقتی واقعاً در Subscription وجود داشته باشد
- نمایش Ping و Applications
- Announcement ویژه با حالت Always / Scheduled
- تنظیمات مستقل برای Owner و reseller
- Namespace اختصاصی `/sub/<admin>/<subscription-hash>` برای نماینده‌ها
- Theme مستقل Subscription با کلید `zomorod-theme`

زمرد برای تنظیمات مدیریتی یک دیتابیس دوم ایجاد نمی‌کند و تا جای ممکن از مدل و API خود PasarGuard استفاده می‌کند.

---

## 📱 پیش‌نمایش

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

## ⚙️ Zomorod · Special

بعد از نصب، در Settings پاسارگارد یک Tab با نام `Zomorod` و Badge کوچک `Special` اضافه می‌شود. این صفحه Popup نیست و داخل همان ناحیه Settings رندر می‌شود.

Defaultهای نصب جدید:

| قابلیت | پیش‌فرض |
|---|---|
| Ping | ✅ روشن |
| Applications | ✅ روشن |
| کانفیگ‌های معمولی | ⛔ خاموش |
| WireGuard | ⛔ خاموش |
| Announcement Special | ⛔ خاموش |

برای Owner، تنظیمات Native پاسارگارد مثل `announcement`، `support_url`، `allow_browser_config` و فرمت‌های Native از همان `/api/settings` خوانده و ذخیره می‌شوند.

برای reseller، تنظیمات شخصی در فیلدهای Native خود Admin و `custom_variables` ذخیره می‌شوند و روی کاربران همان reseller اعمال می‌شوند.

---

## 🔗 WireGuard واقعی

زمرد هیچ WireGuard ساختگی ایجاد نمی‌کند. اگر Subscription کاربر واقعاً ردیف `WG / WireGuard` داشته باشد می‌تواند نمایش داده شود؛ در غیر این صورت هیچ کارت مصنوعی ساخته نمی‌شود.

---

## 🌗 جداسازی Theme

Subscription از کلید مستقل زیر استفاده می‌کند:

```text
zomorod-theme
```

Dashboard پاسارگارد Theme خودش را نگه می‌دارد. Integrator جدید Hook قدیمی Theme روی Dashboard را هم پاک می‌کند و دیگر `localStorage` پنل مدیریت را Override نمی‌کند.

---

## 🧩 Persistence و Self-Healing

PasarGuard در حال حاضر Plugin API رسمی برای Tabهای شخص ثالث ندارد؛ بنابراین Zomorod یک Integration محدود و idempotent دارد.

نسخه جدید Guard:

- کانتینر فعال `pasarguard/panel` را مستقیم پیدا می‌کند
- به نام Compose project وابسته نیست
- در صورت تغییر کانتینر فوراً reconcile می‌کند
- Health reconciliation دوره‌ای دارد و هر چند ثانیه کل Integration را بی‌دلیل دوباره اجرا نمی‌کند
- از HS-PG مستقل است و هیچ `/opt/hs-pg` را اجرا نمی‌کند
- Dashboard loader را بعد از تزریق با SHA بررسی می‌کند
- Subscription template را بعد از hot-copy بررسی می‌کند
- در صورت نبودن کانتینر Fail-safe می‌ماند و بعداً دوباره تلاش می‌کند

---

## 🩺 Doctor

```bash
zomorod doctor
```

موارد زیر را بررسی می‌کند:

```text
Plugin files
Subscription runtime
Container guard
Dashboard injection
Subscription injection
Backend route
Installed ref
```

`Backend route: active (401)` بدون Token معتبر طبیعی است و یعنی Route داخل پروسه PasarGuard وجود دارد و احراز هویت کار می‌کند.

---

## 📂 مسیرهای اصلی

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

Backupهای Zomorod در `/opt/zomorod/backups` با دسترسی محدود ساخته می‌شوند؛ فایل‌های حساس مثل `.env` با permission خصوصی نگهداری می‌شوند.

---

## ♻️ بروزرسانی

```bash
sudo zomorod update
```

Updater ابتدا SHA دقیق آخرین Commit شاخه `main` را Resolve می‌کند و سپس Installer و تمام فایل‌ها را از همان Snapshot ثابت دریافت می‌کند تا فایل‌های چند نسخه با هم مخلوط نشوند.

```bash
zomorod version
zomorod status
zomorod doctor
```

---

## 🗑️ حذف

```bash
curl -fsSL https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/uninstall.sh | sudo bash
```

Uninstaller فایل‌ها، CLI و Guardهای Zomorod را حذف می‌کند ولی اطلاعات کاربران و تنظیمات Native PasarGuard را عمداً نگه می‌دارد.

---

<p align="center">
  <a href="README.en.md">English documentation</a> ·
  <a href="docs/ARCHITECTURE.md">معماری افزونه</a>
</p>

</div>
