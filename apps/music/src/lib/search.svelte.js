import { browser } from '$app/environment'
import { goto } from '$app/navigation'
import { searchAll, addRecentSearch } from './db.js'

export { highlightParts } from './searchEngine.js'

/** @typedef {'all' | 'tracks' | 'albums' | 'artists' | 'playlists'} SearchScope */

export const SEARCH_SCOPES = /** @type {const} */ ([
  'all',
  'tracks',
  'albums',
  'artists',
  'playlists',
])

const TYPEAHEAD_MIN = 2
const TYPEAHEAD_DEBOUNCE_MS = 150
const URL_DEBOUNCE_MS = 300

/** @typedef {'relevance' | 'title' | 'recent'} SearchSort */

export const searchState = $state({
  q: '',
  scope: /** @type {SearchScope} */ ('all'),
  sort: /** @type {SearchSort} */ ('relevance'),
  /** @type {Awaited<ReturnType<typeof searchAll>> | null} */
  results: null,
  /** @type {Awaited<ReturnType<typeof searchAll>> | null} */
  suggestResults: null,
  pending: false,
  suggestPending: false,
})

/** @type {ReturnType<typeof setTimeout> | null} */
let urlTimer = null
/** @type {ReturnType<typeof setTimeout> | null} */
let suggestTimer = null
let searchGen = 0
let suggestGen = 0

/** @param {string} scope */
export function normalizeScope(scope) {
  return /** @type {SearchScope} */ (
    SEARCH_SCOPES.includes(/** @type {SearchScope} */ (scope)) ? scope : 'all'
  )
}

/** @param {SearchSort} sort */
export function normalizeSort(sort) {
  return sort === 'title' || sort === 'recent' ? sort : 'relevance'
}

/** @param {string} q @param {SearchScope} scope @param {SearchSort} [sort] */
export function buildSearchHref(q, scope = 'all', sort = 'relevance') {
  const params = new URLSearchParams()
  const trimmed = q.trim()
  if (trimmed) params.set('q', trimmed)
  if (scope && scope !== 'all') params.set('scope', scope)
  if (sort && sort !== 'relevance') params.set('sort', sort)
  const qs = params.toString()
  return qs ? `/search?${qs}` : '/search'
}

/** @param {URL} url */
export function readSearchFromUrl(url) {
  return {
    q: url.searchParams.get('q') ?? '',
    scope: normalizeScope(url.searchParams.get('scope') ?? 'all'),
    sort: normalizeSort(url.searchParams.get('sort') ?? 'relevance'),
  }
}

/** @type {string | null} */
let lastFetchedQ = null

/** @param {URL} url */
export async function syncSearchFromUrl(url) {
  const { q, scope, sort } = readSearchFromUrl(url)
  searchState.q = q
  searchState.scope = scope
  searchState.sort = sort
  const trimmed = q.trim()
  if (lastFetchedQ !== trimmed) {
    lastFetchedQ = trimmed
    await runFullSearch()
  }
}

/** @param {{ q?: string; scope?: SearchScope; sort?: SearchSort; replace?: boolean }} [opts] */
export function commitSearchUrl(opts = {}) {
  if (!browser) return
  const q = opts.q ?? searchState.q
  const scope = opts.scope ?? searchState.scope
  const sort = opts.sort ?? searchState.sort
  goto(buildSearchHref(q, scope, sort), {
    replaceState: opts.replace !== false,
    noScroll: true,
    keepFocus: true,
  })
}

/** Draft-only query update (typeahead / app bar). Does not touch URL or full results. */
export function setSearchDraft(q) {
  searchState.q = q
}

export function dismissSuggestions() {
  clearTimeout(suggestTimer)
  suggestGen += 1
  searchState.suggestResults = null
  searchState.suggestPending = false
}

/** @param {string} q @param {{ debounce?: boolean; navigate?: boolean; draft?: boolean }} [opts] */
export function setSearchQuery(q, opts = {}) {
  searchState.q = q
  if (!browser || opts.draft) return

  const onSearchPage = window.location.pathname === '/search'
  const navigate = opts.navigate === true
  if (!navigate) return

  clearTimeout(urlTimer)
  const delay = opts.debounce === false ? 0 : URL_DEBOUNCE_MS
  urlTimer = setTimeout(() => {
    commitSearchUrl({ q, replace: true })
  }, delay)
}

/** Commit current draft to URL + full search (search page toolbar). */
export function commitSearchDraft(q = searchState.q) {
  if (!browser) return
  searchState.q = q
  clearTimeout(urlTimer)
  commitSearchUrl({ q, replace: true })
}

/** @param {SearchScope} scope */
export function setSearchScope(scope) {
  const next = normalizeScope(scope)
  searchState.scope = next
  if (browser && window.location.pathname === '/search') {
    commitSearchUrl({ scope: next, replace: true })
  }
}

/** @param {SearchSort} sort */
export function setSearchSort(sort) {
  const next = normalizeSort(sort)
  searchState.sort = next
  if (browser && window.location.pathname === '/search') {
    commitSearchUrl({ sort: next, replace: true })
  }
}

export function clearSearchQuery() {
  searchState.q = ''
  lastFetchedQ = null
  dismissSuggestions()
  if (browser && window.location.pathname === '/search') {
    commitSearchUrl({ q: '', replace: true })
  }
}

export async function runFullSearch() {
  const gen = ++searchGen
  const q = searchState.q.trim()
  searchState.pending = true
  try {
    const results = await searchAll(q, { limit: 50 })
    if (gen !== searchGen) return
    searchState.results = results
    if (q) addRecentSearch(q)
  } finally {
    if (gen === searchGen) searchState.pending = false
  }
}

/** @param {string} q */
export function fetchSuggestions(q) {
  clearTimeout(suggestTimer)
  const trimmed = q.trim()
  if (trimmed.length < TYPEAHEAD_MIN) {
    searchState.suggestResults = null
    searchState.suggestPending = false
    return
  }

  const gen = ++suggestGen
  searchState.suggestPending = true
  suggestTimer = setTimeout(async () => {
    const query = trimmed
    try {
      const results = await searchAll(query, { limit: 5 })
      if (gen !== suggestGen) return
      searchState.suggestResults = results
    } finally {
      if (gen === suggestGen && searchState.q.trim() === query) {
        searchState.suggestPending = false
      }
    }
  }, TYPEAHEAD_DEBOUNCE_MS)
}

/** @param {string} [q] @param {{ scope?: SearchScope; sort?: SearchSort }} [opts] */
export function goToFullSearch(q = searchState.q, opts = {}) {
  const trimmed = q.trim()
  const scope = opts.scope ?? searchState.scope
  const sort = opts.sort ?? searchState.sort
  searchState.q = trimmed
  searchState.scope = scope
  searchState.sort = sort
  dismissSuggestions()
  if (trimmed) addRecentSearch(trimmed)
  goto(buildSearchHref(trimmed, scope, sort), { keepFocus: true })
}

export function typeaheadMinLength() {
  return TYPEAHEAD_MIN
}

/** @param {string} q */
export function typeaheadCharsRemaining(q) {
  return Math.max(0, TYPEAHEAD_MIN - q.trim().length)
}

export function searchShortcutLabel() {
  if (!browser) return '⌘K'
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘K' : 'Ctrl+K'
}

/**
 * @param {import('./types.js').Track[]} tracks
 * @param {SearchSort} sort
 */
export function sortTracks(tracks, sort) {
  const list = [...tracks]
  if (sort === 'title') {
    list.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  } else if (sort === 'recent') {
    list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
  }
  return list
}
