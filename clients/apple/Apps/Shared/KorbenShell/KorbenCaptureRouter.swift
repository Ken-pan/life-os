import Foundation
import KenosActions
import KenosClient

#if os(iOS)

/// P4B Capture Router — 本地启发式意图识别(纯函数,可单测)。
///
/// 诚实边界:识别只产生 **提示(targetHint)与预览文案**,执行永远走
/// `capture.review` L1 草稿队列 —— 原生端不直写任何 Domain 数据
/// (planner_tasks 等契约必须与 web 同形,见治理账本),因此不存在
/// 「静默写错 Domain」。真正的跨域执行在 Assist/Agent(P5+)接管。
enum KorbenCaptureRouter {
    enum Intent: Equatable {
        /// 默认:普通 capture 草稿(L1,可逆)
        case captureDraft
        /// 识别到时间语义 → 计划任务候选(仍存草稿,收件箱确认)
        case planTaskCandidate
    }

    struct Routing: Equatable {
        let intent: Intent
        /// 附着到 CaptureDraft.targetHint 的域提示(nil = 无倾向)
        let targetHint: String?
        /// 风险级别 — P4B 全部 L1(执行 + Undo)
        let riskLabel = "L1"
    }

    /// 时间语义(zh/en 常用式)→ 计划任务候选。
    private static let timePatterns: [String] = [
        "明天", "后天", "今晚", "今天.*点", "周[一二三四五六日]",
        "\\d{1,2}[点:.]\\d{0,2}",
        "tomorrow", "tonight", "next week", "at \\d{1,2}",
    ]

    /// 域关键词 → targetHint(保守:一个都不确定就不给)。
    private static let domainHints: [(pattern: String, hint: String)] = [
        ("训练|健身|深蹲|卧推|workout|gym", "training"),
        ("买|花了|支出|预算|账单|spent|budget|bill", "money"),
        ("笔记|资料|文档|note|research", "library"),
        ("听|歌|playlist|music", "music"),
    ]

    static func classify(_ raw: String) -> Routing {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return Routing(intent: .captureDraft, targetHint: nil) }
        let lower = text.lowercased()

        let hasTime = timePatterns.contains {
            lower.range(of: $0, options: .regularExpression) != nil
        }
        var hint: String?
        for (pattern, h) in domainHints
        where lower.range(of: pattern, options: .regularExpression) != nil {
            // 命中多个域 → 有歧义,放弃 hint(宁可无倾向,不可错倾向)。
            if hint != nil { hint = nil; break }
            hint = h
        }
        if hasTime, hint == nil { hint = "plan" }
        return Routing(
            intent: hasTime ? .planTaskCandidate : .captureDraft,
            targetHint: hint
        )
    }

    /// 识别行文案(诚实口径:候选 ≠ 已写入)。
    static func summary(for routing: Routing, chinese: Bool) -> String {
        switch routing.intent {
        case .planTaskCandidate:
            return chinese
                ? "识别为:计划任务候选 · 保存为草稿,收件箱确认后入计划"
                : "Looks like a plan task — saved as draft, confirm in Inbox"
        case .captureDraft:
            if let hint = routing.targetHint {
                return chinese
                    ? "识别到「\(hint)」相关 · 保存为 Capture 草稿"
                    : "Related to \(hint) — saved as capture draft"
            }
            return chinese
                ? "将保存为 Capture 草稿,稍后在收件箱整理"
                : "Saves as a capture draft — triage later in Inbox"
        }
    }
}

/// P4B ActionReceipt — 每次写入的本地回执(Undo 凭据)。
struct KorbenActionReceipt: Identifiable, Equatable {
    let id = UUID()
    let draftId: UUID
    let idempotencyKey: String
    /// Undo 恢复用的原始输入(失败/撤销都不丢 Draft)。
    let text: String
    let createdAt = Date()
}

extension KenosAppModel {
    /// P4B 提交:分类 hint 附着草稿 → 幂等入队 → 返回回执(10s Undo 窗口)。
    @discardableResult
    func korbenSubmitCapture() -> KorbenActionReceipt? {
        let text = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let routing = KorbenCaptureRouter.classify(text)
        let draft = KenosCaptureFactory.makeDraft(
            text: text,
            sourceContext: "ios_korben_quick_capture",
            targetHint: routing.targetHint
        )
        lastCapture = draft
        captureText = ""
        let key = "capture-\(draft.id.uuidString)"
        do {
            try queue.enqueueR1Draft(
                actionType: "capture.review",
                safeSummary: "Review capture draft",
                idempotencyKey: key,
                correlationId: draft.correlationId
            )
        } catch {
            // 失败不丢 Draft:文本回填,让用户重试。
            captureText = text
            return nil
        }
        return KorbenActionReceipt(draftId: draft.id, idempotencyKey: key, text: text)
    }

    /// P4B Undo:撤销队列项(pending 才可撤)+ 恢复输入文本。
    func korbenUndoCapture(_ receipt: KorbenActionReceipt) {
        if let action = queue.actions.first(where: { $0.idempotencyKey == receipt.idempotencyKey }) {
            try? queue.cancel(action.id)
        }
        if lastCapture?.id == receipt.draftId { lastCapture = nil }
        captureText = receipt.text
    }
}

import SwiftUI

/// P4B Undo pill — 「已保存草稿 · 撤销」,10 秒自动消失。
struct KorbenUndoPill: View {
    let receipt: KorbenActionReceipt
    @ObservedObject var model: KenosAppModel
    @ObservedObject var shellState: KorbenShellState

    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 15))
                .foregroundStyle(Color(red: 0.33, green: 0.84, blue: 0.55))
            Text(prefersChinese ? "已保存草稿" : "Draft saved")
                .font(.system(size: 13, weight: .medium))
            Button(prefersChinese ? "撤销" : "Undo") {
                model.korbenUndoCapture(receipt)
                shellState.undoReceipt = nil
                // 撤销后重开输入,文本已回填。
                shellState.quickCaptureDetent = KorbenQuickCaptureSheet.captureDetent
                shellState.showsQuickCapture = true
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Color(red: 0.357, green: 0.549, blue: 1.0))
            .accessibilityIdentifier("korben.undo")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
        .task(id: receipt.id) {
            try? await Task.sleep(nanoseconds: 10_000_000_000)
            if shellState.undoReceipt?.id == receipt.id {
                shellState.undoReceipt = nil
            }
        }
        .accessibilityIdentifier("korben.undoPill")
    }
}

#endif
