<script>
  // finance 页头：迁到共享 LifeOsAppBar（与 home/music/fitness 一致），
  // 替代旧的手写 .page-header。桌面隐藏 leading 品牌（侧栏已有），移动端显示品牌 + 标题。
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar'
  import AppBrand from '@life-os/platform-web/svelte/brand'
  import ReportBugButton from '@life-os/platform-web/svelte/feedback'
  import { supabase } from '$lib/supabase.js'
  import { auth } from '$lib/auth.svelte.js'

  /** @type {{ title?: string, subtitle?: string, meta?: string }} */
  let { title, subtitle, meta } = $props()
</script>

<LifeOsAppBar {title} {subtitle}>
  {#snippet leading()}
    <AppBrand appId="finance" variant="appbar" ariaLabel="Korben Money" />
  {/snippet}
  {#snippet trailing()}
    {#if meta}<span class="appbar-meta">{meta}</span>{/if}
    <ReportBugButton app="finance" {supabase} user={auth.user} />
  {/snippet}
</LifeOsAppBar>
