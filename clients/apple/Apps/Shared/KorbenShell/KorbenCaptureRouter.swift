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
        // 「买」单字太弱:「买跑鞋」是一件待办,不是一笔账,却会被判进财务
        // (真机实拍)。要求**已发生**的记账语气(买了/花了/付了)或明确的
        // 财务名词,把未来动作留给通用草稿。
        ("买了|花了|付了|支出|预算|账单|报销|spent|budget|bill|expense", "money"),
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
                // 中文文案里不留「Capture」这种内部术语(真机实拍:
                // 「将保存为 Capture 草稿」半中半英)。
                return chinese
                    ? "识别到「\(hint)」相关 · 保存为草稿"
                    : "Related to \(hint) — saved as capture draft"
            }
            return chinese
                ? "将保存为草稿,稍后在收件箱整理"
                : "Saves as a capture draft — triage later in Inbox"
        }
    }
}

/// P4B ActionReceipt — 每次写入的本地回执(Undo 凭据)。
///
/// 承载**一批** draft:Canvas 会把多行拆成多条草稿一次性入队,撤销必须是
/// 整批的 —— 只撤一半会留下用户从没打算保留的残条。单条 capture 就是
/// 批量大小为 1 的特例,两条路径共用同一套回执与 Undo,不分叉。
struct KorbenActionReceipt: Identifiable, Equatable {
    let id = UUID()
    let draftIds: [UUID]
    let idempotencyKeys: [String]
    /// Undo 恢复用的原始输入(失败/撤销都不丢 Draft)。
    let text: String
    let createdAt = Date()

    var itemCount: Int { draftIds.count }
}

extension KenosAppModel {
    /// P4B 提交:分类 hint 附着草稿 → 幂等入队 → 返回回执(10s Undo 窗口)。
    ///
    /// `splitLines`(Canvas 档)会把每一行拆成独立草稿,各自带自己的 hint。
    /// 部分失败按**全批回滚**处理:已入队的撤掉、文本原样回填 —— 半批成功
    /// 是最难收拾的状态(用户不知道哪几条进去了,重试必然重复)。
    @discardableResult
    func korbenSubmitCapture(splitLines: Bool = false) -> KorbenActionReceipt? {
        let text = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        let payloads: [(text: String, hint: String?)] = splitLines
            ? KorbenCanvasComposition.parse(text).map { ($0.text, $0.routing.targetHint) }
            : [(text, KorbenCaptureRouter.classify(text).targetHint)]
        guard !payloads.isEmpty else { return nil }

        captureText = ""
        var draftIds: [UUID] = []
        var keys: [String] = []
        for payload in payloads {
            let draft = KenosCaptureFactory.makeDraft(
                text: payload.text,
                sourceContext: "ios_korben_quick_capture",
                targetHint: payload.hint
            )
            let key = "capture-\(draft.id.uuidString)"
            do {
                try queue.enqueueR1Draft(
                    actionType: "capture.review",
                    safeSummary: "Review capture draft",
                    idempotencyKey: key,
                    correlationId: draft.correlationId
                )
            } catch {
                // 全批回滚:撤掉已入队的,文本回填让用户重试。lastCapture 也回滚 ——
                // 否则它指向一条从未入队的 draft,别处会当「最近已保存」误显。
                for k in keys {
                    if let a = queue.actions.first(where: { $0.idempotencyKey == k }) {
                        try? queue.cancel(a.id)
                    }
                }
                captureText = text
                lastCapture = nil
                return nil
            }
            lastCapture = draft
            draftIds.append(draft.id)
            keys.append(key)
        }
        return KorbenActionReceipt(draftIds: draftIds, idempotencyKeys: keys, text: text)
    }

    /// P4B Undo:仅当队列项仍 pending(未派发)才撤销 + 恢复输入文本。
    /// 已派发的动作 cancel 无效 —— 此时不回填/不重开,避免用户以为已撤销
    /// 又重新「创建」造成重复 capture。
    /// - Returns: true 表示确实撤销;false 表示已派发无法撤销。
    @discardableResult
    func korbenUndoCapture(_ receipt: KorbenActionReceipt) -> Bool {
        let actions = receipt.idempotencyKeys.compactMap { key in
            queue.actions.first { $0.idempotencyKey == key }
        }
        let cancellable = actions.filter {
            $0.status == .pending || $0.status == .retry || $0.status == .failed
        }
        // 批量语义:只要**有任何一条**已派发,就不算撤销成功 —— 否则会回填
        // 输入框,用户以为全撤了、重新创建一次,已派发那条就重复了。
        guard !cancellable.isEmpty, cancellable.count == actions.count,
              actions.count == receipt.idempotencyKeys.count
        else { return false }
        for a in cancellable { try? queue.cancel(a.id) }
        if let last = lastCapture?.id, receipt.draftIds.contains(last) { lastCapture = nil }
        captureText = receipt.text
        return true
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
            Text(
                receipt.itemCount > 1
                    ? (prefersChinese
                        ? "已保存 \(receipt.itemCount) 条草稿"
                        : "\(receipt.itemCount) drafts saved")
                    : (prefersChinese ? "已保存草稿" : "Draft saved")
            )
                .font(.system(size: 13, weight: .medium))
            Button(prefersChinese ? "撤销" : "Undo") {
                let undone = model.korbenUndoCapture(receipt)
                shellState.undoReceipt = nil
                // 仅真正撤销(仍 pending)才重开输入;已派发则保持现状。
                if undone {
                    shellState.quickCaptureDetent = KorbenQuickCaptureSheet.captureDetent
                    shellState.showsQuickCapture = true
                }
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
