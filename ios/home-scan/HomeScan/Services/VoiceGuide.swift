import Foundation
import AVFoundation

/// 扫描语音引导 —— 人在走动没法盯屏幕,走位提示念出来。
///
/// 克制规则:同一句 20s 内不重复、两句之间至少隔 6s、只念「要人动起来」
/// 的提示(跟踪异常/补拍走位),机位站位那类低优先级不念(太碎)。
/// 可在首页设置里关掉(UserDefaults,默认开)。
final class VoiceGuide {
    static let shared = VoiceGuide()

    static let enabledKey = "homescan.voiceGuide"
    static var enabled: Bool {
        UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true
    }

    private let synth = AVSpeechSynthesizer()
    private var lastText = ""
    private var lastAt: TimeInterval = 0

    func speak(_ text: String, minInterval: TimeInterval = 6) {
        guard Self.enabled else { return }
        let now = Date().timeIntervalSince1970
        if text == lastText, now - lastAt < 20 { return }
        guard now - lastAt > minInterval else { return }
        lastText = text
        lastAt = now
        synth.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
        utterance.rate = 0.52
        synth.speak(utterance)
    }
}
