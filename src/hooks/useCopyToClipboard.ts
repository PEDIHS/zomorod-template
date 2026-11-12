import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function useCopyToClipboard(timeout = 2000) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useTranslation();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copyToClipboard = useCallback(async (text: string, id = 'default'): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Preserve copy actions on HTTP installations and older embedded browsers.
        const field = document.createElement('textarea');
        const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:0;font-size:16px';
        document.body.appendChild(field);
        try {
          field.select();
          field.setSelectionRange(0, text.length);
          if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
        } finally { field.remove(); focused?.focus({ preventScroll: true }); }
      }
      if (timer.current) clearTimeout(timer.current);
      setCopiedId(id);
      timer.current = setTimeout(() => setCopiedId(null), timeout);
      toast.success(t('clipboard.copied'), { duration: 2000 });
      return true;
    } catch {
      toast.error(t('clipboard.failed'));
      return false;
    }
  }, [timeout, t]);
  const isCopied = useCallback((id = 'default') => copiedId === id, [copiedId]);
  return { copiedId, copyToClipboard, isCopied };
}
