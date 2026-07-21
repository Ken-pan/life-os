import SwiftUI

/// Continuity chrome motion — Apple HIG Motion / Animation / Reduce Motion.
///
/// Three families only (avoid animation soup):
/// - **Micro** — press / icon feedback (`0.18s`)
/// - **Selection** — dock pill / Orb morph (`0.28 / 0.88`)
/// - **Spatial** — Shelf + Mode transitions (`0.32 / 0.90`, close faster)
///
/// Reduce Motion → short ease / opacity-first; skip parallax, z-scale, elastic bounce.
///
/// Web mirrors (CSS `@life-os/theme` `kenos-motion.css`):
/// `--kenos-motion-chrome/page/sheet` ≈ 320ms, `--kenos-motion-press` ≈ 180ms,
/// `--kenos-ease-chrome` ≈ cubic-bezier(0.22, 1, 0.36, 1).
public enum KenosMotion {
    // MARK: - Micro

    public static let pressResponse: Double = 0.18
    public static let pressDamping: Double = 0.86
    public static let microDuration: Double = 0.18

    // MARK: - Selection

    public static let selectionResponse: Double = 0.28
    public static let selectionDamping: Double = 0.88

    // MARK: - Spatial

    public static let spatialResponse: Double = 0.32
    public static let spatialDamping: Double = 0.90
    public static let shelfOpenResponse: Double = spatialResponse
    public static let shelfOpenDamping: Double = spatialDamping
    public static let shelfCloseResponse: Double = 0.24
    public static let shelfCloseDamping: Double = 0.92
    /// Backward-compat aliases (= open / spatial).
    public static let shelfResponse: Double = shelfOpenResponse
    public static let shelfDamping: Double = shelfOpenDamping
    public static let chromeResponse: Double = selectionResponse
    public static let chromeDamping: Double = selectionDamping
    public static let shellModeResponse: Double = spatialResponse
    public static let shellModeDamping: Double = spatialDamping
    public static let pageResponse: Double = spatialResponse
    public static let pageDamping: Double = 0.92

    /// Launch veil / freeze uncover — short ease-out, never bouncy.
    public static let unveilDuration: Double = 0.28
    public static let unveilReduceDuration: Double = 0.12

    /// Soft SPA veil (native ink flash mask) — hierarchical hops only; peer softNavigate skips it.
    public static let softVeilInDuration: Double = 0.08
    public static let softVeilOutDuration: Double = 0.28

    public static let reduceMotionDuration: Double = 0.16
    public static let reduceMotionPressDuration: Double = 0.10

    /// Backdrop morph when shelf is open (full motion only).
    /// Gentle retreat (~0.97) — navigation drawer, not App Switcher / Stage Manager.
    public static let shelfBackdropScaleDelta: CGFloat = 0.03
    public static let shelfBackdropOffsetX: CGFloat = 20
    public static let shelfCornerRadius: CGFloat = 22
    /// Base Shelf dim — prefer `adaptiveShelfDimOpacity` at call sites.
    /// Paired with an opaque Shelf surface (scheme A): medium veil, not a heavy blackout.
    public static let shelfDimOpacity: Double = 0.30
    public static let shelfDimOpacityKenos: Double = 0.30

    /// Content-adaptive dim: light canvases need slightly more veil; dark need less.
    /// Reduce Transparency raises the floor so the drawer still reads as modal.
    public static func adaptiveShelfDimOpacity(
        colorScheme: ColorScheme,
        reduceTransparency: Bool
    ) -> Double {
        var value = shelfDimOpacity
        switch colorScheme {
        case .light: value += 0.02
        case .dark: value -= 0.02
        @unknown default: break
        }
        if reduceTransparency { value += 0.08 }
        return min(0.48, max(0.26, value))
    }

    /// Kenos ↔ Domain depth cue — Reduce Motion disables entirely via `shellSurfaceScale`.
    public static let shellOutgoingScale: CGFloat = 0.978
    public static let shellIncomingScale: CGFloat = 1.0

    /// Soft SPA page settle travel (web CSS mirrors this).
    public static let pageEnterOffsetY: CGFloat = 8
    public static let pageEnterScale: CGFloat = 0.994

    public static let pressScale: CGFloat = 0.97
    public static let pressScaleReduced: CGFloat = 0.99
    public static let orbPressScale: CGFloat = 0.98
    public static let orbPressScaleReduced: CGFloat = 0.99
    public static let pressOpacity: Double = 0.92
    public static let pressOpacityReduced: Double = 0.96

    // MARK: - Animations

    public static func selection(reduceMotion: Bool) -> Animation {
        if reduceMotion {
            return .easeOut(duration: reduceMotionDuration)
        }
        return .spring(response: selectionResponse, dampingFraction: selectionDamping)
    }

    public static func press(reduceMotion: Bool) -> Animation {
        if reduceMotion {
            return .easeOut(duration: reduceMotionPressDuration)
        }
        return .spring(response: pressResponse, dampingFraction: pressDamping)
    }

    /// Micro family alias (same as press).
    public static func micro(reduceMotion: Bool) -> Animation {
        press(reduceMotion: reduceMotion)
    }

    /// Spatial family — Shelf open / Mode morph / hierarchical page settle.
    public static func spatial(reduceMotion: Bool, closing: Bool = false) -> Animation {
        if reduceMotion {
            return .easeOut(duration: reduceMotionDuration)
        }
        if closing {
            return .spring(response: shelfCloseResponse, dampingFraction: shelfCloseDamping)
        }
        return .spring(response: spatialResponse, dampingFraction: spatialDamping)
    }

