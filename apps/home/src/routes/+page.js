import { redirect } from '@sveltejs/kit'

/**
 * 「/」不再有自己的页面 —— 它直接把人送进平面图。
 *
 * 原来这里是「空间概览」:一张缩到 580px 的静态平面图缩略图,两侧留白比图还宽,
 * 底下压着「打开交互平面图 →」。它唯一的功能就是让人点进 /plan —— 一个占了导航
 * 第一格的加载屏。既然它的出口只有一个,那它就该是那个出口本身。
 *
 * 保留这条重定向而不是删掉整个路由,是因为 PWA 的 start_url 是「/」
 * (static/manifest.webmanifest),已装到桌面的图标还指着它;书签和历史记录同理。
 */
export function load() {
  redirect(307, '/plan')
}
