(() => {
  'use strict';

  const VERSION = '4.3.0';
  const HEADER_PREFIX = 'x-zomorod-';
  const NAV_ID = 'zomorod-special-nav';
  const ROOT_ID = 'zomorod-special-root';
  const OUTLET_MARK = 'data-zomorod-prev-display';

  let active = false;
  let cachedSettings = null;
  let cachedNamespaces = null;
  let namespaceError = null;
  let maintainQueued = false;
  let ownerResolved = false;
  let ownerAllowed = false;

  const defaults = {
    storeName: 'زمرد',
    showConfigs: false,
    showWireGuard: false,
    showPing: true,
    showApps: true,
    showAnnouncement: false,
    announcementMode: 'always',
    announcementTimes: '',
    announcementDuration: 60,
  };

  const css = `
    #${NAV_ID}{position:relative;flex-shrink:0;white-space:nowrap}
    #${NAV_ID} .z-tab{display:flex;align-items:center;gap:.38rem}
    #${NAV_ID} .z-tab-gem{width:1rem;height:1rem;color:#059669;filter:drop-shadow(0 0 5px rgba(16,185,129,.28))}
    #${NAV_ID} .z-tab-badge{font-size:.56rem;font-weight:800;line-height:1;padding:.2rem .34rem;border-radius:999px;color:#fff;background:linear-gradient(135deg,#047857,#065f46 58%,#9a6a17);box-shadow:0 0 0 1px rgba(184,134,11,.18),0 2px 8px rgba(6,95,70,.15)}
    [data-zomorod-active="1"] > button:not(#${NAV_ID}){border-bottom-color:transparent!important;color:hsl(var(--muted-foreground))!important}
    #${NAV_ID}[data-z-active="true"]{border-bottom-width:2px!important;border-bottom-color:#059669!important;color:hsl(var(--foreground))!important;background:linear-gradient(180deg,transparent,rgba(16,185,129,.05))}
    #${ROOT_ID}{width:100%;padding:1rem 1rem 2rem;direction:rtl;color:hsl(var(--foreground));font-family:inherit}
    #${ROOT_ID} *{box-sizing:border-box}
    #${ROOT_ID} .z-hero{position:relative;overflow:hidden;border:1px solid rgba(16,185,129,.22);border-radius:calc(var(--radius,.5rem) + .45rem);padding:1.1rem;background:linear-gradient(135deg,rgba(6,95,70,.12),rgba(4,120,87,.055) 55%,rgba(184,134,11,.10));box-shadow:var(--card-shadow,none)}
    #${ROOT_ID} .z-hero:before{content:"";position:absolute;width:240px;height:240px;border-radius:999px;left:-90px;top:-170px;background:radial-gradient(circle,rgba(16,185,129,.22),transparent 68%);pointer-events:none}
    #${ROOT_ID} .z-hero:after{content:"";position:absolute;width:220px;height:220px;border-radius:999px;right:-90px;bottom:-160px;background:radial-gradient(circle,rgba(184,134,11,.17),transparent 68%);pointer-events:none}
    #${ROOT_ID} .z-hero-row{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
    #${ROOT_ID} .z-brand{display:flex;align-items:center;gap:.8rem}
    #${ROOT_ID} .z-logo{width:46px;height:46px;display:grid;place-items:center;border-radius:14px;color:#fff;background:linear-gradient(145deg,#064e3b,#047857 60%,#9a6a17);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 8px 24px rgba(6,95,70,.18)}
    #${ROOT_ID} .z-logo svg{width:25px;height:25px}
    #${ROOT_ID} .z-title-row{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
    #${ROOT_ID} .z-title{margin:0;font-size:1.12rem;font-weight:850;letter-spacing:-.01em}
    #${ROOT_ID} .z-special{font-size:.61rem;font-weight:850;padding:.22rem .44rem;border-radius:999px;color:#8a5b08;background:rgba(184,134,11,.10);border:1px solid rgba(184,134,11,.24)}
    html.dark #${ROOT_ID} .z-special{color:#e5b84e}
    #${ROOT_ID} .z-subtitle{margin-top:.18rem;font-size:.75rem;color:hsl(var(--muted-foreground));line-height:1.65}
    #${ROOT_ID} .z-version{font-size:.66rem;color:hsl(var(--muted-foreground));border:1px solid hsl(var(--border));background:hsl(var(--background)/.72);padding:.3rem .5rem;border-radius:.45rem}
    #${ROOT_ID} .z-content{display:grid;gap:1rem;margin-top:1rem}
    #${ROOT_ID} .z-card{position:relative;border:1px solid hsl(var(--border));border-radius:calc(var(--radius,.5rem) + .25rem);background:hsl(var(--card));padding:1rem;box-shadow:var(--card-shadow,none);overflow:hidden}
    #${ROOT_ID} .z-card.z-accent{border-color:rgba(16,185,129,.20)}
    #${ROOT_ID} .z-card.z-accent:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(#059669,#b8860b)}
    #${ROOT_ID} .z-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;margin-bottom:.85rem}
    #${ROOT_ID} .z-card-title{display:flex;align-items:center;gap:.5rem;font-size:.91rem;font-weight:800;margin:0}
    #${ROOT_ID} .z-card-icon{width:29px;height:29px;border-radius:.55rem;display:grid;place-items:center;background:rgba(16,185,129,.08);color:#059669;border:1px solid rgba(16,185,129,.14)}
    #${ROOT_ID} .z-card-icon svg{width:15px;height:15px}
    #${ROOT_ID} .z-card-note{font-size:.67rem;color:hsl(var(--muted-foreground));line-height:1.6;margin-top:.18rem}
    #${ROOT_ID} .z-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
    @media(max-width:760px){#${ROOT_ID}{padding:.85rem .75rem 1.5rem}#${ROOT_ID} .z-grid{grid-template-columns:1fr}}
    #${ROOT_ID} .z-field label{display:block;margin-bottom:.35rem;font-size:.74rem;font-weight:700}
    #${ROOT_ID} input[type=text],#${ROOT_ID} input[type=number],#${ROOT_ID} input[type=url],#${ROOT_ID} textarea,#${ROOT_ID} select{width:100%;border:1px solid hsl(var(--border));background:hsl(var(--background));color:hsl(var(--foreground));border-radius:var(--radius,.5rem);padding:.58rem .68rem;font:inherit;font-size:.8rem;outline:none;transition:border-color .15s,box-shadow .15s}
    #${ROOT_ID} textarea{min-height:88px;resize:vertical;line-height:1.65}
    #${ROOT_ID} input:focus,#${ROOT_ID} textarea:focus,#${ROOT_ID} select:focus{border-color:rgba(5,150,105,.62);box-shadow:0 0 0 3px rgba(16,185,129,.09)}
    #${ROOT_ID} .z-help{margin-top:.34rem;font-size:.66rem;color:hsl(var(--muted-foreground));line-height:1.6}
    #${ROOT_ID} .z-toggle{min-height:55px;display:flex;align-items:center;justify-content:space-between;gap:1rem;border:1px solid hsl(var(--border));background:hsl(var(--background)/.46);border-radius:var(--radius,.5rem);padding:.62rem .72rem}
    #${ROOT_ID} .z-toggle.is-special{border-color:rgba(184,134,11,.20);background:linear-gradient(135deg,rgba(6,95,70,.035),rgba(184,134,11,.045))}
    #${ROOT_ID} .z-toggle-title{font-size:.77rem;font-weight:700}
    #${ROOT_ID} .z-toggle-sub{font-size:.64rem;color:hsl(var(--muted-foreground));margin-top:.12rem;line-height:1.5}
    #${ROOT_ID} input[type=checkbox]{appearance:none;width:36px;height:20px;flex:0 0 auto;border-radius:999px;background:hsl(var(--input));border:1px solid hsl(var(--border));position:relative;cursor:pointer;transition:.18s}
    #${ROOT_ID} input[type=checkbox]:after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:999px;background:hsl(var(--foreground)/.72);transition:.18s}
    #${ROOT_ID} input[type=checkbox]:checked{background:linear-gradient(135deg,#059669,#047857);border-color:#047857}
    #${ROOT_ID} input[type=checkbox]:checked:after{left:18px;background:#fff}
    #${ROOT_ID} .z-apps{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
    #${ROOT_ID} .z-chip{font-size:.66rem;border:1px solid rgba(16,185,129,.18);border-radius:999px;padding:.3rem .5rem;background:rgba(16,185,129,.055)}
    #${ROOT_ID} .z-native{font-size:.61rem;padding:.18rem .36rem;border-radius:.4rem;background:rgba(184,134,11,.09);border:1px solid rgba(184,134,11,.17);color:#8a5b08}
    html.dark #${ROOT_ID} .z-native{color:#deb24b}
    #${ROOT_ID} .z-actions{position:sticky;bottom:.5rem;z-index:2;margin-top:1rem;display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;border:1px solid hsl(var(--border));border-radius:calc(var(--radius,.5rem) + .2rem);padding:.72rem .8rem;background:hsl(var(--background)/.90);backdrop-filter:blur(12px);box-shadow:0 -8px 24px rgba(0,0,0,.035)}
    #${ROOT_ID} .z-save,#${ROOT_ID} .z-mini-btn{border:0;border-radius:var(--radius,.5rem);padding:.6rem .92rem;font:inherit;font-size:.75rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#047857,#065f46 68%,#8f6418);box-shadow:0 6px 16px rgba(6,95,70,.12);cursor:pointer}
    #${ROOT_ID} .z-mini-btn{padding:.48rem .7rem;font-size:.68rem}
    #${ROOT_ID} .z-mini-btn.z-danger{background:rgba(220,38,38,.09);box-shadow:none;color:#dc2626;border:1px solid rgba(220,38,38,.2)}
    #${ROOT_ID} .z-save:disabled,#${ROOT_ID} .z-mini-btn:disabled{opacity:.55;cursor:wait}
    #${ROOT_ID} .z-status{font-size:.7rem;color:hsl(var(--muted-foreground))}
    #${ROOT_ID} .z-status.ok{color:#059669}#${ROOT_ID} .z-status.err{color:#dc2626}
    #${ROOT_ID} .z-loading{padding:3rem 1rem;text-align:center;color:hsl(var(--muted-foreground));font-size:.8rem}
    #${ROOT_ID} .z-error{border:1px solid rgba(220,38,38,.24);background:rgba(220,38,38,.05);border-radius:.7rem;padding:.9rem;color:#dc2626;font-size:.76rem;line-height:1.7}
    #${ROOT_ID} .z-pending{border:1px solid rgba(184,134,11,.24);background:linear-gradient(135deg,rgba(184,134,11,.08),rgba(16,185,129,.04));border-radius:.75rem;padding:.85rem;font-size:.72rem;line-height:1.8;color:hsl(var(--muted-foreground))}
    #${ROOT_ID} .z-ns-create{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:.55rem;align-items:end}
    #${ROOT_ID} .z-ns-list{display:grid;gap:.55rem;margin-top:.8rem}
    #${ROOT_ID} .z-ns-row{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.6fr) auto auto;gap:.55rem;align-items:center;padding:.68rem;border:1px solid hsl(var(--border));border-radius:.7rem;background:hsl(var(--background)/.42)}
    #${ROOT_ID} .z-ns-admin{font-size:.75rem;font-weight:800;direction:ltr;text-align:left}
    #${ROOT_ID} .z-ns-url{min-width:0;font-size:.66rem;direction:ltr;text-align:left;color:hsl(var(--muted-foreground));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:760px){#${ROOT_ID} .z-ns-create{grid-template-columns:1fr}#${ROOT_ID} .z-ns-row{grid-template-columns:1fr auto auto}#${ROOT_ID} .z-ns-url{grid-column:1/-1;grid-row:2}}
  `;

  if (!document.getElementById('zomorod-special-style')) {
    const style = document.createElement('style');
    style.id = 'zomorod-special-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  const icons = {
    gem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6.5 3.5h11L22 9l-10 12L2 9l4.5-5.5Z"/><path d="M2 9h20M8 9l4 12 4-12M6.5 3.5 8 9m9.5-5.5L16 9"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const normalizeHeaders = (headers) => Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [String(k).toLowerCase(), String(v ?? '')]));
  const getHeader = (headers, key) => headers[`${HEADER_PREFIX}${key}`] ?? '';
  const asBool = (value, fallback) => value == null || value === '' ? fallback : !['false', '0', 'off', 'no'].includes(String(value).toLowerCase());
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
      return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    } catch { return ''; }
  };
  const removeHeader = (headers, key) => {
    const expected = `${HEADER_PREFIX}${key}`.toLowerCase();
    Object.keys(headers).forEach((name) => { if (name.toLowerCase() === expected) delete headers[name]; });
  };
  const setHeader = (headers, key, value) => { headers[`${HEADER_PREFIX}${key}`] = String(value); };
  const field = (id) => document.getElementById(id);
  const value = (id) => String(field(id)?.value ?? '').trim();
  const checked = (id) => Boolean(field(id)?.checked);

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const headers = new Headers(options.headers || {});
      headers.set('Accept', 'application/json');
      if (options.body) headers.set('Content-Type', 'application/json');
      const token = localStorage.getItem('token') || '';
      if (token) headers.set('Authorization', `Bearer ${token}`);
      headers.set('X-Client-Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      headers.set('X-Client-Timezone-Offset-Minutes', String(-new Date().getTimezoneOffset()));
      const response = await fetch(path, { ...options, headers, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      if (response.status === 204) return null;
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function extract(settings) {
    const subscription = settings?.subscription || {};
    const headers = normalizeHeaders(subscription.response_headers || {});
    return {
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

  function findSettingsTabBar() {
    const preferred = document.querySelector('.scrollbar-hide.flex.overflow-x-auto.border-b');
    if (preferred instanceof HTMLElement && preferred.querySelectorAll(':scope > button').length >= 2) return preferred;
    return [...document.querySelectorAll('.scrollbar-hide, [class*="overflow-x-auto"][class*="border-b"]')].find((node) => node instanceof HTMLElement && node.querySelectorAll(':scope > button').length >= 2) || null;
  }

  function getOutlet(tabBar = findSettingsTabBar()) {
    const outlet = tabBar?.nextElementSibling;
    return outlet instanceof HTMLElement ? outlet : null;
  }

  function setTabState(enabled) {
    const tabBar = findSettingsTabBar();
    const tab = document.getElementById(NAV_ID);
    if (tabBar) enabled ? tabBar.setAttribute('data-zomorod-active', '1') : tabBar.removeAttribute('data-zomorod-active');
    if (tab) tab.dataset.zActive = enabled ? 'true' : 'false';
  }

  function hideNativeChildren(outlet) {
    [...outlet.children].forEach((child) => {
      if (!(child instanceof HTMLElement) || child.id === ROOT_ID) return;
      if (!child.hasAttribute(OUTLET_MARK)) child.setAttribute(OUTLET_MARK, child.style.display || '');
      if (child.style.display !== 'none') child.style.display = 'none';
    });
  }

  function restoreNativeChildren() {
    const outlet = getOutlet();
    if (outlet) {
      [...outlet.querySelectorAll(`[${OUTLET_MARK}]`)].forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        child.style.display = child.getAttribute(OUTLET_MARK) || '';
        child.removeAttribute(OUTLET_MARK);
      });
    }
    document.getElementById(ROOT_ID)?.remove();
  }

  function deactivate() {
    active = false;
    restoreNativeChildren();
    setTabState(false);
  }

  function removeOwnerOnlyUi() {
    if (active) deactivate();
    document.getElementById(NAV_ID)?.remove();
  }

  function mountShell(html) {
    const outlet = getOutlet();
    if (!outlet) return null;
    hideNativeChildren(outlet);
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      outlet.appendChild(root);
    }
    if (root.innerHTML !== html) root.innerHTML = html;
    setTabState(true);
    return root;
  }

  function renderLoading() {
    mountShell('<div class="z-loading">Loading Zomorod settings…</div>');
  }

  function renderError(error) {
    mountShell(`<div class="z-error">Zomorod could not load PasarGuard settings.<br>${escapeHtml(error?.name === 'AbortError' ? 'Request timed out' : (error?.message || error))}</div>`);
  }

  function namespaceSection() {
    if (namespaceError) {
      const pending = namespaceError.status === 404
        ? 'ماژول مسیرهای اختصاصی روی سرور کپی شده، اما Routeهای Python بعد از یک راه‌اندازی عادی PasarGuard فعال می‌شوند. Installer برای جلوگیری از قطع SSH هیچ Restart/Recreate انجام نمی‌دهد.'
        : `بخش مسیرهای اختصاصی در دسترس نیست: ${namespaceError.message || namespaceError}`;
      return `<section class="z-card z-accent"><div class="z-card-head"><div><h3 class="z-card-title"><span class="z-card-icon">${icons.users}</span>Admin Subscription Namespaces</h3><div class="z-card-note">فقط Owner اصلی PasarGuard به این بخش دسترسی دارد.</div></div><span class="z-native">OWNER ONLY</span></div><div class="z-pending">${escapeHtml(pending)}</div></section>`;
    }

    if (!cachedNamespaces) return '';
    const admins = Array.isArray(cachedNamespaces.admins) ? cachedNamespaces.admins : [];
    const routes = Array.isArray(cachedNamespaces.routes) ? cachedNamespaces.routes : [];
    const options = admins.map((admin) => `<option value="${escapeHtml(admin.id)}" data-username="${escapeHtml(admin.username)}">${escapeHtml(admin.username)}</option>`).join('');
    const rows = routes.length ? routes.map((route) => {
      const example = `${location.origin}${route.path_prefix}/<subscription-hash>`;
      return `<div class="z-ns-row" data-z-route="${escapeHtml(route.slug)}"><div class="z-ns-admin">${escapeHtml(route.username)}</div><div class="z-ns-url" title="${escapeHtml(example)}">${escapeHtml(example)}</div><button type="button" class="z-mini-btn z-copy-ns" data-prefix="${escapeHtml(`${location.origin}${route.path_prefix}/`)}">Copy Prefix</button><button type="button" class="z-mini-btn z-danger z-delete-ns" data-slug="${escapeHtml(route.slug)}">Delete</button></div>`;
    }).join('') : '<div class="z-help">هنوز برای هیچ ادمینی مسیر اختصاصی ساخته نشده است.</div>';

    return `<section class="z-card z-accent"><div class="z-card-head"><div><h3 class="z-card-title"><span class="z-card-icon">${icons.users}</span>Admin Subscription Namespaces</h3><div class="z-card-note">مسیر نمونه: /sub/pedram/&lt;subscription-hash&gt;. توکن فقط وقتی کار می‌کند که کاربر واقعاً متعلق به همان ادمین باشد.</div></div><span class="z-native">OWNER ONLY</span></div>
      <div class="z-ns-create">
        <div class="z-field"><label for="z-ns-admin">ادمین</label><select id="z-ns-admin">${options}</select></div>
        <div class="z-field"><label for="z-ns-slug">مسیر</label><input id="z-ns-slug" type="text" dir="ltr" maxlength="32" placeholder="pedram"></div>
        <button type="button" class="z-mini-btn" id="z-create-ns">Create / Update</button>
      </div>
      <div class="z-help">هش همان توکن امن و Native خود PasarGuard است؛ Zomorod توکن جدید یا ضعیف‌تری تولید نمی‌کند.</div>
      <div class="z-ns-list">${rows}</div>
    </section>`;
  }

  function bindNamespaceActions(root) {
    const select = root?.querySelector('#z-ns-admin');
    const slug = root?.querySelector('#z-ns-slug');
    const syncSlug = () => {
      if (!(select instanceof HTMLSelectElement) || !(slug instanceof HTMLInputElement)) return;
      const option = select.selectedOptions[0];
      const username = option?.dataset.username || '';
      slug.value = username.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '') || `admin-${select.value}`;
    };
    if (select instanceof HTMLSelectElement) {
      select.addEventListener('change', syncSlug);
      if (slug instanceof HTMLInputElement && !slug.value) syncSlug();
    }

    root?.querySelector('#z-create-ns')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (!(button instanceof HTMLButtonElement) || !(select instanceof HTMLSelectElement) || !(slug instanceof HTMLInputElement)) return;
      button.disabled = true;
      try {
        await api('/api/zomorod/admin-subscriptions', { method: 'POST', body: JSON.stringify({ admin_id: Number(select.value), slug: slug.value.trim(), enabled: true }) });
        cachedNamespaces = await api('/api/zomorod/admin-subscriptions');
        namespaceError = null;
        if (cachedSettings) render(cachedSettings);
      } catch (error) {
        alert(`Zomorod: ${error?.message || error}`);
      } finally {
        button.disabled = false;
      }
    });

    root?.querySelectorAll('.z-copy-ns').forEach((button) => button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.prefix || '');
        const old = button.textContent;
        button.textContent = 'Copied ✓';
        setTimeout(() => { if (button.isConnected) button.textContent = old; }, 1400);
      } catch (_) {}
    }));

    root?.querySelectorAll('.z-delete-ns').forEach((button) => button.addEventListener('click', async () => {
      const routeSlug = button.dataset.slug || '';
      if (!routeSlug || !confirm(`Delete /sub/${routeSlug}/ namespace?`)) return;
      button.disabled = true;
      try {
        await api(`/api/zomorod/admin-subscriptions/${encodeURIComponent(routeSlug)}`, { method: 'DELETE' });
        cachedNamespaces = await api('/api/zomorod/admin-subscriptions');
        if (cachedSettings) render(cachedSettings);
      } catch (error) {
        alert(`Zomorod: ${error?.message || error}`);
      }
    }));
  }

  function render(settings) {
    cachedSettings = settings;
    const cfg = extract(settings);
    const apps = cfg.apps.length ? cfg.apps.map((app) => `<span class="z-chip">${escapeHtml(app.name || '')}${app.platform ? ` · ${escapeHtml(app.platform)}` : ''}</span>`).join('') : '<span class="z-help">اپلیکیشنی در PasarGuard تعریف نشده است.</span>';
    const html = `
      <section class="z-hero"><div class="z-hero-row"><div class="z-brand"><div class="z-logo">${icons.gem}</div><div><div class="z-title-row"><h2 class="z-title">Zomorod Template</h2><span class="z-special">SPECIAL</span></div><div class="z-subtitle">تنظیمات ویژه زمرد — فقط برای Owner اصلی PasarGuard</div></div></div><span class="z-version">v${VERSION}</span></div></section>
      <div class="z-content">
        ${namespaceSection()}
        <section class="z-card"><div class="z-card-head"><div><h3 class="z-card-title"><span class="z-card-icon">${icons.sliders}</span>تنظیمات عمومی</h3><div class="z-card-note">قابلیت‌های عمومی به‌صورت پیش‌فرض فعال‌اند؛ امکانات Special کنترل مستقل دارند.</div></div></div><div class="z-grid">
          <div class="z-field"><label for="z-store">نام فروشگاه</label><input id="z-store" type="text" maxlength="80" value="${escapeHtml(cfg.storeName)}"></div>
          <div class="z-toggle"><div><div class="z-toggle-title">نمایش Ping</div><div class="z-toggle-sub">نمایش پینگ تخمینی فعلی تمپلیت</div></div><input id="z-show-ping" type="checkbox" ${cfg.showPing ? 'checked' : ''}></div>
          <div class="z-toggle"><div><div class="z-toggle-title">نمایش اپلیکیشن‌ها</div><div class="z-toggle-sub">Applications تعریف‌شده در PasarGuard</div></div><input id="z-show-apps" type="checkbox" ${cfg.showApps ? 'checked' : ''}></div>
          <div class="z-field"><label>اپلیکیشن‌های تعریف‌شده</label><div class="z-apps">${apps}</div></div>
        </div></section>
        <section class="z-card z-accent"><div class="z-card-head"><div><h3 class="z-card-title"><span class="z-card-icon">${icons.link}</span>Special Connections</h3><div class="z-card-note">فقط نمایش کانفیگ‌های واقعی موجود در Subscription کنترل می‌شود.</div></div><span class="z-native">SPECIAL</span></div><div class="z-grid">
          <div class="z-toggle is-special"><div><div class="z-toggle-title">نمایش کانفیگ‌های معمولی</div><div class="z-toggle-sub">VLESS / VMess / Trojan / SS و سایر کانفیگ‌ها</div></div><input id="z-show-configs" type="checkbox" ${cfg.showConfigs ? 'checked' : ''}></div>
          <div class="z-toggle is-special"><div><div class="z-toggle-title">نمایش WireGuard</div><div class="z-toggle-sub">فقط اگر WireGuard واقعاً داخل Subscription باشد</div></div><input id="z-show-wg" type="checkbox" ${cfg.showWireGuard ? 'checked' : ''}></div>
          <div class="z-toggle"><div><div class="z-toggle-title">Allow browser config</div></div><input id="z-native-browser" type="checkbox" ${cfg.allowBrowserConfig ? 'checked' : ''}></div>
          <div class="z-toggle"><div><div class="z-toggle-title">Links format</div></div><input id="z-native-links" type="checkbox" ${cfg.nativeLinks ? 'checked' : ''}></div>
          <div class="z-toggle"><div><div class="z-toggle-title">WireGuard native format</div></div><input id="z-native-wg" type="checkbox" ${cfg.nativeWireGuard ? 'checked' : ''}></div>
        </div></section>
        <section class="z-card z-accent"><div class="z-card-head"><div><h3 class="z-card-title"><span class="z-card-icon">${icons.bell}</span>Special Announcement</h3><div class="z-card-note">اعلان واقعی PasarGuard با استایل و انیمیشن Emerald/Gold نمایش داده می‌شود.</div></div><span class="z-native">SPECIAL</span></div><div class="z-grid">
          <div class="z-toggle is-special"><div><div class="z-toggle-title">نمایش اعلان ویژه</div><div class="z-toggle-sub">بدون متن اعلان، کارت ساختگی نمایش داده نمی‌شود</div></div><input id="z-show-ann" type="checkbox" ${cfg.showAnnouncement ? 'checked' : ''}></div>
          <div class="z-field"><label for="z-ann-mode">حالت نمایش</label><select id="z-ann-mode"><option value="always" ${cfg.announcementMode === 'always' ? 'selected' : ''}>همیشه</option><option value="scheduled" ${cfg.announcementMode === 'scheduled' ? 'selected' : ''}>ساعت‌بندی‌شده</option></select></div>
          <div class="z-field"><label for="z-ann-times">ساعت‌ها</label><input id="z-ann-times" type="text" dir="ltr" placeholder="09:00,14:30,21:00" value="${escapeHtml(cfg.announcementTimes)}"></div>
          <div class="z-field"><label for="z-ann-duration">مدت هر نوبت (دقیقه)</label><input id="z-ann-duration" type="number" min="1" max="1440" value="${escapeHtml(cfg.announcementDuration)}"></div>
          <div class="z-field"><label for="z-ann-text">متن اعلان PasarGuard</label><textarea id="z-ann-text" maxlength="128">${escapeHtml(cfg.announce)}</textarea></div>
          <div class="z-field"><label for="z-ann-url">لینک اعلان</label><input id="z-ann-url" type="url" dir="ltr" value="${escapeHtml(cfg.announceUrl)}"></div>
        </div></section>
      </div>
      <div class="z-actions"><span class="z-status" id="z-status">آماده ذخیره</span><button class="z-save" id="z-save">Save Zomorod Settings</button></div>`;
    const root = mountShell(html);
    root?.querySelector('#z-save')?.addEventListener('click', () => save(settings));
    bindNamespaceActions(root);
  }

  async function save(settings) {
    const button = field('z-save');
    const statusNode = field('z-status');
    if (!button || !statusNode) return;
    button.disabled = true;
    statusNode.className = 'z-status';
    statusNode.textContent = 'در حال ذخیره…';
    try {
      const times = value('z-ann-times');
      if (times && !times.split(',').every((item) => /^([01]\d|2[0-3]):[0-5]\d$/.test(item.trim()))) throw new Error('فرمت ساعت باید HH:MM باشد');
      settings.subscription ||= {};
      const subscription = settings.subscription;
      const responseHeaders = { ...(subscription.response_headers || {}) };
      removeHeader(responseHeaders, 'enabled');
      removeHeader(responseHeaders, 'store-name');
      setHeader(responseHeaders, 'store-name-b64', encodeUtf8Base64(value('z-store') || defaults.storeName));
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
      cachedSettings = updated;
      statusNode.className = 'z-status ok';
      statusNode.textContent = 'ذخیره شد ✓';
    } catch (error) {
      console.error('[Zomorod] save failed', error);
      statusNode.className = 'z-status err';
      statusNode.textContent = `خطا: ${error?.name === 'AbortError' ? 'timeout' : (error?.message || error)}`;
    } finally {
      button.disabled = false;
    }
  }

  async function loadNamespaces() {
    try {
      cachedNamespaces = await api('/api/zomorod/admin-subscriptions');
      namespaceError = null;
    } catch (error) {
      cachedNamespaces = null;
      namespaceError = error;
    }
  }

  async function openPage() {
    if (!ownerAllowed) return;
    if (active && cachedSettings) {
      await loadNamespaces();
      render(cachedSettings);
      return;
    }
    active = true;
    renderLoading();
    try {
      const [settings] = await Promise.all([api('/api/settings'), loadNamespaces()]);
      if (!active) return;
      render(settings);
    } catch (error) {
      if (!active) return;
      console.error('[Zomorod] settings load failed', error);
      renderError(error);
    }
  }

  function ensureTab() {
    if (!ownerResolved || !ownerAllowed) return;
    const tabBar = findSettingsTabBar();
    if (!tabBar) return;
    if (!tabBar.dataset.zomorodBound) {
      tabBar.dataset.zomorodBound = '1';
      tabBar.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (button && button.id !== NAV_ID && active) deactivate();
      }, true);
    }
    if (document.getElementById(NAV_ID)) return;
    const button = document.createElement('button');
    button.id = NAV_ID;
    button.type = 'button';
    button.dataset.zActive = 'false';
    button.className = 'relative flex-shrink-0 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors text-muted-foreground hover:text-foreground';
    button.title = 'Zomorod Special — Owner only';
    button.innerHTML = `<div class="z-tab">${icons.gem.replace('<svg ', '<svg class="z-tab-gem" ')}<span>Zomorod</span><span class="z-tab-badge">Special</span></div>`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPage();
    });
    tabBar.appendChild(button);
    if (active) setTabState(true);
  }

  function maintain() {
    maintainQueued = false;
    if (!ownerResolved || !ownerAllowed) {
      removeOwnerOnlyUi();
      return;
    }
    const tabBar = findSettingsTabBar();
    if (!tabBar) {
      if (active) deactivate();
      return;
    }
    ensureTab();
    if (active) {
      const outlet = getOutlet(tabBar);
      if (outlet) hideNativeChildren(outlet);
      setTabState(true);
      if (!document.getElementById(ROOT_ID) && cachedSettings) render(cachedSettings);
    }
  }

  function scheduleMaintain() {
    if (maintainQueued) return;
    maintainQueued = true;
    requestAnimationFrame(maintain);
  }

  async function resolveOwnerAccess() {
    try {
      const current = await api('/api/admin');
      ownerAllowed = current?.role?.is_owner === true || current?.is_owner === true;
    } catch (_) {
      ownerAllowed = false;
    } finally {
      ownerResolved = true;
      scheduleMaintain();
    }
  }

  window.addEventListener('popstate', () => { if (active) deactivate(); scheduleMaintain(); });
  const observer = new MutationObserver(scheduleMaintain);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { resolveOwnerAccess(); scheduleMaintain(); }, { once: true });
  } else {
    resolveOwnerAccess();
    scheduleMaintain();
  }
})();
