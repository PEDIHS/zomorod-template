# معماری Zomorod Special

> این سند جزئیات فنی Integration زمرد با PasarGuard را توضیح می‌دهد. مستندات اصلی پروژه فارسی است؛ نام APIها و مسیرهای فنی عمداً به شکل اصلی نگه داشته شده‌اند.

## هدف معماری

Zomorod Special باید سه ویژگی را هم‌زمان داشته باشد:

1. صفحه Subscription بتواند مستقل از Build اصلی Dashboard توسعه پیدا کند.
2. تنظیمات اصلی با PasarGuard دو نسخه متفاوت نداشته باشند.
3. آپدیت عادی PasarGuard فایل‌های اصلی افزونه و تنظیمات زمرد را حذف نکند.

برای رسیدن به این هدف، پروژه از یک معماری دو لایه استفاده می‌کند.

```text
┌───────────────────────────────────────────────────────────┐
│                    PasarGuard Database                    │
│                                                           │
│ subscription.*               subscription.response_headers│
│ native settings              x-zomorod-* settings         │
└───────────────┬─────────────────────────────┬─────────────┘
                │ /api/settings               │ /{token}/raw
                │                             │
        ┌───────▼────────┐              ┌─────▼─────────────┐
        │ Zomorod Special│              │ Zomorod Runtime  │
        │ Admin Control  │              │ Subscription UI  │
        └───────▲────────┘              └───────────────────┘
                │
        small generated-build loader
                │
┌───────────────┴───────────────────────────────────────────┐
│                 PasarGuard Dashboard                     │
└───────────────────────────────────────────────────────────┘
```

## لایه ۱: Subscription UI

صفحه اشتراک در مسیر زیر نصب می‌شود:

```text
/var/lib/pasarguard/templates/subscription/index.html
```

و PasarGuard از تنظیمات رسمی زیر برای Render آن استفاده می‌کند:

```dotenv
CUSTOM_TEMPLATES_DIRECTORY="/var/lib/pasarguard/templates/"
SUBSCRIPTION_PAGE_TEMPLATE="subscription/index.html"
```

Runtime زمرد (`plugin/zomorod-runtime.js`) در زمان Integration داخل HTML نهایی قرار می‌گیرد تا به فایل Static جدا و Route اضافی در endpoint عمومی Subscription وابسته نباشد.

### دریافت تنظیمات Runtime

Runtime از endpoint native زیر استفاده می‌کند:

```text
/{subscription-path}/{token}/raw
```

PasarGuard در خروجی `raw`، Response Headerهای Subscription را نیز برمی‌گرداند. Zomorod فقط Headerهایی با Prefix زیر را مصرف می‌کند:

```text
x-zomorod-
```

این روش دو مزیت دارد:

- هیچ endpoint عمومی اختصاصی برای تنظیمات زمرد لازم نیست.
- تنظیمات در همان Database و Backup پاسارگارد باقی می‌مانند.

## لایه ۲: Zomorod Special Admin Control

فایل:

```text
plugin/zomorod-special.js
```

داخل Origin داشبورد PasarGuard اجرا می‌شود. این فایل:

1. از Token موجود Dashboard استفاده می‌کند.
2. `GET /api/settings` را اجرا می‌کند.
3. تنظیمات native و Zomorod را در UI یکپارچه نمایش می‌دهد.
4. در Save، همان object را با `PUT /api/settings` برمی‌گرداند.

### Native fields

این فیلدها توسط خود PasarGuard مالکیت و اعتبارسنجی می‌شوند:

```text
subscription.announce
subscription.announce_url
subscription.applications
subscription.allow_browser_config
subscription.manual_sub_request.links
subscription.manual_sub_request.wireguard
```

Zomorod برای آن‌ها Shadow Copy ایجاد نمی‌کند.

### Zomorod namespace

فیلدهای فقط مربوط به UI زمرد در `subscription.response_headers` ذخیره می‌شوند:

```text
x-zomorod-enabled
x-zomorod-store-name
x-zomorod-show-configs
x-zomorod-show-wireguard
x-zomorod-show-ping
x-zomorod-show-apps
x-zomorod-show-announcement
x-zomorod-announcement-mode
x-zomorod-announcement-times
x-zomorod-announcement-duration
```

## چرا افزونه سورس اصلی PasarGuard را Fork نمی‌کند؟

Patch کردن فایل‌های زیر در نصب کاربر، هزینه نگهداری بالایی ایجاد می‌کند:

```text
app/*
dashboard/src/*
```

چون هر `git pull`، upgrade package یا rebuild می‌تواند Patch را overwrite کند یا Conflict بسازد.

در عوض، Zomorod فایل‌های مالک خودش را اینجا نگه می‌دارد:

