import SwiftUI

/// Shared Liquid Glass chrome — Kenos Mode + Domain Mode speak one language.
/// Tuned to iOS 26 system TabView / toolbar (WWDC25 Meet Liquid Glass):
/// floating capsule, concentric continuous corners, adaptive `Glass.regular`, no accent tint.
public enum KenosGlass {
    /// Kept for docs / layout math; dock uses Capsule (infinite continuous radius).
    public static let dockCornerRadius: CGFloat = 36

    /// Symmetric float inset (live accessory / sheets).
    public static let dockHorizontalInset: CGFloat = 14

    /// Floating dock insets — Orb + capsule share the same screen margins.
    public static let dockLeadingInset: CGFloat = 14
    public static let dockTrailingInset: CGFloat = 14

    /// Gap above home indicator.
    public static let dockBottomInset: CGFloat = 6

    /// Icon-only dock row height (48pt hit + capsule pad) — edge-gesture clearance SSOT.
    public static let dockRowHeight: CGFloat = 56

    /// Breathing room between the last scroll content and the top of the floating dock.
    /// Content may pass *behind* glass while scrolling; at rest the end must clear the dock.
    public static let dockContentClearance: CGFloat = 16

    /// Scroll-end pad above the home indicator (dock row + float + clearance).
    /// CSS pairs this with `env(safe-area-inset-bottom)` — do not include the home indicator here.
    public static var dockScrollEndPadPx: Int {
        Int(dockRowHeight + dockBottomInset + dockContentClearance)
    }

    /// Spaces Orb diameter (circle Liquid Glass control).
    public static let spacesOrbSize: CGFloat = 48

    /// Gap between Spaces Orb and destination capsule.
    public static let orbCapsuleGap: CGFloat = 8

    /// Outer pad inside the destination glass capsule.
    public static let capsuleOuterPadding: CGFloat = 4

    /// Destination icon hit target (HIG ≥44).
    public static let destinationHitSize: CGFloat = 48

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
    /// dock cell. Accent tint lives on the plate, not a hard black fill.
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
                    // Semantic stroke — adapts to light/dark (no hard-coded white).
                    shape.stroke(Color.primary.opacity(0.12), lineWidth: 0.5)
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
