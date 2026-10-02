/* Zomorod PWA — opt-in, zero page caches, iOS-first notification UX. */
(() => {
  'use strict';
  const base = '/api/zomorod/pwa';
  const scope = '/sub/';
  const ROOT = 'zomorod-pwa-controls';
  const MODAL = 'zomorod-pwa-modal';
  const DISMISS = 'zomorod-pwa-intro-v3';
  const isIOS = () => /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const node = (id) => document.getElementById(id);
  const path = location.pathname.replace(/\/+$/, '');
  const parts = path.slice(scope.length).split('/').filter(Boolean);
  if (!path.startsWith(scope) || ![1, 2].includes(parts.length)) return;
  const token = parts[parts.length - 1];
  if (!/^[A-Za-z0-9._~-]{12,250}$/.test(token)) return;

  let config = null, registration = null, existing = null, deferredInstall = null;
  let busy = false;
  const info = (message) => {
    const element = node('z-pwa-info');
    if (element) element.textContent = message;
    const modalText = node('z-pwa-modal-status');
    if (modalText && message) modalText.textContent = message;
  };
  const dismissModal = (remember = false) => {
    node(MODAL)?.remove();
    if (remember) { try { localStorage.setItem(DISMISS, '1'); } catch (_) {} }
  };
  const wasDismissed = () => {
    try { return localStorage.getItem(DISMISS) === '1'; } catch (_) { return false; }
  };
  const decodeKey = (value) => {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  };
  const currentPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');
  function setButtons() {
    const install = node('z-pwa-install'), enable = node('z-pwa-push'), disable = node('z-pwa-disable');
    if (install) install.hidden = standalone();
    if (enable) {
      enable.hidden = !config?.push_enabled;
      enable.disabled = busy || !registration;
      enable.textContent = existing ? 'اعلان‌ها فعال هستند' : 'فعال‌سازی اعلان‌ها';
    }
    if (disable) disable.hidden = !config?.push_enabled || !existing;
  }
  function showModal(kind) {
    if (node(MODAL) || wasDismissed()) return;
    const push = kind === 'push';
    const modal = document.createElement('div');
    modal.id = MODAL;
    modal.dir = 'rtl';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'z-pwa-modal-title');
    modal.innerHTML =
      '<div class="z-pwa-shade"></div><div class="z-pwa-dialog">' +
      '<div class="z-pwa-symbol" aria-hidden="true">✦</div>' +
      '<h2 id="z-pwa-modal-title">' + (push ? 'اعلان‌های زمرد را فعال کنید' : 'زمرد را روی گوشی نصب کنید') + '</h2>' +
      '<p>' + (push ? 'هشدارهای سرویس و اطلاعیه‌های مهم را حتی زمانی که زمرد باز نیست، دریافت کنید.' :
        'برای دریافت اعلان در آیفون، زمرد باید با گزینه Add to Home Screen به‌صورت وب‌اپ نصب شده باشد.') + '</p>' +
      '<p id="z-pwa-modal-status" class="z-pwa-modal-status" aria-live="polite"></p>' +
      '<button id="z-pwa-modal-primary" class="z-pwa-modal-main" type="button">' +
      (push ? 'فعال‌سازی اعلان‌ها' : 'راهنمای نصب') + '</button>' +
      '<button id="z-pwa-modal-later" class="z-pwa-modal-later" type="button">فعلاً نه</button>' +
      '</div>';
    document.body.appendChild(modal);
    node('z-pwa-modal-later')?.addEventListener('click', () => dismissModal(true));
    node('z-pwa-modal-primary')?.addEventListener('click', () => {
      if (push) void enablePush();
      else {
        info('در Safari روی Share بزنید و Add to Home Screen را انتخاب کنید. سپس زمرد را از آیکون جدید باز کنید.');
        // Keep the explanation visible in the modal until the user dismisses it.
      }
    });
  }
  function offerIntro() {
    if (wasDismissed() || !config?.pwa_enabled || node(MODAL)) return;
    if (config.push_enabled && registration && 'PushManager' in window &&
      currentPermission() !== 'denied' && !existing) {
      if (!isIOS() || standalone()) showModal('push');
      else showModal('install');
    } else if (isIOS() && !standalone() && config.push_enabled && !existing) {
      showModal('install');
    }
  }
  function updateSupport() {
    if (!config?.push_enabled) return;
    if (isIOS() && !standalone()) {
      info('برای دریافت اعلان، زمرد را از آیکون صفحه اصلی آیفون باز کنید.');
    } else if (!('PushManager' in window) || !('Notification' in window)) {
      info('این نسخه از مرورگر از اعلان‌های وب پشتیبانی نمی‌کند.');
    } else if (currentPermission() === 'denied') {
      info('مجوز اعلان مسدود است؛ از Settings آیفون، Notifications و سپس زمرد را بررسی کنید.');
    }
  }
  async function storeSubscription(sub) {
    const response = await fetch(base + '/subscribe/' + encodeURIComponent(token), {
      method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(sub.toJSON())
    });
    if (!response.ok) {
      let detail = '';
      try { detail = String((await response.json()).detail || ''); } catch (_) {}
      throw new Error('ثبت اعلان در سرور انجام نشد (HTTP ' + response.status + '). ' + detail);
    }
    existing = sub;
    setButtons();
  }
  // Called directly by the user's click. subscribe() MUST be invoked before
  // any await: WebKit requires a live user gesture to request Push permission.
  async function enablePush() {
    if (busy || !config?.push_enabled) return;
    if (isIOS() && !standalone()) {
      showModal('install');
      info('ابتدا زمرد را از صفحه اصلی آیفون باز کنید، نه از داخل Safari.');
      return;
    }
    if (!registration || !('PushManager' in window) || !('Notification' in window)) {
      info('سرویس اعلان آماده نیست؛ یک‌بار صفحه را بازخوانی کنید.');
      return;
    }
    if (currentPermission() === 'denied') {
      updateSupport();
      return;
    }
    busy = true; setButtons(); info('در حال درخواست مجوز اعلان…');
    try {
      // Do not await getSubscription or Notification.requestPermission before
      // subscribe(): both consume the transient activation on iPhone.
      const pending = existing ? Promise.resolve(existing) : registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: decodeKey(config.vapid_public_key)
      });
      const subscription = await pending;
      existing = subscription;
      await storeSubscription(subscription);
      info('اعلان‌ها با موفقیت روی این گوشی فعال شدند.');
      dismissModal(true);
    } catch (error) {
      if (currentPermission() === 'denied') updateSupport();
      else info('فعال‌سازی انجام نشد: ' + (error?.message || 'دوباره تلاش کنید.'));
    } finally { busy = false; setButtons(); }
  }
  async function disablePush() {
    if (busy || !registration) return;
    busy = true; setButtons();
    try {
      const sub = existing || await registration.pushManager.getSubscription();
      if (sub) {
        const res = await fetch(base + '/subscribe/' + encodeURIComponent(token), {
          method: 'DELETE', credentials: 'same-origin',
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify(sub.toJSON())
        });
        if (!res.ok) throw new Error('سرور حذف اشتراک را تأیید نکرد.');
        await sub.unsubscribe();
      }
      existing = null;
      info('اعلان‌های این دستگاه غیرفعال شدند.');
    } catch (error) { info(error?.message || 'لغو اعلان انجام نشد.'); }
    finally { busy = false; setButtons(); }
  }
  function renderControls() {
    if (node(ROOT)) return;
    const shell = document.createElement('section');
    shell.id = ROOT; shell.dir = 'rtl';
    shell.innerHTML =
      '<div class="z-pwa-description"><strong>وب‌اپ زمرد</strong><span id="z-pwa-info" aria-live="polite">مدیریت نصب و اعلان‌های گوشی</span></div>' +
      '<button id="z-pwa-install" class="z-pwa-btn" type="button">افزودن به صفحه اصلی</button>' +
      '<button id="z-pwa-push" class="z-pwa-btn z-pwa-primary" type="button" hidden>فعال‌سازی اعلان‌ها</button>' +
      '<button id="z-pwa-disable" class="z-pwa-btn z-pwa-text" type="button" hidden>لغو اعلان</button>';
    document.body.appendChild(shell);
    node('z-pwa-install')?.addEventListener('click', () => {
      if (deferredInstall) {
        const prompt = deferredInstall; deferredInstall = null;
        void prompt.prompt().catch(() => { info('در منوی مرورگر گزینه Install App را انتخاب کنید.'); });
      } else if (isIOS()) {
        showModal('install');
        info('در Safari گزینه Share و سپس Add to Home Screen را بزنید.');
      } else info('از منوی مرورگر گزینه Install App یا افزودن به صفحه اصلی را انتخاب کنید.');
    });
    node('z-pwa-push')?.addEventListener('click', () => void enablePush());
    node('z-pwa-disable')?.addEventListener('click', () => void disablePush());
    setButtons();
  }
  function loadStyle() {
    if (node('zomorod-pwa-style')) return;
    const style = document.createElement('style'); style.id = 'zomorod-pwa-style';
    style.textContent =
      '#zomorod-pwa-controls{box-sizing:border-box;direction:rtl;max-width:820px;margin:16px auto 30px;padding:13px 16px;border:1px solid hsl(var(--border,0 0% 85%));background:hsl(var(--card,0 0% 100%));color:hsl(var(--foreground,0 0% 13%));border-radius:16px;font:inherit;display:flex;flex-wrap:wrap;gap:10px;align-items:center;box-shadow:0 5px 20px rgba(0,0,0,.045)}' +
      '#zomorod-pwa-controls *{box-sizing:border-box}#zomorod-pwa-controls [hidden]{display:none!important}' +
      '#zomorod-pwa-controls .z-pwa-description{flex:1;min-width:160px;display:flex;flex-direction:column;gap:4px;font-size:13px}' +
      '#zomorod-pwa-controls .z-pwa-description span{font-size:11px;line-height:1.8;opacity:.7}' +
      '#zomorod-pwa-controls .z-pwa-btn{padding:9px 11px;border:1px solid hsl(var(--border,0 0% 75%));border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}' +
      '#zomorod-pwa-controls .z-pwa-primary{background:#075c48;color:#fff;border-color:#075c48}' +
      '#zomorod-pwa-controls .z-pwa-text{border:0;text-decoration:underline}' +
      '#zomorod-pwa-controls button:disabled{opacity:.55;cursor:wait}' +
      '#zomorod-pwa-modal{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:20px;direction:rtl;font:inherit}' +
      '#zomorod-pwa-modal .z-pwa-shade{position:absolute;inset:0;background:rgba(8,19,17,.64);backdrop-filter:blur(6px)}' +
      '#zomorod-pwa-modal .z-pwa-dialog{position:relative;width:100%;max-width:380px;box-sizing:border-box;max-height:90dvh;overflow:auto;padding:27px 24px 19px;background:#fff;color:#202925;border:1px solid rgba(14,101,77,.12);border-radius:23px;box-shadow:0 22px 65px rgba(0,0,0,.18);text-align:center}' +
      '#zomorod-pwa-modal .z-pwa-symbol{display:grid;place-items:center;width:49px;height:49px;margin:0 auto 15px;border-radius:16px;background:linear-gradient(145deg,#08634e,#b78b32);color:#fff;font-size:25px}' +
      '#zomorod-pwa-modal h2{font-size:17px;line-height:1.8;font-weight:800;margin:0 0 9px}' +
      '#zomorod-pwa-modal p{font-size:12px;line-height:2;color:#5b6963;margin:0 0 12px}' +
      '#zomorod-pwa-modal .z-pwa-modal-status:not(:empty){color:#a46517;font-size:11px}' +
      '#zomorod-pwa-modal button{display:block;width:100%;font:inherit;border:0;cursor:pointer;border-radius:12px;padding:12px;font-size:13px}' +
      '#zomorod-pwa-modal .z-pwa-modal-main{background:#075c48;color:white;font-weight:750}' +
      '#zomorod-pwa-modal .z-pwa-modal-later{margin-top:7px;background:transparent;color:#68726e}' +
      '@media(max-width:640px){#zomorod-pwa-controls{margin:12px 10px 22px;padding:12px;gap:8px}#zomorod-pwa-modal .z-pwa-shade{backdrop-filter:none}}' +
      '@media(prefers-color-scheme:dark){#zomorod-pwa-modal .z-pwa-dialog{background:#18221e;color:#f5f7f5;border-color:#34463d}#zomorod-pwa-modal p{color:#bcc7c0}#zomorod-pwa-modal .z-pwa-modal-later{color:#bec7c0}}';
    document.head.appendChild(style);
  }
  function scheduleIntro() {
    // The subscription page has its own theme boot-guard. Avoid showing the
    // modal behind its splash screen and avoid adding work to its first paint.
    let checks = 0;
    const show = () => {
      if (!document.documentElement.hasAttribute('data-zomorod-booting') || checks++ >= 22) offerIntro();
      else setTimeout(show, 300);
    };
    setTimeout(show, 250);
  }
  async function start() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
    try {
      const response = await fetch(base + '/config', {cache: 'no-store', credentials: 'same-origin'});
      if (!response.ok) return;
      config = await response.json();
    } catch (_) { return; }
    if (!config.pwa_enabled) {
      try {
        const current = await navigator.serviceWorker.getRegistrations();
        await Promise.all(current.filter(r => r.active?.scriptURL.includes(base + '/sw.js')).map(r => r.unregister()));
      } catch (_) {}
      return;
    }
    // Prepare the installable manifest before the person taps Add to Home Screen.
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = config.manifest_url + '?start=' + encodeURIComponent(path);
    document.head.appendChild(manifest);
    if (isIOS()) {
      const meta = document.createElement('meta');
      meta.name = 'apple-mobile-web-app-capable'; meta.content = 'yes';
      document.head.appendChild(meta);
      const icon = document.createElement('link');
      icon.rel = 'apple-touch-icon'; icon.href = base + '/icon/192.png';
      document.head.appendChild(icon);
    }
    loadStyle();
    renderControls();
    if (config.push_enabled) updateSupport();
    try {
      registration = await navigator.serviceWorker.register(config.sw_url, {scope: scope, updateViaCache: 'none'});
      setButtons();
      if (config.push_enabled && 'PushManager' in window) {
        existing = await registration.pushManager.getSubscription();
        setButtons();
        // Existing permission can be recovered after an earlier server failure;
        // this does NOT cause any native permission prompt.
        if (existing && currentPermission() === 'granted') {
          try { await storeSubscription(existing); }
          catch (error) { info(error.message); }
        }
      }
    } catch (error) { info('سرویس اعلان در این مرورگر آماده نشد: ' + (error?.message || '')); }
    scheduleIntro();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    setButtons();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    setButtons();
    info('زمرد با موفقیت روی دستگاه نصب شد.');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {void start();}, {once:true});
  else void start();
})();
