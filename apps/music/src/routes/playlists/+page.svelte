<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import Icon from '$lib/components/Icon.svelte';
  import { createPlaylist, getPlaylists } from '$lib/db.js';
  import { goto } from '$app/navigation';
  import { toast } from '$lib/ui.svelte.js';

  let playlists = $state([]);

  onMount(async () => {
    playlists = await getPlaylists();
  });

  async function onCreate() {
    const name = prompt('歌单名称');
    if (!name?.trim()) return;
    const id = await createPlaylist(name.trim());
    toast('已创建歌单');
    await goto(`/playlists/${id}`);
  }
</script>

<div class="wrap">
  <div class="page-toolbar">
    <button class="btn-primary" type="button" onclick={onCreate}>
      <Icon name="plus" size={16} /> {t('playlists.create')}
    </button>
  </div>

  <a class="playlist-card" href="/liked" style="margin-bottom:12px">
    <div class="playlist-card-art"><Icon name="heart" size={22} /></div>
    <div>
      <div class="track-row-title">{t('home.liked')}</div>
      <div class="track-row-sub">红心歌曲</div>
    </div>
  </a>

  {#each playlists.filter((p) => p.kind === 'user') as pl (pl.id)}
    <a class="playlist-card" href={`/playlists/${pl.id}`} style="margin-bottom:12px">
      <div class="playlist-card-art"><Icon name="list" size={22} /></div>
      <div>
        <div class="track-row-title">{pl.name}</div>
        <div class="track-row-sub">用户歌单</div>
      </div>
    </a>
  {:else}
    <p class="empty-state">{t('playlists.empty')}</p>
  {/each}
</div>
