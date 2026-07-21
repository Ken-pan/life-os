import SwiftUI
import KenosDesign

#if os(iOS)

/// Shared interactive Space Shelf chrome — open preview + committed drawer + dimmer.
///
/// Used by Kenos Mode (`KenosShellWithSpaceShelf`) and Domain Mode (`KenosDomainModeShell`)
/// so edge-pan / dismiss feel identical (Telegram / iOS Mail drawer).
///
/// Parent owns `progress` so backdrop scale/offset stay locked to the panel.
struct KenosSpaceShelfChrome: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Peak dim when shelf is fully open (Domain reads denser than Kenos hall).
    var dimOpacity: Double
    /// Live edge-pan translation while opening (0 when idle / committed).
    @Binding var openDragX: CGFloat
    /// Live dismiss offset on the open panel (≤ 0).
    @Binding var dismissDragX: CGFloat
    /// Settled + interactive reveal (0…1). Drives panel, dimmer, and parent backdrop.
    @Binding var progress: CGFloat

    private var openAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: false)
    }

    private var closeAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: true)
    }

    private var panelOffsetX: CGFloat {
        if reduceMotion {
            return progress > 0.5 ? 0 : -KenosShelfGesture.panelWidth
        }
        // 1:1 with the finger while dragging; springs handle commit settle.
        let p = min(1, max(0, progress))
        return -KenosShelfGesture.panelWidth + KenosShelfGesture.panelWidth * p
    }

    var body: some View {
        ZStack(alignment: .leading) {
            if progress > 0.02 {
                dimmer
                    .zIndex(2)
                KenosSpaceShelfView(
                    model: model,
                    dismissDragX: model.showSpaceShelf ? $dismissDragX : .constant(0)
                )
                .frame(width: KenosShelfGesture.panelWidth)
                .offset(x: panelOffsetX)
                .opacity(reduceMotion && !model.showSpaceShelf ? Double(progress) : 1)
                .allowsHitTesting(model.showSpaceShelf && progress > 0.55)
                .accessibilityIdentifier("kenos.spaceShelf")
                .accessibilityHidden(!model.showSpaceShelf)
                .zIndex(3)
            }
        }
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.55), trigger: openThresholdToken)
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.45), trigger: closeThresholdToken)
        .onChange(of: openDragX) { _, x in
            guard !model.showSpaceShelf else { return }
            progress = min(1, KenosShelfGesture.openProgress(translationX: x))
        }
        .onChange(of: dismissDragX) { _, x in
            guard model.showSpaceShelf else { return }
            progress = KenosShelfGesture.dismissProgress(dismissOffsetX: x)
        }
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

    private var openThresholdToken: Int {
        openDragX >= KenosShelfGesture.openDistance ? 1 : 0
    }

    private var closeThresholdToken: Int {
        dismissDragX <= -KenosShelfGesture.closeDistance ? 1 : 0
    }

    @ViewBuilder
    private var dimmer: some View {
        let eased = KenosMotion.shelfEasedProgress(progress)
        let layer = Color.black.opacity(dimOpacity * Double(eased))
            .ignoresSafeArea()
            .accessibilityHidden(true)

        if model.showSpaceShelf {
            layer
                .onTapGesture {
                    withAnimation(closeAnimation) {
                        model.dismissSpaceShelf()
                    }
                }
                .simultaneousGesture(dimmerDismissDrag)
        } else {
            layer.allowsHitTesting(false)
        }
    }

    /// Swipe left on the dimmed content to dismiss (same thresholds as the panel).
    private var dimmerDismissDrag: some Gesture {
        DragGesture(minimumDistance: 16, coordinateSpace: .local)
            .onChanged { value in
                guard !reduceMotion else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > abs(dy) * 1.05, dx < 0 else {
                    if dismissDragX != 0 { dismissDragX = 0 }
                    return
                }
                dismissDragX = KenosShelfGesture.cappedDismissOffset(dx)
            }
            .onEnded { value in
                let dx = value.translation.width
                let predicted = value.predictedEndTranslation.width
                let velocity = predicted - dx
                let shouldClose = KenosShelfGesture.shouldCommitClose(
                    translationX: dx,
                    velocityX: velocity,
                    predictedTranslationX: predicted
                )
                if shouldClose {
                    withAnimation(closeAnimation) {
                        model.dismissSpaceShelf()
                    }
                } else {
                    withAnimation(openAnimation) {
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
        progress > 0.10 ? KenosMotion.shelfCornerRadius : 0
    }
}

#endif
