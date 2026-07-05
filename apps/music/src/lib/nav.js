/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildNavItems(tr) {
  return [
    { tab: 'home', href: '/', label: tr('nav.home'), icon: 'home' },
    { tab: 'library', href: '/library', label: tr('nav.library'), icon: 'library' },
    { tab: 'browse', href: '/browse', label: tr('nav.browse'), icon: 'discover' },
    { tab: 'playlists', href: '/playlists', label: tr('nav.playlists'), icon: 'list' },
    { tab: 'settings', href: '/settings', label: tr('nav.settings'), icon: 'settings' }
  ];
}

/** @param {string} pathname */
export function resolveNavTab(pathname) {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/library') || pathname.startsWith('/liked') || pathname.startsWith('/import')) return 'library';
  if (pathname.startsWith('/browse') || pathname.startsWith('/album') || pathname.startsWith('/artist')) return 'browse';
  if (pathname.startsWith('/playlists')) return 'playlists';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/search')) return 'library';
  return 'home';
}

/** @param {string} pathname */
export function isNavChromeHidden(pathname) {
  return pathname.startsWith('/now-playing');
}

/** @param {string} pathname */
export function isMiniPlayerHidden(pathname) {
  return pathname.startsWith('/now-playing');
}

const NOW_PLAYING_RETURN_KEY = 'music:now-playing-return';

/** Remember where to go when dismissing Now Playing (avoids unreliable history.length). */
/** @param {string} from */
export function markNowPlayingReturn(from) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(NOW_PLAYING_RETURN_KEY, from || '/');
}

/** @param {string} [fallback='/'] */
export function consumeNowPlayingReturn(fallback = '/') {
  if (typeof sessionStorage === 'undefined') return fallback;
  const value = sessionStorage.getItem(NOW_PLAYING_RETURN_KEY) ?? fallback;
  sessionStorage.removeItem(NOW_PLAYING_RETURN_KEY);
  return value;
}

/** @returns {string | null} */
export function peekNowPlayingReturn() {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(NOW_PLAYING_RETURN_KEY);
}

/** Set return path only when not already recorded (e.g. deep link to Now Playing). */
/** @param {string} from */
export function ensureNowPlayingReturn(from) {
  if (peekNowPlayingReturn()) return;
  markNowPlayingReturn(from);
}

/** @param {string} pathname @param {(k: string) => string} tr */
export function resolvePageTitle(pathname, tr) {
  if (pathname === '/') return tr('home.title');
  if (pathname === '/library') return tr('library.title');
  if (pathname === '/browse') return tr('browse.title');
  if (pathname === '/playlists') return tr('playlists.title');
  if (pathname === '/search') return tr('search.title');
  if (pathname === '/liked') return tr('liked.title');
  if (pathname === '/import') return tr('import.title');
  if (pathname === '/now-playing') return tr('nowPlaying.title');
  if (pathname === '/settings') return tr('settings.title');
  if (pathname === '/auth') return tr('auth.title');
  if (pathname.startsWith('/album/')) return tr('album.title');
  if (pathname.startsWith('/artist/')) return tr('artist.title');
  if (pathname.startsWith('/playlists/')) return tr('playlist.title');
  return tr('app.name');
}
