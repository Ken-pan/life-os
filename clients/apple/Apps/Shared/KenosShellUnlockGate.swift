import SwiftUI

/// Native shell lock screen — shown until Face ID / Touch ID grants `kenos.unlock.shell`.
struct KenosShellUnlockGate: View {
    @ObservedObject var model: KenosAppModel
    #if os(iOS)
    @Environment(\.scenePhase) private var scenePhase
    #endif

    private var isZh: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "lock.fill")
                .font(.system(size: 44, weight: .medium))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(isZh ? "解锁 Kenos" : "Unlock Kenos")
                .font(.title2.weight(.semibold))
            Text(
                isZh
                    ? "使用面容 ID 或设备密码解锁此设备上的 Life OS 数据。"
                    : "Face ID or device passcode unlocks this device for your Life OS data."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
            if let err = model.shellUnlockError, !err.isEmpty {
                Text(err)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            Button {
                Task { @MainActor in
                    _ = await model.unlockShellAndHydrate(prompt: true)
                }
            } label: {
                Text(
                    model.shellUnlockBusy
                        ? (isZh ? "解锁中…" : "Unlocking…")
                        : (isZh ? "解锁" : "Unlock")
                )
                .frame(minWidth: 160)
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.shellUnlockBusy)
            .accessibilityIdentifier("kenos.shellUnlock.button")
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(model.chromeAppearance.canvasColor.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("kenos.shellUnlock.gate")
        // Auto Face ID only while foreground-active; one shot per lock episode.
        #if os(iOS)
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await model.autoPromptShellUnlockIfNeeded()
        }
        #else
        .task {
            await model.autoPromptShellUnlockIfNeeded()
        }
        #endif
    }
}
