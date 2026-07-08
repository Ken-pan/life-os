import { createI18n } from '@life-os/platform-web'
import { S, patchCloudSettings } from '$lib/state.svelte.js'
import zh from './messages/zh.js'

/** @typedef {typeof zh} Messages */

const messages = /** @type {Record<'zh' | 'en', Messages>} */ ({ zh })

export const { resolveLocale, localeTag, t, applyLocale, setLocale } =
  createI18n({
    messages,
    getLocale: () => S.settings.locale,
    persistLocale: (locale) => patchCloudSettings({ locale }),
  })
