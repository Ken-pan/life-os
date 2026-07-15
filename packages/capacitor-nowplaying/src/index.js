import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * iOS 原生壳的「正在播放」桥接（对应 ios/Sources/NowPlayingPlugin）。
 * WKWebView 里 navigator.mediaSession 接不到系统锁屏/控制中心，
 * 原生壳内改走 MPNowPlayingInfoCenter / MPRemoteCommandCenter。
 * Web / PWA 环境 isNativePlatform() 为 false，所有入口都是 no-op。
 *
 * 曲目对象为结构化约定（任何 app 的类型只要含这些字段即可）：
 * @typedef {{ id: string, title?: string, artist?: string, album?: string,
 *   duration?: number, artBlob?: Blob, artUrl?: string }} NowPlayingTrack
 */

const browser = typeof window !== 'undefined';

export function isNativeShell() {
  return browser && Capacitor.isNativePlatform();
}

/** @type {any} */
let plugin;
function nowPlaying() {
  if (plugin !== undefined) return plugin;
  plugin = isNativeShell() ? registerPlugin('NowPlaying') : null;
  return plugin;
}

/** 当前送到原生侧的状态，供 toggle / 中断恢复 / 封面补发判断 */
const nativeState = { trackId: /** @type {string | null} */ (null), playing: false };

/** @type {{ id: string | null, dataUrl: string | null }} */
let artworkCache = { id: null, dataUrl: null };

/** @param {NowPlayingTrack} track @returns {Promise<string | null>} */
async function artworkDataUrl(track) {
  if (artworkCache.id === track.id) return artworkCache.dataUrl;
  try {
    const blob = track.artBlob ?? (track.artUrl ? await (await fetch(track.artUrl)).blob() : null);
    if (!blob) return null;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(/** @type {string} */ (reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    artworkCache = { id: track.id, dataUrl };
    return dataUrl;
  } catch {
    return null;
  }
}

/** @param {NowPlayingTrack | null | undefined} track @param {boolean} playing */
export function nativeUpdateMediaSession(track, playing) {
  const np = nowPlaying();
  if (!np) return;
  if (!track) {
    nativeState.trackId = null;
    nativeState.playing = false;
    void np.clear();
    return;
  }
  nativeState.trackId = track.id;
  nativeState.playing = playing;
  const payload = {
    trackId: track.id,
    title: track.title || '',
    artist: track.artist || '',
    album: track.album || '',
    playing,
    duration: track.duration || 0,
  };
  // 元数据先上锁屏，封面转码完再补发一次
  void np.update(payload);
  void artworkDataUrl(track).then((artwork) => {
    if (!artwork || nativeState.trackId !== track.id) return;
    void np.update({ ...payload, playing: nativeState.playing, artwork });
  });
}

let lastSent = { at: 0, position: 0, rate: 1 };

/** 系统会按 rate 自行插值进度，只需低频校准 + seek 时立即修正 @param {HTMLAudioElement} audio */
export function nativeUpdatePosition(audio) {
  const np = nowPlaying();
  if (!np) return;
  const duration = audio.duration;
  const position = audio.currentTime;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;
  const rate = audio.paused ? 0 : audio.playbackRate || 1;
  const now = Date.now();
  const extrapolated = lastSent.position + (lastSent.rate * (now - lastSent.at)) / 1000;
  const drifted = Math.abs(position - extrapolated) > 2;
  if (now - lastSent.at < 4000 && !drifted && rate === lastSent.rate) return;
  lastSent = { at: now, position, rate };
  void np.updatePosition({ position, duration, rate });
}

/**
 * 绑定锁屏/控制中心/耳机线控命令与音频会话事件（来电中断、拔耳机）。
 * @param {{
 *   play: () => void,
 *   pause: () => void,
 *   next: () => void,
 *   prev: () => void,
 *   seekTo?: (time: number) => void
 * }} handlers
 */
export function bindNativeMediaHandlers(handlers) {
  const np = nowPlaying();
  if (!np) return;

  void np.addListener('command', (/** @type {any} */ event) => {
    switch (event?.name) {
      case 'play':
        handlers.play();
        break;
      case 'pause':
        handlers.pause();
        break;
      case 'toggle':
        nativeState.playing ? handlers.pause() : handlers.play();
        break;
      case 'next':
        handlers.next();
        break;
      case 'previous':
        handlers.prev();
        break;
      case 'seekTo': {
        const position = Number(event?.position);
        if (Number.isFinite(position)) handlers.seekTo?.(position);
        break;
      }
    }
  });

  // 来电/Siri 中断：暂停；中断结束且系统建议恢复：续播
  let wasPlayingBeforeInterruption = false;
  void np.addListener('interruption', (/** @type {any} */ event) => {
    if (event?.type === 'began') {
      wasPlayingBeforeInterruption = nativeState.playing;
      if (nativeState.playing) handlers.pause();
      return;
    }
    if (event?.type === 'ended' && event?.shouldResume && wasPlayingBeforeInterruption) {
      handlers.play();
    }
    wasPlayingBeforeInterruption = false;
  });

  // 拔耳机/蓝牙断开：按 iOS 惯例自动暂停
  void np.addListener('routeChange', (/** @type {any} */ event) => {
    if (event?.reason === 'deviceUnavailable' && nativeState.playing) handlers.pause();
  });
}
