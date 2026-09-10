<div dir="rtl" align="right">

# 💎 زمرد — Zomorod Template

### تجربه اشتراک حرفه‌ای برای PasarGuard با رابط Emerald + Gold و کنترل‌های `Zomorod · Special`

<p align="center">
  <img alt="Zomorod" src="https://img.shields.io/badge/Zomorod-Special-065f46?style=for-the-badge&labelColor=0b2f26">
  <img alt="PasarGuard" src="https://img.shields.io/badge/PasarGuard-Compatible-b8860b?style=for-the-badge&labelColor=3a2d09">
  <img alt="Persian First" src="https://img.shields.io/badge/Language-فارسی-047857?style=for-the-badge">
  <img alt="CI" src="https://github.com/PEDIHS/zomorod-template/actions/workflows/ci.yml/badge.svg">
</p>

<p align="center">
  <strong>ظاهر اصلی زمرد حفظ می‌شود؛ Integration فقط قابلیت اضافه می‌کند.</strong><br>
  صفحه اشتراک، تنظیمات Special و تنظیمات Native پاسارگارد بدون دیتابیس مدیریتی دوم کنار هم کار می‌کنند.
</p>

<p align="center">
  <a href="README.en.md">English documentation</a> ·
  <a href="docs/ARCHITECTURE.md">معماری افزونه</a>
</p>

---

## 📱 پیش‌نمایش واقعی — Light / Dark

تصاویر زیر از اجرای واقعی تمپلیت زمرد گرفته شده‌اند و برای مستندات GitHub فقط Browser Chrome و آدرس پنل از آن‌ها حذف شده است.

<p align="center">
  <img src="screenshots/light-usage-announcement.webp" alt="Light usage and announcement" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-usage-announcement.webp" alt="Dark usage and announcement" width="44%">
</p>

<p align="center"><sub>داشبورد اصلی در حالت روشن و تاریک</sub></p>

---

## 🛡️ داشبورد اشتراک

صفحه اصلی برای نمایش سریع وضعیت سرویس طراحی شده است؛ بدون شلوغی و با تمرکز روی اطلاعاتی که کاربر واقعاً نیاز دارد.

- وضعیت فعال، محدود، منقضی و سایر وضعیت‌های PasarGuard
- حجم کل، مصرف‌شده و باقی‌مانده
- درصد مصرف و زمان باقی‌مانده
- Quick Connect برای رفتن مستقیم به کانفیگ‌ها
- Refresh اطلاعات
- طراحی Responsive و Mobile-first
- پشتیبانی مستقل از Light / Dark / System

<p align="center">
  <img src="screenshots/light-usage-announcement.webp" alt="Light usage and announcement" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-usage-announcement.webp" alt="Dark usage and announcement" width="44%">
</p>

---

## 📊 مصرف، اطلاعات حساب و اعلان

زمرد جزئیات مصرف و وضعیت حساب را در کارت‌های جدا و خوانا نمایش می‌دهد.

- Remaining Traffic با نمایش بصری حجم باقی‌مانده
- حجم مصرف‌شده و حجم کل
- تاریخ انقضا و آخرین اتصال
- نمودار مصرف در بازه‌های زمانی مختلف
- اعلان Native پاسارگارد
- حالت اعلان Special با Accent زمردی/طلایی و انیمیشن چشمگیر
- امکان نمایش دائمی یا زمان‌بندی‌شده اعلان در چند ساعت مختلف روز

<p align="center">
  <img src="screenshots/light-usage-announcement.webp" alt="Light usage and announcement" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-usage-announcement.webp" alt="Dark usage and announcement" width="44%">
</p>

### اعلان Special

وقتی گزینه Announcement در Zomorod فعال باشد، اعلان فقط زمانی Special می‌شود که **واقعاً متن اعلان در PasarGuard وجود داشته باشد**. در حالت Scheduled نیز فقط داخل بازه‌های تعریف‌شده نمایش داده می‌شود.

انیمیشن اعلان برای کاربرانی که `prefers-reduced-motion` دارند به‌صورت خودکار غیرفعال می‌شود.

---

## 🔗 لینک اشتراک و کانفیگ‌ها

بخش Connection Links همان ساختار اصلی تمپلیت را نگه می‌دارد و قابلیت‌های زمرد روی آن به‌صورت کنترل‌شده اعمال می‌شوند.

