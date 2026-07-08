import assert from 'node:assert/strict'

import { createI18n } from '../src/i18n.js'

const messages = {
  zh: {
    nav: { inbox: '收件箱' },
    greet: '你好 {name}',
    onlyZh: '仅中文',
  },
  en: {
    nav: { inbox: 'Inbox' },
    greet: 'Hello {name}',
  },
}

let locale = 'zh'
let persisted = null
const i18n = createI18n({
  messages,
  getLocale: () => locale,
  persistLocale: (next) => {
    persisted = next
    locale = next
  },
})

// resolveLocale 兜底
assert.equal(i18n.resolveLocale('en'), 'en')
assert.equal(i18n.resolveLocale('fr'), 'zh')
assert.equal(i18n.resolveLocale(undefined), 'zh')

// dot-path 查找 + 插值
assert.equal(i18n.t('nav.inbox'), '收件箱')
assert.equal(i18n.t('greet', { name: 'Ken' }), '你好 Ken')
assert.equal(i18n.localeTag(), 'zh-CN')

// 切换 locale + zh 兜底 + 未知 key 原样返回
locale = 'en'
assert.equal(i18n.t('nav.inbox'), 'Inbox')
assert.equal(i18n.t('onlyZh'), '仅中文')
assert.equal(i18n.t('missing.key'), 'missing.key')
assert.equal(i18n.localeTag(), 'en-US')

// setLocale 走 persistLocale 并规范化非法值
i18n.setLocale('zh')
assert.equal(persisted, 'zh')
i18n.setLocale('fr')
assert.equal(persisted, 'zh')

console.log('i18n.test.mjs — OK')
