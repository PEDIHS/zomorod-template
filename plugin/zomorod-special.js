(() => {
  'use strict';

  const VERSION = '4.0.0';
  const HEADER_PREFIX = 'x-zomorod-';
  const MARKER_ID = 'zomorod-special-root';
  const NAV_ID = 'zomorod-special-nav';

  const defaults = {
    enabled: true,
    storeName: 'زمرد',
    showConfigs: true,
    showWireGuard: true,
    showPing: false,
    showApps: true,
    showAnnouncement: true,
    announcementMode: 'always',
    announcementTimes: '',
    announcementDuration: 60,
  };

  const css = `
    #${NAV_ID}{position:relative;display:flex;flex-shrink:0;align-items:center;gap:.45rem;padding:.5rem .75rem;white-space:nowrap;border:0;border-bottom:2px solid transparent;background:transparent;color:inherit;font:inherit;font-size:.875rem;font-weight:650;cursor:pointer;transition:color .15s ease,border-color .15s ease,background .15s ease}
    #${NAV_ID}:hover{background:linear-gradient(135deg,rgba(5,150,105,.07),rgba(202,138,4,.05))}
    #${NAV_ID}[data-z-active="true"]{border-bottom-color:#047857;color:inherit;background:linear-gradient(135deg,rgba(5,150,105,.09),rgba(202,138,4,.05))}
    #${NAV_ID} .z-gem-mini{font-size:.82rem;color:#047857}
    #${NAV_ID} .z-badge{font-size:.58rem;padding:.1rem .36rem;border-radius:999px;background:linear-gradient(135deg,#047857,#8a6414);color:#fff;letter-spacing:.03em;line-height:1.3}
    #${MARKER_ID}{position:fixed;inset:0;z-index:2147483000;background:rgba(3,10,8,.62);backdrop-filter:blur(10px);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:3.5rem 1rem 2rem;direction:rtl;font-family:inherit}
    #${MARKER_ID} .z-shell{width:min(1040px,100%);background:var(--background,#fff);color:var(--foreground,#111827);border:1px solid rgba(16,185,129,.23);border-radius:1.2rem;box-shadow:0 24px 80px rgba(0,0,0,.28);overflow:hidden}
    #${MARKER_ID} .z-head{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:1.1rem 1.25rem;background:linear-gradient(135deg,rgba(4,120,87,.14),rgba(161,98,7,.12));border-bottom:1px solid rgba(16,185,129,.17)}
    #${MARKER_ID} .z-title{display:flex;gap:.8rem;align-items:center}.z-gem{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,#065f46,#047857 58%,#b7791f);color:white;font-weight:900;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
    #${MARKER_ID} h1{font-size:1.15rem;margin:0;font-weight:850}#${MARKER_ID} .z-sub{font-size:.76rem;opacity:.68;margin-top:.15rem}
    #${MARKER_ID} .z-close{border:1px solid rgba(127,127,127,.25);background:transparent;color:inherit;border-radius:.65rem;padding:.5rem .75rem;cursor:pointer}
    #${MARKER_ID} .z-body{padding:1.15rem;display:grid;gap:1rem}
    #${MARKER_ID} .z-card{border:1px solid rgba(127,127,127,.18);border-radius:1rem;padding:1rem;background:rgba(127,127,127,.025)}
    #${MARKER_ID} .z-card h2{font-size:.94rem;margin:0 0 .75rem;font-weight:800;display:flex;align-items:center;gap:.45rem}
    #${MARKER_ID} .z-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}@media(max-width:720px){#${MARKER_ID} .z-grid{grid-template-columns:1fr}}
    #${MARKER_ID} label{font-size:.76rem;font-weight:700;display:block;margin-bottom:.35rem}
    #${MARKER_ID} input[type=text],#${MARKER_ID} input[type=number],#${MARKER_ID} input[type=url],#${MARKER_ID} textarea,#${MARKER_ID} select{width:100%;box-sizing:border-box;border:1px solid rgba(127,127,127,.28);background:var(--background,#fff);color:inherit;border-radius:.7rem;padding:.62rem .7rem;outline:none;font:inherit;font-size:.82rem}
    #${MARKER_ID} textarea{min-height:84px;resize:vertical}
    #${MARKER_ID} .z-toggle{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.65rem .75rem;border:1px solid rgba(127,127,127,.14);border-radius:.75rem}
    #${MARKER_ID} .z-toggle span{font-size:.8rem;font-weight:650}#${MARKER_ID} input[type=checkbox]{width:18px;height:18px;accent-color:#047857}
    #${MARKER_ID} .z-help{font-size:.7rem;opacity:.62;margin-top:.3rem;line-height:1.7}
    #${MARKER_ID} .z-apps{display:flex;flex-wrap:wrap;gap:.4rem}.z-chip{font-size:.7rem;border:1px solid rgba(16,185,129,.2);border-radius:999px;padding:.28rem .55rem;background:rgba(16,185,129,.06)}
    #${MARKER_ID} .z-actions{display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap;padding:1rem 1.15rem;border-top:1px solid rgba(127,127,127,.16)}
    #${MARKER_ID} .z-save{border:0;border-radius:.75rem;background:linear-gradient(135deg,#047857,#065f46 65%,#9a6b1f);color:#fff;padding:.68rem 1.05rem;font-weight:800;cursor:pointer}.z-save:disabled{opacity:.55;cursor:wait}
    #${MARKER_ID} .z-status{font-size:.74rem;opacity:.7}.z-status.ok{color:#059669;opacity:1}.z-status.err{color:#dc2626;opacity:1}
    #${MARKER_ID} .z-native{font-size:.72rem;padding:.35rem .55rem;border-radius:.55rem;background:rgba(202,138,4,.09);border:1px solid rgba(202,138,4,.18)}
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const asBool = (value, fallback) => value == null || value === '' ? fallback : !['false','0','off','no'].includes(String(value).toLowerCase());
  const normalizeHeaders = (headers) => Object.fromEntries(Object.entries(headers || {}).map(([k,v]) => [String(k).toLowerCase(), String(v ?? '')]));
  const getHeader = (headers, key) => headers[`${HEADER_PREFIX}${key}`] ?? '';
  const setHeader = (headers, key, value) => { headers[`${HEADER_PREFIX}${key}`] = String(value); };
  const removeHeader = (headers, key) => {
    const expected = `${HEADER_PREFIX}${key}`.toLowerCase();
    Object.keys(headers).forEach((name) => {
      if (name.toLowerCase() === expected) delete headers[name];
    });
  };
  const encodeUtf8Base64 = (value) => {
    const bytes = new TextEncoder().encode(String(value ?? ''));
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  };
  const decodeUtf8Base64 = (value) => {
    if (!value) return '';
    try {
      const binary = atob(value);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return '';
    }
  };
  const getToken = () => localStorage.getItem('token') || '';

  async function api(path, options = {}) {
    const token = getToken();
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Client-Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    headers.set('X-Client-Timezone-Offset-Minutes', String(-new Date().getTimezoneOffset()));
    const response = await fetch(path, { ...options, headers, cache: 'no-store' });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${response.status} ${detail || response.statusText}`);
    }
    return response.json();
  }

  function extract(settings) {
    const subscription = settings?.subscription || {};
    const headers = normalizeHeaders(subscription.response_headers || {});
    const encodedStoreName = getHeader(headers, 'store-name-b64');
    const legacyStoreName = getHeader(headers, 'store-name');
    return {
      enabled: asBool(getHeader(headers, 'enabled'), defaults.enabled),
      storeName: decodeUtf8Base64(encodedStoreName) || legacyStoreName || defaults.storeName,
      showConfigs: asBool(getHeader(headers, 'show-configs'), defaults.showConfigs),
      showWireGuard: asBool(getHeader(headers, 'show-wireguard'), defaults.showWireGuard),
      showPing: asBool(getHeader(headers, 'show-ping'), defaults.showPing),
      showApps: asBool(getHeader(headers, 'show-apps'), defaults.showApps),
      showAnnouncement: asBool(getHeader(headers, 'show-announcement'), defaults.showAnnouncement),
      announcementMode: getHeader(headers, 'announcement-mode') === 'scheduled' ? 'scheduled' : 'always',
      announcementTimes: getHeader(headers, 'announcement-times'),
      announcementDuration: Number(getHeader(headers, 'announcement-duration')) || defaults.announcementDuration,
      announce: subscription.announce || '',
      announceUrl: subscription.announce_url || '',
      allowBrowserConfig: subscription.allow_browser_config !== false,
      nativeLinks: subscription.manual_sub_request?.links !== false,
      nativeWireGuard: subscription.manual_sub_request?.wireguard !== false,
      apps: Array.isArray(subscription.applications) ? subscription.applications : [],
    };
  }

  function field(id) { return document.getElementById(id); }
  function checked(id) { return Boolean(field(id)?.checked); }
  function value(id) { return String(field(id)?.value ?? '').trim(); }
  function setTabActive(active) {
    const tab = document.getElementById(NAV_ID);
    if (tab) tab.dataset.zActive = active ? 'true' : 'false';
  }

  function render(settings) {
    document.getElementById(MARKER_ID)?.remove();
    const cfg = extract(settings);
    const root = document.createElement('div');
    root.id = MARKER_ID;
    root.innerHTML = `
      <div class="z-shell" role="dialog" aria-modal="true" aria-label="تنظیمات زمرد">
        <div class="z-head">
          <div class="z-title"><div class="z-gem">Z</div><div><h1>زمرد تمپلیت <span class="z-native">Special</span></h1><div class="z-sub">Zomorod Control Plane · v${VERSION} · افزونه مستقل برای PasarGuard</div></div></div>
          <button class="z-close" data-z-close>بازگشت به پنل</button>
        </div>
        <div class="z-body">
          <section class="z-card">
            <h2>◆ هویت و نمایش تمپلیت</h2>
            <div class="z-grid">
              <div><label for="z-store">نام فروشگاه</label><input id="z-store" type="text" maxlength="80" value="${escapeHtml(cfg.storeName)}"><div class="z-help">نام UTF-8 به‌صورت Base64 امن در تنظیمات مشترک ذخیره می‌شود تا Headerهای PasarGuard معتبر بمانند.</div></div>
              <div class="z-toggle"><span>فعال بودن لایه زمرد</span><input id="z-enabled" type="checkbox" ${cfg.enabled ? 'checked' : ''}></div>
              <div class="z-toggle"><span>نمایش کانفیگ‌های معمولی</span><input id="z-show-configs" type="checkbox" ${cfg.showConfigs ? 'checked' : ''}></div>
              <div class="z-toggle"><span>نمایش بخش WireGuard</span><input id="z-show-wg" type="checkbox" ${cfg.showWireGuard ? 'checked' : ''}></div>
              <div class="z-toggle"><span>نمایش پینگ تخمینی سرورها</span><input id="z-show-ping" type="checkbox" ${cfg.showPing ? 'checked' : ''}></div>
              <div class="z-toggle"><span>نمایش بخش اپلیکیشن‌ها</span><input id="z-show-apps" type="checkbox" ${cfg.showApps ? 'checked' : ''}></div>
            </div>
          </section>

          <section class="z-card">
            <h2>◆ تنظیمات مشترک با PasarGuard</h2>
            <div class="z-grid">
              <div class="z-toggle"><span>Allow browser config</span><input id="z-native-browser" type="checkbox" ${cfg.allowBrowserConfig ? 'checked' : ''}></div>
              <div class="z-toggle"><span>فرمت Links در PasarGuard</span><input id="z-native-links" type="checkbox" ${cfg.nativeLinks ? 'checked' : ''}></div>
              <div class="z-toggle"><span>فرمت WireGuard در PasarGuard</span><input id="z-native-wg" type="checkbox" ${cfg.nativeWireGuard ? 'checked' : ''}></div>
              <div><label>اپلیکیشن‌های تعریف‌شده در PasarGuard</label><div class="z-apps">${cfg.apps.length ? cfg.apps.map((app) => `<span class="z-chip">${escapeHtml(app.name)} · ${escapeHtml(app.platform)}</span>`).join('') : '<span class="z-help">اپلیکیشنی تعریف نشده است.</span>'}</div><div class="z-help">این لیست مستقیماً از همان settings پاسارگارد خوانده می‌شود؛ بنابراین دو دیتابیس جدا نداریم.</div></div>
            </div>
          </section>

          <section class="z-card">
            <h2>◆ اعلان هوشمند</h2>
            <div class="z-grid">
              <div class="z-toggle"><span>نمایش اعلان در زمرد</span><input id="z-show-ann" type="checkbox" ${cfg.showAnnouncement ? 'checked' : ''}></div>
              <div><label for="z-ann-mode">حالت نمایش</label><select id="z-ann-mode"><option value="always" ${cfg.announcementMode === 'always' ? 'selected' : ''}>همیشه</option><option value="scheduled" ${cfg.announcementMode === 'scheduled' ? 'selected' : ''}>ساعت‌بندی‌شده</option></select></div>
              <div><label for="z-ann-times">ساعت‌های نمایش</label><input id="z-ann-times" type="text" dir="ltr" placeholder="09:00,14:30,21:00" value="${escapeHtml(cfg.announcementTimes)}"><div class="z-help">چند ساعت را با کاما جدا کن. تعداد دفعات نمایش روزانه برابر تعداد ساعت‌های ثبت‌شده است.</div></div>
              <div><label for="z-ann-duration">مدت هر نوبت</label><input id="z-ann-duration" type="number" min="1" max="1440" value="${escapeHtml(cfg.announcementDuration)}"><div class="z-help">دقیقه؛ مثلاً 60 یعنی اعلان از ساعت تعیین‌شده یک ساعت فعال است.</div></div>
              <div><label for="z-ann-text">متن اعلان PasarGuard</label><textarea id="z-ann-text" maxlength="128">${escapeHtml(cfg.announce)}</textarea><div class="z-help">همان فیلد native اعلان پاسارگارد است و از متغیرهای قالب‌بندی خود پنل پشتیبانی می‌کند.</div></div>
              <div><label for="z-ann-url">لینک اعلان</label><input id="z-ann-url" type="url" dir="ltr" value="${escapeHtml(cfg.announceUrl)}"></div>
            </div>
          </section>
        </div>
        <div class="z-actions"><span class="z-status" id="z-status">آماده ذخیره</span><button class="z-save" id="z-save">ذخیره تنظیمات زمرد</button></div>
      </div>`;
    document.body.appendChild(root);
    setTabActive(true);

    const close = () => {
      root.remove();
      setTabActive(false);
    };
    root.querySelector('[data-z-close]')?.addEventListener('click', close);
    root.addEventListener('click', (event) => { if (event.target === root) close(); });
    field('z-save')?.addEventListener('click', () => save(settings));
  }

  async function save(settings) {
    const button = field('z-save');
    const status = field('z-status');
    if (!button || !status) return;
    button.disabled = true;
    status.className = 'z-status';
    status.textContent = 'در حال ذخیره…';

    try {
      const times = value('z-ann-times');
      if (times && !times.split(',').every((item) => /^([01]\d|2[0-3]):[0-5]\d$/.test(item.trim()))) {
        throw new Error('فرمت ساعت باید HH:MM باشد؛ نمونه: 09:00,21:30');
      }

      settings.subscription ||= {};
      const subscription = settings.subscription;
      const responseHeaders = { ...(subscription.response_headers || {}) };
      const storeName = value('z-store') || defaults.storeName;
      setHeader(responseHeaders, 'enabled', checked('z-enabled'));
      removeHeader(responseHeaders, 'store-name');
      setHeader(responseHeaders, 'store-name-b64', encodeUtf8Base64(storeName));
      setHeader(responseHeaders, 'show-configs', checked('z-show-configs'));
      setHeader(responseHeaders, 'show-wireguard', checked('z-show-wg'));
      setHeader(responseHeaders, 'show-ping', checked('z-show-ping'));
      setHeader(responseHeaders, 'show-apps', checked('z-show-apps'));
      setHeader(responseHeaders, 'show-announcement', checked('z-show-ann'));
      setHeader(responseHeaders, 'announcement-mode', value('z-ann-mode') || 'always');
      setHeader(responseHeaders, 'announcement-times', times);
      setHeader(responseHeaders, 'announcement-duration', Math.max(1, Math.min(1440, Number(value('z-ann-duration')) || 60)));
      subscription.response_headers = responseHeaders;
      subscription.announce = value('z-ann-text');
      subscription.announce_url = value('z-ann-url');
      subscription.allow_browser_config = checked('z-native-browser');
      subscription.manual_sub_request ||= {};
      subscription.manual_sub_request.links = checked('z-native-links');
      subscription.manual_sub_request.wireguard = checked('z-native-wg');

      const updated = await api('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
      status.className = 'z-status ok';
      status.textContent = 'ذخیره شد؛ تنظیمات فوراً با PasarGuard مشترک شد ✓';
      setTimeout(() => render(updated), 700);
    } catch (error) {
      console.error('[Zomorod] Save failed', error);
      status.className = 'z-status err';
      status.textContent = `خطا: ${error.message || error}`;
    } finally {
      button.disabled = false;
    }
  }

  async function openPage() {
    setTabActive(true);
    try {
      const settings = await api('/api/settings');
      render(settings);
    } catch (error) {
      console.error('[Zomorod] Could not load settings', error);
      setTabActive(false);
      alert(`زمرد نتوانست تنظیمات PasarGuard را بخواند.\n${error.message || error}`);
    }
  }

  function findSettingsTabBar() {
    const bars = [...document.querySelectorAll('.scrollbar-hide, [class*="overflow-x-auto"][class*="border-b"]')];
    return bars.find((bar) => {
      const buttons = [...bar.querySelectorAll('button')];
      if (buttons.length < 3) return false;
      const text = bar.textContent || '';
      return /subscription|subscriptions|اشتراک|theme|general|عمومی|تنظیمات/i.test(text);
    }) || null;
  }

  function ensureTab() {
    if (document.getElementById(NAV_ID)) return;
    const tabBar = findSettingsTabBar();
    if (!tabBar) return;

    const button = document.createElement('button');
    button.id = NAV_ID;
    button.type = 'button';
    button.dataset.zActive = 'false';
    button.title = 'Zomorod Template Special';
    button.innerHTML = '<span class="z-gem-mini">◆</span><span>زمرد تمپلیت</span><span class="z-badge">Special</span>';
    button.addEventListener('click', openPage);
    tabBar.appendChild(button);
  }

  function maintain() {
    ensureTab();
    if (!document.getElementById(MARKER_ID)) setTabActive(false);
  }

  window.addEventListener('hashchange', maintain);
  const observer = new MutationObserver(maintain);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maintain, { once: true });
  else maintain();
})();