- کارت مستقل Subscription Link
- Copy و QR Code
- Copy All
- تشخیص پروتکل هر کانفیگ
- Ping نمایشی برای هر سرور
- نمایش نام و Flag سرورها
- کنترل مستقل نمایش کانفیگ‌های معمولی

<p align="center">
  <img src="screenshots/light-configs.webp" alt="Light configuration list" width="44%">
  &nbsp;&nbsp;
  <img src="screenshots/dark-configs.webp" alt="Dark configuration list" width="44%">
</p>

### WireGuard واقعی، نه کارت ساختگی

WireGuard فقط در صورتی نمایش داده می‌شود که داخل Subscription کاربر واقعاً یک لینک `WireGuard / WG` وجود داشته باشد. در این حالت همان کانفیگ در کنار VLESS و سایر کانفیگ‌ها قرار می‌گیرد.

Template اصلی برای WireGuard قابلیت دریافت محتوای Native و دانلود فایل `.conf` را دارد. اگر WG داخل Subscription وجود نداشته باشد، زمرد هیچ کارت یا کانفیگ مصنوعی ایجاد نمی‌کند.

---

## 📲 اپلیکیشن‌های پیشنهادی

Applications از تنظیمات خود PasarGuard خوانده می‌شوند و در صفحه اشتراک نمایش داده می‌شوند. بنابراین برای اضافه یا حذف ابزارهای Android، iOS یا Desktop نیازی به ویرایش دستی HTML نیست.

- Apps تعریف‌شده در PasarGuard
- Import URLهای Native
- نمایش متناسب با دستگاه
- امکان روشن/خاموش کردن نمایش Apps از Zomorod

---

## ⚙️ `Zomorod · Special`

بعد از نصب، یک Tab انگلیسی با Badge کوچک `Special` در صفحه Settings پاسارگارد اضافه می‌شود. این بخش **Popup یا Overlay مستقل نیست** و داخل همان ناحیه Settings کار می‌کند.

Master Toggle با نام Runtime وجود ندارد؛ هر قابلیت به‌صورت مستقل کنترل می‌شود.

### تنظیمات Zomorod

- نام فروشگاه
- نمایش کانفیگ‌های معمولی
- نمایش WireGuard
- نمایش Ping
- نمایش Applications
- نمایش Announcement Special
- حالت `Always / Scheduled` برای اعلان
- چند ساعت نمایش در روز
- مدت فعال بودن هر نوبت اعلان

### تنظیمات مشترک Native PasarGuard

- `Allow browser config`
- فرمت Native `links`
- فرمت Native `wireguard`
- متن Announcement
- Announcement URL
- Applications

این موارد در تنظیمات خود PasarGuard ذخیره می‌شوند؛ Zomorod برای آن‌ها دیتابیس دوم ایجاد نمی‌کند.

### Defaultهای فعلی

| قابلیت | پیش‌فرض |
|---|---|
| Ping | ✅ روشن |
| Applications | ✅ روشن |
| کانفیگ‌های معمولی | ⛔ خاموش |
| WireGuard | ⛔ خاموش |
| Announcement Special | ⛔ خاموش |

قابلیت‌های Special عمداً روی نصب جدید پیش‌فرض خاموش هستند تا مدیر پنل خودش تصمیم بگیرد چه چیزهایی برای کاربران نمایش داده شوند.

---

## 🌗 تم مستقل از Dashboard پاسارگارد

Zomorod دیگر Local Storage مربوط به Theme پنل PasarGuard را لمس نمی‌کند.

- Dashboard پاسارگارد کلید Theme خودش را نگه می‌دارد.
- Subscription Template از کلید مستقل `zomorod-theme` استفاده می‌کند.
- تغییر Light/Dark در صفحه اشتراک نباید Theme پنل مدیریت را Reset کند.
- Tab تنظیمات Zomorod فقط از Theme فعلی Dashboard تبعیت می‌کند و آن را تغییر نمی‌دهد.

این جداسازی هم در Build جدید Template و هم در Installer برای Prebuilt فارسی اعمال شده است.

---

## 🚀 نصب

دستور استاندارد نصب روی یک سرور دارای PasarGuard:

```bash
curl -fL --show-error -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/install.sh?install=$(date +%s)" -o /tmp/zomorod-install.sh && sudo bash /tmp/zomorod-install.sh
```

