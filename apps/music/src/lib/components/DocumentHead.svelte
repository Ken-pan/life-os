<script>
  import { page } from '$app/state';
  import {
    LIFE_OS_SITE_META,
    LIFE_OS_ROBOTS,
    formatDocumentTitle,
    getSiteDescription,
    getOgLocale,
    absoluteUrl
  } from '@life-os/theme';

  /** @type {{ appId: 'music', pageTitle: string, locale?: string, imagePath?: string }} */
  let { appId, pageTitle, locale = 'zh', imagePath = '/icon.svg' } = $props();

  const app = $derived(LIFE_OS_SITE_META[appId]);
  const documentTitle = $derived(formatDocumentTitle(pageTitle, app.name));
  const description = $derived(getSiteDescription(appId, locale));
  const canonical = $derived(absoluteUrl(page.url.origin, page.url.pathname));
  const ogImage = $derived(absoluteUrl(page.url.origin, imagePath));
  const ogLocale = $derived(getOgLocale(locale));
</script>

<svelte:head>
  <title>{documentTitle}</title>
  <meta name="description" content={description} />
  <meta name="robots" content={LIFE_OS_ROBOTS} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={app.name} />
  <meta property="og:title" content={documentTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:locale" content={ogLocale} />
  <meta property="og:image" content={ogImage} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={documentTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>
