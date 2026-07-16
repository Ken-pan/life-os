import XCTest
import SwiftUI
import UIKit
@testable import HomeScan

/// 语义色的对比度必须达标 —— 用算的,不用看的。
///
/// 起因:`HS.warn` 曾经直接是 `Color.orange`,并且被拿去当正文颜色。
/// 从真机截图上采样算出来是 **1.97:1**,而 WCAG AA 的正文门槛是 4.5:1 ——
/// 连一半都不到。肉眼看「橙色字」是完全正常的,所以这种错只有量才发现得了。
///
/// 系统的鲜艳色(systemOrange 之类)是给**填充和图标**设计的:大色块、粗轮廓,
/// 那些场景下 3:1 就够。把它们当正文用就会掉进这个坑。
final class ContrastTests: XCTestCase {

    /// WCAG 相对亮度
    private func luminance(_ c: UIColor) -> CGFloat {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        func lin(_ v: CGFloat) -> CGFloat {
            v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    private func ratio(_ a: UIColor, _ b: UIColor) -> CGFloat {
        let l1 = luminance(a), l2 = luminance(b)
        let hi = max(l1, l2), lo = min(l1, l2)
        return (hi + 0.05) / (lo + 0.05)
    }

    private func resolved(_ c: Color, dark: Bool) -> UIColor {
        UIColor(c).resolvedColor(
            with: UITraitCollection(userInterfaceStyle: dark ? .dark : .light)
        )
    }

    /// 分组列表的底色 —— 警告文字实际就落在它上面
    private func groupedBG(dark: Bool) -> UIColor {
        UIColor.systemGroupedBackground.resolvedColor(
            with: UITraitCollection(userInterfaceStyle: dark ? .dark : .light)
        )
    }

    /// WCAG AA 正文门槛
    private let bodyMin: CGFloat = 4.5
    // 为什么这里**没有**图标色的对比度断言:
    //
    // 我一开始加了一条(门槛 3:1,WCAG 非文本),它当场把 systemOrange(2.07:1)和
    // systemGreen(1.99:1)判失败 —— 但那是**用错了尺子**,不是代码有问题。
    // 3:1 那条针对的是「**独自承载信息**的图形」。这个 App 里每一处彩色图标都
    // 和文字配对(warn 永远跟着一句话、good 永远跟着「已上传 X」),颜色是冗余的
    // 强化,不是唯一线索 —— 属于装饰性,WCAG 明确豁免。
    // 而且 Apple 自己就这么干:设置页的开关是 systemGreen 配白底,约 2:1。
    // 硬凑 3:1 只会把图标全逼成暗色,丢掉「一眼看见」这个它唯一的作用,
    // 还偏离平台观感。
    //
    // 真正要守的不变式是「彩色**从不单独表意**」—— 那个机器测不了,靠 code review。
    // 能机器测的是文字对比度,就在下面。

    /// 文字色:两种外观都要过 4.5
    func testTextColorsPassBodyContrast() {
        for (name, color) in [("警告", HS.warnText), ("错误", HS.dangerText)] {
            for dark in [false, true] {
                let r = ratio(resolved(color, dark: dark), groupedBG(dark: dark))
                XCTAssertGreaterThanOrEqual(
                    r, bodyMin,
                    "\(name)文字在\(dark ? "深色" : "浅色")下只有 \(String(format: "%.2f", r)):1,AA 正文要 \(bodyMin):1"
                )
            }
        }
    }

    /// 文字色必须和它的图标色**是两个值**。
    ///
    /// 这条守的是「别图省事把 warnText 写成 = warn」:那样一眼看不出问题
    /// (橙字看着挺正常),但正文对比度就掉到 2:1 了。
    func testTextColorsDifferFromGlyphColorsOnLight() {
        for (name, glyph, text) in [
            ("警告", HS.warn, HS.warnText),
            ("错误", HS.danger, HS.dangerText),
        ] {
            XCTAssertNotEqual(
                resolved(glyph, dark: false), resolved(text, dark: false),
                "\(name):浅色下文字色不该等于图标色 —— 图标色过不了正文的 4.5:1"
            )
        }
    }

    /// 反面自检:确认这套算法真的能判失败 —— 否则上面两条可能是空过的。
    /// 顺便把「为什么不能直接用 systemOrange 当正文」钉死在测试里:
    /// 哪天有人把 warnText 改回 Color.orange,上面那条会红,而这条解释为什么。
    func testPlainSystemOrangeWouldFailAsBodyTextOnLight() {
        let r = ratio(resolved(Color.orange, dark: false), groupedBG(dark: false))
        XCTAssertLessThan(
            r, bodyMin,
            "前提变了:systemOrange 浅色下现在是 \(String(format: "%.2f", r)):1 —— "
                + "如果它已经达标,warnText 这个变通就可以撤掉了"
        )
    }
}
