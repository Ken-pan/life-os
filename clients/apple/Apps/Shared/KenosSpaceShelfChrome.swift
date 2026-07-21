import SwiftUI
import KenosDesign

#if os(iOS)

/// Shared interactive Space Shelf chrome — open preview + committed drawer + dimmer.
///
/// Used by Kenos Mode (`KenosShellWithSpaceShelf`) and Domain Mode (`KenosDomainModeShell`)
/// so edge-pan / dismiss feel identical (Telegram / iOS Mail drawer).
///
/// Parent owns `progress` so backdrop scale/offset stay locked to the panel.
/// **Single spring owner:** this chrome animates `progress` on `showSpaceShelf` changes;
/// hosts call `openSpaceShelf` / `dismissSpaceShelf` without wrapping `withAnimation`.
struct KenosSpaceShelfChrome: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    /// Peak dim override — `nil` uses content-adaptive base from `KenosMotion`.
    var dimOpacity: Double? = nil
    /// Live edge-pan translation while opening (0 when idle / committed).
    @Binding var openDragX: CGFloat
    /// Live dismiss offset on the open panel (≤ 0).
    @Binding var dismissDragX: CGFloat
    /// Settled + interactive reveal (0…1+). Drives panel, dimmer, and parent backdrop.
    @Binding var progress: CGFloat

    /// Rising-edge haptic ticks — never reset with drag offsets (avoids double buzz).
    @State private var openHapticTick = 0
    @State private var closeHapticTick = 0

    private var openAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: false)
    }

    private var closeAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: true)
    }

    private var resolvedDimOpacity: Double {
        dimOpacity
            ?? KenosMotion.adaptiveShelfDimOpacity(
                colorScheme: colorScheme,
                reduceTransparency: reduceTransparency
            )
    }

    var body: some View {
        GeometryReader { geo in
            let panelWidth = KenosShelfGesture.preferredPanelWidth(containerWidth: geo.size.width)
            ZStack(alignment: .leading) {
                if progress > 0.02 {
                    dimmer(panelWidth: panelWidth)
                        .zIndex(2)
                    KenosSpaceShelfView(
                        model: model,
                        dismissDragX: model.showSpaceShelf ? $dismissDragX : .constant(0),
                        panelWidth: panelWidth
                    )
                    .frame(width: panelWidth)
                    .offset(x: panelOffsetX(panelWidth: panelWidth))
                    .opacity(panelOpacity)
                    // Trailing separation — quiet depth (0.10–0.14 light), not a grey slab.
                    .shadow(
                        color: Color.black.opacity(
                            (colorScheme == .light ? 0.12 : 0.26)
                                * Double(KenosMotion.shelfEasedProgress(min(1, progress)))
                        ),
                        radius: 14,
                        x: 4,
                        y: 0
                    )
                    .allowsHitTesting(model.showSpaceShelf && progress > 0.55)
                    .accessibilityIdentifier("kenos.spaceShelf")
                    .accessibilityHidden(!model.showSpaceShelf)
                    .zIndex(3)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .onChange(of: openDragX) { previous, x in
                guard !model.showSpaceShelf else { return }
                if KenosShelfGesture.crossedOpenThreshold(
                    previousTranslation: previous,
                    currentTranslation: x
                ) {
                    openHapticTick &+= 1
                }
                // Reduce Motion: skip live preview — settle only via showSpaceShelf.
                guard !reduceMotion else { return }
                progress = KenosShelfGesture.cappedOpenProgress(
                    translationX: x,
                    panelWidth: panelWidth
                )
            }
            .onChange(of: dismissDragX) { previous, x in
                guard model.showSpaceShelf else { return }
                if KenosShelfGesture.crossedCloseThreshold(
                    previousOffset: previous,
                    currentOffset: x
                ) {
                    closeHapticTick &+= 1
                }
                guard !reduceMotion else { return }
                progress = KenosShelfGesture.dismissProgress(
                    dismissOffsetX: x,
                    panelWidth: panelWidth
                )
            }
        }
        .sensoryFeedback(
            .impact(flexibility: .soft, intensity: 0.55),
            trigger: openHapticTick
        )
        .sensoryFeedback(
            .impact(flexibility: .soft, intensity: 0.45),
            trigger: closeHapticTick
        )
        .onChange(of: model.showSpaceShelf) { _, open in
            if open {
                withAnimation(openAnimation) {
                    progress = 1
                }
                openDragX = 0
            } else {
                withAnimation(closeAnimation) {
                    progress = 0
                }
                dismissDragX = 0
                openDragX = 0
            }
        }
        .onAppear {
            if progress == 0, model.showSpaceShelf {
                progress = 1
            }
        }
    }

    /// Reduce Motion: opacity-only; full motion: slide with light rubber-band overshoot.
    private var panelOpacity: Double {
        if reduceMotion {
            return Double(min(1, max(0, progress)))
        }
        return 1
    }

    private func panelOffsetX(panelWidth: CGFloat) -> CGFloat {
        if reduceMotion {
            // No live slide under Reduce Motion — opacity carries the reveal.
            return 0
        }
        let p = max(0, progress)
        return -panelWidth + panelWidth * min(p, KenosShelfGesture.openProgressOvershootCap)
    }

    @ViewBuilder
    private func dimmer(panelWidth: CGFloat) -> some View {
        let eased = KenosMotion.shelfEasedProgress(min(1, progress))
        let layer = Color.black.opacity(resolvedDimOpacity * Double(eased))
            .ignoresSafeArea()
            .accessibilityHidden(true)

        if model.showSpaceShelf {
            layer
                .onTapGesture {
                    // Chrome owns spring via showSpaceShelf onChange.
                    model.dismissSpaceShelf()
                }
                .simultaneousGesture(dimmerDismissDrag(panelWidth: panelWidth))
                // Close VO target is the Spaces Orb — dimmer stays a silent tap target.
        } else {
            layer.allowsHitTesting(false)
        }
    }

    /// Swipe left on the dimmed content to dismiss (same thresholds as the panel).
    private func dimmerDismissDrag(panelWidth: CGFloat) -> some Gesture {
        DragGesture(
            minimumDistance: KenosShelfGesture.dismissDragMinimumDistance,
            coordinateSpace: .local
        )
        .onChanged { value in
            guard !reduceMotion else { return }
            let dx = value.translation.width
            let dy = value.translation.height
            guard abs(dx) > abs(dy) * 1.05, dx < 0 else {
                if dismissDragX != 0 { dismissDragX = 0 }
                return
            }
            dismissDragX = KenosShelfGesture.cappedDismissOffset(dx, panelWidth: panelWidth)
        }
        .onEnded { value in
            let dx = value.translation.width
            let predicted = value.predictedEndTranslation.width
            let velocity = KenosShelfGesture.dragVelocityX(value)
            let shouldClose = KenosShelfGesture.shouldCommitClose(
                translationX: dx,
                velocityX: velocity,
                predictedTranslationX: predicted
            )
            if shouldClose {
                model.dismissSpaceShelf()
            } else {
                withAnimation(KenosMotion.shelfInteractive(reduceMotion: reduceMotion)) {
                    dismissDragX = 0
                    progress = 1
                }
            }
        }
    }
}

extension KenosSpaceShelfChrome {
    static func backdropScale(reduceMotion: Bool, progress: CGFloat) -> CGFloat {
        KenosMotion.shelfBackdropScale(reduceMotion: reduceMotion, progress: min(1, progress))
    }

    static func backdropOffset(reduceMotion: Bool, progress: CGFloat) -> CGFloat {
        KenosMotion.shelfBackdropOffset(reduceMotion: reduceMotion, progress: min(1, progress))
    }

    static func clipRadius(progress: CGFloat) -> CGFloat {
        // Reduce Motion: no rounded card morph.
        progress > 0.10 ? KenosMotion.shelfCornerRadius : 0
    }
}

#endif
