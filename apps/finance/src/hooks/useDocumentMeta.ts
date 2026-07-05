import { useEffect } from 'react';
import { applyDocumentMeta } from '@life-os/theme';
import type { AppLocale } from '../i18n/types';

export function useDocumentMeta(pageTitle: string, locale: AppLocale | 'zh' | 'en'): void {
  useEffect(() => {
    applyDocumentMeta('finance', {
      pageTitle,
      locale: locale.startsWith('en') ? 'en' : 'zh',
      pathname: `${window.location.pathname}${window.location.search}${window.location.hash}`
    });
  }, [pageTitle, locale]);
}
