<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import Icon from '$lib/components/Icon.svelte';
  import { createPlaylist, getPlaylists } from '$lib/db.js';
  import { goto } from '$app/navigation';
  import { toast } from '$lib/ui.svelte.js';
  import { setPageChrome } from '$lib/pageChrome.svelte.js';

  let playlists = $state([]);

  const userPlaylists = $derived(playlists.filter((p) => p.kind === 'user'));

  onMount(async () => {
    playlists = await getPlaylists();
  });

  async function onCreate() {
    const name = prompt(t('playlists.namePrompt'));
    if (!name?.trim()) return;
    const id = await createPlaylist(name.trim());
    toast(t('playlists.created'));
    await goto(`/playlists/${id}`);
  }

  $effect(() => {
    setPageChrome({
      action: {
        label: t('playlists.create'),
        onClick: onCreate,
        variant: 'primary',
        icon: 'plus'
      }
    });
  });
</script>

<div class="wrap">
  <a class="playlist-card" href="/liked" style="margin-bottom:12px">
    <div class="playlist-card-art"><Icon name="heart" size={22} /></div>
    <div>
      <div class="track-row-title">{t('home.liked')}</div>
      <div class="track-row-sub">红心歌曲</div>
    </div>
  </a>

  {#each userPlaylists as pl (pl.id)}
    <a class="playlist-card" href={`/playlists/${pl.id}`} style="margin-bottom:12px">
      <div class="playlist-card-art"><Icon name="list" size={22} /></div>
      <div>
        <div class="track-row-title">{pl.name}</div>
        <div class="track-row-sub">用户歌单</div>
      </div>
    </a>
  {/each}

  {#if userPlaylists.length === 0}
    <div class="empty-hint-card" aria-live="polite">
      <p>{t('playlists.emptyUserHint')}</p>
    </div>
  {/if}
</div>
