(() => {
  'use strict';

  const VERSION = '4.0.1';
  const HEADER_PREFIX = 'x-zomorod-';
  const MARKER_ID = 'zomorod-special-root';
  const NAV_ID = 'zomorod-special-nav';
  let active = false;
  let lastSettings = null;

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
    #${NAV_ID}{position:relative;flex-shrink:0;white-space:nowrap}
    #${NAV_ID} .z-tab-inner{display:flex;align-items:center;gap:.375rem}
    #${NAV_ID} .z-gem-icon{width:1rem;height:1rem;color:#059669;filter:drop-shadow(0 0 5px rgba(16,185,129,.28))}
    #${NAV_ID} .z-badge{margin-inline-start:.12rem;font-size:.56rem;font-weight:800;line-height:1;padding:.2rem .34rem;border-radius:999px;color:#fff;background:linear-gradient(135deg,#047857 0%,#065f46 52%,#a06b16 100%);box-shadow:0 0 0 1px rgba(180,130,36,.18),0 2px 8px rgba(6,95,70,.15)}
    #${NAV_ID}[data-z-active="true"]{border-bottom-width:2px!important;border-bottom-color:#059669!important;color:hsl(var(--foreground))!important;background:linear-gradient(180deg,transparent,rgba(16,185,129,.055))}

    #${MARKER_ID}{width:100%;padding:1rem 1rem 2rem;direction:rtl;color:hsl(var(--foreground));font-family:inherit}
    #${MARKER_ID} *{box-sizing:border-box}
    #${MARKER_ID} .z-hero{position:relative;overflow:hidden;border:1px solid rgba(16,185,129,.22);border-radius:calc(var(--radius, .5rem) + .45rem);padding:1.05rem 1.1rem;background:linear-gradient(135deg,rgba(6,95,70,.11),rgba(4,120,87,.06) 52%,rgba(184,134,11,.10));box-shadow:var(--card-shadow,none)}
    #${MARKER_ID} .z-hero:before{content:"";position:absolute;width:240px;height:240px;border-radius:999px;inset:-155px auto auto -65px;background:radial-gradient(circle,rgba(16,185,129,.22),transparent 67%);pointer-events:none}
    #${MARKER_ID} .z-hero:after{content:"";position:absolute;width:210px;height:210px;border-radius:999px;inset:auto -85px -145px auto;background:radial-gradient(circle,rgba(184,134,11,.16),transparent 68%);pointer-events:none}
    #${MARKER_ID} .z-hero-row{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
    #${MARKER_ID} .z-brand{display:flex;align-items:center;gap:.8rem;min-width:0}
    #${MARKER_ID} .z-logo{width:46px;height:46px;display:grid;place-items:center;flex:0 0 auto;border-radius:14px;color:#fff;background:linear-gradient(145deg,#064e3b,#047857 58%,#a06b16);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 8px 22px rgba(6,95,70,.18)}
    #${MARKER_ID} .z-logo svg{width:25px;height:25px}
    #${MARKER_ID} .z-title{margin:0;font-size:1.12rem;font-weight:850;letter-spacing:-.01em}
    #${MARKER_ID} .z-title-row{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
    #${MARKER_ID} .z-special{font-size:.62rem;font-weight:800;padding:.22rem .44rem;border-radius:999px;color:#8a5b08;background:rgba(184,134,11,.11);border:1px solid rgba(184,134,11,.24)}
    html.dark #${MARKER_ID} .z-special{color:#e5b84e}
    #${MARKER_ID} .z-subtitle{margin-top:.18rem;font-size:.76rem;color:hsl(var(--muted-foreground));line-height:1.65}
    #${MARKER_ID} .z-version{font-size:.68rem;color:hsl(var(--muted-foreground));border:1px solid hsl(var(--border));background:hsl(var(--background)/.7);padding:.3rem .5rem;border-radius:.45rem}

    #${MARKER_ID} .z-content{display:grid;gap:1rem;margin-top:1rem}
    #${MARKER_ID} .z-card{position:relative;border:1px solid hsl(var(--border));border-radius:calc(var(--radius, .5rem) + .25rem);background:hsl(var(--card));padding:1rem;box-shadow:var(--card-shadow,none);overflow:hidden}
    #${MARKER_ID} .z-card.z-accent{border-color:rgba(16,185,129,.20)}
    #${MARKER_ID} .z-card.z-accent:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(#059669,#b8860b)}
    #${MARKER_ID} .z-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;margin-bottom:.85rem}
    #${MARKER_ID} .z-card-title{display:flex;align-items:center;gap:.5rem;font-size:.91rem;font-weight:800;margin:0}
    #${MARKER_ID} .z-card-icon{width:28px;height:28px;border-radius:.55rem;display:grid;place-items:center;background:rgba(16,185,129,.08);color:#059669;border:1px solid rgba(16,185,129,.14)}
    #${MARKER_ID} .z-card-icon svg{width:15px;height:15px}
    #${MARKER_ID} .z-card-note{font-size:.68rem;color:hsl(var(--muted-foreground));line-height:1.6}
    #${MARKER_ID} .z-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
    @media(max-width:760px){#${MARKER_ID}{padding:.85rem .75rem 1.5rem}#${MARKER_ID} .z-grid{grid-template-columns:1fr}#${MARKER_ID} .z-hero{padding:.9rem}}

    #${MARKER_ID} .z-field label{display:block;margin-bottom:.35rem;font-size:.74rem;font-weight:700}
    #${MARKER_ID} input[type=text],#${MARKER_ID} input[type=number],#${MARKER_ID} input[type=url],#${MARKER_ID} textarea,#${MARKER_ID} select{width:100%;border:1px solid hsl(var(--border));background:hsl(var(--background));color:hsl(var(--foreground));border-radius:var(--radius,.5rem);padding:.58rem .68rem;font:inherit;font-size:.8rem;outline:none;transition:border-color .15s,box-shadow .15s}
    #${MARKER_ID} textarea{min-height:88px;resize:vertical;line-height:1.65}
    #${MARKER_ID} input:focus,#${MARKER_ID} textarea:focus,#${MARKER_ID} select:focus{border-color:rgba(5,150,105,.62);box-shadow:0 0 0 3px rgba(16,185,129,.09)}
    #${MARKER_ID} .z-help{margin-top:.34rem;font-size:.67rem;color:hsl(var(--muted-foreground));line-height:1.65}

    #${MARKER_ID} .z-toggle{min-height:54px;display:flex;align-items:center;justify-content:space-between;gap:1rem;border:1px solid hsl(var(--border));background:hsl(var(--background)/.45);border-radius:var(--radius,.5rem);padding:.62rem .72rem}
    #${MARKER_ID} .z-toggle-copy{min-width:0}
    #${MARKER_ID} .z-toggle-title{font-size:.77rem;font-weight:700}
    #${MARKER_ID} .z-toggle-sub{font-size:.64rem;color:hsl(var(--muted-foreground));margin-top:.12rem;line-height:1.5}
    #${MARKER_ID} input[type=checkbox]{appearance:none;width:36px;height:20px;flex:0 0 auto;border-radius:999px;background:hsl(var(--input));border:1px solid hsl(var(--border));position:relative;cursor:pointer;transition:.18s}
    #${MARKER_ID} input[type=checkbox]:after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:999px;background:hsl(var(--foreground)/.72);transition:.18s}
    #${MARKER_ID} input[type=checkbox]:checked{background:linear-gradient(135deg,#059669,#047857);border-color:#047857}
    #${MARKER_ID} input[type=checkbox]:checked:after{left:18px;background:#fff}

    #${MARKER_ID} .z-apps{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
    #${MARKER_ID} .z-chip{font-size:.67rem;border:1px solid rgba(16,185,129,.18);border-radius:999px;padding:.3rem .5rem;background:rgba(16,185,129,.055);color:hsl(var(--foreground))}
    #${MARKER_ID} .z-native{font-size:.62rem;padding:.18rem .36rem;border-radius:.4rem;background:rgba(184,134,11,.09);border:1px solid rgba(184,134,11,.17);color:#8a5b08}
    html.dark #${MARKER_ID} .z-native{color:#deb24b}

    #${MARKER_ID} .z-actions{position:sticky;bottom:0;z-index:2;margin-top:1rem;display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;border:1px solid hsl(var(--border));border-radius:calc(var(--radius,.5rem) + .2rem);padding:.72rem .8rem;background:hsl(var(--background)/.88);backdrop-filter:blur(12px);box-shadow:0 -8px 22px rgba(0,0,0,.035)}
    #${MARKER_ID} .z-save{border:0;border-radius:var(--radius,.5rem);padding:.58rem .9rem;font:inherit;font-size:.78rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#047857,#065f46 68%,#8f6418);box-shadow:0 6px 16px rgba(6,95,70,.16);cursor:pointer}
    #${MARKER_ID} .z-save:hover{filter:brightness(1.04)}#${MARKER_ID} .z-save:disabled{opacity:.55;cursor:wait}
    #${MARKER_ID} .z-status{font-size:.7rem;color:hsl(var(--muted-foreground))}.z-status.ok{color:#059669!important}.z-status.err{color:#dc2626!important}
    #${MARKER_ID} .z-loading{padding:3.5rem 1rem;text-align:center;color:hsl(var(--muted-foreground));font-size:.8rem}
    #${MARKER_ID} .z-error{border:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.05);border-radius:.7rem;padding:.85rem;color:#dc2626;font-size:.76rem;line-height:1.7}
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const icons = {
    gem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6.5 3.5h11L22 9l-10 12L2 9l4.5-5.5Z"/><path d="M2 9h20M8 9l4 12 4-12M6.5 3.5 8 9m9.5-5.5L16 9M6.5 3.5h11"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  };

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
    return {
      enabled: asBool(getHeader(headers, 'enabled'), defaults.enabled),
      storeName: decodeUtf8Base64(getHeader(headers, 'store-name-b64')) || getHeader(headers, 'store-name') || defaults.storeName,
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

  function findSettingsTabBar() {
    const bars = [...document.querySelectorAll('.scrollbar-hide, [class*="overflow-x-auto"][class*="border-b"]')];
    return bars.find((bar) => {
      const buttons = [...bar.querySelectorAll('button')];
      if (buttons.length < 3) return false;
      const text = bar.textContent || '';
      return /subscription|subscriptions|اشتراک|theme|general|عمومی|تنظیمات/i.test(text);
    }) || null;
  }

  function getOutlet(tabBar = findSettingsTabBar()) {
    if (!tabBar) return null;
    const sibling = tabBar.nextElementSibling;
    return sibling instanceof HTMLElement ? sibling : null;
  }

  function getPageHeader(tabBar = findSettingsTabBar()) {
    const settingsBody = tabBar?.closest('.relative.w-full');
    const header = settingsBody?.previousElementSibling;
    return header instanceof HTMLElement ? header : null;
  }

  function setHeaderSpecial(enabled) {
    const tabBar = findSettingsTabBar();
    const header = getPageHeader(tabBar);
    if (!header) return;
    const title = header.querySelector('h1');
    const desc = title?.parentElement?.querySelector('span');
    if (!title) return;

    if (enabled) {
      if (!title.dataset.zOriginal) title.dataset.zOriginal = title.textContent || '';
      title.textContent = 'Zomorod';
      if (desc) {
        if (!desc.dataset.zOriginal) desc.dataset.zOriginal = desc.textContent || '';
        desc.textContent = 'Manage Zomorod template settings';
      }
    } else {
      if (title.dataset.zOriginal) {
        title.textContent = title.dataset.zOriginal;
        delete title.dataset.zOriginal;
      }
      if (desc?.dataset.zOriginal) {
        desc.textContent = desc.dataset.zOriginal;
        delete desc.dataset.zOriginal;
      }
    }
  }

  function setTabActive(enabled) {
    const tab = document.getElementById(NAV_ID);
    if (!tab) return;
    tab.dataset.zActive = enabled ? 'true' : 'false';
    tab.setAttribute('aria-selected', enabled ? 'true' : 'false');
  }

  function hideNativeOutletContent() {
    const outlet = getOutlet();
    if (!outlet) return null;
    [...outlet.children].forEach((child) => {
      if (!(child instanceof HTMLElement) || child.id === MARKER_ID) return;
      if (!child.hasAttribute('data-zomorod-prev-display')) child.setAttribute('data-zomorod-prev-display', child.style.display || '');
      child.style.display = 'none';
    });
    return outlet;
  }

  function restoreNativeOutletContent() {
    const tabBar = findSettingsTabBar();
    const outlet = getOutlet(tabBar);
    document.getElementById(MARKER_ID)?.remove();
    if (outlet) {
      [...outlet.querySelectorAll('[data-zomorod-prev-display]')].forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        child.style.display = child.getAttribute('data-zomorod-prev-display') || '';
        child.removeAttribute('data-zomorod-prev-display');
      });
    }
    setHeaderSpecial(false);
    setTabActive(false);
  }

  function deactivate() {
    if (!active && !document.getElementById(MARKER_ID)) return;
    active = false;
    restoreNativeOutletContent();
  }

  function render(settings) {
    lastSettings = settings;
    active = true;
    const outlet = hideNativeOutletContent();
    if (!outlet) return;
    document.getElementById(MARKER_ID)?.remove();

    const cfg = extract(settings);
    const root = document.createElement('div');
    root.id = MARKER_ID;
    root.innerHTML = `
      <section class="z-hero">
        <div class="z-hero-row">
          <div class="z-brand">
            <div class="z-logo">${icons.gem}</div>
            <div>
              <div class="z-title-row"><h2 class="z-title">Zomorod Template</h2><span class="z-special">SPECIAL</span></div>
              <div class="z-subtitle">کنترل حرفه‌ای تمپلیت زمرد با تنظیمات مشترک و Native پاسارگارد</div>
            </div>
          </div>
          <span class="z-version">v${VERSION}</span>
        </div>
      </section>

      <div class="z-content">
        <section class="z-card z-accent">
          <div class="z-card-head">
            <div><h3 class="z-card-title"><span class="z-card-icon">${icons.sliders}</span>هویت و نمایش تمپلیت</h3><div class="z-card-note">ظاهر اصلی تمپلیت دست‌نخورده می‌ماند؛ این بخش فقط قابلیت‌های نمایش را کنترل می‌کند.</div></div>
          </div>
          <div class="z-grid">
            <div class="z-field"><label for="z-store">نام فروشگاه</label><input id="z-store" type="text" maxlength="80" value="${escapeHtml(cfg.storeName)}"><div class="z-help">نام UTF-8 به‌صورت امن در تنظیمات مشترک PasarGuard ذخیره می‌شود.</div></div>
            <div class="z-toggle"><div class="z-toggle-copy"><div class="z-toggle-title">فعال بودن لایه زمرد</div><div class="z-toggle-sub">کنترل قابلیت‌های افزونه بدون تغییر Skin اصلی</div></div><input id="z-enabled" type="checkbox" ${cfg.enabled ? 'checked' : ''}></div>
            <div class="z-toggle"><div class="z-toggle-copy"><div class="z-toggle-title">نمایش کانفیگ‌های معمولی</div><div class="z-toggle-sub">VLESS / VMess / Trojan و سایر لینک‌ها</div></div><input id="z-show-configs" type="checkbox" ${cfg.showConfigs ? 'checked' : ''}></div>
            <div class="z-toggle"><div class="z-toggle-copy"><div class="z-toggle-title">نمایش WireGuard</div><div class="z-toggle-sub">دانلود Native فایل WireGuard پاسارگارد</div></div><input id="z-show-wg" type="checkbox" ${cfg.showWireGuard ? 'checked' : ''}></div>
            <div class="z-toggle"><div class="z-toggle-copy"><div class="z-toggle-title">نمایش پینگ تخمینی</div><div class="z-toggle-sub">Ping نمایشی تمپلیت، نه ICMP واقعی</div></div><input id="z-show-ping" type="checkbox" ${cfg.showPing ? 'checked' : ''}></div>
            <div class="z-toggle"><div class="z-toggle-copy"><div class="z-toggle-title">نمایش اپلیکیشن‌ها</div><div class="z-toggle-sub">استفاده از همان Applications تعریف‌شده در PasarGuard</div></div><input id="z-show-apps" type="checkbox" ${cfg.showApps ? 'checked' : ''}></div>
          </div>
        </section>

        <section class="z-card">
          <div class="z-card-head">
            <div><h3 class="z-card-title"><span class="z-card-icon">${icons.link}</span>PasarGuard Native</h3><div class="z-card-note">این گزینه‌ها مستقیماً روی Settings خود پاسارگارد اعمال می‌شوند و دیتابیس جدا ندارند.</div></div><span class="z-native">SHARED SETTINGS</span>
          </div>
          <div class="z-grid">
            <div class="z-toggle"><div class="z-toggle-copy"><div class="z-toggle-title">Allow browser config</div><div class="z-toggle-sub">اجازه نمایش کانفیگ در مرورگر</div></div><input id="z-native-browser" type="checkbox" ${cfg.allowBrowserConfig ? 'checked' : ''}></div>
            <div class="z-toggle"><div class="z-toggle-copy"><div class="z-toggle-title">Links format</div><div class="z-toggle-sub">فرمت Native لینک‌های اشتراک</div></div><input id="z-native-links" type="checkbox" ${cfg.nativeLinks ? 'checked' : ''}></div>
            <div class="z-toggle"><div class="z-toggle-copy"><div class="z-toggle-title">WireGuard format</div><div class="z-toggle-sub">فعال بودن endpoint و فرمت Native WireGuard</div></div><input id="z-native-wg" type="checkbox" ${cfg.nativeWireGuard ? 'checked' : ''}></div>
            <div class="z-field"><label>اپلیکیشن‌های تعریف‌شده</label><div class="z-apps">${cfg.apps.length ? cfg.apps.map((app) => `<span class="z-chip">${escapeHtml(app.name)} · ${escapeHtml(app.platform)}</span>`).join('') : '<span class="z-help">اپلیکیشنی در PasarGuard تعریف نشده است.</span>'}</div></div>
          </div>
        </section>

        <section class="z-card z-accent">
          <div class="z-card-head">
            <div><h3 class="z-card-title"><span class="z-card-icon">${icons.bell}</span>اعلان هوشمند</h3><div class="z-card-note">اعلان Native پاسارگارد با امکان زمان‌بندی چند نوبت در روز برای زمرد.</div></div>
          </div>
          <div class="z-grid">
            <div class="z-toggle"><div class="z-toggle-copy"><div class="z-toggle-title">نمایش اعلان در زمرد</div><div class="z-toggle-sub">نمایش یا مخفی‌کردن Announcement در صفحه کاربر</div></div><input id="z-show-ann" type="checkbox" ${cfg.showAnnouncement ? 'checked' : ''}></div>
            <div class="z-field"><label for="z-ann-mode">حالت نمایش</label><select id="z-ann-mode"><option value="always" ${cfg.announcementMode === 'always' ? 'selected' : ''}>همیشه</option><option value="scheduled" ${cfg.announcementMode === 'scheduled' ? 'selected' : ''}>ساعت‌بندی‌شده</option></select></div>
            <div class="z-field"><label for="z-ann-times">ساعت‌های نمایش</label><input id="z-ann-times" type="text" dir="ltr" placeholder="09:00,14:30,21:00" value="${escapeHtml(cfg.announcementTimes)}"><div class="z-help">چند ساعت را با کاما جدا کن.</div></div>
            <div class="z-field"><label for="z-ann-duration">مدت هر نوبت (دقیقه)</label><input id="z-ann-duration" type="number" min="1" max="1440" value="${escapeHtml(cfg.announcementDuration)}"></div>
            <div class="z-field"><label for="z-ann-text">متن اعلان PasarGuard</label><textarea id="z-ann-text" maxlength="128">${escapeHtml(cfg.announce)}</textarea></div>
            <div class="z-field"><label for="z-ann-url">لینک اعلان</label><input id="z-ann-url" type="url" dir="ltr" value="${escapeHtml(cfg.announceUrl)}"></div>
          </div>
        </section>
      </div>

      <div class="z-actions"><span class="z-status" id="z-status">آماده ذخیره</span><button class="z-save" id="z-save">Save Zomorod Settings</button></div>`;

    outlet.appendChild(root);
    setHeaderSpecial(true);
    setTabActive(true);
    field('z-save')?.addEventListener('click', () => save(settings));
  }

  function renderLoading() {
    active = true;
    const outlet = hideNativeOutletContent();
    if (!outlet) return;
    document.getElementById(MARKER_ID)?.remove();
    const root = document.createElement('div');
    root.id = MARKER_ID;
    root.innerHTML = `<div class="z-loading">Loading Zomorod settings…</div>`;
    outlet.appendChild(root);
    setHeaderSpecial(true);
    setTabActive(true);
  }

  function renderError(error) {
    const outlet = hideNativeOutletContent();
    if (!outlet) return;
    document.getElementById(MARKER_ID)?.remove();
    const root = document.createElement('div');
    root.id = MARKER_ID;
    root.innerHTML = `<div class="z-error">Zomorod could not load PasarGuard settings.<br>${escapeHtml(error?.message || error)}</div>`;
    outlet.appendChild(root);
    setHeaderSpecial(true);
    setTabActive(true);
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
      lastSettings = updated;
      status.className = 'z-status ok';
      status.textContent = 'ذخیره شد و با PasarGuard همگام شد ✓';
      setTimeout(() => { if (active) render(updated); }, 650);
    } catch (error) {
      console.error('[Zomorod] Save failed', error);
      status.className = 'z-status err';
      status.textContent = `خطا: ${error.message || error}`;
    } finally {
      button.disabled = false;
    }
  }

  async function openPage() {
    active = true;
    renderLoading();
    try {
      const settings = await api('/api/settings');
      if (!active) return;
      render(settings);
    } catch (error) {
      console.error('[Zomorod] Could not load settings', error);
      if (active) renderError(error);
    }
  }

  function ensureTab() {
    const tabBar = findSettingsTabBar();
    if (!tabBar) return;

    if (!tabBar.dataset.zomorodBound) {
      tabBar.dataset.zomorodBound = '1';
      tabBar.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (button && button.id !== NAV_ID) deactivate();
      }, true);
    }

    if (document.getElementById(NAV_ID)) return;
    const button = document.createElement('button');
    button.id = NAV_ID;
    button.type = 'button';
    button.dataset.zActive = 'false';
    button.title = 'Zomorod Special';
    button.className = 'relative flex-shrink-0 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors text-muted-foreground hover:text-foreground';
    button.innerHTML = `<div class="z-tab-inner">${icons.gem}<span>Zomorod</span><span class="z-badge">Special</span></div>`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPage();
    });
    tabBar.appendChild(button);
    if (active) setTabActive(true);
  }

  function maintain() {
    const tabBar = findSettingsTabBar();
    if (!tabBar) {
      if (active) deactivate();
      return;
    }
    ensureTab();
    if (active) {
      hideNativeOutletContent();
      setHeaderSpecial(true);
      setTabActive(true);
      if (!document.getElementById(MARKER_ID) && lastSettings) render(lastSettings);
    }
  }

  window.addEventListener('popstate', () => { if (active) deactivate(); setTimeout(maintain, 0); });
  const observer = new MutationObserver(maintain);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maintain, { once: true });
  else maintain();
})();
