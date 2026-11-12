import useSWR from 'swr';
import { fetcher, getBaseUrl, HttpError } from '@/lib/fetcher';
import useSWRImmutable from 'swr/immutable'
import type { UserInfo, ConfigData, ChartData, AppClient, InfoHeaders } from '@/types/user';

import { getSubscriptionPath as normalizePath, normalizeConfigLinks, safeExternalUrl } from '@/lib/subscriptionData';
const getSubscriptionPath = () => normalizePath(window.location.pathname);
const retryable = (error: Error) => !(error instanceof HttpError) || ![401, 403, 404, 410].includes(error.status);

export const useUserInfo = () => {
  const initial = typeof window !== 'undefined' ? window.__INITIAL_DATA__ : undefined;
  
  const { data: response, error, isLoading, isValidating, mutate } = useSWR<{ data: UserInfo; headers: InfoHeaders; updatedAt: number }>(
    `${getBaseUrl()}${getSubscriptionPath()}/info`,
    fetcher,
    {
      // Don't use fallbackData - we'll handle initial data separately
      // This ensures the fetcher always runs and returns { data, headers } structure
      revalidateIfStale: false,
      revalidateOnMount: true, // Always fetch on mount to get headers
      errorRetryCount: 3,
      shouldRetryOnError: retryable,
      errorRetryInterval: 5000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 30000,
      dedupingInterval: 5000,
      onError: (error) => {
        console.warn('Failed to fetch user info:', error);
      }
    }
  );

  // Extract data and headers from response
  // Response should always be { data, headers } from fetcher for /info endpoint
  const apiData = response?.data;
  const apiHeaders = response?.headers;
  
  // Use initial Jinja data only as first paint fallback.
  // Once API data arrives, it should replace the initial snapshot.
  const data = error && !retryable(error) ? undefined : apiData ?? initial?.user;
  
  // Always use headers from API response (headers are only available from API, not from initial data)
  const headers = apiHeaders;

  const handleRefresh = async () => {
    await mutate();
  };

  // Don't show loading if we have initial data
  const shouldShowLoading = isLoading && !initial?.user;

  return { data, headers, error, updatedAt: response?.updatedAt ?? null, isLoading: shouldShowLoading, isValidating, refresh: handleRefresh };
};

type RawConfigData = {
  links?: unknown;
  body?: {
    links?: unknown;
  };
};

export const useConfigData = () => {
  const initialLinks = typeof window !== 'undefined'
    ? normalizeConfigLinks(window.__INITIAL_DATA__?.links)
    : [];

  const { data: rawData, error, isLoading, mutate } = useSWR<RawConfigData>(
    `${getBaseUrl()}${getSubscriptionPath()}/raw`,
    fetcher,
    {
      revalidateOnMount: initialLinks.length === 0,
      revalidateIfStale: false,
      errorRetryCount: 3,
      shouldRetryOnError: retryable,
      errorRetryInterval: 2500,
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      onError: (err) => {
        console.warn('Failed to fetch subscription configs:', err);
      },
    }
  );

  // PasarGuard <= older releases returned { links }, while current releases
  // return { body: { links }, headers }. Support both so GitHub installs keep
  // showing configs regardless of the panel version.
  const fallbackLinks = normalizeConfigLinks(rawData?.body?.links ?? rawData?.links);
  const links = rawData ? fallbackLinks : initialLinks;
  const data: ConfigData | undefined = rawData || initialLinks.length > 0 ? { links } : undefined;

  return { data, error, isLoading: isLoading && initialLinks.length === 0, refresh: mutate };
};

export const useChartData = (
  startTime: Date,
  period: string = "hour",
  shouldFetch: boolean = true
) => {
  const { data: chartData, error: chartError, mutate } = useSWR<ChartData>(
    shouldFetch ? `${getBaseUrl()}${getSubscriptionPath()}/usage?start=${startTime.toISOString()}&period=${period}` : null,
    fetcher,
    {
      errorRetryCount: 2,
      shouldRetryOnError: retryable,
      errorRetryInterval: 2000,
      revalidateOnFocus: false,
      revalidateOnMount: shouldFetch, // Only fetch on first load if shouldFetch is true
      refreshInterval: 60000,
      dedupingInterval: 5000,
      onError: (error) => {
        console.warn("Failed to fetch chart data:", error);
      },
    }
  );

  return { chartData, chartError, refresh: mutate };
};

export const useApps = () => {
  const initialAppsArray = typeof window !== 'undefined'
    ? window.__INITIAL_DATA__?.apps
    : undefined;
  
  const { data, error, isLoading } = useSWRImmutable<AppClient[]>(
    initialAppsArray && initialAppsArray.length > 0
      ? null
      : `${getBaseUrl()}${getSubscriptionPath()}/apps`,
    fetcher,
    {
      errorRetryCount: 2,
      shouldRetryOnError: retryable,
      errorRetryInterval: 3000,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      onError: (err) => {
        console.warn('Failed to fetch apps:', err)
      }
    }
  )

  if (initialAppsArray && initialAppsArray.length > 0) {
    return { apps: initialAppsArray, appsError: null, appsLoading: false };
  }

  return { apps: data, appsError: error, appsLoading: isLoading }
}

// Hook to get support URL from useUserInfo headers (no separate fetch needed)
export const useSupportUrl = () => {
  const { headers } = useUserInfo();
  const supportUrl = headers?.['support-url'];
  
  return { supportUrl: safeExternalUrl(supportUrl, true) || null };
};
