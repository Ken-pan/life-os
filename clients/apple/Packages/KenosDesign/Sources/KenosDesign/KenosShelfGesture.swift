import CoreGraphics
import Foundation

/// Space Shelf drawer gesture math — SSOT for Kenos + Domain shells.
///
/// Feels like iOS Mail / Telegram / Slack:
/// - 1:1 finger tracking up to panel width
/// - light rubber-band past the open stop
/// - commit by distance **or** flick velocity
/// - Reduce Motion callers skip live offsets and only use open/close springs
///
/// Edge-open zoning (Apple HIG + Navigation v2):
/// - **Back beats Shelf** on mid/upper leading edge (WKWebView back-forward)
/// - Shelf edge-pull only in a **dock-adjacent** band so it stays optional, not global
/// - Visible Spaces tip remains the primary affordance; edge band must not steal its taps
public enum KenosShelfGesture {
    /// Visible drawer width (must match `KenosSpaceShelfView` frame).
    public static let panelWidth: CGFloat = 288

    /// Leading hit strip over WKWebView / scroll content.
    /// ~Apple edge width; narrow enough to avoid vertical-scroll steal.
    public static let edgeStripWidth: CGFloat = 28

    /// Ideal reach zone above the floating dock (HIG ≥44; thumb-friendly).
    public static let edgeOpenReachIdeal: CGFloat = 72

    /// Floor / cap for the reach zone (landscape / short height).
    public static let edgeOpenReachMin: CGFloat = 44
    public static let edgeOpenReachMax: CGFloat = 88

    /// Max fraction of container height claimed by the reach zone (excl. dock clearance).
    public static let edgeOpenReachMaxFraction: CGFloat = 0.18

    /// Translation that maps to progress 1.0 (1:1 with panel).
    public static let trackingDistance: CGFloat = panelWidth

    // MARK: Open (edge → shelf)

    /// Minimum horizontal travel to commit open without a flick.
    public static let openDistance: CGFloat = 52
    /// Points/sec flick that commits open even with short travel.
    public static let openVelocity: CGFloat = 280
    /// Predicted end travel that also commits (finger lifts early).
    public static let openPredicted: CGFloat = 96

    // MARK: Close (shelf → content)

    public static let closeDistance: CGFloat = 64
    public static let closeVelocity: CGFloat = 320
    public static let closePredicted: CGFloat = 120

    /// How far past full-open the rubber band still yields (visual overshoot).
    public static let rubberBandLimit: CGFloat = 36

    // MARK: Edge-open geometry

    /// Bottom chrome reserved for home indicator + dock (tip stays tappable).
    public static func edgeOpenBottomClearance(
        safeAreaBottom: CGFloat,
        dockBottomInset: CGFloat = KenosGlass.dockBottomInset,
        dockRowHeight: CGFloat = KenosGlass.dockRowHeight,
        additionalBottomChrome: CGFloat = 0
    ) -> CGFloat {
        max(0, safeAreaBottom)
            + max(0, dockBottomInset)
            + max(0, dockRowHeight)
            + max(0, additionalBottomChrome)
    }

    /// Reach-band height above dock clearance, capped for short / landscape containers.
    public static func edgeOpenReachHeight(
        containerHeight: CGFloat,
        clearance: CGFloat
    ) -> CGFloat {
        let available = max(0, containerHeight - clearance)
        let fractionCap = available * edgeOpenReachMaxFraction
        let capped = min(edgeOpenReachIdeal, edgeOpenReachMax, max(edgeOpenReachMin, fractionCap))
        // Never taller than leftover space above the dock chrome.
        return min(capped, available)
    }