این روش Installer را ابتدا در `/tmp` ذخیره می‌کند، نسخه کش‌شده را دور می‌زند و فقط در صورت دانلود موفق آن را اجرا می‌کند.

Installer برای فارسی `latest` از Prebuilt اصلی زمرد استفاده می‌کند، فایل‌های Plugin و Backend را نصب می‌کند، دستور `zomorod` را در `/usr/local/bin/zomorod` قرار می‌دهد و Integration را اعمال می‌کند.

### Restart امن PasarGuard

در حالت پیش‌فرض، بعد از نصب Integration، فقط خود پنل PasarGuard از طریق CLI رسمی آن Restart می‌شود:

```text
pasarguard restart
```

Installer مستقیماً `docker restart`، `docker compose down/up`، recreate یا reboot سیستم اجرا نمی‌کند. بعد از Restart، وضعیت PasarGuard بررسی و Integration زمرد دوباره اعمال می‌شود تا Routeهای Backend مانند `/sub/<admin>/<subscription-hash>` فعال شوند.

اگر عمداً نمی‌خواهید پنل در همان لحظه Restart شود:

```bash
sudo bash /tmp/zomorod-install.sh --no-restart
```

در این حالت Routeهای Python بعد از Restart عادی بعدی PasarGuard فعال می‌شوند.

---

## ♻️ بروزرسانی

بعد از اولین نصب، روش رسمی بروزرسانی این است:

```bash
sudo zomorod update
```

Updater ابتدا SHA دقیق آخرین Commit شاخه `main` را Resolve می‌کند و سپس همان Snapshot ثابت را نصب می‌کند تا فایل‌های چند نسخه با هم مخلوط نشوند.

برای بررسی نسخه و وضعیت نصب:

```bash
zomorod version
zomorod status
```

اگر CLI هنوز روی یک نصب قدیمی وجود ندارد، یک بار Installer بخش «نصب» را اجرا کنید تا `/usr/local/bin/zomorod` ساخته شود.

---

## 📂 مسیرهای اصلی

```text
/opt/zomorod/
/opt/zomorod/plugin/zomorod-special.js
/opt/zomorod/plugin/zomorod-runtime.js
/opt/zomorod/plugin/integrate-dashboard.sh
/opt/zomorod/backend/zomorod_admin_subscriptions.py
/usr/local/bin/zomorod
/var/lib/pasarguard/templates/subscription/index.html
/var/lib/pasarguard/zomorod/admin-subscriptions.json
```

---

## 🧩 پایداری Integration

PasarGuard در حال حاضر Plugin API رسمی برای ثبت Tab شخص ثالث در Dashboard ندارد؛ بنابراین Zomorod از Integration محدود و self-healing استفاده می‌کند.

- Loader فقط در Settings Tab Bar فعالیت می‌کند.
- از تغییر Header و Skin عمومی Dashboard اجتناب می‌شود.
- MutationObserver به‌صورت idempotent و با `requestAnimationFrame` کنترل می‌شود.
- درخواست Settings دارای timeout است تا صفحه روی Loading بی‌نهایت نماند.
- Path/Timer بعد از Update پنل Integration را دوباره بررسی می‌کنند.
- Restart موردنیاز Backend فقط از CLI رسمی `pasarguard restart` انجام می‌شود؛ هیچ Lifecycle مستقیم Docker اجرا نمی‌شود.

---

## 🔐 امنیت و Fail-safe

- Management Backend جدا وجود ندارد.
- درخواست تنظیمات same-origin به `/api/settings` انجام می‌شود.
- نام UTF-8 فروشگاه به‌صورت Base64 در Header اختصاصی Zomorod ذخیره می‌شود تا محدودیت Headerهای HTTP رعایت شود.
- اگر Runtime نتواند تنظیمات Subscription را دریافت کند، تغییرات Special اعمال نمی‌شوند و UI اصلی Template در اولویت می‌ماند.
- WireGuard جعلی تولید نمی‌شود؛ فقط لینک واقعی Subscription نمایش داده می‌شود.

---

## سازگاری

Zomorod برای ساختار فعلی PasarGuard طراحی و تست می‌شود. چون Dashboard هنوز API رسمی Third-party Plugin ندارد، تغییرات عمده آینده در DOM یا Router پاسارگارد ممکن است نیاز به بروزرسانی Integration داشته باشند.

</div>