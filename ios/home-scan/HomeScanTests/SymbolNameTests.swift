import XCTest
import UIKit
@testable import HomeScan

/// SF Symbol 名字必须真实存在。
///
/// 为什么值得单开一个测试:名字写错了 **SwiftUI 什么都不说** —— 不报错、不崩、
/// 不 log,就是渲染出一片空白。一个本该指路的箭头变成空气,而代码看着完全正常。
/// 这类错只能靠"去问系统"来抓,没有别的办法。
///
/// 清单靠 grep 维护:
///   grep -rhoE '(systemImage|systemName): *"[^"]+"' HomeScan/Views HomeScan/Services \
///     | sed -E 's/.*"([^"]+)"/\1/' | sort -u
/// 加了新符号就把它加进来 —— 这个测试的价值全在"清单是全的"。
final class SymbolNameTests: XCTestCase {

    /// 全 App 用到的 SF Symbol(2026-07 grep 所得)
    static let used = [
        "archivebox",
        "arrow.clockwise",
        "arrow.counterclockwise",
        "arrow.left.arrow.right",
        "arrow.up.circle.fill",
        "arrow.uturn.backward",
        "camera",
        "camera.badge.ellipsis",
        "camera.fill",
        "camera.metering.matrix",
        "camera.viewfinder",
        "checkmark",
        "checkmark.circle.fill",
        "checkmark.seal",
        "chevron.right",
        "cube.transparent",
        "exclamationmark.octagon.fill",
        "exclamationmark.triangle",
        "exclamationmark.triangle.fill",
        "figure.walk",
        "gearshape.2.fill",
        "hand.point.up.left",
        "icloud.and.arrow.up",
        "location.magnifyingglass",
        "location.north.fill",
        "location.slash.fill",
        "pencil",
        "person.circle",
        "plus.circle",
        "plus.viewfinder",
        "questionmark.circle",
        "scope",
        "shippingbox",
        "speaker.wave.2",
        "square.split.bottomrightquarter",
        "stop.circle",
        "thermometer.sun.fill",
        "trash",
        "tray.and.arrow.up.fill",
        "viewfinder",
        "wand.and.stars",
        "wifi.exclamationmark",
        "xmark",
        "xmark.circle.fill",
    ]

    func testAllSymbolsExist() {
        for name in Self.used {
            XCTAssertNotNil(
                UIImage(systemName: name),
                "SF Symbol「\(name)」不存在 —— 它会静默渲染成空白,没人会发现"
            )
        }
    }

    /// 反面自检:确认这个测试真的在测东西。
    /// 没有这条的话,万一 UIImage(systemName:) 因为某种原因永远返回非 nil,
    /// 上面那 40 多个断言就是在空过 —— 而我们会以为符号都验过了。
    func testBogusSymbolIsRejected() {
        XCTAssertNil(
            UIImage(systemName: "definitely.not.a.real.symbol.zzz"),
            "编不出来的名字必须返回 nil,否则上面的断言全是空过的"
        )
    }

    /// HintKind 的图标是运行时按 case 取的,grep 不一定扫得到 —— 单独锁一遍
    func testHintKindIconsExist() {
        for kind in [
            ScanSessionController.HintKind.tracking,
            .evidence,
            .viewpoint,
        ] {
            XCTAssertNotNil(
                UIImage(systemName: kind.icon),
                "HintKind.\(kind) 的图标「\(kind.icon)」不存在"
            )
        }
    }
}
