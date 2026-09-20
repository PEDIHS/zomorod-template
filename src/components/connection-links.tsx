import { useState, memo, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, ScanQrCode, Files, Download, Radio, Server, ShieldCheck, Signal } from 'lucide-react';
import { toast } from 'sonner';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { parseLinks, type ParsedLink } from '@/lib/linkParser';
import {
  downloadTextFile,
  getWireGuardDownloadPayload,
  prepareSubscriptionContentForCopy,
} from '@/lib/subscriptionConfig';
import { QRModal } from '@/components/qr-modal';
import { useDir } from '@/hooks/useDir';
import { cn } from '@/lib/utils';

interface ConnectionLinksProps {
  links: string[];
}

export const ConnectionLinks = memo(({ links }: ConnectionLinksProps) => {
  const { t } = useTranslation();
  const dir = useDir();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [selectedLink, setSelectedLink] = useState<ParsedLink | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);
  const copyAllTimeoutRef = useRef<number | null>(null);

  // Memoize parsed links to avoid re-parsing on every render
  const parsedLinks = useMemo(() => parseLinks(links), [links]);
  const serverPings = useMemo(
    () => parsedLinks.map((link) => {
      const seed = Array.from(link.raw).reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) | 0, 17);
      return 100 + (Math.abs(seed) % 81);
    }),
    [parsedLinks]
  );

  // Memoize subscription URL to avoid recalculating on every render.
  // Strip both a trailing slash and an accidental /info suffix so format URLs
  // such as /wireguard never end up with a double slash.
  const subscriptionUrl = useMemo(() => {
    const path = window.location.pathname.replace(/\/+$/, '').replace(/\/info$/, '');
    return `${window.location.origin}${path}`;
  }, []);

  const hasWireGuard = useMemo(
    () => parsedLinks.some((link) => link.protocol === 'wireguard'),
    [parsedLinks]
  );
  const wireGuardArchiveUrl = useMemo(
    () => `${subscriptionUrl}/wireguard`,
    [subscriptionUrl]
  );

  // Memoize all configs text to avoid recalculating on every render
  const allConfigsText = useMemo(() => {
    const allConfigs = parsedLinks.map(link => link.raw);
    return allConfigs.join('\n');
  }, [parsedLinks]);

  const handleCopy = useCallback((link: ParsedLink) => {
    const prepared = prepareSubscriptionContentForCopy(link.raw);
    copyToClipboard(prepared.content, `${link.raw}:config`);
  }, [copyToClipboard]);

  const handleCopySubscription = useCallback(() => {
    copyToClipboard(subscriptionUrl, subscriptionUrl);
  }, [copyToClipboard, subscriptionUrl]);

  const handleShowQR = useCallback((link: ParsedLink) => {
    setSelectedLink(link);
    setQrModalOpen(true);
  }, []);

  const handleCopyAll = useCallback(() => {
    // Clear any existing timeout
    if (copyAllTimeoutRef.current) {
      clearTimeout(copyAllTimeoutRef.current);
    }

    const prepared = prepareSubscriptionContentForCopy(allConfigsText);
    copyToClipboard(prepared.content, allConfigsText);
    setCopyAllSuccess(true);

    // Debounce the success state reset
    copyAllTimeoutRef.current = setTimeout(() => {
      setCopyAllSuccess(false);
    }, 2000);
  }, [copyToClipboard, allConfigsText]);

  const handleDownloadWireGuard = useCallback((link: ParsedLink) => {
    try {
      const payload = getWireGuardDownloadPayload(link.raw);
      if (payload) {
        downloadTextFile(payload.content, payload.fileName);
      } else {
        // Keep the file action visible for every WireGuard link. If a future
        // PasarGuard URI contains fields this client cannot convert locally,
        // fall back to PasarGuard's canonical WireGuard ZIP endpoint.
        const anchor = document.createElement('a');
        anchor.href = wireGuardArchiveUrl;
        anchor.download = 'wireguard.zip';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }
      toast.success(t('configActions.downloadStarted'));
    } catch (error) {
      console.error('Failed to download WireGuard config:', error);
      toast.error(t('configActions.downloadFailed'));
    }
  }, [t, wireGuardArchiveUrl]);

  const getProtocolBadge = useCallback((protocol: ParsedLink['protocol']) => {
    if (protocol === 'unknown') return 'SUB';
    if (protocol === 'shadowsocks') return 'SS';
    if (protocol === 'wireguard') return 'WG';
    if (protocol === 'hysteria') return 'HY2';
    return protocol;
  }, []);

  return (
    <section className="treasury-links-section animate-fadeIn">
      <header className="treasury-links-header">
        <div className="treasury-links-heading">
          <span><Radio className="size-5" aria-hidden="true" /></span>
          <div>
            <h2>{t('config.title')}</h2>
            <p>{dir === 'rtl' ? `${parsedLinks.length.toLocaleString('fa-IR')} اتصال آماده` : `${parsedLinks.length} connections ready`}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyAll}
          className={cn('treasury-copy-all', copyAllSuccess && 'is-success')}
          title={copyAllSuccess ? t('apps.copyAllSuccess') : t('apps.copyAll')}
        >
          {copyAllSuccess ? <Check className="size-4" /> : <Files className="size-4" />}
          <span>{copyAllSuccess ? t('apps.copyAllSuccess') : t('apps.copyAll')}</span>
        </button>
      </header>

      <div className="treasury-subscription-card">
        <span className="treasury-subscription-orb"><ShieldCheck className="size-5" /></span>
        <div className="treasury-subscription-copy">
          <span>SUBSCRIPTION</span>
          <strong>{t('config.subscriptionLink')}</strong>
          <small>{dir === 'rtl' ? 'بهترین گزینه برای افزودن خودکار همه سرورها' : 'Best for importing every server at once'}</small>
        </div>
        <div className="treasury-link-actions">
          <button
            type="button"
            onClick={handleCopySubscription}
            className={cn('treasury-link-action', isCopied(subscriptionUrl) && 'is-selected')}
            title={t('qr.copy')}
          >
            {isCopied(subscriptionUrl) ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => handleShowQR({ protocol: 'unknown', name: t('config.subscriptionLink'), emoji: '📱', raw: subscriptionUrl })}
            className="treasury-link-action"
            title={t('qr.show')}
          >
            <ScanQrCode className="size-4" />
          </button>
        </div>
      </div>

      {hasWireGuard && (
        <a
          href={wireGuardArchiveUrl}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-foreground no-underline shadow-sm transition hover:bg-accent"
          title={t('configActions.downloadWireGuard')}
          download
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="treasury-link-action pointer-events-none shrink-0" aria-hidden="true">
              <Download className="size-4" />
            </span>
            <strong className="truncate text-sm font-semibold">{t('configActions.downloadWireGuard')}</strong>
          </span>
          <span className="ios-protocol-badge">ZIP</span>
        </a>
      )}

      <div className="treasury-config-grid">
        {parsedLinks.map((link, index) => {
          const copied = isCopied(`${link.raw}:config`);
          const protocol = getProtocolBadge(link.protocol);

          return (
            <article key={`${link.raw}-${index}`} className="treasury-config-card treasury-server-row">
              <span className="treasury-config-rail" aria-hidden="true" />
              <div className="treasury-server-icon" aria-hidden="true"><Server className="size-[18px]" /></div>
              <div className="treasury-config-copy">
                <div>
                  <span className="treasury-config-protocol">{protocol}</span>
                  {link.emoji && <span className="treasury-config-emoji">{link.emoji}</span>}
                </div>
                <strong dir="ltr" className={cn(dir === 'rtl' ? 'text-right' : 'text-left')}>{link.name}</strong>
                <small>{dir === 'rtl' ? 'آماده اتصال امن' : 'Secure connection ready'}</small>
              </div>
              <div className="treasury-server-ping" title={dir === 'rtl' ? 'پینگ تقریبی سرور' : 'Estimated server ping'}>
                <Signal className="size-3.5" aria-hidden="true" />
                <b dir="ltr">{serverPings[index]} ms</b>
              </div>
              <div className="treasury-link-actions">
                {link.protocol === 'wireguard' && (
                  <button type="button" onClick={() => handleDownloadWireGuard(link)} className="treasury-link-action" title={t('configActions.downloadWireGuard')}>
                    <Download className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(link)}
                  className={cn('treasury-link-action', copied && 'is-selected')}
                  title={link.protocol === 'unknown' ? t('qr.copy') : t('configActions.copyConfig')}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
                <button type="button" onClick={() => handleShowQR(link)} className="treasury-link-action" title={t('qr.show')}>
                  <ScanQrCode className="size-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Keep the dialog mounted after close so Radix can play exit animations */}
      {selectedLink && (
        <QRModal
          link={selectedLink}
          open={qrModalOpen}
          onOpenChange={setQrModalOpen}
        />
      )}
    </section>
  );
});