    /// True when a touch in container coordinates may start a Shelf edge-open.
    public static func isInEdgeOpenZone(
        point: CGPoint,
        containerSize: CGSize,
        safeAreaBottom: CGFloat,
        dockBottomInset: CGFloat = KenosGlass.dockBottomInset,
        dockRowHeight: CGFloat = KenosGlass.dockRowHeight,
        additionalBottomChrome: CGFloat = 0
    ) -> Bool {
        guard containerSize.width > 0, containerSize.height > 0 else { return false }
        guard point.x >= 0, point.x <= edgeStripWidth else { return false }
        guard point.y >= 0, point.y <= containerSize.height else { return false }

        let clearance = edgeOpenBottomClearance(
            safeAreaBottom: safeAreaBottom,
            dockBottomInset: dockBottomInset,
            dockRowHeight: dockRowHeight,
            additionalBottomChrome: additionalBottomChrome
        )
        let reach = edgeOpenReachHeight(
            containerHeight: containerSize.height,
            clearance: clearance
        )
        guard reach >= edgeOpenReachMin * 0.5 else { return false }

        let bandBottom = containerSize.height - clearance
        let bandTop = bandBottom - reach
        return point.y >= bandTop && point.y <= bandBottom
    }

    // MARK: Progress / commit

    /// Progress (0…1+) from an opening edge-pan translation.
    public static func openProgress(translationX: CGFloat) -> CGFloat {
        let clamped = max(0, translationX)
        if clamped <= trackingDistance {
            return min(1, clamped / trackingDistance)
        }
        let overshoot = clamped - trackingDistance
        let banded = rubberBand(overshoot, limit: rubberBandLimit)
        return 1 + banded / trackingDistance
    }

    /// Finger-follow X offset for the content backdrop while opening (subtle parallax).
    public static func backdropParallax(translationX: CGFloat, reduceMotion: Bool) -> CGFloat {
        guard !reduceMotion else { return 0 }
        return max(0, translationX) * 0.12
    }

    /// Progress (0…1) while the open shelf is being dragged closed (`dismissOffset` ≤ 0).
    public static func dismissProgress(dismissOffsetX: CGFloat) -> CGFloat {
        let pulled = max(0, -dismissOffsetX)
        return max(0, min(1, 1 - pulled / panelWidth))
    }

    /// Rubber-band a positive overshoot toward `limit` (Apple scroll feel).
    public static func rubberBand(_ offset: CGFloat, limit: CGFloat) -> CGFloat {
        guard offset > 0, limit > 0 else { return max(0, offset) }
        // Classic UIScrollView-style: d * (1 - 1/(x/d + 1)) — asymptotes to `limit`.
        return limit * (1 - 1 / ((offset / limit) + 1))
    }

    /// Cap opening translation used for live preview (includes soft overshoot).
    public static func cappedOpenTranslation(_ translationX: CGFloat) -> CGFloat {
        let x = max(0, translationX)
        if x <= trackingDistance { return x }
        return trackingDistance + rubberBand(x - trackingDistance, limit: rubberBandLimit)
    }

    /// Cap dismiss drag so the panel can't be pushed past the leading edge.
    public static func cappedDismissOffset(_ translationX: CGFloat) -> CGFloat {
        min(0, max(translationX, -panelWidth))
    }

    public static func shouldCommitOpen(
        translationX: CGFloat,
        velocityX: CGFloat,
        predictedTranslationX: CGFloat? = nil
    ) -> Bool {
        let predicted = predictedTranslationX ?? (translationX + velocityX * 0.18)
        return translationX > openDistance
            || velocityX > openVelocity
            || predicted > openPredicted
    }

    public static func shouldCommitClose(
        translationX: CGFloat,
        velocityX: CGFloat,
        predictedTranslationX: CGFloat? = nil
    ) -> Bool {
        // translationX is typically negative while closing.
        let predicted = predictedTranslationX ?? (translationX + velocityX * 0.18)
        return translationX < -closeDistance
            || velocityX < -closeVelocity
            || predicted < -closePredicted
    }

    /// True when live open progress crosses the commit distance (for soft haptic).
    public static func crossedOpenThreshold(
        previousTranslation: CGFloat,
        currentTranslation: CGFloat
    ) -> Bool {
        previousTranslation < openDistance && currentTranslation >= openDistance
    }

    public static func crossedCloseThreshold(
        previousOffset: CGFloat,
        currentOffset: CGFloat
    ) -> Bool {
        previousOffset > -closeDistance && currentOffset <= -closeDistance
    }
}
