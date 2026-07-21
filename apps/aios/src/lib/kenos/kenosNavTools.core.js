/**
 * Assistant navigation / Library compose helpers (no $app).
 */

import { domainDeepLink } from './domainResume.core.js'

/** @type {Record<string, { domainId?: string, path: string, label: string, inAppHref?: string }>} */
export const OPEN_SPACE_TARGETS = Object.freeze({
  plan: { domainId: 'plan', path: '/upcoming', label: 'Plan' },
  money: { domainId: 'money', path: '/home/today', label: 'Money' },
  training: { domainId: 'training', path: '/', label: 'Training' },
  fitness: { domainId: 'training', path: '/', label: 'Training' },
  health: { domainId: 'health', path: '/', label: 'Health' },
  music: { domainId: 'music', path: '/', label: 'Music' },
  home: { domainId: 'home', path: '/plan', label: 'Home' },
  library: { domainId: 'knowledge', path: '/library', label: 'Library' },
  knowledge: { domainId: 'knowledge', path: '/library', label: 'Library' },
  work: { inAppHref: '/work', label: 'Work' },
  focus: { inAppHref: '/spaces/work', label: 'Work · Deep Work' },
  deep_work: { inAppHref: '/spaces/work', label: 'Work · Deep Work' },
  today: { inAppHref: '/', label: 'Today' },
  inbox: { inAppHref: '/inbox', label: 'Inbox' },
  assistant: { inAppHref: '/assistant', label: 'Assistant' },
  spaces: { inAppHref: '/spaces', label: 'Spaces' },
  settings: { inAppHref: '/settings', label: 'Settings' },
})

/**
 * @param {unknown} space
 * @param {{ env?: ImportMetaEnv | Record<string, string | undefined> }} [opts]
 * @returns {{ ok: true, href: string, label: string, external: boolean } | { ok: false, message: string }}
 */
export function resolveOpenSpaceTarget(space, opts = {}) {
  const key = String(space || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  const target = OPEN_SPACE_TARGETS[key]
  if (!target) {
    return {
      ok: false,
      message: `未知 Space「${space}」。可选: plan, money, training, health, music, home, library, work, focus, today, inbox, assistant, spaces, settings。`,
    }
  }
  if (target.inAppHref) {
    return {
      ok: true,
      href: target.inAppHref,
      label: target.label,
      external: false,
    }
  }
  const href = domainDeepLink(target.domainId, target.path, opts.env)
  return {
    ok: true,
    href,
    label: target.label,
    external: /^https?:\/\//i.test(href),
  }
}

/**
 * @param {{ title?: string, body?: string }} args
 * @param {{ env?: ImportMetaEnv | Record<string, string | undefined> }} [opts]
 */
export function buildLibraryComposeHref(args = {}, opts = {}) {
  const title = String(args.title || '')
    .trim()
    .slice(0, 200)
  const body = String(args.body || '')
    .trim()
    .slice(0, 8000)
  if (!title && !body) {
    return {
      ok: false,
      message: 'compose_library_note 需要 title 或 body 至少一项。',
    }
  }
  const params = new URLSearchParams()
  params.set('compose', '1')
  if (title) params.set('title', title)
  if (body) params.set('body', body)
  const path = `/library?${params.toString()}`
  const href = domainDeepLink('knowledge', path, opts.env)
  return {
    ok: true,
    href,
    title: title || '(无标题)',
    bodyPreview: body.slice(0, 120),
    message: `已打开 Library 起草笔记「${title || '(无标题)'}」。正文已预填到编辑器(本机 Knowledge 数据,不经云端模型服务器写入)。`,
  }
}
