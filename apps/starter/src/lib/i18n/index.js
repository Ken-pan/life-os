import { createI18n } from '@life-os/platform-web'
import { S, save } from '$lib/state.svelte.js'
import { messages } from './messages/index.js'

/** @typedef {typeof import('./messages/zh.js').default} Messages */

export const { resolveLocale, localeTag, t, applyLocale, setLocale } =
  createI18n({
    messages,
    getLocale: () => S.settings.locale,
    persistLocale: (locale) => {
      S.settings.locale = locale
      save()
    },
  })
