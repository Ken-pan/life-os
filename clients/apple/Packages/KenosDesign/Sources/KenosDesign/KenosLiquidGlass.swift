import SwiftUI

/// Shared Liquid Glass chrome — Kenos Mode + Domain Mode speak one language.
/// Tuned to iOS 26 system TabView / toolbar (WWDC25 Meet Liquid Glass):
/// floating capsule, concentric continuous corners, adaptive `Glass.regular`, no accent tint.
public enum KenosGlass {
    /// Kept for docs / layout math; dock uses Capsule (infinite continuous radius).
    public static let dockCornerRadius: CGFloat = 36

    /// Symmetric float inset (live accessory / sheets).
    public static let dockHorizontalInset: CGFloat = 14

    /// Split dock — Spaces flush to leading edge (docked half-capsule);
    /// destination capsule keeps a fuller trailing float.
    public static let dockLeadingInset: CGFloat = 0
    public static let dockTrailingInset: CGFloat = 14

    /// Gap above home indicator.
    public static let dockBottomInset: CGFloat = 6

    /// Icon-only dock row height (48pt hit + capsule pad) — edge-gesture clearance SSOT.
    public static let dockRowHeight: CGFloat = 56

    /// Top chrome under status bar (tools / domain title).
    public static let chromeTopInset: CGFloat = 54

    /// Inner padding of dock / tool capsules.
    public static let chromePaddingH: CGFloat = 12
    public static let chromePaddingV: CGFloat = 10

    /// Floating bottom dock — capsule (system TabView float language).
    public static var dockShape: Capsule {
        Capsule(style: .continuous)
    }

    /// Top tools + domain title — same capsule family.
    public static var chipShape: Capsule {
        Capsule(style: .continuous)
    }

    /// Selected-tab highlight — continuous capsule wrapping the **entire** selected
    /// dock cell (icon + label). Accent tint lives on the content, not on the glass fill.
    public static var selectionShape: Capsule {
        Capsule(style: .continuous)
    }
}

public extension View {
    /// Adaptive Liquid Glass — never accent-tinted.
    /// - `prominent: false` → `Glass.clear` (lighter chrome)
    /// - `prominent: true` → `Glass.regular` (system Tab Bar density — more blur / less see-through)
    @ViewBuilder
    func kenosLiquidGlass(
        in shape: some Shape = KenosGlass.dockShape,
        interactive: Bool = true,
        prominent: Bool = false
    ) -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            let base = prominent ? Glass.regular : Glass.clear
            let glass = base.interactive(interactive)
            self.glassEffect(glass, in: shape)
        } else {
            self
                .background(prominent ? .thinMaterial : .ultraThinMaterial, in: shape)
                .overlay {
                    shape.stroke(Color.white.opacity(0.14), lineWidth: 0.5)
                }
        }
    }

    /// Group multiple glass chips so they share one morphing glass surface (iOS 26).
    @ViewBuilder
    func kenosGlassContainer<Content: View>(
        spacing: CGFloat = 12,
        @ViewBuilder content: () -> Content
    ) -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            GlassEffectContainer(spacing: spacing, content: content)
        } else {
            content()
        }
    }
}
