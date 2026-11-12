import type { UsageDataPoint } from '../types/user';

export const getSubscriptionPath = (pathname: string) =>
  pathname.replace(/\/+$/, '').replace(/\/(?:info|raw|apps|usage)$/, '');

export const normalizeConfigLinks = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const allowed = /^(?:vless|vmess|trojan|ss|shadowsocks|wireguard|hysteria2?|hy2|tuic|https?):\/\//i;
  return [...new Set(value.filter((v): v is string => typeof v === 'string')
    .map(v => v.trim()).filter(v => allowed.test(v)))];
};

/** Combine all node series when present; the default API also supports a single total series. */
export const aggregateUsage = (stats: unknown): UsageDataPoint[] => {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return [];
  const buckets = new Map<number, number>();
  for (const series of Object.values(stats)) {
    if (!Array.isArray(series)) continue;
    for (const point of series) {
      if (!point || typeof point.period_start !== 'string') continue;
      const stamp = Date.parse(point.period_start);
      const bytes = point.total_traffic;
      if (!Number.isFinite(stamp) || typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) continue;
      buckets.set(stamp, (buckets.get(stamp) ?? 0) + bytes);
    }
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b)
    .map(([stamp, total_traffic]) => ({ period_start: new Date(stamp).toISOString(), total_traffic }));
};

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024))));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

/** External links may never execute script or load local files. App import schemes are opt-in. */
export const safeExternalUrl = (value?: string | null, appScheme = false): string | undefined => {
  if (!value || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return undefined;
  try {
    const url = new URL(value.trim());
    if (['http:', 'https:'].includes(url.protocol)) return url.href;
    if (appScheme && /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) &&
      !['javascript:', 'data:', 'vbscript:', 'file:', 'blob:'].includes(url.protocol)) return value.trim();
  } catch { /* Invalid URL; render no action. */ }
  return undefined;
};
