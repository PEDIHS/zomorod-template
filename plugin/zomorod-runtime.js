(() => {
  'use strict';

  const PREFIX = 'x-zomorod-';
  const DEFAULTS = {
    enabled: false,
    storeName: 'زمرد',
    showConfigs: true,
    showWireGuard: true,
    showPing: true,
    showApps: true,
    showAnnouncement: true,
    announcementMode: 'always',
    announcementTimes: '',
    announcementDuration: 60,
  };

  const state = { config: { ...DEFAULTS }, raw: null };
  let applyQueued = false;

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
      enabled: bool(header(headers, 'enabled'), DEFAULTS.enabled),
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

  const setVisible = (selector, visible) => {
    document.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (!node.hasAttribute('data-zomorod-original-display')) node.setAttribute('data-zomorod-original-display', node.style.display || '');
      const target = visible ? (node.getAttribute('data-zomorod-original-display') || '') : 'none';
      if (node.style.display !== target) node.style.display = target;
    });
  };

  const updateBrand = (name) => {
    document.querySelectorAll('.treasury-brand').forEach((brand) => {
      const spans = brand.querySelectorAll(':scope > span');
      const label = spans[spans.length - 1];
      if (label && label.textContent !== name) label.textContent = name;
      if (brand.getAttribute('aria-label') !== name) brand.setAttribute('aria-label', name);
    });
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
      return diff < config.announcementDuration;
    });
  };

  const setWireGuardRowsVisible = (visible) => {
    document.querySelectorAll('.treasury-server-row').forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const protocol = row.querySelector('.treasury-config-protocol')?.textContent?.trim().toUpperCase();
      if (protocol !== 'WG' && protocol !== 'WIREGUARD') return;
      if (!row.hasAttribute('data-zomorod-original-display')) row.setAttribute('data-zomorod-original-display', row.style.display || '');
      const target = visible ? (row.getAttribute('data-zomorod-original-display') || '') : 'none';
      if (row.style.display !== target) row.style.display = target;
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
    section.innerHTML = '<div class="treasury-notice-icon" aria-hidden="true">WG</div><div class="min-w-0 flex-1"><h2>WireGuard</h2><p>دانلود مستقیم فایل استاندارد WireGuard از PasarGuard</p></div><button type="button" class="ios-primary-button" data-zomorod-wg-download>دانلود .conf</button>';
    anchor.insertAdjacentElement('afterend', section);

    const button = section.querySelector('[data-zomorod-wg-download]');
    button?.addEventListener('click', async () => {
      const original = button.textContent;
      button.disabled = true;
      if (button.textContent !== 'در حال دریافت…') button.textContent = 'در حال دریافت…';
      try {
        const response = await fetch(`${window.location.origin}${basePath()}/wireguard`, { headers: { Accept: 'text/plain,*/*' }, cache: 'no-store' });
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
        }, 1800);
      }
    });
  };

  const restoreOriginalUi = () => {
    document.querySelectorAll('[data-zomorod-original-display]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.style.display = node.getAttribute('data-zomorod-original-display') || '';
      node.removeAttribute('data-zomorod-original-display');
    });
    document.getElementById('zomorod-wireguard-card')?.remove();
    document.documentElement.removeAttribute('data-zomorod');
  };

  const apply = () => {
    applyQueued = false;
    const config = state.config;
    if (!config.enabled) {
      restoreOriginalUi();
      return;
    }

    updateBrand(config.storeName);
    setVisible('.treasury-links-section', config.showConfigs);
    setVisible('.treasury-quick-action', config.showConfigs);
    setVisible('.treasury-server-ping', config.showPing);
    setVisible('.treasury-notice:not(#zomorod-wireguard-card)', announcementIsActive(config));
    setWireGuardRowsVisible(config.showWireGuard);

    document.querySelectorAll('.treasury-section-title').forEach((title) => {
      const text = title.textContent || '';
      if (!/اپلیکیشن|application/i.test(text)) return;
      if (title instanceof HTMLElement) {
        const target = config.showApps ? '' : 'none';
        if (title.style.display !== target) title.style.display = target;
      }
      if (title.nextElementSibling instanceof HTMLElement) {
        const target = config.showApps ? '' : 'none';
        if (title.nextElementSibling.style.display !== target) title.nextElementSibling.style.display = target;
      }
    });

    ensureWireGuardCard(config);
    if (document.documentElement.getAttribute('data-zomorod') !== 'active') document.documentElement.setAttribute('data-zomorod', 'active');
  };

  const scheduleApply = () => {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(apply);
  };

  const start = async () => {
    try {
      state.raw = await fetchRaw();
      state.config = parseConfig(state.raw);
    } catch (error) {
      console.warn('[Zomorod] runtime settings unavailable; original template remains untouched.', error);
      state.config = { ...DEFAULTS, enabled: false };
    }

    apply();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { subtree: true, childList: true });
    window.setInterval(scheduleApply, 30000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
