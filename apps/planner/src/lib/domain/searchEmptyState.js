/**
 * 搜索页空态文案分流 —— 同一个「没有结果」在搜索页要答不同的问题：
 * 是关键词没命中、是筛选把任务滤空了，还是本来就没有任务。
 * 纯函数，返回 i18n key（+ 可选参数 / 提示 key），由组件用 `t()` 解析。
 *
 * 注意 `selectSearch` 在无关键词时返回全部活动任务，因此「有关键词但 0 结果」
 * 与「只有标签 / 项目筛选却 0 结果」是两种不同处境，文案也应不同。
 *
 * @param {{ query?: string, tag?: string, projectId?: string }} [ctx]
 * @returns {{ messageKey: string, params?: Record<string, string>, hintKey?: string }}
 */
export function searchEmptyState({ query = '', tag = '', projectId = '' } = {}) {
  const q = query.trim()
  if (q) {
    return {
      messageKey: 'search.noMatch',
      params: { query: q },
      hintKey: 'search.noMatchHint',
    }
  }
  if (tag || projectId) {
    return { messageKey: 'search.noFilterMatch', hintKey: 'search.noMatchHint' }
  }
  return { messageKey: 'common.empty', hintKey: 'search.emptyHint' }
}
