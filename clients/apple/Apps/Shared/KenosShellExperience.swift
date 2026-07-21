import SwiftUI
import KenosDesign

#if os(iOS)

extension Notification.Name {
    /// First Continuity / shell document paint — dismisses launch veil.
    static let kenosFirstContentReady = Notification.Name("kenosFirstContentReady")
}

/// Safari / Linear-style hairline load indicator over the web canvas.
struct KenosLoadProgressBar: View {
    var progress: Double
    var accent: Color
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var visible: Bool {
        progress > 0.02 && progress < 0.995
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Color.clear
                Capsule(style: .continuous)
                    .fill(accent.opacity(0.85))
                    .frame(width: max(4, geo.size.width * min(1, max(0, progress))))
                    .opacity(visible ? 1 : 0)
            }
        }
        .frame(height: 2)
        .animation(KenosMotion.unveil(reduceMotion: reduceMotion), value: progress)
        .animation(KenosMotion.unveil(reduceMotion: reduceMotion), value: visible)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Cold-start continuity: ink + quiet brand, fades when first content paints.
/// Matches LaunchBackground so the system splash → app frame feels like one surface.
struct KenosLaunchVeil: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var markOpacity: Double = 0
    @State private var markScale: CGFloat = 0.985

    private let ink = Color(red: 0.031, green: 0.035, blue: 0.039)

    var body: some View {
        ZStack {
            ink.ignoresSafeArea()
            VStack(spacing: 10) {
                Text("Kenos")
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.92))
                    .tracking(-0.6)
                Text("Continuity")
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.38))
                    .tracking(1.2)
                    .textCase(.uppercase)
            }
            .opacity(markOpacity)
            .scaleEffect(reduceMotion ? 1 : markScale)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(KenosMotion.unveil(reduceMotion: reduceMotion)) {
                markOpacity = 1
                markScale = 1
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Kenos")
    }
}

/// Hosts launch veil + wires first-paint / failsafe dismiss.
struct KenosLaunchVeilHost<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ViewBuilder var content: () -> Content
    @State private var showVeil = true

    var body: some View {
        ZStack {
            content()
            if showVeil {
                KenosLaunchVeil()
                    .transition(.opacity)
                    .zIndex(50)
            }
        }
        .animation(KenosMotion.unveil(reduceMotion: reduceMotion), value: showVeil)
        .onReceive(NotificationCenter.default.publisher(for: .kenosFirstContentReady)) { _ in
            dismissVeil()
        }
        .task {
            // Failsafe — never trap the user behind a brand mark.
            try? await Task.sleep(nanoseconds: 1_100_000_000)
            dismissVeil()
        }
    }

    private func dismissVeil() {
        guard showVeil else { return }
        withAnimation(KenosMotion.unveil(reduceMotion: reduceMotion)) {
            showVeil = false
        }
    }
}

#endif
