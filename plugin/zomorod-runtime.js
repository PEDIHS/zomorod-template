(() => {
  'use strict';

  const PREFIX = 'x-zomorod-';
  const DEFAULTS = {
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

  const state = {
    config: { ...DEFAULTS },
    raw: null,
    loaded: false,
  };

  let applyQueued = false;
  let refreshInFlight = false;

  const specialCss = `
    .zomorod-special-announcement{
      position:relative!important;
      isolation:isolate;
      overflow:hidden!important;
      border-color:rgba(16,185,129,.42)!important;
      background:
        radial-gradient(circle at 8% 18%,rgba(16,185,129,.16),transparent 34%),
        radial-gradient(circle at 92% 82%,rgba(184,134,11,.18),transparent 36%),
        linear-gradient(135deg,rgba(6,95,70,.10),rgba(4,120,87,.055) 48%,rgba(184,134,11,.09))!important;
      box-shadow:0 12px 38px rgba(6,95,70,.12),0 0 0 1px rgba(184,134,11,.08),inset 0 1px 0 rgba(255,255,255,.08)!important;
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
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.20),rgba(255,230,157,.17),transparent);
      transform:rotate(14deg);
      animation:zomorodAnnSweep 4.8s cubic-bezier(.3,.7,.2,1) infinite;
    }
    .zomorod-special-announcement .treasury-notice-icon{
      color:#f4d57a!important;
      border-color:rgba(184,134,11,.26)!important;
      background:linear-gradient(145deg,#065f46,#047857 62%,#a06b16)!important;
      box-shadow:0 0 0 1px rgba(255,255,255,.08),0 0 24px rgba(16,185,129,.20)!important;
      animation:zomorodAnnIcon 2.1s ease-in-out infinite;
    }
    .zomorod-special-announcement h2{
      color:#047857!important;
      text-shadow:0 0 18px rgba(16,185,129,.12);
    }
    html.dark .zomorod-special-announcement h2{color:#6ee7b7!important}
    @keyframes zomorodAnnSweep{
      0%,12%{left:-52%;opacity:0}
      22%{opacity:1}
      58%{left:122%;opacity:.8}
      70%,100%{left:122%;opacity:0}
    }
    @keyframes zomorodAnnBreathe{
      0%,100%{transform:translateY(0);box-shadow:0 12px 38px rgba(6,95,70,.12),0 0 0 1px rgba(184,134,11,.08)}
      50%{transform:translateY(-1px);box-shadow:0 16px 46px rgba(6,95,70,.18),0 0 0 1px rgba(184,134,11,.16),0 0 30px rgba(16,185,129,.08)}
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

  const decodeUtf8Base64 = (value) => {
    if (!value) return '';
    try {
      const binary = atob(value);
      return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    } catch {
      return '';
    }
  };

  const parseConfig = (raw) => {
    const headers = normalizeHeaders(raw?.headers);
    return {
      storeName: decodeUtf8Base64(header(headers, 'store-name-b64').trim()) || header(headers, 'store-name').trim() || DEFAULTS.storeName,
      showConfigs: bool(header(headers, 'show-configs'), DEFAULTS.showConfigs),
      showWireGuard: bool(header(headers, 'show-wireguard'), DEFAULTS.showWireGuard),
      showPing: bool(header(headers, 'show-ping'), DEFAULTS.showPing),
      showApps: bool(header(headers, 'show-apps'), DEFAULTS.showApps),
      showAnnouncement: bool(header(headers, 'show-announcement'), DEFAULTS.showAnnouncement),
      announcementMode: header(headers, 'announcement-mode') === 'scheduled' ? 'scheduled' : 'always',
      announcementTimes: header(headers, 'announcement-times'),
      announcementDuration: Math.max(1, Math.min(1440, Number(header(headers, 'announcement-duration')) || DEFAULTS.announcementDuration)),
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

  const isWireGuardRow = (row) => {
    const protocol = row.querySelector('.treasury-config-protocol')?.textContent?.trim().toUpperCase();
    return protocol === 'WG' || protocol === 'WIREGUARD';
  };

  const applyConnections = (config) => {
    const rows = [...document.querySelectorAll('.treasury-server-row')].filter((row) => row instanceof HTMLElement);
    const hasWireGuard = rows.some(isWireGuardRow);

    rows.forEach((row) => {
      const visible = isWireGuardRow(row) ? config.showWireGuard : config.showConfigs;
      setDisplay(row, visible);
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
    document.documentElement.removeAttribute('data-zomorod');
  };

  const apply = () => {
    applyQueued = false;
    if (!state.loaded) return;

    const config = state.config;
    updateBrand(config.storeName);
    applyConnections(config);
    applyPing(config.showPing);
    applyApps(config.showApps);
    applyAnnouncement(config);

    if (document.documentElement.getAttribute('data-zomorod') !== 'active') {
      document.documentElement.setAttribute('data-zomorod', 'active');
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
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { subtree: true, childList: true });
    window.setInterval(() => refreshSettings(), 60000);
    window.setInterval(scheduleApply, 30000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
