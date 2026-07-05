import {
  LIFE_OS_SITE_META,
  LIFE_OS_ROBOTS,
  formatDocumentTitle,
  getSiteDescription,
  absoluteUrl,
  getOgLocale
} from './siteMeta.js';

/**
 * @param {string} selector
 * @param {Record<string, string>} attrs
 * @param {string} content
 */
function upsertMeta(selector, attrs, content) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * @param {string} rel
 * @param {string} href
 */
function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * 运行时写入 document title / OG / Twitter meta（React 等无 SSR head 框架）
 * @param {import('./siteMeta.js').LifeOsAppId} appId
 * @param {{
 *   pageTitle: string,
 *   locale?: 'zh' | 'en' | string,
 *   pathname?: string,
 *   imagePath?: string
 * }} options
 */
export function applyDocumentMeta(appId, options) {
  if (typeof document === 'undefined') return;

  const app = LIFE_OS_SITE_META[appId];
  const locale = options.locale ?? 'zh';
  const documentTitle = formatDocumentTitle(options.pageTitle, app.name);
  const description = getSiteDescription(appId, locale);
  const origin = window.location.origin;
  const pathname =
    options.pathname ??
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const canonical = absoluteUrl(origin, pathname);
  const ogImage = absoluteUrl(origin, options.imagePath ?? app.favicon.light);
  const ogLocale = getOgLocale(locale);
  const ogLocaleAlt = ogLocale === 'zh_CN' ? 'en_US' : 'zh_CN';

  document.title = documentTitle;

  upsertMeta('meta[name="description"]', { name: 'description' }, description);
  upsertMeta('meta[name="robots"]', { name: 'robots' }, LIFE_OS_ROBOTS);
  upsertLink('canonical', canonical);

  upsertMeta('meta[property="og:type"]', { property: 'og:type' }, 'website');
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name' }, app.name);
  upsertMeta('meta[property="og:title"]', { property: 'og:title' }, documentTitle);
  upsertMeta('meta[property="og:description"]', { property: 'og:description' }, description);
  upsertMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
  upsertMeta('meta[property="og:locale"]', { property: 'og:locale' }, ogLocale);
  upsertMeta('meta[property="og:locale:alternate"]', { property: 'og:locale:alternate' }, ogLocaleAlt);
  upsertMeta('meta[property="og:image"]', { property: 'og:image' }, ogImage);
  upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt' }, app.name);

  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary');
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, documentTitle);
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, description);
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, ogImage);
}
