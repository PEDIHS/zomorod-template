<div dir="rtl" align="right">

# 💎 زمرد — Zomorod Template

### تجربه اشتراک حرفه‌ای برای PasarGuard، با افزونه تنظیمات مستقل و ماندگار

<p align="center">
  <img alt="Zomorod" src="https://img.shields.io/badge/Zomorod-Special-065f46?style=for-the-badge&labelColor=0b2f26">
  <img alt="PasarGuard" src="https://img.shields.io/badge/PasarGuard-Compatible-b8860b?style=for-the-badge&labelColor=3a2d09">
  <img alt="Persian First" src="https://img.shields.io/badge/Language-فارسی-047857?style=for-the-badge">
  <img alt="CI" src="https://github.com/PEDIHS/zomorod-template/actions/workflows/ci.yml/badge.svg">
</p>

<p align="center">
  <strong>ظاهر اصلی تمپلیت حفظ شده است.</strong><br>
  افزونه Zomorod Special فقط قابلیت‌های مدیریتی و Integration با PasarGuard را اضافه می‌کند و نباید Skin اصلی Subscription Template را تغییر دهد.
</p>

<p align="center">
  <img src="screenshots/en.png" alt="Original English subscription UI" width="55%">
  <img src="screenshots/fa.png" alt="Original Persian subscription UI" width="22%">
</p>

<p align="center">
  <a href="README.en.md">English documentation</a> ·
  <a href="docs/ARCHITECTURE.md">معماری افزونه</a>
</p>

---

## معماری زمرد

زمرد همان Subscription Template اصلی را حفظ می‌کند و یک Integration جدا برای PasarGuard اضافه می‌کند. فایل‌های React و استایل اصلی صفحه اشتراک دست‌نخورده می‌مانند؛ قابلیت‌های اضافه از طریق Runtime اختیاری و تب `Zomorod · Special` مدیریت می‌شوند.

Runtime زمرد به‌صورت پیش‌فرض **خاموش** است تا پس از نصب، ظاهر و رفتار صفحه اشتراک دقیقاً مثل نسخه اصلی باقی بماند. فعال‌کردن قابلیت‌های نمایشی فقط از داخل تب Zomorod انجام می‌شود.

## قابلیت‌ها

### رابط کاربری اصلی Template

- طراحی Responsive و Mobile-first
- همان سیستم بصری Emerald + Gold نسخه اصلی
- فارسی، انگلیسی، روسی و چینی
- Light / Dark / System
- QR Code و کپی کانفیگ
- نمایش مصرف، انقضا و Usage
- Applications تعریف‌شده در PasarGuard
- WireGuard موجود در Template اصلی

### تب `Zomorod · Special`

بعد از نصب، یک تب انگلیسی با Badge کوچک `Special` در Settings پاسارگارد اضافه می‌شود. صفحه Zomorod داخل همان ناحیه Settings باز می‌شود و Popup نیست.

از این بخش می‌توان موارد زیر را مدیریت کرد:

- فعال/غیرفعال کردن Runtime زمرد
- نام فروشگاه
- نمایش کانفیگ‌ها
- نمایش WireGuard
- نمایش Ping
- نمایش Applications
- `Allow browser config`
- فرمت Native `links`
- فرمت Native `wireguard`
- متن و لینک Announcement
- نمایش دائمی یا زمان‌بندی‌شده Announcement
- چند ساعت نمایش در روز و مدت هر نوبت

> Runtime خاموش یعنی هیچ تغییری روی DOM و ظاهر Subscription Template اعمال نمی‌شود.

## نصب

```bash
curl -fsSL https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/install.sh | sudo bash
```

Installer برای نصب فارسی `latest` از همان Prebuilt اصلی ریپو استفاده می‌کند تا ظاهر Template تغییر نکند.

Installer هیچ‌کدام از این عملیات را انجام نمی‌دهد:

- `pasarguard restart`
- Docker restart
- Docker recreate
- stop/start سرویس‌ها

در نصب Docker، فایل‌ها روی کانتینر درحال اجرا اعمال می‌شوند.

## مسیرها

```text
/opt/zomorod/
/opt/zomorod/plugin/zomorod-special.js
/opt/zomorod/plugin/zomorod-runtime.js
/opt/zomorod/plugin/integrate-dashboard.sh
/var/lib/pasarguard/templates/subscription/index.html
```

## بروزرسانی

همان دستور نصب را دوباره اجرا کنید:

```bash
curl -fsSL https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/install.sh | sudo bash
```

Installer idempotent است و قبل از جایگزینی Template و تنظیمات موجود Backup می‌گیرد.

## حذف

```bash
sudo /opt/zomorod/uninstall.sh
```

در صورت نبود فایل محلی:

```bash
curl -fsSL https://raw.githubusercontent.com/PEDIHS/zomorod-template/main/uninstall.sh | sudo bash
```

## پایداری Integration

PasarGuard در حال حاضر API رسمی برای ثبت Tab شخص ثالث در Dashboard ندارد. بنابراین Integration زمرد با Loader محدود و self-healing انجام می‌شود. این Loader فقط روی نوار تب Settings کار می‌کند و از دستکاری Header یا Loopهای DOM اجتناب می‌کند.

Timer و Path unit بعد از Update پنل Integration را دوباره بررسی می‌کنند، بدون restart/recreate سرویس.

## امنیت

- Management backend جدا وجود ندارد.
- Token فقط از session فعلی Dashboard برای درخواست same-origin به `/api/settings` استفاده می‌شود.
- نام UTF-8 فروشگاه به‌صورت Base64 در Header اختصاصی زمرد ذخیره می‌شود تا محدودیت Latin-1 Headerهای HTTP رعایت شود.
- Runtime در صورت خطای تنظیمات یا timeout، به حالت امن برمی‌گردد و Template اصلی را دست‌نخورده نگه می‌دارد.

## سازگاری

Integration با ساختار فعلی PasarGuard تست می‌شود، اما چون Plugin API رسمی Dashboard وجود ندارد، تغییرات عمده آینده در DOM/Router پنل ممکن است نیاز به Update زمرد داشته باشد.

</div>