```text
/opt/zomorod/
```

و فقط به Build تولیدشده Dashboard یک Loader کوچک اضافه می‌کند.

## Self-healing integration

اسکریپت زیر idempotent است:

```text
/opt/zomorod/plugin/integrate-dashboard.sh
```

هر بار اجرا:

- وجود Runtime زمرد را در Subscription Template تضمین می‌کند.
- `zomorod-special.js` را داخل statics تولیدشده Dashboard کپی می‌کند.
- Loader را فقط در صورت نبودن به `index.html` و `404.html` اضافه می‌کند.

برای اجرا بعد از Upgrade دو مکانیزم وجود دارد:

### Path watcher

```text
zomorod-integrator.path
```

تغییر فایل Build اصلی Dashboard را مشاهده می‌کند و Integration را دوباره اجرا می‌کند.

### Fallback timer

```text
zomorod-integrator.timer
```

هر پنج دقیقه Health Check را اجرا می‌کند. این Timer برای حالتی است که مسیر Build در زمان نصب موجود نبوده یا رویداد File Watch از دست رفته باشد.

## چرا این یک Plugin API واقعی PasarGuard نیست؟

در نسخه‌ای که Zomorod بر اساس آن طراحی شده، PasarGuard API رسمی برای Register کردن third-party Dashboard route/tab ندارد. بنابراین Loader زمرد یک compatibility layer است، نه API رسمی Plugin upstream.

این تمایز مهم است:

- **داده و تنظیمات:** پایدار و مبتنی بر API/DB خود PasarGuard.
- **نمایش Tab در Dashboard:** self-healing integration روی Build تولیدشده.

اگر PasarGuard در آینده Plugin API رسمی ارائه کند، مسیر مطلوب Zomorod مهاجرت Admin Control به همان API خواهد بود و namespace تنظیمات فعلی می‌تواند بدون Migration مخرب حفظ شود.

## WireGuard flow

وقتی کاربر روی دانلود WireGuard می‌زند:

```text
Browser
  │
  ├── GET /{subscription}/{token}/wireguard
  │
PasarGuard
  │  validates user / HWID / enabled format
  │  renders native WireGuard configuration
  ▼
.conf download
```

Zomorod WireGuard را خودش Generate نمی‌کند؛ در بخش Special از قابلیت native PasarGuard استفاده می‌کند.

## Announcement scheduling

PasarGuard مسئول متن اصلی اعلان است. Zomorod فقط Visibility Window را کنترل می‌کند.

نمونه:

```text
announcement-mode     = scheduled
announcement-times    = 09:00,14:30,21:00
announcement-duration = 60
```

Runtime ساعت Local Browser را با هر Window مقایسه می‌کند. با Duration برابر ۶۰، Window ساعت `14:30` تا `15:29` فعال است.

## مدل امنیت

### Admin side

- Zomorod Token جدید صادر نمی‌کند.
- Credential جدا ذخیره نمی‌کند.
- درخواست Admin همان Origin به `/api/settings` ارسال می‌شود.
- Authorization و RBAC توسط PasarGuard انجام می‌شود.

### Subscription side

- endpoint اختصاصی بدون احراز هویت ایجاد نمی‌شود.
- Runtime فقط endpointهای Subscription همان Token کاربر را مصرف می‌کند.
- WireGuard همچنان از validation خود PasarGuard عبور می‌کند.

## Compatibility contract

Zomorod Special به این رفتارهای upstream متکی است:

1. Custom Templates همچنان پشتیبانی شوند.
2. `/api/settings` شکل کلی Subscription Settings را حفظ کند.
3. `subscription.response_headers` حذف نشود.
4. `/{token}/raw` Response Headerها را ارائه دهد.
5. Manual `wireguard` endpoint وجود داشته باشد.
6. Dashboard یک HTML build قابل سرو داشته باشد.

تغییر breaking در موارد بالا باید با Release جدید Zomorod پاسخ داده شود.

## Recovery

اجرای دستی Integration:

```bash
sudo /opt/zomorod/plugin/integrate-dashboard.sh
```

بررسی Timer و Watcher:

```bash
systemctl status zomorod-integrator.path
systemctl status zomorod-integrator.timer
journalctl -u zomorod-integrator.service --no-pager -n 100
```

Backupهای Installer:

```text
/opt/zomorod/backups/<timestamp>/
```

## اصل طراحی

قاعده اصلی Zomorod این است:

> هر چیزی که PasarGuard خودش مالک آن است، در PasarGuard ذخیره و اعتبارسنجی شود؛ هر چیزی که فقط مربوط به ظاهر و رفتار Zomorod است، namespaced و قابل حذف باقی بماند.
