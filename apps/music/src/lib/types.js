/** @typedef {{ id: string, title: string, artist: string, album: string, albumKey: string, artistKey: string, duration: number, mime: string, size: number, addedAt: number, playCount: number, liked: 0 | 1, artUrl?: string, objectUrl?: string, lyrics?: string, words: string[] }} Track */

/** @typedef {{ id: string, name: string, kind: 'user' | 'liked' | 'system', createdAt: number, updatedAt: number }} Playlist */

/** @typedef {{ playlistId: string, trackId: string, position: number, rowId?: number }} PlaylistTrackRow */

/** @typedef {{ trackId: string, playedAt: number }} RecentRow */

/** @typedef {'off' | 'one' | 'all'} RepeatMode */

export {};
