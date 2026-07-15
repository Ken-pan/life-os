import Foundation
import Capacitor
import MediaPlayer
import AVFoundation
import os.log

/**
 * 锁屏 / 控制中心 / 灵动岛「正在播放」桥接。
 * WKWebView 里 navigator.mediaSession 不会接入系统 Now Playing，
 * 所以由 JS 侧（src/lib/mediaSession.js）在原生壳内改走本插件。
 */
@objc(NowPlayingPlugin)
public class NowPlayingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NowPlayingPlugin"
    public let jsName = "NowPlaying"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updatePosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private static let logger = OSLog(subsystem: "os.lifeos.music", category: "NowPlaying")

    private var currentTrackId: String?
    private var artworkCacheId: String?
    private var artwork: MPMediaItemArtwork?

    override public func load() {
        setupRemoteCommands()
        observeAudioSession()
        os_log("NowPlayingPlugin loaded", log: Self.logger, type: .info)
    }

    // MARK: - JS API

    @objc func update(_ call: CAPPluginCall) {
        let trackId = call.getString("trackId") ?? ""
        let playing = call.getBool("playing") ?? false
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let album = call.getString("album") ?? ""
        let duration = call.getDouble("duration") ?? 0
        let artworkData = call.getString("artwork")

        DispatchQueue.main.async { [weak self] in
            guard let self else { return call.resolve() }

            if playing {
                try? AVAudioSession.sharedInstance().setActive(true)
            }

            let center = MPNowPlayingInfoCenter.default()
            var info = center.nowPlayingInfo ?? [:]
            let trackChanged = trackId != self.currentTrackId
            self.currentTrackId = trackId

            info[MPMediaItemPropertyTitle] = title
            info[MPMediaItemPropertyArtist] = artist
            info[MPMediaItemPropertyAlbumTitle] = album
            info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0
            if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
            if trackChanged { info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0.0 }

            if let artworkData, trackId != self.artworkCacheId {
                self.artwork = Self.decodeArtwork(artworkData)
                self.artworkCacheId = trackId
            }
            if trackChanged && artworkData == nil {
                // 新曲目没带封面：清掉上一首的，避免张冠李戴
                self.artwork = nil
                self.artworkCacheId = nil
            }
            info[MPMediaItemPropertyArtwork] = self.artwork

            center.nowPlayingInfo = info
            os_log("NowPlaying update: %{public}@ — %{public}@ (playing=%{public}d)",
                   log: Self.logger, type: .info, artist, title, playing ? 1 : 0)
            call.resolve()
        }
    }

    @objc func updatePosition(_ call: CAPPluginCall) {
        let position = call.getDouble("position") ?? 0
        let duration = call.getDouble("duration")
        let rate = call.getDouble("rate") ?? 1.0

        DispatchQueue.main.async {
            let center = MPNowPlayingInfoCenter.default()
            var info = center.nowPlayingInfo ?? [:]
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position
            info[MPNowPlayingInfoPropertyPlaybackRate] = rate
            if let duration, duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
            center.nowPlayingInfo = info
            call.resolve()
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            self?.currentTrackId = nil
            self?.artworkCacheId = nil
            self?.artwork = nil
            call.resolve()
        }
    }

    // MARK: - Remote commands（锁屏/控制中心/耳机线控 → JS）

    private func setupRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            self?.emitCommand("play"); return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.emitCommand("pause"); return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.emitCommand("toggle"); return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            self?.emitCommand("next"); return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            self?.emitCommand("previous"); return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.notifyListeners("command", data: ["name": "seekTo", "position": event.positionTime])
            return .success
        }
    }

    private func emitCommand(_ name: String) {
        os_log("Remote command: %{public}@", log: Self.logger, type: .info, name)
        notifyListeners("command", data: ["name": name])
    }

    // MARK: - 中断（来电/Siri）与输出路由（拔耳机）

    private func observeAudioSession() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(onInterruption(_:)),
                       name: AVAudioSession.interruptionNotification, object: nil)
        nc.addObserver(self, selector: #selector(onRouteChange(_:)),
                       name: AVAudioSession.routeChangeNotification, object: nil)
    }

    @objc private func onInterruption(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            notifyListeners("interruption", data: ["type": "began"])
        case .ended:
            let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: optionsRaw).contains(.shouldResume)
            try? AVAudioSession.sharedInstance().setActive(true)
            notifyListeners("interruption", data: ["type": "ended", "shouldResume": shouldResume])
        @unknown default:
            break
        }
    }

    @objc private func onRouteChange(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
        // 耳机拔出/蓝牙断开：按 iOS 惯例自动暂停
        if reason == .oldDeviceUnavailable {
            notifyListeners("routeChange", data: ["reason": "deviceUnavailable"])
        }
    }

    // MARK: - Artwork

    private static func decodeArtwork(_ dataUrlOrBase64: String) -> MPMediaItemArtwork? {
        let base64 = dataUrlOrBase64.contains(",")
            ? String(dataUrlOrBase64.split(separator: ",", maxSplits: 1)[1])
            : dataUrlOrBase64
        guard let data = Data(base64Encoded: base64), let image = UIImage(data: data) else { return nil }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }
}
