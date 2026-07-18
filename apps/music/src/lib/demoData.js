// 本地演示数据 —— 仅 localhost 空库时灌入（见 demoMode.js）。
// 一批华语流行曲目，横跨 6 位歌手 / 6 张专辑，覆盖：最近添加、热门播放、
// 喜欢、最近播放、用户歌单。无音频 blob —— 专辑封面由 trackArt 的确定性渐变兜底。

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

/**
 * 原始曲目定义（下面用 slugKey/trackWords 补全派生字段）。
 * @type {{ id: string, title: string, artist: string, album: string, duration: number, playCount: number, liked?: 1 }[]}
 */
const RAW = [
  // 周杰伦 —— 叶惠美（热门歌手，高播放）
  { id: 'demo-jay-01', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, playCount: 42, liked: 1 },
  { id: 'demo-jay-02', title: '东风破', artist: '周杰伦', album: '叶惠美', duration: 315, playCount: 28 },
  { id: 'demo-jay-03', title: '以父之名', artist: '周杰伦', album: '叶惠美', duration: 341, playCount: 12, liked: 1 },
  { id: 'demo-jay-04', title: '你听得到', artist: '周杰伦', album: '叶惠美', duration: 244, playCount: 7 },
  { id: 'demo-jay-05', title: '三年二班', artist: '周杰伦', album: '叶惠美', duration: 232, playCount: 3 },

  // 林俊杰 —— 曹操
  { id: 'demo-jj-01', title: '江南', artist: '林俊杰', album: '曹操', duration: 269, playCount: 33, liked: 1 },
  { id: 'demo-jj-02', title: '曹操', artist: '林俊杰', album: '曹操', duration: 210, playCount: 15 },
  { id: 'demo-jj-03', title: '一千年以后', artist: '林俊杰', album: '曹操', duration: 254, playCount: 9 },
  { id: 'demo-jj-04', title: '醉赤壁', artist: '林俊杰', album: '曹操', duration: 238, playCount: 2 },

  // 邓紫棋 —— 新的心跳
  { id: 'demo-gem-01', title: '光年之外', artist: '邓紫棋', album: '新的心跳', duration: 235, playCount: 21, liked: 1 },
  { id: 'demo-gem-02', title: '泡沫', artist: '邓紫棋', album: '新的心跳', duration: 265, playCount: 18 },
  { id: 'demo-gem-03', title: '喜欢你', artist: '邓紫棋', album: '新的心跳', duration: 232, playCount: 6 },
  { id: 'demo-gem-04', title: '后会无期', artist: '邓紫棋', album: '新的心跳', duration: 248, playCount: 1 },

  // 五月天 —— 第二人生
  { id: 'demo-may-01', title: '突然好想你', artist: '五月天', album: '第二人生', duration: 300, playCount: 25, liked: 1 },
  { id: 'demo-may-02', title: '诺亚方舟', artist: '五月天', album: '第二人生', duration: 322, playCount: 8 },
  { id: 'demo-may-03', title: '干杯', artist: '五月天', album: '第二人生', duration: 358, playCount: 11 },
  { id: 'demo-may-04', title: 'OAOA', artist: '五月天', album: '第二人生', duration: 224, playCount: 0 },

  // 陈奕迅 —— 十年
  { id: 'demo-eason-01', title: '十年', artist: '陈奕迅', album: '十年', duration: 205, playCount: 19, liked: 1 },
  { id: 'demo-eason-02', title: '好久不见', artist: '陈奕迅', album: '十年', duration: 231, playCount: 14 },
  { id: 'demo-eason-03', title: '浮夸', artist: '陈奕迅', album: '十年', duration: 285, playCount: 5 },
  { id: 'demo-eason-04', title: '稳稳的幸福', artist: '陈奕迅', album: '十年', duration: 258, playCount: 0 },

  // 李荣浩 —— 模特
  { id: 'demo-lrh-01', title: '模特', artist: '李荣浩', album: '模特', duration: 262, playCount: 10 },
  { id: 'demo-lrh-02', title: '李白', artist: '李荣浩', album: '模特', duration: 219, playCount: 16 },
  { id: 'demo-lrh-03', title: '老街', artist: '李荣浩', album: '模特', duration: 274, playCount: 4 },
  { id: 'demo-lrh-04', title: '不将就', artist: '李荣浩', album: '模特', duration: 246, playCount: 0 },
]

/** 用户歌单：{ id, name } + 成员 trackId 列表（按序即 position）。 */
const PLAYLISTS = [
  {
    id: 'demo-pl-mandarin',
    name: '华语必听',
    trackIds: [
      'demo-jay-01',
      'demo-jj-01',
      'demo-gem-01',
      'demo-may-01',
      'demo-eason-01',
      'demo-lrh-02',
    ],
  },
  {
    id: 'demo-pl-latenight',
    name: '深夜循环',
    trackIds: ['demo-jay-03', 'demo-eason-03', 'demo-gem-02', 'demo-lrh-03'],
  },
  {
    id: 'demo-pl-drive',
    name: '开车单曲',
    trackIds: ['demo-may-03', 'demo-jj-02', 'demo-jay-02', 'demo-may-01'],
  },
]

/** 最近播放：trackId + 距今的小时数（越小越新）。 */
const RECENT = [
  'demo-jay-01',
  'demo-gem-01',
  'demo-jj-01',
  'demo-may-01',
  'demo-eason-01',
  'demo-lrh-02',
  'demo-jay-02',
  'demo-gem-02',
]

/**
 * 灌入 demo 音乐库。只应在 localhost 且 tracks 为空时调用。
 * @param {import('dexie').Dexie} db
 * @param {{ slugKey: (s: string) => string, trackWords: (t: any) => string[] }} helpers
 */
export async function seedDemoLibrary(db, { slugKey, trackWords }) {
  const now = Date.now()

  const tracks = RAW.map((t, i) => {
    const base = {
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumKey: slugKey(t.album),
      artistKey: slugKey(t.artist),
      duration: t.duration,
      mime: 'audio/mpeg',
      size: 0,
      addedAt: now - i * DAY, // 错峰添加时间，「最近添加」有序
      playCount: t.playCount,
      liked: /** @type {0 | 1} */ (t.liked ? 1 : 0),
    }
    return { ...base, words: trackWords(base) }
  })

  await db.tracks.bulkPut(tracks)

  // 用户歌单 + 成员行
  const playlistRows = PLAYLISTS.map((p, i) => ({
    id: p.id,
    name: p.name,
    kind: 'user',
    createdAt: now - (i + 1) * DAY,
    updatedAt: now - i * HOUR,
  }))
  await db.playlists.bulkPut(playlistRows)

  const membership = PLAYLISTS.flatMap((p) =>
    p.trackIds.map((trackId, position) => ({
      playlistId: p.id,
      trackId,
      position,
    })),
  )
  await db.playlistTracks.bulkPut(membership)

  // 最近播放（越靠前越新）
  const recentRows = RECENT.map((trackId, i) => ({
    trackId,
    playedAt: now - i * HOUR,
  }))
  await db.recent.bulkPut(recentRows)
}
