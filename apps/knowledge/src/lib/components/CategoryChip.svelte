<script>
  // 彩色分类标签：同一标签稳定同色（哈希到主题 hue token）。卡片 + 文档头元信息复用。
  import { tagHueVar } from '$lib/tagColor.js'
  /** @type {{ tag: string }} */
  let { tag } = $props()
</script>

<span class="cat-chip" style="--hue: {tagHueVar(tag)}">{tag}</span>

<style>
  .cat-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--radius-pill, 999px);
    font-size: var(--text-xs, 11px);
    font-weight: 500;
    line-height: 1.5;
    white-space: nowrap;
    color: var(--hue);
    background: color-mix(in srgb, var(--hue) 15%, transparent);
  }
</style>
