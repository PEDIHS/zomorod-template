export class HttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

const request = async (url: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new HttpError(response.status);
    const data: unknown = await response.json();
    return { response, data };
  } finally { clearTimeout(timer); }
};

export const fetcher = async <T>(url: string): Promise<T> => {
  const { response, data } = await request(url);
  if (new URL(url, window.location.origin).pathname.endsWith('/info')) {
    const headers: Record<string, string> = {};
    for (const name of ['announce', 'announce-url', 'support-url', 'profile-title']) {
      const value = response.headers.get(name);
      if (value) headers[name] = value;
    }
    return { data, headers, updatedAt: Date.now() } as T;
  }
  return data as T;
};

export const textFetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new HttpError(response.status);
  return response.text();
};

export const getBaseUrl = () =>
  (import.meta.env?.VITE_PANEL_DOMAIN || window.location.origin).replace(/\/+$/, '');

export const getAdjustedUrl = (subURL?: string) => {
  const base = getBaseUrl();
  const url = new URL(subURL || window.location.pathname, window.location.origin);
  if (import.meta.env?.VITE_PANEL_DOMAIN) return `${base}${url.pathname}${url.search}${url.hash}`;
  return ['http:', 'https:'].includes(url.protocol) ? url.href : `${base}${window.location.pathname}`;
};
