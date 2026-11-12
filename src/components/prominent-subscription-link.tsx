import { useState, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, ScanQrCode, Link2 } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { QRModal } from '@/components/qr-modal';
import { getSubscriptionPath } from '@/lib/subscriptionData';
import { cn } from '@/lib/utils';
import type { ParsedLink } from '@/lib/linkParser';

interface ProminentSubscriptionLinkProps {
  hasChart?: boolean;
}

export const ProminentSubscriptionLink = memo(({ hasChart }: ProminentSubscriptionLinkProps) => {
  const { t } = useTranslation();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [qrModalOpen, setQrModalOpen] = useState(false);

  const subscriptionUrl = useMemo(() =>
    `${window.location.origin}${getSubscriptionPath(window.location.pathname)}`,
    []
  );

  const handleCopy = useCallback(() => {
    copyToClipboard(subscriptionUrl, subscriptionUrl);
  }, [copyToClipboard, subscriptionUrl]);

  const handleShowQR = useCallback(() => {
    setQrModalOpen(true);
  }, []);

  const subscriptionLinkData = useMemo<ParsedLink>(() => ({
    protocol: 'unknown',
    name: t('config.subscriptionLink'),
    emoji: '📱',
    raw: subscriptionUrl
  }), [subscriptionUrl, t]);

  return (
    <div className={cn(
      "animate-fadeIn",
      hasChart ? 'order-2 lg:order-1' : ''
    )}>
      <div className="space-y-3">
        <div className="ios-panel-header">
          <h2 className="page-section-title flex items-center gap-2">
            <Link2 className="size-5 text-primary" aria-hidden="true" />
            {t('config.title')}
          </h2>
        </div>

        <div className="ios-grouped-list">
        <div className="ios-list-row ios-list-row-featured">
          <div className="flex items-center gap-2">
            {/* Subscription Badge */}
            <div className="ios-protocol-badge">
              SUB
            </div>

            {/* Name */}
            <div className="page-item-title flex-1 min-w-0 truncate">
              {t('config.subscriptionLink')}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-1 shrink-0">
              <button
                onClick={handleCopy}
                className={`ios-row-action ${isCopied(subscriptionUrl) ? 'is-selected' : ''}`}
                title={t('qr.copy')}
              >
                {isCopied(subscriptionUrl) ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                onClick={handleShowQR}
                className="ios-row-action"
                title={t('qr.show')}
              >
                <ScanQrCode className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      <QRModal
        link={subscriptionLinkData}
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
      />
    </div>
  );
});

ProminentSubscriptionLink.displayName = 'ProminentSubscriptionLink';
