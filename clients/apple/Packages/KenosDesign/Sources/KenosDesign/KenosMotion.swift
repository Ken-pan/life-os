import SwiftUI

/// Continuity chrome motion — Apple HIG Motion / Animation / Reduce Motion.
///
/// Principles baked into these tokens:
/// - Motion supports meaning (selection travel, shelf hierarchy, chrome settle), not decoration
/// - System-like springs: snappy selection (~0.3–0.4s feel), low bounce, silky settle
/// - Interruptible (spring settles from current velocity when reversed)
/// - Reduce Motion → short ease / opacity-first; skip large scale travel
///
/// Web mirrors (CSS `@life-os/theme` `kenos-motion.css`):
/// `--kenos-motion-chrome/page/sheet` ≈ 360ms, `--kenos-motion-press` ≈ 220ms,
/// `--kenos-ease-chrome` ≈ cubic-bezier(0.22, 1, 0.36, 1).
public enum KenosMotion {
    /// Dock tab selection / Spaces chip — snappy, not toy-bouncy.
    public static let selectionResponse: Double = 0.36
    public static let selectionDamping: Double = 0.88

    /// Press scale feedback on dock / chrome controls.
    public static let pressResponse: Double = 0.20
    public static let pressDamping: Double = 0.86

    /// Space Shelf open — snappy drawer snap (Mail / Telegram / Slack).
    public static let shelfOpenResponse: Double = 0.34
    public static let shelfOpenDamping: Double = 0.86
    /// Space Shelf close — slightly quicker, less bounce than open.
    public static let shelfCloseResponse: Double = 0.28
    public static let shelfCloseDamping: Double = 0.92
    /// Backward-compat aliases (= open).
    public static let shelfResponse: Double = shelfOpenResponse
    public static let shelfDamping: Double = shelfOpenDamping

    /// Page chrome enter (Music-style title + glass bubble settle).
    public static let chromeResponse: Double = 0.36
    public static let chromeDamping: Double = 0.90

    /// Kenos ↔ Domain shell morph — calm depth crossfade (Linear / Music).
    public static let shellModeResponse: Double = 0.38
    public static let shellModeDamping: Double = 0.94

    /// Soft SPA hierarchical settle (in-web push / sheet content) — NOT peer dock tabs.
    /// Peer tabs (HIG): instant swap; only selection chrome uses `selection`.
    public static let pageResponse: Double = 0.36
    public static let pageDamping: Double = 0.92

    /// Launch veil / freeze uncover — short ease-out, never bouncy.
    public static let unveilDuration: Double = 0.32
    public static let unveilReduceDuration: Double = 0.12

    /// Soft SPA veil (native ink flash mask) — hierarchical hops only; peer softNavigate skips it.
    public static let softVeilInDuration: Double = 0.08
    public static let softVeilOutDuration: Double = 0.30

    public static let reduceMotionDuration: Double = 0.16
    public static let reduceMotionPressDuration: Double = 0.10

    /// Backdrop morph when shelf is open (full motion only).
    /// Slightly restrained — drawer hierarchy cue, not a zoom gimmick.
    public static let shelfBackdropScaleDelta: CGFloat = 0.055
    public static let shelfBackdropOffsetX: CGFloat = 28
    public static let shelfCornerRadius: CGFloat = 22
    public static let shelfDimOpacity: Double = 0.44
    public static let shelfDimOpacityKenos: Double = 0.32

    /// Kenos ↔ Domain depth cue (outgoing shrinks slightly; incoming settles in).
    public static let shellOutgoingScale: CGFloat = 0.978
    public static let shellIncomingScale: CGFloat = 1.0
    public static let shellHiddenScale: CGFloat = 1.018

    /// Soft SPA page settle travel (web CSS mirrors this).
    public static let pageEnterOffsetY: CGFloat = 10
    public static let pageEnterScale: CGFloat = 0.992

    public static let pressScale: CGFloat = 0.94
    public static let pressScaleReduced: CGFloat = 0.98
    public static let pressOpacity: Double = 0.88
    public static let pressOpacityReduced: Double = 0.94

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

    /// Shelf / dimmer — interruptible spring so a quick reverse doesn't finish the old ease.
    /// - Parameter closing: use the snappier close spring (best practice: dismiss faster than present).
    public static func shelf(reduceMotion: Bool, closing: Bool = false) -> Animation {
        if reduceMotion {
            return .easeOut(duration: reduceMotionDuration)
        }
        if closing {
            return .spring(response: shelfCloseResponse, dampingFraction: shelfCloseDamping)
        }
        return .spring(response: shelfOpenResponse, dampingFraction: shelfOpenDamping)
    }

    /// Live finger-follow while edge-panning / swipe-dismissing the shelf.
    public static func shelfInteractive(reduceMotion: Bool) -> Animation {
        if reduceMotion {
            return .easeOut(duration: reduceMotionPressDuration)
        }
        return .interactiveSpring(response: 0.22, dampingFraction: 0.86, blendDuration: 0.15)
    }

    /// Title / toolbar chrome settle — same family as selection.
    public static func chrome(reduceMotion: Bool) -> Animation {
        if reduceMotion {
            return .easeOut(duration: reduceMotionDuration)
        }
        return .spring(response: chromeResponse, dampingFraction: chromeDamping)
    }

    /// Dual-layer shell Mode switch (Kenos hall ↔ Domain Continuity).
    public static func shellMode(reduceMotion: Bool) -> Animation {
        if reduceMotion {
            return .easeOut(duration: reduceMotionDuration)
        }
        return .spring(response: shellModeResponse, dampingFraction: shellModeDamping)
    }

    /// Soft tab / SPA content settle.
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
        let p = shelfEasedProgress(progress)
        if reduceMotion { return 1 }
        return 1 - shelfBackdropScaleDelta * p
    }

    public static func shelfBackdropOffset(reduceMotion: Bool, progress: CGFloat) -> CGFloat {
        let p = shelfEasedProgress(progress)
        if reduceMotion { return 0 }
        return shelfBackdropOffsetX * p
    }

    /// Depth scale for a dual-layer shell surface.
    public static func shellSurfaceScale(
        reduceMotion: Bool,
        isForeground: Bool,
        isPresent: Bool
    ) -> CGFloat {
        if reduceMotion { return 1 }
        if !isPresent { return shellHiddenScale }
        return isForeground ? shellIncomingScale : shellOutgoingScale
    }

    public static func pressScale(reduceMotion: Bool, pressed: Bool) -> CGFloat {
        guard pressed else { return 1 }
        return reduceMotion ? pressScaleReduced : pressScale
    }

    public static func pressOpacity(reduceMotion: Bool, pressed: Bool) -> Double {
        guard pressed else { return 1 }
        return reduceMotion ? pressOpacityReduced : pressOpacity
    }

    /// Shelf panel — slide + subtle fade; Reduce Motion → opacity only.
    /// Prefer offset-driven chrome (`KenosSpaceShelfChrome`) for interactive pans;
    /// this transition covers boolean open/close commits.
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

    public init(reduceMotion: Bool) {
        self.reduceMotion = reduceMotion
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(
                KenosMotion.pressScale(reduceMotion: reduceMotion, pressed: configuration.isPressed)
            )
            .opacity(
                KenosMotion.pressOpacity(reduceMotion: reduceMotion, pressed: configuration.isPressed)
            )
            .animation(KenosMotion.press(reduceMotion: reduceMotion), value: configuration.isPressed)
    }
}
