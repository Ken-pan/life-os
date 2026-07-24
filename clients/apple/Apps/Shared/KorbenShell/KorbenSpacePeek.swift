import SwiftUI
import KenosDesign

#if os(iOS)

/// Gate5C-1 Space Peek — Orb **Tap** 的落点。
///
/// 与 Space Center(Swipe Up → `openSpaceSwitcher()` 的全目录 sheet)刻意不同:
/// Peek 是**局部**的、从 Orb 原点长出来的一张卡,当前页始终有 14–18% 露在外面。
/// 这不是审美偏好 —— 它是「我只是瞄一眼 / 随手跳一下」与「我要浏览全部空间」
/// 两种意图的形态区分。此前 Tap 直接开 Space Center,两种意图落到同一个近全屏
/// 面板,Tap 因此没有自己的语义(真机 review P1-1)。
///
/// 几何按规范:宽 82–86%、高 68–74%,**贴左下**与 Orb 同列,生长锚点 = 左下角。
struct KorbenSpacePeek: View {
    @ObservedObject var model: KenosAppModel
    @ObservedObject var shellState: KorbenShellState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 规范区间取中值 —— 留出的边缘正好够看清下层页面在动。
    static let widthFraction: CGFloat = 0.84
    static let heightFraction: CGFloat = 0.71

    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    private var projection: KorbenShellProjection {
        KorbenShellProjection.make(from: model)
    }

    /// Peek 的排序即「跳转意图」的排序:置顶 → 最近 → 其余目录。
    /// 当前空间不出现在网格里(它已经在你眼前,给它一个格子只是浪费一行)。
    private var entries: [KenosAppModel.SpaceCatalogEntry] {
        let catalog = KenosAppModel.spaceCatalog
        let current = projection.shellMode == .domain ? projection.currentSpaceId : nil
        var seen = Set<String>()
        var out: [KenosAppModel.SpaceCatalogEntry] = []
        for id in model.pinnedSpaceIds + model.recentSpaceIds {
            guard id != current, !seen.contains(id) else { continue }
            guard let e = catalog.first(where: { $0.id == id }) else { continue }
            seen.insert(id)
            out.append(e)
        }
        for e in catalog where e.id != current && !seen.contains(e.id) {
            seen.insert(e.id)
            out.append(e)
        }
        return out
    }

    private func symbol(for id: String) -> String {
        KenosDomainRegistry.shelfDomainDefinitions
            .first(where: { $0.id == id })?.systemImage ?? "square.grid.2x2"
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottomLeading) {
                // 背板刻意浅(0.18):Peek 的定义是「当前页还在」,压黑就退化成 Center。
                Color.black.opacity(0.18)
                    .ignoresSafeArea()
                    .onTapGesture { shellState.showsSpacePeek = false }
                    .accessibilityLabel(prefersChinese ? "关闭空间预览" : "Close Space peek")

                card
                    .frame(
                        width: geo.size.width * Self.widthFraction,
                        height: geo.size.height * Self.heightFraction
                    )
                    // 与 Orb 同列(同一 chrome 左内边距),底边压在底部 chrome 之上。
                    .padding(.leading, KorbenShellMetrics.chromeHorizontalInset)
                    .padding(.bottom, KorbenShellMetrics.bottomObstruction(hasDomainCapsule: false))
            }
        }
        // 从 Orb 所在的左下角生长 —— anchor 是这个交互的全部意义所在。
        .transition(
            reduceMotion
                ? .opacity
                : .scale(scale: 0.24, anchor: .bottomLeading).combined(with: .opacity)
        )
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().overlay(.white.opacity(0.08))
            ScrollView {
                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                    spacing: 10
                ) {
                    ForEach(entries) { entry in
                        spaceTile(entry)
                    }
                }
                .padding(14)
            }
            Divider().overlay(.white.opacity(0.08))
            allSpacesRow
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(model.chromeAppearance.canvasColor.opacity(0.62))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(.white.opacity(0.10), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.22), radius: 22, y: 10)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("korben.spacePeek")
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text(prefersChinese ? "空间" : "Spaces")
                .font(.system(size: 17, weight: .semibold))
            Spacer(minLength: 0)
            // 当前空间只作为一枚「你在这儿」的标记出现,不占网格位。
            if projection.shellMode == .domain {
                HStack(spacing: 5) {
                    Image(systemName: symbol(for: projection.currentSpaceId))
                        .font(.system(size: 11, weight: .medium))
                    Text(currentSpaceLabel)
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundStyle(.secondary)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(.white.opacity(0.06), in: Capsule())
                .accessibilityLabel(
                    prefersChinese ? "当前空间 \(currentSpaceLabel)" : "Current Space \(currentSpaceLabel)"
                )
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private var currentSpaceLabel: String {
        let raw = KenosDomainRegistry.shelfDomainDefinitions
            .first(where: { $0.id == projection.currentSpaceId })?.label
            ?? projection.currentSpaceId
        return KenosLocalizedTitles.navigation(raw, chinese: prefersChinese)
    }

    private func spaceTile(_ entry: KenosAppModel.SpaceCatalogEntry) -> some View {
        Button {
            shellState.showsSpacePeek = false
            model.open(urlString: "kenos://domain/\(entry.id)")
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: symbol(for: entry.id))
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(.primary.opacity(0.9))
                VStack(alignment: .leading, spacing: 2) {
                    Text(KenosLocalizedTitles.navigation(entry.title, chinese: prefersChinese))
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                    // 副标题是英文一句话描述,中文界面下与卡片名混排读起来割裂,
                    // 且在两列网格里必被截断("Cash flow and decisio…")—— 中文界面
                    // 直接不显示,名字本身已经够识别。
                    if !prefersChinese {
                        Text(entry.subtitle)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
        .accessibilityLabel(KenosLocalizedTitles.navigation(entry.title, chinese: prefersChinese))
        .accessibilityHint(entry.subtitle)
        .accessibilityIdentifier("korben.spacePeek.tile.\(entry.id)")
    }

    /// Peek → Center 的升级路径:同一个手势语法里,Tap 看一眼、需要全集时再展开。
    private var allSpacesRow: some View {
        Button {
            shellState.showsSpacePeek = false
            model.openSpaceSwitcher()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "rectangle.grid.2x2")
                    .font(.system(size: 13))
                Text(prefersChinese ? "全部空间与置顶" : "All Spaces & pins")
                    .font(.system(size: 14, weight: .medium))
                Spacer(minLength: 0)
                Image(systemName: "chevron.up")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16)
            .frame(height: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("korben.spacePeek.allSpaces")
    }
}

#endif
