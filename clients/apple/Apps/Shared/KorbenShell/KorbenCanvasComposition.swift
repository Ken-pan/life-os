import Foundation

#if os(iOS)

/// P1-3 Canvas 能力层 —— 把一段脑内倾倒**拆成多条各自定向的草稿**。
///
/// 这是 Canvas 与 Quick Capture 的实质区别。此前 Canvas 只是同一个输入框拉高
/// 到 95%(真机 review：「仍只是大号 Capture」)——多出来的高度没有换来任何
/// 新能力。人在 Canvas 里写的本来就是清单式的东西:
///
///     修复登录跳转
///     - 明天下午跟 Ken 过一遍预算
///     买跑鞋
///
/// 一次性存成一条 blob 草稿,等于把拆分工作推给未来的自己。这里按行拆开,
/// 每条各自过一遍 `KorbenCaptureRouter`(所以「明天…预算」那条会带上自己的
/// 时间语义与域倾向,而不是被整段的噪音淹掉)。
///
/// 纪律不变:拆分只影响**草稿的条数与 hint**,执行仍是 L1 `capture.review`
/// 队列,原生端不直写任何 Domain 数据。拆错了在收件箱合并即可,不会写坏东西。
enum KorbenCanvasComposition {
    /// 一条待创建项。
    struct Item: Identifiable, Equatable {
        let id: Int
        let text: String
        let routing: KorbenCaptureRouter.Routing
    }

    /// 上限:防止误粘一整篇文档时炸出上百条草稿。超出的部分**并入最后一条**,
    /// 而不是静默丢掉 —— 用户写下的东西一个字都不能凭空消失。
    static let maxItems = 20

    /// 行首的清单符号:人手写清单时几乎必带,留在正文里只是噪音。
    /// 注意不吃掉 `- ` 之外的连字符(如「跨-应用同步」),故要求符号后有空白。
    private static let bulletPrefixes = ["- ", "* ", "• ", "– ", "· "]

    static func normalize(line raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespaces)
        for p in bulletPrefixes where s.hasPrefix(p) {
            s = String(s.dropFirst(p.count)).trimmingCharacters(in: .whitespaces)
            break
        }
        // 有序清单:`1. ` / `1) `。同样要求后随空白,避免吃掉「2026. 计划」这种年份。
        if let m = s.range(of: "^\\d{1,2}[.)]\\s+", options: .regularExpression) {
            s = String(s[m.upperBound...]).trimmingCharacters(in: .whitespaces)
        }
        return s
    }

    /// 拆分。单行输入返回一条 —— Canvas 与 Capture 在"只写了一句"时行为完全一致,
    /// 不制造两种心智模型。
    static func parse(_ raw: String) -> [Item] {
        let lines = raw
            .components(separatedBy: .newlines)
            .map(normalize(line:))
            .filter { !$0.isEmpty }
        guard !lines.isEmpty else { return [] }

        var kept = Array(lines.prefix(maxItems))
        if lines.count > maxItems {
            // 溢出并入最后一条:宁可最后一条变长,也不静默吞掉用户写的内容。
            let overflow = lines.dropFirst(maxItems).joined(separator: "\n")
            kept[kept.count - 1] += "\n" + overflow
        }
        return kept.enumerated().map { i, text in
            Item(id: i, text: text, routing: KorbenCaptureRouter.classify(text))
        }
    }

    /// 底部摘要:说清楚将要创建几条、其中几条带定向 —— 创建前就能核对,
    /// 而不是创建后才在收件箱发现分错了。
    static func summary(items: [Item], chinese: Bool) -> String {
        guard !items.isEmpty else {
            return chinese ? "每行会成为一条草稿" : "Each line becomes one draft"
        }
        let routed = items.filter { $0.routing.targetHint != nil }.count
        if items.count == 1 {
            return chinese ? "将创建 1 条草稿" : "Creates 1 draft"
        }
        if routed == 0 {
            return chinese ? "将创建 \(items.count) 条草稿" : "Creates \(items.count) drafts"
        }
        return chinese
            ? "将创建 \(items.count) 条草稿 · 其中 \(routed) 条已识别去向"
            : "Creates \(items.count) drafts · \(routed) with a target"
    }
}

#endif
