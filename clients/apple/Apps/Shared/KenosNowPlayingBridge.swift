#if os(iOS)
import AVFoundation
import Foundation
import MediaPlayer
import UIKit
import WebKit

/// Continuity Music → system Now Playing / lock screen / Control Center.
///
/// WKWebView does not wire `navigator.mediaSession` into MPNowPlayingInfoCenter.
/// Music posts via `kenosNative.nowPlaying.*`; remote commands return through
/// `window.__KENOS_NOW_PLAYING_HANDLERS__`.
@MainActor
enum KenosNowPlayingBridge {
    struct Snapshot: Equatable {
        var trackId: String
        var title: String
        var artist: String
        var album: String
        var playing: Bool
        var duration: Double
    }

    private(set) static var snapshot: Snapshot?
    private static var artworkCacheId: String?
    private static var artwork: MPMediaItemArtwork?
    private static var remoteCommandsReady = false
    private static var sessionObserversReady = false
    private static var sessionPrepared = false
    /// WebView that owns the HTML5 <audio> element (may differ from active domain).
    private weak static var playbackWebView: WKWebView?

    static var liveAccessoryTitle: String? {
        guard let snapshot, !snapshot.title.isEmpty else { return nil }
        return snapshot.title
    }

    static var liveAccessorySubtitle: String? {
        guard let snapshot else { return nil }
        let artist = snapshot.artist.trimmingCharacters(in: .whitespacesAndNewlines)
        if artist.isEmpty { return snapshot.playing ? "Playing" : "Paused" }
        return snapshot.playing ? artist : "\(artist) · Paused"
    }

    static var hasLiveTrack: Bool {
        snapshot != nil
    }

    static var isPlaying: Bool {
        snapshot?.playing == true
    }

    /// Keep Continuity Music media alive while the Domain surface is opacity-hidden.
    static func shouldKeepMediaAlive(for url: URL?) -> Bool {
        guard hasLiveTrack else { return false }
        return KenosDomainRegistry.domainId(fromContinuity: url) == "music"
    }

    /// Call once at launch so HTML5 audio can keep routing after backgrounding.
    static func prepareAudioSession() {
        ensureRemoteCommands()
        ensureSessionObservers()
        if sessionPrepared {
            try? AVAudioSession.sharedInstance().setActive(true)
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
            sessionPrepared = true
            KenosLog.info("audio session ready", category: .bridge, metadata: [
                "category": "playback",
            ])
        } catch {
            KenosLog.warning("audio session setup failed", category: .bridge, metadata: [
                "error": error.localizedDescription,
            ])
        }
    }

    static func update(params: [String: Any]) {
        let trackId = string(params["trackId"])
        let title = string(params["title"])
        // Ignore empty payloads (bridge race / tear-down) so we don't clobber a live session.
        guard !trackId.isEmpty || !title.isEmpty else { return }

        prepareAudioSession()
        if let active = KenosDomainWebBridge.activeWebView {
            playbackWebView = active
        }
        let playing = bool(params["playing"])
        let artist = string(params["artist"])
        let album = string(params["album"])
        let duration = double(params["duration"])
        let artworkData = string(params["artwork"])

        if playing {
            try? AVAudioSession.sharedInstance().setActive(true)
        }

        let previousId = snapshot?.trackId
        let trackChanged = trackId != previousId
        let next = Snapshot(
            trackId: trackId,
            title: title,
            artist: artist,
            album: album,
            playing: playing,
            duration: duration
        )
        let metadataChanged = snapshot != next
        snapshot = next
        KenosCrashContextStore.noteNowPlaying(trackId: trackId, title: title, playing: playing)

        let center = MPNowPlayingInfoCenter.default()
        var info = center.nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyTitle] = title
        info[MPMediaItemPropertyArtist] = artist
        info[MPMediaItemPropertyAlbumTitle] = album
        info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0
        if duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if trackChanged {
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0.0
        }

