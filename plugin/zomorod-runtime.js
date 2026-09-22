(() => {
  'use strict';

  const PREFIX = 'x-zomorod-';
  const SUPPORT_ID = 'zomorod-support-link';
  const THEME_STYLE_ID = 'zomorod-theme-style';
  const THEME_DEFAULTS = { primary: '#C9992D', secondary: '#064C38' };
  const DEFAULTS = {
    storeName: 'زمرد',
    supportId: '',
    showConfigs: true,
    showWireGuard: false,
    showPing: true,
    showApps: true,
    showAnnouncement: false,
    announcementMode: 'always',
    announcementTimes: '',
    announcementDuration: 60,
    themePrimary: THEME_DEFAULTS.primary,
    themeSecondary: THEME_DEFAULTS.secondary,
  };

  const state = {
    config: { ...DEFAULTS },
    raw: null,
    loaded: false,
  };

  let applyQueued = false;
  let refreshInFlight = false;
  let domObserver = null;
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

  const specialCss = `
    .zomorod-special-announcement{
      position:relative!important;
      isolation:isolate;
      overflow:hidden!important;
      border-color:color-mix(in srgb,var(--treasury-emerald-bright) 42%,transparent)!important;
      background:
        radial-gradient(circle at 8% 18%,color-mix(in srgb,var(--treasury-emerald-bright) 16%,transparent),transparent 34%),
        radial-gradient(circle at 92% 82%,color-mix(in srgb,var(--treasury-gold) 18%,transparent),transparent 36%),
        linear-gradient(135deg,color-mix(in srgb,var(--treasury-emerald) 10%,transparent),color-mix(in srgb,var(--treasury-emerald-bright) 5.5%,transparent) 48%,color-mix(in srgb,var(--treasury-gold) 9%,transparent))!important;
      box-shadow:0 12px 38px color-mix(in srgb,var(--treasury-emerald) 12%,transparent),0 0 0 1px color-mix(in srgb,var(--treasury-gold) 8%,transparent),inset 0 1px 0 rgba(255,255,255,.08)!important;
      animation:zomorodAnnBreathe 3.4s ease-in-out infinite;
    }
    .zomorod-special-announcement>*{position:relative;z-index:2}
    .zomorod-special-announcement:before{
      content:"";
      position:absolute;
      z-index:1;
      width:38%;
      height:220%;
      top:-60%;
      left:-52%;
      pointer-events:none;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.20),color-mix(in srgb,var(--treasury-gold-bright) 17%,transparent),transparent);
      transform:rotate(14deg);
      animation:zomorodAnnSweep 4.8s cubic-bezier(.3,.7,.2,1) infinite;
    }
    .zomorod-special-announcement .treasury-notice-icon{
      color:var(--treasury-gold-bright)!important;
      border-color:color-mix(in srgb,var(--treasury-gold) 26%,transparent)!important;
      background:linear-gradient(145deg,var(--treasury-emerald-deep),var(--treasury-emerald) 62%,var(--treasury-gold))!important;
      box-shadow:0 0 0 1px rgba(255,255,255,.08),0 0 24px color-mix(in srgb,var(--treasury-emerald-bright) 20%,transparent)!important;
      animation:zomorodAnnIcon 2.1s ease-in-out infinite;
    }
    .zomorod-special-announcement h2{
      color:var(--treasury-emerald)!important;
      text-shadow:0 0 18px color-mix(in srgb,var(--treasury-emerald-bright) 12%,transparent);
    }
    html.dark .zomorod-special-announcement h2{color:var(--treasury-emerald-bright)!important}
    #${SUPPORT_ID}{
      min-height:34px;
      display:inline-flex;
      align-items:center;
      gap:.4rem;
      padding:.42rem .62rem;
      border-radius:999px;
      border:1px solid color-mix(in srgb,var(--treasury-emerald-bright) 20%,transparent);
      color:inherit;
      background:linear-gradient(135deg,color-mix(in srgb,var(--treasury-emerald-bright) 8%,transparent),color-mix(in srgb,var(--treasury-gold) 8%,transparent));
      font-size:.72rem;
      font-weight:750;
      text-decoration:none;
      white-space:nowrap;
      transition:transform .16s ease,border-color .16s ease,background .16s ease;
    }
    #${SUPPORT_ID}:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--treasury-emerald-bright) 38%,transparent);background:linear-gradient(135deg,color-mix(in srgb,var(--treasury-emerald-bright) 12%,transparent),color-mix(in srgb,var(--treasury-gold) 11%,transparent))}
    #${SUPPORT_ID} .zomorod-support-gem{color:var(--treasury-emerald-bright);font-size:.78rem;line-height:1}
    #${SUPPORT_ID} .zomorod-support-label{max-width:128px;overflow:hidden;text-overflow:ellipsis}
    @media(max-width:560px){ #${SUPPORT_ID}{padding:.42rem .52rem}#${SUPPORT_ID} .zomorod-support-value{display:none}}
    @keyframes zomorodAnnSweep{
      0%,12%{left:-52%;opacity:0}
      22%{opacity:1}
      58%{left:122%;opacity:.8}
      70%,100%{left:122%;opacity:0}
    }
    @keyframes zomorodAnnBreathe{
      0%,100%{transform:translateY(0);box-shadow:0 12px 38px color-mix(in srgb,var(--treasury-emerald) 12%,transparent),0 0 0 1px color-mix(in srgb,var(--treasury-gold) 8%,transparent)}
      50%{transform:translateY(-1px);box-shadow:0 16px 46px color-mix(in srgb,var(--treasury-emerald) 18%,transparent),0 0 0 1px color-mix(in srgb,var(--treasury-gold) 16%,transparent),0 0 30px color-mix(in srgb,var(--treasury-emerald-bright) 8%,transparent)}
    }
    @keyframes zomorodAnnIcon{
      0%,100%{transform:scale(1) rotate(0deg)}
      50%{transform:scale(1.06) rotate(-3deg)}
    }
    @media(prefers-reduced-motion:reduce){
      .zomorod-special-announcement,.zomorod-special-announcement:before,.zomorod-special-announcement .treasury-notice-icon{animation:none!important}
    }
  `;

  if (!document.getElementById('zomorod-runtime-style')) {
    const style = document.createElement('style');
    style.id = 'zomorod-runtime-style';
    style.textContent = specialCss;
    document.head.appendChild(style);
  }

  const bool = (value, fallback) => {
    if (value == null || value === '') return fallback;
    return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
  };

  const normalizeHeaders = (headers) => Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), String(value ?? '')])
  );

  const header = (headers, name) => headers[`${PREFIX}${name}`] ?? '';

  const normalizeHex = (input, fallback) => {
    const value = String(input || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(value) ? value : fallback;
  };
  const hexToRgb = (hex) => {
    const value = normalizeHex(hex, '#000000').slice(1);
    return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
  };
  const rgbToHex = (r, g, b) => '#' + [r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('').toUpperCase();
  const mixHex = (hex, target, amount) => {
    const a = hexToRgb(hex), b = hexToRgb(target), t = Math.max(0, Math.min(1, amount));
    return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  };
  const rgbaHex = (hex, alpha) => {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  };
  const contrastText = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.62 ? '#172015' : '#FFFFFF';
  };

  const applyTheme = (config) => {
    const primary = normalizeHex(config?.themePrimary, DEFAULTS.themePrimary);
    const secondary = normalizeHex(config?.themeSecondary, DEFAULTS.themeSecondary);
    const primaryChanged = primary !== THEME_DEFAULTS.primary;
    const secondaryChanged = secondary !== THEME_DEFAULTS.secondary;
    let style = document.getElementById(THEME_STYLE_ID);

    // No customization means no CSS override at all, preserving the exact
    // upstream Zomorod palette byte-for-byte.
    if (!primaryChanged && !secondaryChanged) {
      style?.remove();
      return;
    }

    if (!style) {
      style = document.createElement('style');
      style.id = THEME_STYLE_ID;
      document.head.appendChild(style);
    }

    const light = [];
    const dark = [];

    if (primaryChanged) {
      const darkPrimary = mixHex(primary, '#FFFFFF', 0.18);
      const primaryBright = mixHex(primary, '#FFFFFF', 0.28);
      const darkPrimaryBright = mixHex(primary, '#FFFFFF', 0.4);
      light.push(
        `--primary:${primary}`,
        `--primary-soft:${rgbaHex(primary,.12)}`,
        `--primary-foreground:${contrastText(primary)}`,
        `--ring:${primary}`,
        `--treasury-gold:${primary}`,
        `--treasury-gold-bright:${primaryBright}`,
        `--treasury-gold-foreground:${contrastText(primary)}`,
      );
      dark.push(
        `--primary:${darkPrimary}`,
        `--primary-soft:${rgbaHex(darkPrimary,.14)}`,
        `--primary-foreground:${contrastText(darkPrimary)}`,
        `--ring:${darkPrimary}`,
        `--treasury-gold:${primary}`,
        `--treasury-gold-bright:${darkPrimaryBright}`,
        `--treasury-gold-foreground:${contrastText(primary)}`,
      );
    }

    if (secondaryChanged) {
      const darkSecondary = mixHex(secondary, '#FFFFFF', 0.12);
      const secondaryDeep = mixHex(secondary, '#000000', 0.28);
      const secondaryBright = mixHex(secondary, '#FFFFFF', 0.12);
      const darkSecondaryBright = mixHex(secondary, '#FFFFFF', 0.24);
      light.push(
        `--secondary:${secondary}`,
        `--secondary-foreground:${contrastText(secondary)}`,
        `--treasury-emerald:${secondary}`,
        `--treasury-emerald-deep:${secondaryDeep}`,
        `--treasury-emerald-bright:${secondaryBright}`,
        `--treasury-emerald-foreground:${contrastText(secondary)}`,
      );
      dark.push(
        `--secondary:${darkSecondary}`,
        `--secondary-foreground:${contrastText(darkSecondary)}`,
        `--treasury-emerald:${secondary}`,
        `--treasury-emerald-deep:${secondaryDeep}`,
        `--treasury-emerald-bright:${darkSecondaryBright}`,
        `--treasury-emerald-foreground:${contrastText(secondary)}`,
      );
    }

    style.textContent = `
      .treasury-shell{${light.join(';')}}
      .dark .treasury-shell{${dark.join(';')}}`;
  };

  const decodeUtf8Base64 = (value) => {
    if (!value) return '';
    try {
      const binary = atob(value);
      return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    } catch {
      return '';
    }
  };

  const supportLabelFromUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, window.location.origin);
      if (['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'].includes(parsed.hostname.toLowerCase())) {
        const path = parsed.pathname.replace(/^\/+|\/+$/g, '');
        if (path && !path.includes('/') && !path.startsWith('+')) return `@${path}`;
      }
    } catch (_) {}
    return raw;
  };

  const supportHref = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const username = raw.startsWith('@') ? raw.slice(1) : raw;
    if (/^[A-Za-z0-9_]{4,64}$/.test(username)) return `https://t.me/${username}`;
    if (/^(?:https?:\/\/|tg:\/\/)/i.test(raw)) return raw;
    return '';
  };

  const parseConfig = (raw) => {
    const headers = normalizeHeaders(raw?.headers);
    const encodedSupport = decodeUtf8Base64(header(headers, 'support-id-b64').trim());
    return {
      storeName: decodeUtf8Base64(header(headers, 'store-name-b64').trim()) || header(headers, 'store-name').trim() || DEFAULTS.storeName,
      supportId: encodedSupport || supportLabelFromUrl(headers['support-url']) || DEFAULTS.supportId,
      showConfigs: bool(header(headers, 'show-configs'), DEFAULTS.showConfigs),
      showWireGuard: bool(header(headers, 'show-wireguard'), DEFAULTS.showWireGuard),
      showPing: bool(header(headers, 'show-ping'), DEFAULTS.showPing),
      showApps: bool(header(headers, 'show-apps'), DEFAULTS.showApps),
      showAnnouncement: bool(header(headers, 'show-announcement'), DEFAULTS.showAnnouncement),
      announcementMode: header(headers, 'announcement-mode') === 'scheduled' ? 'scheduled' : 'always',
      announcementTimes: header(headers, 'announcement-times'),
      announcementDuration: Math.max(1, Math.min(1440, Number(header(headers, 'announcement-duration')) || DEFAULTS.announcementDuration)),
      themePrimary: normalizeHex(header(headers, 'theme-primary'), DEFAULTS.themePrimary),
      themeSecondary: normalizeHex(header(headers, 'theme-secondary'), DEFAULTS.themeSecondary),
    };
  };

  const basePath = () => window.location.pathname.replace(/\/+$/, '');

  async function fetchRaw() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`${window.location.origin}${basePath()}/raw`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`raw endpoint returned ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  const setDisplay = (node, visible) => {
    if (!(node instanceof HTMLElement)) return;
    if (!node.hasAttribute('data-zomorod-original-display')) {
      node.setAttribute('data-zomorod-original-display', node.style.display || '');
    }
    const target = visible ? (node.getAttribute('data-zomorod-original-display') || '') : 'none';
    if (node.style.display !== target) node.style.display = target;
  };

  const updateBrand = (name) => {
    document.querySelectorAll('.treasury-brand').forEach((brand) => {
      const spans = brand.querySelectorAll(':scope > span');
      const label = spans[spans.length - 1];
      if (label && label.textContent !== name) label.textContent = name;
      if (brand.getAttribute('aria-label') !== name) brand.setAttribute('aria-label', name);
    });
  };

  const applySupport = (supportId) => {
    const href = supportHref(supportId);
    let link = document.getElementById(SUPPORT_ID);
    if (!href) {
      if (link) link.remove();
      return;
    }

    const controls = document.querySelector('.treasury-navigation .ios-container .flex.shrink-0')
      || document.querySelector('.treasury-navigation .ios-container > div:last-child');
    if (!(controls instanceof HTMLElement)) return;

    if (!(link instanceof HTMLAnchorElement)) {
      link = document.createElement('a');
      link.id = SUPPORT_ID;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.innerHTML = '<span class="zomorod-support-gem">◆</span><span class="zomorod-support-label">پشتیبانی</span><span class="zomorod-support-value"></span>';
      controls.insertBefore(link, controls.firstChild);
    }

    if (link.href !== new URL(href, window.location.origin).href) link.href = href;
    const valueNode = link.querySelector('.zomorod-support-value');
    const label = supportLabelFromUrl(supportId);
    if (valueNode && valueNode.textContent !== label) valueNode.textContent = label;
    const title = `پشتیبانی ${label}`.trim();
    if (link.title !== title) link.title = title;
  };

  const isWireGuardRow = (row) => {
    const protocol = row
      .querySelector('.treasury-config-protocol, .ios-protocol-badge')
      ?.textContent?.trim().toUpperCase();
    return protocol === 'WG' || protocol === 'WIREGUARD';
  };

  const applyConnections = (config) => {
    // Support both the legacy server rows and the current subscription card UI.
    const rows = [...document.querySelectorAll('.treasury-server-row, .treasury-config-card')]
      .filter((row) => row instanceof HTMLElement);
    const hasWireGuard = rows.some(isWireGuardRow);

    rows.forEach((row) => {
      const visible = isWireGuardRow(row) ? config.showWireGuard : config.showConfigs;
      setDisplay(row, visible);
    });

    // The dedicated archive action is rendered separately from the config rows.
    // Keep it in sync with the same WireGuard visibility switch.
    document.querySelectorAll('a[download][href$="/wireguard"]').forEach((node) => {
      setDisplay(node, config.showWireGuard);
    });

    const section = document.querySelector('.treasury-links-section');
    const showSection = config.showConfigs || (config.showWireGuard && hasWireGuard);
    setDisplay(section, showSection);
    document.querySelectorAll('.treasury-quick-action').forEach((node) => setDisplay(node, showSection));

    return hasWireGuard;
  };

  const applyPing = (visible) => {
    document.querySelectorAll('.treasury-server-ping').forEach((node) => setDisplay(node, visible));
  };

  const applyApps = (visible) => {
    document.querySelectorAll('.treasury-section-title').forEach((title) => {
      const text = title.textContent || '';
      if (!/اپلیکیشن|application/i.test(text)) return;
      setDisplay(title, visible);
      setDisplay(title.nextElementSibling, visible);
    });
  };

  const nativeAnnouncement = () => {
    const headers = normalizeHeaders(state.raw?.headers);
    return String(headers.announce || '').trim();
  };

  const announcementIsInWindow = (config) => {
    if (config.announcementMode !== 'scheduled') return true;
    const times = String(config.announcementTimes || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
    if (!times.length) return false;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return times.some((time) => {
      const [hour, minute] = time.split(':').map(Number);
      const start = hour * 60 + minute;
      const diff = (nowMinutes - start + 1440) % 1440;
      return diff < config.announcementDuration;
    });
  };

  const applyAnnouncement = (config) => {
    const hasAnnouncement = nativeAnnouncement().length > 0;
    const visible = config.showAnnouncement && hasAnnouncement && announcementIsInWindow(config);

    document.querySelectorAll('.treasury-notice').forEach((notice) => {
      if (!(notice instanceof HTMLElement)) return;
      setDisplay(notice, visible);
      if (visible) notice.classList.add('zomorod-special-announcement');
      else notice.classList.remove('zomorod-special-announcement');
    });
  };

  const restoreOriginalUi = () => {
    document.querySelectorAll('[data-zomorod-original-display]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.style.display = node.getAttribute('data-zomorod-original-display') || '';
      node.removeAttribute('data-zomorod-original-display');
    });
    document.querySelectorAll('.zomorod-special-announcement').forEach((node) => node.classList.remove('zomorod-special-announcement'));
    document.getElementById(SUPPORT_ID)?.remove();
    document.getElementById(THEME_STYLE_ID)?.remove();
    document.documentElement.removeAttribute('data-zomorod');
  };

  const observeDom = () => {
    if (!domObserver || !document.documentElement) return;
    domObserver.observe(document.documentElement, { subtree: true, childList: true });
  };

  const apply = () => {
    applyQueued = false;
    if (!state.loaded) return;

    // Avoid observing DOM mutations produced by Zomorod itself. Without this,
    // our own updates can enqueue another animation-frame pass and cause a
    // self-sustaining render loop on dynamic subscription pages.
    domObserver?.disconnect();
    try {
      const config = state.config;
      applyTheme(config);
      updateBrand(config.storeName);
      applySupport(config.supportId);
      applyConnections(config);
      applyPing(config.showPing);
      applyApps(config.showApps);
      applyAnnouncement(config);

      if (document.documentElement.getAttribute('data-zomorod') !== 'active') {
        document.documentElement.setAttribute('data-zomorod', 'active');
      }
    } finally {
      observeDom();
    }
  };

  const scheduleApply = () => {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(apply);
  };

  const refreshSettings = async ({ initial = false } = {}) => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      const raw = await fetchRaw();
      state.raw = raw;
      state.config = parseConfig(raw);
      state.loaded = true;
      scheduleApply();
    } catch (error) {
      if (initial) {
        console.warn('[Zomorod] runtime settings unavailable; original template remains untouched.', error);
        restoreOriginalUi();
        state.loaded = false;
      } else {
        console.warn('[Zomorod] runtime refresh failed; keeping last known settings.', error);
      }
    } finally {
      refreshInFlight = false;
    }
  };

  const start = async () => {
    await refreshSettings({ initial: true });
    domObserver = new MutationObserver(scheduleApply);
    observeDom();

    // Settings rarely change while a subscription page is open. Refresh less
    // often and never poll a background tab; DOM changes are already handled by
    // the observer, so the previous 30-second forced repaint is unnecessary.
    window.setInterval(() => {
      if (!document.hidden) void refreshSettings();
    }, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void refreshSettings();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
