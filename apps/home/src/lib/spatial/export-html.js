/** @typedef {import('./types.js').SpatialProject} SpatialProject */

import { renderFloorPlanSvg } from './render-svg.js'
import { projectStats } from './model.js'

/**
 * Build a self-contained spatial audit HTML document (offline-friendly).
 * @param {SpatialProject} project
 * @param {{ includeFurniture?: boolean }} [opts]
 */
export function exportAuditHtml(project, opts = {}) {
  const includeFurniture = opts.includeFurniture ?? false
  const svg = renderFloorPlanSvg(project, { compact: true, hideFurniture: !includeFurniture })
  const meta = project.meta
  const stats = projectStats(project)

  const storageCards = project.storageZones
    .map(
      (z) => `<article class="card">
      <header><span class="tag">${esc(z.code)}</span><h3>${esc(z.nameZh)}</h3></header>
      <p class="meta"><b>位置</b> ${esc(z.locationZh)} · <b>形式</b> ${esc(z.formZh)}${z.inferred ? ' · <b>推测</b>' : ''}</p>
      <ul>${z.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </article>`,
    )
    .join('')

  const furnitureRows = includeFurniture
    ? project.furnitureInventory
        .map(
          (r) =>
            `<tr><td>${esc(r.zoneZh)}</td><td>${esc(r.objectZh)}</td><td>${esc(r.noteZh)}</td></tr>`,
        )
        .join('')
    : ''

  const assumptions = (meta.assumptions ?? [])
    .map((a) => `<li>${a}</li>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.nameZh)} · 空间存储审计</title>
<style>
:root{--ink:#16181d;--panel:#1d2027;--paper:#eef1f4;--line:#2a2f37;--accent:#5c758c;--fg:#dfe3e8;--mut:#9aa2ad;--mono:ui-monospace,Menlo,monospace;--sans:system-ui,"PingFang SC",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--fg);font-family:var(--sans);line-height:1.55}
.wrap{max-width:1080px;margin:0 auto;padding:32px 20px 64px}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.32em;color:var(--accent);text-transform:uppercase;margin:0 0 8px}
h1{font-size:clamp(26px,4.6vw,40px);font-weight:750;margin:0 0 6px}
.sub{color:var(--mut);font-size:15px;margin:0 0 20px;max-width:60ch}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 26px}
.chip{font-family:var(--mono);font-size:12px;background:var(--panel);border:1px solid var(--line);padding:6px 11px;border-radius:999px}
.chip b{color:var(--accent)}
.plan{background:var(--paper);border-radius:14px;padding:14px;border:1px solid var(--line);overflow-x:auto}
.plan svg{display:block;width:100%;height:auto;min-width:0;max-width:100%}
.legend{display:flex;flex-wrap:wrap;gap:12px 18px;margin:16px 2px 0;font-family:var(--mono);font-size:11px;color:var(--mut)}
.legend i{display:inline-block;width:16px;height:12px;border-radius:2px;border:1px solid var(--line);vertical-align:middle;margin-right:5px}
.legend .store{background:repeating-linear-gradient(45deg,#dce4ec,#dce4ec 3px,#f4f7fa 3px,#f4f7fa 6px);border-color:var(--accent)}
.legend .furn{background:#dfe3e8}
h2{font-size:13px;font-family:var(--mono);letter-spacing:.24em;text-transform:uppercase;color:var(--accent);margin:44px 0 4px;padding-top:20px;border-top:1px solid var(--line)}
.h2sub{color:var(--mut);font-size:14px;margin:0 0 18px}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
.card header{display:flex;align-items:center;gap:10px;margin:0 0 8px}
.card .tag{font-family:var(--mono);font-weight:700;font-size:12px;color:#f5f8fa;background:var(--accent);padding:3px 8px;border-radius:6px}
.card h3{font-size:15px;margin:0}
.card .meta{font-size:12px;color:var(--mut);margin:0 0 9px}
.card ul{margin:0;padding-left:17px;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line)}
th{font-family:var(--mono);font-size:11px;color:var(--accent)}
.notes{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:15px 18px;font-size:13px}
footer{margin-top:40px;color:var(--mut);font-family:var(--mono);font-size:11px;border-top:1px solid var(--line);padding-top:16px}
</style></head>
<body><div class="wrap">
<p class="eyebrow">HOME.OS · Spatial Audit</p>
<h1>${esc(meta.nameZh)}</h1>
<p class="sub">顶视平面 · ${includeFurniture ? '家具布置 · ' : ''}${stats.storageZones} 个储藏区标注 + 逐区物品清单。比例尺见平面图左下。</p>
<div class="chips">
 <span class="chip"><b>户型</b> ${esc(meta.layoutType ?? '—')}</span>
 <span class="chip"><b>面积</b> ${meta.sqft ? `${meta.sqft} sqft` : '—'}</span>
 <span class="chip"><b>房间</b> ${stats.rooms} 区</span>
 <span class="chip"><b>储藏点</b> S1–S${stats.storageZones}</span>
</div>
<div class="plan">${svg}</div>
<div class="legend">
 <span><i class="store"></i>储藏区</span>
 ${includeFurniture ? '<span><i class="furn"></i>家具</span>' : ''}
 <span>实线 = 承重墙</span>
 <span>虚线 = 通道口</span>
 <span>= 推拉门 · ⌒ 平开门</span>
</div>
<h2>储藏区清单</h2>
<p class="h2sub">对应平面青灰标注点。</p>
<div class="grid-cards">${storageCards}</div>
${includeFurniture ? `<h2>家具明细</h2>
<table><thead><tr><th>区域</th><th>物件</th><th>备注</th></tr></thead><tbody>${furnitureRows}</tbody></table>` : ''}
<h2>重建说明</h2>
<div class="notes"><ul>${assumptions}</ul></div>
<footer>${esc(meta.sourceNote ?? 'HOME.OS export')}</footer>
</div></body></html>`
}

/**
 * Wrap HTML as MHTML (Chrome/Edge double-click friendly).
 * @param {SpatialProject} project
 */
/**
 * @param {SpatialProject} project
 * @param {{ includeFurniture?: boolean }} [opts]
 */
export function exportAuditMhtml(project, opts = {}) {
  const html = exportAuditHtml(project, opts)
  const boundary = `----=_HomeOS_${Date.now()}`
  const encoded = btoa(unescape(encodeURIComponent(html)))
  return [
    'From: <Saved by HOME.OS>',
    'Subject: Spatial Audit',
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    'Content-Location: audit.html',
    '',
    encoded,
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

/**
 * @param {string} content
 * @param {string} filename
 * @param {string} mime
 */
export function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** @param {string} s */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
