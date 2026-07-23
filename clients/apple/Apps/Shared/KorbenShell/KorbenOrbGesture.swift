import SwiftUI
import KenosDesign

#if os(iOS)

/// P3 Orb 手势判定 — 纯函数状态机(可单测),参数按规范:
/// Tap:按下 <250ms 且位移 <8pt;Hold:280ms 触发;方向锁定:>18pt,±25°;
/// Drag Right:72pt 预览 / 132pt 展开。
enum KorbenOrbGestureResolver {
    enum Phase: Equatable {
        case idle
        /// 按下未定性(计时中)
        case pressing(start: Date)
        /// Hold 触发,Fan 展开(可拖选目标)
        case fan
        /// 方向锁定为纵向上滑
        case swipeUp
        /// 方向锁定为向右拖
        case dragRight
    }

    static let tapMaxDuration: TimeInterval = 0.25
    static let tapMaxMovement: CGFloat = 8
    static let holdDuration: TimeInterval = 0.28
    static let directionLockDistance: CGFloat = 18
    static let assistPreviewDistance: CGFloat = 72
    static let assistCommitDistance: CGFloat = 132

    /// 位移超过锁定阈值后判方向;±25° 容差。
    static func lockedDirection(translation: CGSize) -> Phase? {
        let dx = translation.width
        let dy = translation.height
        let dist = sqrt(dx * dx + dy * dy)
        guard dist >= directionLockDistance else { return nil }
        let angle = atan2(-dy, dx) * 180 / .pi // 上=90°,右=0°
        if abs(angle - 90) <= 25 { return .swipeUp }
        if abs(angle) <= 25 { return .dragRight }
        return nil
    }

    /// Fan 目标命中(targets 为屏幕坐标圆心,半径 hitRadius)。
    static func fanTargetIndex(
        at point: CGPoint,
        targets: [CGPoint],
        hitRadius: CGFloat = 34
    ) -> Int? {
        var best: (index: Int, distance: CGFloat)?
        for (i, c) in targets.enumerated() {
            let d = hypot(point.x - c.x, point.y - c.y)
            if d <= hitRadius, d < (best?.distance ?? .infinity) {
                best = (i, d)
            }
        }
        return best?.index
    }
}

extension KorbenOrbGestureResolver {
    /// Fan 目标圆心(以 Orb 圆心为原点的弧线展开;间距 > 12pt)。
    static func fanCenters(orbCenter: CGPoint, count: Int) -> [CGPoint] {
        let radius: CGFloat = 96
        let angles: [CGFloat] = [95, 62, 30, 2] // 度;上 → 右弧线
        return (0..<min(count, 4)).map { i in
            let a = angles[i] * .pi / 180
            return CGPoint(
                x: orbCenter.x + radius * cos(a),
                y: orbCenter.y - radius * sin(a)
            )
        }
    }
}

/// Recent Fan 的展示目标(≤4,来自 recentSpaceIds ∩ spaceCatalog)。
struct KorbenFanTarget: Identifiable, Equatable {
    let id: String
    let title: String

    @MainActor
    static func recents(model: KenosAppModel) -> [KorbenFanTarget] {
        let catalog = KenosAppModel.spaceCatalog
        var seen = Set<String>()
        var out: [KorbenFanTarget] = []
        for id in model.recentSpaceIds where !seen.contains(id) {
            guard let entry = catalog.first(where: { $0.id == id }) else { continue }
            seen.insert(id)
            out.append(.init(id: entry.id, title: entry.title))
            if out.count == 4 { break }
        }
        // 冷启动无 recent:给目录前 4 个,Fan 永远可用。
        if out.isEmpty {
            out = catalog.prefix(4).map { .init(id: $0.id, title: $0.title) }
        }
        return out
    }
}

/// Recent Fan overlay — 目标圆(56pt)+ 名称;悬停目标 1.08x。
struct KorbenOrbFanOverlay: View {
    @ObservedObject var shellState: KorbenShellState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let centers = KorbenOrbGestureResolver.fanCenters(
            orbCenter: shellState.orbCenter,
            count: shellState.orbFanTargets.count
        )
        ZStack {
            ForEach(Array(shellState.orbFanTargets.enumerated()), id: \.element.id) { i, target in
                // 守卫:centers 只有 min(count,4) 个,越界即崩溃。
                if centers.indices.contains(i) {
                let highlighted = shellState.orbFanHighlight == i
                VStack(spacing: 4) {
                    ZStack {
                        Circle().fill(.ultraThinMaterial)
                        Circle().strokeBorder(
                            highlighted ? Color.white.opacity(0.5) : .white.opacity(0.12),
                            lineWidth: highlighted ? 1.5 : 0.5
                        )
                        Text(String(target.title.prefix(1)))
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.primary.opacity(0.9))
                    }
                    .frame(width: 56, height: 56)
                    Text(target.title)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.primary.opacity(highlighted ? 0.95 : 0.7))
                        .lineLimit(1)
                }
                .scaleEffect(highlighted && !reduceMotion ? 1.08 : 1.0)
                .animation(.easeOut(duration: 0.12), value: highlighted)
                .position(x: centers[i].x, y: centers[i].y)
                }
            }
        }
        .accessibilityHidden(true) // VO 走 Orb 的 accessibilityActions
    }
}

/// Drag Right 预览气泡 —— ≥72pt 出现,≥132pt 变提交态。
struct KorbenAssistPreviewBubble: View {
    let committed: Bool
    let orbCenter: CGPoint

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "sparkle")
                .font(.system(size: 13, weight: .medium))
            Text(committed ? "松手进入 Ask" : "Korben")
                .font(.system(size: 13, weight: .medium))
        }
        .foregroundStyle(.primary.opacity(0.92))
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(
            committed ? Color.white.opacity(0.45) : .white.opacity(0.1),
            lineWidth: committed ? 1.2 : 0.5
        ))
        .position(x: orbCenter.x + 116, y: orbCenter.y - 58)
        .accessibilityHidden(true)
    }
}

#endif
