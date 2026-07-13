/**
 * 侧栏预览面板(Artifacts/Canvas + 内建阅读器 + 文件查看)。
 * kind:
 *  - 'artifact' HTML/SVG 实时渲染(沙盒 iframe)+ 代码视图
 *  - 'code'     纯代码查看
 *  - 'url'      内建阅读器(阅读模式正文,可外部打开)
 *  - 'file'     附件文件内容
 */

export const P = $state({
  open: false,
  /** @type {'artifact'|'code'|'url'|'file'|null} */
  kind: null,
  title: '',
  lang: '',
  code: '',
  url: '',
  /** 阅读器/文件正文(url 模式为空时由面板自行抓取) */
  text: '',
  name: '',
  /** artifact 视图:'preview' | 'code' */
  view: 'preview',
})

export function openArtifact({ lang, code, title }) {
  Object.assign(P, {
    open: true,
    kind: 'artifact',
    lang,
    code,
    title: title || lang.toUpperCase(),
    view: 'preview',
    url: '',
    text: '',
    name: '',
  })
}

export function openCode({ lang, code, title }) {
  Object.assign(P, {
    open: true,
    kind: 'code',
    lang,
    code,
    title: title || lang || 'code',
    view: 'code',
    url: '',
    text: '',
    name: '',
  })
}

export function openUrl(url, text = '') {
  let title = url
  try {
    title = new URL(url).hostname
  } catch {
    /* keep raw */
  }
  Object.assign(P, {
    open: true,
    kind: 'url',
    url,
    text,
    title,
    lang: '',
    code: '',
    name: '',
    view: 'preview',
  })
}

export function openFile({ name, text }) {
  Object.assign(P, {
    open: true,
    kind: 'file',
    name,
    text,
    title: name,
    lang: '',
    code: '',
    url: '',
    view: 'preview',
  })
}

export function closePanel() {
  P.open = false
}
