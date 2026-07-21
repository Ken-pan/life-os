<script>
  /**
   * Knowledge 笔记 wikilink 芯片条（Planner 备注 + Finance 采购备注共用）。
   * 主链 `knowledgeos://`（原生 Vault），旁路网页 `/library?title=`。
   * 文案由调用方传入（不上平台 i18n）。
   */
  import { LIFE_OS_APP_ORIGINS } from '@life-os/theme'
  import {
    parseWikilinks,
    knowledgeNoteUrl,
    knowledgeNativeNoteUrl,
  } from '../../wikilinks.js'
  import Icon from '../icon/Icon.svelte'

  /**
   * @type {{
   *   text?: string,
   *   webOrigin?: string,
   *   ariaLabel?: string,
   *   webLinkLabel?: string,
   *   nativeTitle?: (title: string) => string,
   *   webTitle?: (title: string) => string,
   *   variant?: 'chip' | 'wikilink',
   * }}
   */
  let {
    text = '',
    webOrigin = '',
    ariaLabel = 'Knowledge notes',
    webLinkLabel = 'Web',
    nativeTitle = (title) => `Open “${title}” in KnowledgeOS`,
    webTitle = (title) => `Open “${title}” on the web`,
    variant = 'chip',
  } = $props()

  const links = $derived(parseWikilinks(text))
  const origin = $derived(
    String(webOrigin || '').replace(/\/$/, '') || LIFE_OS_APP_ORIGINS.knowledge.production,
  )
</script>

{#if links.length}
  <div class="life-os-wikilinks" aria-label={ariaLabel}>
    {#each links as link (link.target)}
      <span class="life-os-wikilinks__group">
        <a
          class="life-os-wikilinks__link"
          href={knowledgeNativeNoteUrl(link.target)}
          title={nativeTitle(link.target)}
        >
          {#if variant === 'chip'}
            <Icon name="link" size={13} strokeWidth={1.8} />
            <span>{link.label}</span>
          {:else}
            [[{link.label}]]
          {/if}
        </a>
        <a
          class="life-os-wikilinks__link life-os-wikilinks__link--web"
          href={knowledgeNoteUrl(link.target, origin)}
          target="_blank"
          rel="noopener noreferrer"
          title={webTitle(link.target)}
        >
          {webLinkLabel}
        </a>
      </span>
    {/each}
  </div>
{/if}

<style>
  .life-os-wikilinks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .life-os-wikilinks__group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    max-width: 100%;
  }

  .life-os-wikilinks__link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 3px 9px;
    border-radius: var(--radius-pill, 999px);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: color-mix(in srgb, var(--accent) 82%, var(--t1, var(--text)));
    font-size: var(--text-xs);
    font-weight: 500;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: background var(--motion-fast) var(--ease, ease);
  }

  .life-os-wikilinks__link:hover {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .life-os-wikilinks__link--web {
    padding: 3px 7px;
    background: transparent;
    color: var(--t3, var(--text-secondary));
  }

  .life-os-wikilinks__link--web:hover {
    background: color-mix(in srgb, var(--t3, var(--text-secondary)) 12%, transparent);
    color: var(--t2, var(--text));
  }
</style>
