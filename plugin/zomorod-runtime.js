(() => {
  'use strict';

  const PREFIX = 'x-zomorod-';
  const DEFAULTS = {
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

  const state = { config: { ...DEFAULTS }, raw: null };

  const bool = (value, fallback) => {
    if (value == null || value === '') return fallback;
    return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
  };

  const normalizeHeaders = (headers) => Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), String(value ?? '')])
  );

  const header = (headers, name) => headers[`${PREFIX}${name}`] ?? '';

  const parseConfig = (raw) => {
    const headers = normalizeHeaders(raw?.headers);
    return {
      enabled: bool(header(headers, 'enabled'), DEFAULTS.enabled),
      storeName: header(headers, 'store-name').trim() || DEFAULTS.storeName,
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

  const fetchRaw = async () => {
    const response = await fetch(`${window.location.origin}${basePath()}/raw`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`raw endpoint returned ${response.status}`);
    return response.json();
  };

  const setVisible = (selector, visible) => {
    document.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.dataset.zomorodOriginalDisplay ||= node.style.display || '';
      node.style.display = visible ? node.dataset.zomorodOriginalDisplay : 'none';
    });
  };

  const updateBrand = (name) => {
    document.querySelectorAll('.treasury-brand').forEach((brand) => {
      const spans = brand.querySelectorAll(':scope > span');
      const label = spans[spans.length - 1];
      if (label) label.textContent = name;
      brand.setAttribute('aria-label', name);
    });
    if (document.title && !document.title.includes(name)) document.title = `${name} · Zomorod`;
  };

  const announcementIsActive = (config) => {
    if (!config.showAnnouncement) return false;
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
      return diff >= 0 && diff < config.announcementDuration;
    });
  };

  const ensureWireGuardCard = (config) => {
    const existing = document.getElementById('zomorod-wireguard-card');
    if (!config.showWireGuard) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const anchor = document.querySelector('.treasury-links-section') || document.querySelector('.treasury-content-stack');
    if (!anchor || !(anchor.parentElement instanceof HTMLElement)) return;

    const section = document.createElement('section');
    section.id = 'zomorod-wireguard-card';
    section.className = 'treasury-notice animate-fadeIn';
    section.style.marginTop = '1rem';
    section.innerHTML = `
      <div class="treasury-notice-icon" aria-hidden="true">WG</div>
      <div class="min-w-0 flex-1">
        <h2>WireGuard</h2>
        <p>دانلود مستقیم فایل استاندارد WireGuard از خود PasarGuard</p>
      </div>
      <button type="button" class="ios-primary-button" data-zomorod-wg-download>دانلود .conf</button>
    `;

    anchor.insertAdjacentElement('afterend', section);
    const button = section.querySelector('[data-zomorod-wg-download]');
    button?.addEventListener('click', async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'در حال دریافت…';
      try {
        const response = await fetch(`${window.location.origin}${basePath()}/wireguard`, {
          headers: { Accept: 'text/plain,*/*' },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`WireGuard HTTP ${response.status}`);
        const content = await response.text();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'wireguard.conf';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        button.textContent = 'دانلود شد ✓';
      } catch (error) {
        console.error('[Zomorod] WireGuard download failed', error);
        button.textContent = 'WireGuard در دسترس نیست';
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = original;
        }, 2200);
      }
    });
  };

  const apply = () => {
    const config = state.config;
    if (!config.enabled) return;

    updateBrand(config.storeName);
    setVisible('.treasury-links-section', config.showConfigs);
    setVisible('.treasury-quick-action', config.showConfigs);
    setVisible('.treasury-server-ping', config.showPing);
    setVisible('.treasury-notice', announcementIsActive(config));

    document.querySelectorAll('.treasury-section-title').forEach((title) => {
      const text = title.textContent || '';
      if (!/اپلیکیشن|application/i.test(text)) return;
      if (title instanceof HTMLElement) title.style.display = config.showApps ? '' : 'none';
      if (title.nextElementSibling instanceof HTMLElement) title.nextElementSibling.style.display = config.showApps ? '' : 'none';
    });

    ensureWireGuardCard(config);
    document.documentElement.dataset.zomorod = 'active';
  };

  const start = async () => {
    try {
      state.raw = await fetchRaw();
      state.config = parseConfig(state.raw);
    } catch (error) {
      console.warn('[Zomorod] Could not read runtime settings; defaults are active.', error);
    }

    apply();
    const observer = new MutationObserver(() => apply());
    observer.observe(document.documentElement, { subtree: true, childList: true });
    window.setInterval(apply, 30000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
