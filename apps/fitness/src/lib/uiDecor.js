/**
 * UI decorative copy — roles, audit, and hide policy.
 *
 * Mark elements: `data-ui-decor="{role}"`
 * Audit: `node scripts/i18n-en-audit.mjs` (en + zh)
 *
 * Hide policy follows Material / Android guidance: one heading per block;
 * decorative or redundant labels are not shown (CSS) and skipped by AT (aria-hidden).
 */

/** @typedef {'tag'|'kicker'|'section-label'|'callout-label'|'meta-strip'|'eyebrow'|'en-accent'|'stat-label'|'nav-label'} UiDecorRole */

/** @type {UiDecorRole[]} Hidden in BOTH zh and en */
export const UI_DECOR_HIDE_BOTH = [
  'tag', // sec-title already names the section (计划 / Program)
  'kicker', // hero/cover echo (今日推荐 / Today's pick)
  'callout-label', // callout body is self-explanatory (今日重点 / Today's focus)
  'meta-strip', // app bar, coach subtitle, eyebrow program name
  'en-accent', // day.name caps (CHEST) — zero info when cn/title shown
]

/**
 * Hidden only in English — currently same as BOTH (en-accent not rendered in EN anyway).
 * @type {UiDecorRole[]}
 */
export const UI_DECOR_HIDE_EN = []

/**
 * Hidden only in Chinese — en-accent covered by UI_DECOR_HIDE_BOTH.
 * @type {UiDecorRole[]}
 */
export const UI_DECOR_HIDE_ZH = []

/** @param {'zh'|'en'} locale @param {UiDecorRole} role */
export function shouldHideDecor(locale, role) {
  if (UI_DECOR_HIDE_BOTH.includes(role)) return true
  if (locale === 'en' && UI_DECOR_HIDE_EN.includes(role)) return true
  if (locale === 'zh' && UI_DECOR_HIDE_ZH.includes(role)) return true
  return false
}

/** @type {Record<UiDecorRole, { value: 'none'|'low'|'medium'|'high'; note: string; hide: boolean }>} */
export const UI_DECOR_ROLES = {
  tag: {
    value: 'low',
    hide: true,
    note: 'Pill before sec-title — duplicate in zh & en',
  },
  kicker: {
    value: 'low',
    hide: true,
    note: 'Above hero/cover title — context already obvious',
  },
  'section-label': {
    value: 'medium',
    hide: false,
    note: 'Card/chart block label (sg-title, cycle) — keep for scan',
  },
  'callout-label': {
    value: 'low',
    hide: true,
    note: 'Callout kicker before body text',
  },
  'meta-strip': {
    value: 'low',
    hide: true,
    note: 'AppBar today line, coach subtitle, eyebrow program name',
  },
  eyebrow: {
    value: 'medium',
    hide: false,
    note: 'Date line — program name span uses meta-strip and is hidden',
  },
  'en-accent': {
    value: 'none',
    hide: true,
    note: 'Decorative EN caps on training days — hidden both locales',
  },
  'stat-label': {
    value: 'medium',
    hide: false,
    note: 'Metric caption under number',
  },
  'nav-label': {
    value: 'high',
    hide: false,
    note: 'Bottom navigation',
  },
}

/** CSS class → default decor role for audit auto-detection */
export const UI_DECOR_CLASS_MAP = {
  tag: 'tag',
  'hero-kicker': 'kicker',
  'hm-kicker': 'kicker',
  'tc-label': 'section-label',
  'cycle-label': 'section-label',
  'sg-title': 'section-label',
  'co-label': 'callout-label',
  'appbar-meta': 'meta-strip',
  eyebrow: 'eyebrow',
  'decor-en': 'en-accent',
  'stat-l': 'stat-label',
  'nav-lbl': 'nav-label',
}

/** Human-readable hide matrix for decor-report.md */
export const UI_DECOR_HIDE_MATRIX = {
  zh: {
    hide: UI_DECOR_HIDE_BOTH,
    keep: ['section-label', 'stat-label', 'nav-label', 'eyebrow (date only)'],
    notes: [
      '不显示 CHEST 等 en-accent，只保留 胸/背/腿/臂',
      '不显示 今日推荐、今日训练、AppBar 今日·胸',
      '不显示 计划/发现/设置 等小标签（与 sec-title 重复）',
      '保留 sg-title（账户、程序模板等卡片分区）与统计 stat-label',
    ],
  },
  en: {
    hide: [...UI_DECOR_HIDE_BOTH, ...UI_DECOR_HIDE_EN],
    keep: ['section-label', 'stat-label', 'nav-label', 'eyebrow (date only)'],
    notes: [
      "No PROGRAM/Discover tag duplicate, no Today's pick/workout kickers",
      'No AppBar "Today · Chest"',
      "No Today's focus callout label — body text only",
      'Keep EXERCISES / SESSIONS PER WEEK block labels and nav',
    ],
  },
}
