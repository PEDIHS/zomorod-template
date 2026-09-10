import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, ScanQrCode, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useDir } from '@/hooks/useDir';
import { cn } from '@/lib/utils';
import type { ParsedLink } from '@/lib/linkParser';
import {
  downloadTextFile,
  encodeSubscriptionContentToBase64,
  getWireGuardDownloadPayload,
  prepareSubscriptionContentForCopy,
} from '@/lib/subscriptionConfig';

interface QRModalProps {
  link: ParsedLink;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WireGuardQrMode = 'config' | 'uri';

export const QRModal = memo(({ link, open, onOpenChange }: QRModalProps) => {
  const { t } = useTranslation();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const dir = useDir();
  const [wireGuardQrMode, setWireGuardQrMode] = useState<WireGuardQrMode>('config');
  const preparedCopyContent = useMemo(() => prepareSubscriptionContentForCopy(link.raw), [link.raw]);
  const wireGuardDownload = useMemo(() => getWireGuardDownloadPayload(link.raw), [link.raw]);
  const isWireGuard = Boolean(wireGuardDownload);
  const supportsBase64Copy = link.protocol !== 'unknown';
  const qrValue = wireGuardDownload && wireGuardQrMode === 'config' ? wireGuardDownload.content : link.raw;

  useEffect(() => {
    setWireGuardQrMode('config');
  }, [link.raw]);

  // Keep a conservative ceiling for error-correction level L. Very large WG
  // configs should use copy/download instead of producing an unreadable QR.
  const canGenerateQR = useMemo(() => qrValue.length <= 2900, [qrValue]);

  const handleCopy = useCallback(() => {
    copyToClipboard(preparedCopyContent.content, `${link.raw}:config`);
  }, [copyToClipboard, link.raw, preparedCopyContent.content]);

  const handleCopyBase64 = useCallback(() => {
    const encodedContent = encodeSubscriptionContentToBase64(preparedCopyContent.content);
    copyToClipboard(encodedContent, `${link.raw}:base64`);
  }, [copyToClipboard, link.raw, preparedCopyContent.content]);

  const handleDownloadWireGuard = useCallback(() => {
    if (!wireGuardDownload) return;
    try {
      downloadTextFile(wireGuardDownload.content, wireGuardDownload.fileName);
      toast.success(t('configActions.downloadStarted'));
    } catch (error) {
      console.error('Failed to download WireGuard config:', error);
      toast.error(t('configActions.downloadFailed'));
    }
  }, [t, wireGuardDownload]);

  const copiedConfig = isCopied(`${link.raw}:config`);
  const copiedBase64 = isCopied(`${link.raw}:base64`);
  const protocolBadge =
    link.protocol === 'unknown' ? 'SUB' :
    link.protocol === 'wireguard' ? 'WG' :
    link.protocol === 'hysteria' ? 'HY2' :
    link.protocol;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[440px] max-h-[calc(100dvh-1rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-[24px] p-4 sm:p-5"
        dir={dir}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="pr-8 sm:pr-9">
          <DialogTitle>
            <div className="flex items-center gap-2">
              <ScanQrCode className="size-5" aria-hidden="true" />
              <span className="text-base">{t('qr.title')}</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-1 sm:gap-4">
          {wireGuardDownload && (
            <div className="ios-segmented-control" aria-label={t('qr.format')}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={`ios-segmented-item ${wireGuardQrMode === 'config' ? 'is-selected' : ''}`}
                onClick={() => setWireGuardQrMode('config')}
              >
                {t('qr.config')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={`ios-segmented-item ${wireGuardQrMode === 'uri' ? 'is-selected' : ''}`}
                onClick={() => setWireGuardQrMode('uri')}
              >
                URI
              </Button>
            </div>
          )}

          {canGenerateQR ? (
            <div className="w-full rounded-[22px] border border-black/5 bg-white p-3 shadow-sm sm:p-4">
              <div className="mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-xl bg-white">
                <QRCodeSVG
                  value={qrValue}
                  size={320}
                  level="L"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#071c16"
                  className="block h-auto w-full"
                  style={{ width: '100%', height: 'auto', maxWidth: '320px' }}
                  role="img"
                  aria-label={`${t('qr.title')} - ${link.name}`}
                />
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center justify-center rounded-2xl bg-muted/30 p-6 sm:p-8">
              <AlertCircle className="mb-3 size-11 text-yellow-500" aria-hidden="true" />
              <p className="mb-1 text-center text-sm font-medium text-muted-foreground">{t('qr.tooLong')}</p>
              <p className="text-center text-sm text-muted-foreground">{t('qr.useCopy')}</p>
            </div>
          )}

          <div className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-muted/60 px-3 text-sm">
            <div className="ios-protocol-badge">{protocolBadge}</div>
            {link.emoji && <span className="text-base">{link.emoji}</span>}
            <span dir="ltr" className={cn('page-item-title min-w-0 flex-1 truncate', dir === 'rtl' ? 'text-right' : 'text-left')}>
              {link.name}
            </span>
          </div>

          <div className={`grid w-full grid-cols-1 gap-2 ${isWireGuard ? 'sm:grid-cols-2' : ''}`}>
            <Button onClick={handleCopy} size="sm" className="h-10 w-full gap-2 text-sm">
              {copiedConfig ? <><Check className="size-4" />{t('qr.copied')}</> : <><Copy className="size-4" />{link.protocol === 'unknown' ? t('qr.copy') : t('configActions.copyConfig')}</>}
            </Button>

            {supportsBase64Copy && (
              <Button onClick={handleCopyBase64} size="sm" variant={copiedBase64 ? 'default' : 'outline'} className="h-10 w-full gap-2 text-sm">
                {copiedBase64 ? <><Check className="size-4" />{t('qr.copied')}</> : <><Copy className="size-4" />{t('configActions.copyBase64')}</>}
              </Button>
            )}

            {wireGuardDownload && (
              <Button onClick={handleDownloadWireGuard} size="sm" variant="outline" className="h-10 w-full gap-2 text-sm sm:col-span-2">
                <Download className="size-4" />
                {t('configActions.downloadWireGuard')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