    /// Shelf / dimmer — interruptible spring so a quick reverse doesn't finish the old ease.
    public static func shelf(reduceMotion: Bool, closing: Bool = false) -> Animation {
        spatial(reduceMotion: reduceMotion, closing: closing)
    }

    /// Cancel / settle after an interrupted shelf drag (not for live finger-follow).
    /// Live open/dismiss uses `animation(nil)` + progress binding; this spring snaps back.
    public static func shelfInteractive(reduceMotion: Bool) -> Animation {
        if reduceMotion {
            return .easeOut(duration: reduceMotionPressDuration)
        }
        return .interactiveSpring(response: 0.22, dampingFraction: 0.86, blendDuration: 0.15)
    }

    /// Title / toolbar chrome settle — Selection family.
    public static func chrome(reduceMotion: Bool) -> Animation {
        selection(reduceMotion: reduceMotion)
    }

    /// Dual-layer shell Mode switch — Spatial family.
    public static func shellMode(reduceMotion: Bool) -> Animation {
        spatial(reduceMotion: reduceMotion)
    }

    /// Soft SPA hierarchical settle — uses `pageDamping` (slightly snappier than shelf open).
    public static func page(reduceMotion: Bool) -> Animation {
        if reduceMotion {
            return .easeOut(duration: reduceMotionDuration)
        }
        return .spring(response: pageResponse, dampingFraction: pageDamping)
    }

    /// Launch veil dismiss / freeze-frame uncover.
    public static func unveil(reduceMotion: Bool) -> Animation {
        .easeOut(duration: reduceMotion ? unveilReduceDuration : unveilDuration)
    }

    /// Ease-out curve for drag→backdrop mapping (settles more as progress nears 1).
    public static func shelfEasedProgress(_ raw: CGFloat) -> CGFloat {
        let p = min(1, max(0, raw))
        return 1 - pow(1 - p, 2.15)
    }

    public static func shelfBackdropScale(reduceMotion: Bool, progress: CGFloat) -> CGFloat {
        if reduceMotion { return 1 }
        let p = shelfEasedProgress(progress)
        return 1 - shelfBackdropScaleDelta * p
    }

    public static func shelfBackdropOffset(reduceMotion: Bool, progress: CGFloat) -> CGFloat {
        if reduceMotion { return 0 }
        let p = shelfEasedProgress(progress)
        return shelfBackdropOffsetX * p
    }

    /// Depth scale for a dual-layer shell surface.
    public static func shellSurfaceScale(
        reduceMotion: Bool,
        isForeground: Bool
    ) -> CGFloat {
        if reduceMotion { return 1 }
        return isForeground ? shellIncomingScale : shellOutgoingScale
    }

    public static func pressScale(reduceMotion: Bool, pressed: Bool) -> CGFloat {
        guard pressed else { return 1 }
        return reduceMotion ? pressScaleReduced : pressScale
    }

    /// Spaces Orb press — subtler than destination cells; respects Reduce Motion.
    public static func orbPressScale(reduceMotion: Bool, pressed: Bool) -> CGFloat {
        guard pressed else { return 1 }
        return reduceMotion ? orbPressScaleReduced : orbPressScale
    }

    public static func pressOpacity(reduceMotion: Bool, pressed: Bool) -> Double {
        guard pressed else { return 1 }
        return reduceMotion ? pressOpacityReduced : pressOpacity
    }

    /// Shelf panel — slide + subtle fade; Reduce Motion → opacity only.
    public static func shelfPanelTransition(reduceMotion: Bool) -> AnyTransition {
        if reduceMotion { return .opacity }
        return .asymmetric(
            insertion: .move(edge: .leading).combined(with: .opacity),
            removal: .move(edge: .leading)
                .combined(with: .opacity)
        )
    }

    /// Soft page settle used by overlays / native chrome.
    public static func pageSettleTransition(reduceMotion: Bool) -> AnyTransition {
        if reduceMotion { return .opacity }
        return .asymmetric(
            insertion: .opacity
                .combined(with: .offset(y: pageEnterOffsetY))
                .combined(with: .scale(scale: pageEnterScale)),
            removal: .opacity
        )
    }
}

/// Light press scale for nav-adjacent chrome (shelf close, live accessory, cards).
public struct KenosPressStyle: ButtonStyle {
    public var reduceMotion: Bool
    /// Override idle→pressed scale (e.g. Spaces Orb uses a subtler dip).
    public var pressedScale: CGFloat?

    nonisolated public init(reduceMotion: Bool, pressedScale: CGFloat? = nil) {
        self.reduceMotion = reduceMotion
        self.pressedScale = pressedScale
    }

    public func makeBody(configuration: Configuration) -> some View {
        let scale: CGFloat = {
            guard configuration.isPressed else { return 1 }
            if let pressedScale {
                // Custom idle→pressed dip still softens under Reduce Motion.
                if reduceMotion {
                    return min(1, pressedScale + (1 - pressedScale) * 0.5)
                }
                return pressedScale
            }
            return KenosMotion.pressScale(reduceMotion: reduceMotion, pressed: true)
        }()
        return configuration.label
            .scaleEffect(scale)
            .opacity(
                KenosMotion.pressOpacity(reduceMotion: reduceMotion, pressed: configuration.isPressed)
            )
            .animation(KenosMotion.press(reduceMotion: reduceMotion), value: configuration.isPressed)
    }
}