        var artworkChanged = false
        if !artworkData.isEmpty,
           artworkData.count <= maxArtworkBase64Chars,
           trackId != artworkCacheId
        {
            artwork = decodeArtwork(artworkData)
            artworkCacheId = trackId
            artworkChanged = true
        } else if trackChanged, artworkData.isEmpty {
            artwork = nil
            artworkCacheId = nil
            artworkChanged = true
        } else if !artworkData.isEmpty, artworkData.count > maxArtworkBase64Chars {
            KenosLog.warning(
                "now playing artwork skipped — oversize",
                category: .bridge,
                metadata: ["chars": String(artworkData.count)]
            )
        }
        info[MPMediaItemPropertyArtwork] = artwork
        center.nowPlayingInfo = info

        guard metadataChanged || artworkChanged else { return }
        KenosLog.debug("now playing update", category: .bridge, metadata: [
            "title": String(title.prefix(48)),
            "playing": playing ? "1" : "0",
        ])
        NotificationCenter.default.post(name: .kenosNowPlayingDidChange, object: nil)
    }

    static func updatePosition(params: [String: Any]) {
        let position = double(params["position"])
        let duration = double(params["duration"])
        let rate = double(params["rate"], fallback: 1)
        let center = MPNowPlayingInfoCenter.default()
        var info = center.nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position
        info[MPNowPlayingInfoPropertyPlaybackRate] = rate
        if duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        center.nowPlayingInfo = info
    }

    static func clear() {
        guard snapshot != nil || MPNowPlayingInfoCenter.default().nowPlayingInfo != nil else {
            playbackWebView = nil
            return
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        snapshot = nil
        artwork = nil
        artworkCacheId = nil
        playbackWebView = nil
        KenosCrashContextStore.clearNowPlaying()
        NotificationCenter.default.post(name: .kenosNowPlayingDidChange, object: nil)
    }

    /// Clear when the Continuity surface that owned `<audio>` is torn down.
    static func clearIfOwned(by webView: WKWebView) {
        // Only clear when the owning Continuity surface is torn down — never
        // because a music URL is still live (that incorrectly wiped playback).
        if playbackWebView === webView {
            clear()
        }
    }

    // MARK: - Remote commands

    private static func ensureRemoteCommands() {
        guard !remoteCommandsReady else { return }
        remoteCommandsReady = true
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { _ in
            emitCommand("play") ? .success : .commandFailed
        }
        center.pauseCommand.addTarget { _ in
            emitCommand("pause") ? .success : .commandFailed
        }
        center.togglePlayPauseCommand.addTarget { _ in
            emitCommand("toggle") ? .success : .commandFailed
        }
        center.nextTrackCommand.addTarget { _ in
            emitCommand("next") ? .success : .commandFailed
        }
        center.previousTrackCommand.addTarget { _ in
            emitCommand("previous") ? .success : .commandFailed
        }
        center.changePlaybackPositionCommand.addTarget { event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            return emitCommand("seekTo", position: event.positionTime) ? .success : .commandFailed
        }
    }

    private static func ensureSessionObservers() {
        guard !sessionObserversReady else { return }
        sessionObserversReady = true
        let nc = NotificationCenter.default
        nc.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { note in
            let typeRaw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let optionsRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            Task { @MainActor in
                handleInterruption(typeRaw: typeRaw, optionsRaw: optionsRaw)
            }
        }
        nc.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { note in
            let reasonRaw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            Task { @MainActor in
                handleRouteChange(reasonRaw: reasonRaw)
            }
        }
    }

    private static func handleInterruption(typeRaw: UInt?, optionsRaw: UInt) {
        guard let typeRaw,
              let type = AVAudioSession.InterruptionType(rawValue: typeRaw)
        else { return }
        switch type {
        case .began:
            emitCommand("interruptBegan")
        case .ended:
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: optionsRaw).contains(.shouldResume)
            try? AVAudioSession.sharedInstance().setActive(true)
            if shouldResume {
                emitCommand("interruptEndedResume")
            } else {
                emitCommand("interruptEnded")
            }
        @unknown default:
            break
        }
    }

    private static func handleRouteChange(reasonRaw: UInt?) {
        guard let reasonRaw,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonRaw)
        else { return }
        if reason == .oldDeviceUnavailable {
            emitCommand("routeDeviceUnavailable")
        }
    }

    @discardableResult
    private static func emitCommand(_ name: String, position: Double? = nil) -> Bool {
        KenosLog.info("now playing remote", category: .bridge, metadata: ["command": name])
        // Prefer the Music Continuity surface even if another domain is active.
        guard let webView = playbackWebView ?? KenosDomainWebBridge.activeWebView else {
            return false
        }
        var payload = "{\"name\":\"\(name)\""
        if let position, position.isFinite {
            payload += ",\"position\":\(position)"
        }
        payload += "}"
        let js = """
        try {
          var h = window.__KENOS_NOW_PLAYING_HANDLERS__;
          if (h && typeof h.handle === 'function') h.handle(\(payload));
        } catch (e) {}
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
        return true
    }

    // MARK: - Helpers

    /// Cap Continuity artwork payloads — oversized base64 has killed WKWebView.
    private static let maxArtworkBase64Chars = 240_000

    private static func decodeArtwork(_ dataUrlOrBase64: String) -> MPMediaItemArtwork? {
        guard dataUrlOrBase64.count <= maxArtworkBase64Chars else { return nil }
        let base64 = dataUrlOrBase64.contains(",")
            ? String(dataUrlOrBase64.split(separator: ",", maxSplits: 1)[1])
            : dataUrlOrBase64
        guard base64.count <= maxArtworkBase64Chars,
              let data = Data(base64Encoded: String(base64)),
              data.count <= 180_000,
              let image = UIImage(data: data),
              image.size.width > 1,
              image.size.height > 1
        else { return nil }
        guard let cgImage = cgImageBacking(for: image) else { return nil }
        // MediaPlayer invokes the request handler on `*/accessQueue`. A closure
        // formed inside this @MainActor type is MainActor-isolated and traps
        // with EXC_BREAKPOINT / SIGTRAP when the system pushes Now Playing
        // (Music Continuity crash fingerprint 75109b108116574b).
        return makeArtwork(
            cgImage: cgImage,
            scale: image.scale,
            orientation: image.imageOrientation,
            size: image.size
        )
    }

    /// Resolve a CGImage even when UIImage is CIImage-backed.
    private static func cgImageBacking(for image: UIImage) -> CGImage? {
        if let cg = image.cgImage { return cg }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        let rendered = UIGraphicsImageRenderer(size: image.size, format: format).image { _ in
            image.draw(at: .zero)
        }
        return rendered.cgImage
    }

    nonisolated private static func makeArtwork(
        cgImage: CGImage,
        scale: CGFloat,
        orientation: UIImage.Orientation,
        size: CGSize
    ) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: size) { _ in
            UIImage(cgImage: cgImage, scale: scale, orientation: orientation)
        }
    }

    #if DEBUG
    /// Test hook — exercises the same off-main request-handler path that crashed.
    static func testingMakeArtwork(fromBase64 dataUrlOrBase64: String) -> MPMediaItemArtwork? {
        decodeArtwork(dataUrlOrBase64)
    }
    #endif

    private static func string(_ value: Any?) -> String {
        guard let value else { return "" }
        if let s = value as? String { return s }
        return String(describing: value)
    }

    private static func bool(_ value: Any?) -> Bool {
        if let b = value as? Bool { return b }
        if let n = value as? NSNumber { return n.boolValue }
        if let s = value as? String {
            return s == "1" || s.lowercased() == "true"
        }
        return false
    }

    private static func double(_ value: Any?, fallback: Double = 0) -> Double {
        if let d = value as? Double { return d }
        if let n = value as? NSNumber { return n.doubleValue }
        if let s = value as? String, let d = Double(s) { return d }
        return fallback
    }
}

extension Notification.Name {
    static let kenosNowPlayingDidChange = Notification.Name("kenosNowPlayingDidChange")
}
#endif
