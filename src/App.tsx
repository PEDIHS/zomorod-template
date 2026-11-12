import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, AlertTriangle, ArrowDownLeft, ArrowUpRight, Bell, CalendarDays, Check, CheckCheck, Copy, Database, Gem, RefreshCcw, ShieldCheck, Sparkles, WifiOff } from 'lucide-react';
import { useUserInfo, useConfigData, useChartData } from '@/hooks/useUserData';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useLanguage } from '@/hooks/useLanguage';
import { Layout } from '@/components/layout';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OnlineBadge } from '@/components/online-badge';
import { TrafficChart } from '@/components/traffic-chart';
import { ConnectionLinks } from '@/components/connection-links';
import { ProminentSubscriptionLink } from '@/components/prominent-subscription-link';
import { AppsList } from '@/components/AppsList';
import { formatRelativeExpiry, formatDate } from '@/lib/dateFormatter';
import { aggregateUsage, formatBytes, getSubscriptionPath, safeExternalUrl } from '@/lib/subscriptionData';
import { cn } from '@/lib/utils';

function App() {
  const { t, i18n } = useTranslation();
  useLanguage();
  const [timeRange, setTimeRange] = useState('7d');
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const { data, headers, error, isLoading, isValidating, refresh, updatedAt } = useUserInfo();
  const { data: configData, error: configsError, isLoading: configsLoading, refresh: refreshConfigs } = useConfigData();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const subscriptionUrl = `${window.location.origin}${getSubscriptionPath(window.location.pathname)}`;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  const { startTime, period } = useMemo(() => {
    const hours = ({ '24h': 24, '7d': 168, '30d': 720 } as Record<string, number>)[timeRange] ?? 168;
    return { startTime: new Date(refreshedAt - hours * 3600000), period: hours > 24 ? 'day' : 'hour' };
  }, [timeRange, refreshedAt]);
  const { chartData, chartError } = useChartData(startTime, period, Boolean(data));
  const chartUsage = useMemo(() => aggregateUsage(chartData?.stats), [chartData?.stats]);
  const rawAnnouncement = headers?.announce;
  const announcement = useMemo(() => {
    if (!rawAnnouncement) return '';
    try {
      if (rawAnnouncement.startsWith('base64:')) {
        return new TextDecoder().decode(Uint8Array.from(atob(rawAnnouncement.slice(7)), c => c.charCodeAt(0)));
      }
      return decodeURIComponent(rawAnnouncement);
    } catch { return rawAnnouncement.startsWith('base64:') ? '' : rawAnnouncement; }
  }, [rawAnnouncement]);
  const refreshAll = () => {
    setRefreshedAt(Date.now());
    void Promise.allSettled([refresh(), refreshConfigs()]);
  };

  if (!data) return (
    <Layout>
      <div className="pro-gate" role={isLoading || isValidating ? 'status' : 'alert'} aria-live="polite">
        <span className="pro-gate-icon"><Gem className="size-8" /></span>
        {isLoading || isValidating ? <><div className="ios-spinner" /><h1>{t('common.loading')}</h1></> : <>
          <h1>{t('dashboard.error')}</h1><p>{t('pro.unavailable')}</p>
          <button type="button" className="ios-primary-button" onClick={refreshAll}><RefreshCcw className="size-4" />{t('pro.retry')}</button>
        </>}
      </div>
    </Layout>
  );

  const locale = i18n.language.startsWith('fa') ? 'fa-IR' : i18n.language;
  const status = ['active', 'disabled', 'limited', 'expired', 'on_hold'].includes(data.status) ? data.status : 'disabled';
  const unlimited = !data.data_limit || data.data_limit <= 0;
  const used = Math.max(0, Number.isFinite(data.used_traffic) ? data.used_traffic : 0);
  const percentage = unlimited ? 0 : Math.max(0, Math.min(100, used / data.data_limit! * 100));
  const remaining = unlimited ? t('userInfo.unlimited') : formatBytes(Math.max(0, data.data_limit! - used));
  const expiry = formatRelativeExpiry(data.expire, t);
  const statusTone = status === 'active' ? 'success' : status === 'on_hold' ? 'info' : 'warning';
  const announceUrl = safeExternalUrl(headers?.['announce-url']);
  const hasLinks = Boolean(configData?.links.length);

  return (
    <Layout>
      <div className="treasury-shell pro-shell">
        <header className="treasury-navigation pro-navigation">
          <div className="ios-container flex items-center justify-between gap-3">
            <div className="treasury-brand" aria-label="Zomorod">
              <span className="treasury-brand-shield"><Gem className="size-5" /></span><span>{t('pro.brand')}</span><small className="pro-edition">PRO</small>
            </div>
            <div className="flex shrink-0 items-center gap-2"><LanguageSwitcher /><ThemeToggle /></div>
          </div>
        </header>
        <main className="ios-container pro-page">
          <div className="pro-page-heading">
            <div><p className="pro-eyebrow">{t('pro.personalSpace')}</p><h1>{t('pro.mySubscription')}</h1><div className="pro-identity"><span dir="ltr">{data.username}</span><OnlineBadge lastOnline={data.online_at} showText /></div></div>
            <button type="button" className="pro-refresh" disabled={isValidating} onClick={refreshAll} aria-label={t('pro.refresh')}><RefreshCcw className={cn('size-4', isValidating && 'animate-spin')} /><span>{t('pro.refresh')}</span></button>
          </div>
          <div className={cn('pro-sync', (error || !online) && 'is-stale')} role="status" aria-live="polite">
            {error || !online ? <WifiOff className="size-3.5" /> : <CheckCheck className="size-3.5" />}
            <span>{!online ? t('pro.offline') : error ? t('pro.stale') : isValidating ? t('pro.syncing') : t('pro.synced')}</span>
            {updatedAt && <time dir="ltr" dateTime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time>}
          </div>

          <div className="pro-dashboard-grid">
            <div className="pro-overview">
              <section className={cn('treasury-hero pro-hero', `pro-tone-${statusTone}`)} aria-labelledby="account-status">
                <div className="pro-hero-top"><span className="pro-card-label"><ShieldCheck className="size-4" />{t('pro.serviceOverview')}</span><span id="account-status" className={cn('pro-status', `pro-status-${statusTone}`)}><i />{t(`status.${status}`)}</span></div>
                <div className="pro-hero-body">
                  <div className="pro-balance"><span>{t('remaining')}</span><strong dir="auto">{remaining}</strong><p>{t(`pro.description.${status}`)}</p></div>
                  <div className="treasury-orbit pro-orbit" style={{ '--progress': `${percentage * 3.6}deg` } as CSSProperties} role="img" aria-label={`${percentage.toFixed(0)}% ${t('userInfo.used')}`}><div className="treasury-orbit-center"><strong>{percentage.toFixed(0)}<small>%</small></strong><span>{t('userInfo.used')}</span></div></div>
                </div>
                <div className="pro-hero-bottom"><span><Database className="size-3.5" />{formatBytes(used)} / {unlimited ? '∞' : formatBytes(data.data_limit!)}</span><span><CalendarDays className="size-3.5" />{status === 'on_hold' ? t('pro.startsOnUse') : expiry.time}</span></div>
              </section>

              <section className="pro-stat-grid" aria-label={t('pro.serviceOverview')}>
                <div className="pro-stat"><span className="pro-stat-icon"><ArrowUpRight className="size-4" /></span><span>{t('userInfo.usedTraffic')}</span><strong dir="ltr">{formatBytes(used)}</strong></div>
                <div className="pro-stat"><span className="pro-stat-icon"><Database className="size-4" /></span><span>{t('userInfo.totalLimit')}</span><strong dir="auto">{unlimited ? t('userInfo.unlimited') : formatBytes(data.data_limit!)}</strong></div>
                <div className="pro-stat"><span className="pro-stat-icon"><Activity className="size-4" /></span><span>{t('userInfo.lifetimeTraffic')}</span><strong dir="ltr">{formatBytes(data.lifetime_used_traffic || 0)}</strong></div>
              </section>

              <TrafficChart data={chartUsage} isLoading={!chartData && !chartError} error={chartError} timeRange={timeRange} onTimeRangeChange={value => { setTimeRange(value); setRefreshedAt(Date.now()); }} />
              {announcement && <section className="treasury-notice pro-notice" aria-labelledby="announcement-title"><div className="treasury-notice-icon"><Bell className="size-5" /></div><div className="min-w-0 flex-1"><h2 id="announcement-title">{t('userInfo.announcement')}</h2><p className="whitespace-pre-wrap break-words">{announcement}</p>{announceUrl && <a href={announceUrl} target="_blank" rel="noopener noreferrer" className="ios-link">{t('userInfo.viewAnnouncement')}</a>}</div></section>}
              <section className="pro-detail-card"><h2>{t('pro.accountDetails')}</h2><dl><div><dt>{t('userInfo.expiryDate')}</dt><dd>{status === 'on_hold' ? t('pro.startsOnUse') : !data.expire || data.expire === '0' ? t('userInfo.noTimeLimit') : formatDate(data.expire, locale)}</dd></div><div><dt>{t('userInfo.lastOnline')}</dt><dd>{data.online_at ? formatDate(data.online_at, locale) : t('notConnectedYet')}</dd></div>{data.next_plan && <div><dt>{t('pro.nextPlan')}</dt><dd>{data.next_plan.data_limit ? formatBytes(data.next_plan.data_limit) : t('userInfo.unlimited')}</dd></div>}</dl></section>
            </div>

            <aside className="pro-connections">
              <section className="pro-connect-guide">
                <div className="pro-guide-title"><span><Sparkles className="size-5" /></span><div><p className="pro-eyebrow">{t('pro.getStarted')}</p><h2>{t('pro.connectTitle')}</h2></div></div>
                <p>{t('pro.connectDescription')}</p>
                <button type="button" className="pro-connect-button treasury-quick-action" onClick={() => void copyToClipboard(subscriptionUrl, 'subscription-guide')}>
                  {isCopied('subscription-guide') ? <Check className="size-5" /> : <Copy className="size-5" />}{isCopied('subscription-guide') ? t('qr.copied') : t('pro.copySubscription')}
                  <ArrowDownLeft className="size-4 ms-auto" />
                </button>
                <ol className="pro-connect-steps">{['copyStep', 'openStep', 'importStep'].map((key, index) => <li key={key}><b>{index + 1}</b><span>{t(`pro.${key}`)}</span></li>)}</ol>
              </section>
              <div id="connection-links" className="scroll-mt-24">
                {hasLinks ? <ConnectionLinks links={configData!.links} /> : <>
                  <ProminentSubscriptionLink />
                  {configsLoading && <p className="pro-config-message" role="status">{t('common.loading')}</p>}
                  {configsError && <div className="pro-config-message is-error" role="alert"><AlertTriangle className="size-4" /><span>{t('pro.configError')}</span><button type="button" onClick={() => void refreshConfigs().catch(() => {})}>{t('pro.retry')}</button></div>}
                </>}
              </div>
            </aside>
          </div>
          <section data-zomorod-apps className="pro-apps-section"><div className="treasury-section-title"><div><span><Sparkles className="size-4" /></span><h2>{t('apps.title')}</h2></div><p>{t('pro.appsDescription')}</p></div><AppsList /></section>
        </main>
      </div>
    </Layout>
  );
}
export default App;
