import SwiftUI
import KenosDesign

/// Settings → Apple Health: connect, sync, and toggle optional metrics.
struct KenosAppleHealthSettingsSection: View {
    @ObservedObject var syncer: KenosHealthSyncer
    @State private var busy = false

    var body: some View {
        Section {
            if !KenosHealthKitFeature.isEnabled {
                Text("Apple Health is temporarily disabled in this build (signing / HealthKit entitlement).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if !syncer.available {
                Text("HealthKit is unavailable on this device.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                statusBlock
                lookbackPicker
                actionButtons
            }
        } header: {
            Text("Apple Health")
        } footer: {
            Text(
                KenosHealthKitFeature.isEnabled
                    ? "On the system Health Access sheet, tap Turn On All then Allow. Core metrics power Health status; optional metrics re-prompt when enabled."
                    : "Re-enable KenosHealthKitFeature + HealthKit entitlement when App ID provisioning is ready."
            )
                .font(KenosTypography.caption)
        }

        if KenosHealthKitFeature.isEnabled, syncer.available {
            Section("Optional metrics") {
                ForEach(KenosHealthMetricID.optional) { metric in
                    Toggle(isOn: Binding(
                        get: { syncer.isEnabled(metric) },
                        set: { on in
                            Task {
                                busy = true
                                await syncer.setMetric(metric, enabled: on)
                                busy = false
                            }
                        }
                    )) {
                        Label {
                            HStack {
                                Text(metric.title)
                                if syncer.coverage[metric] == true {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                        .imageScale(.small)
                                        .accessibilityLabel("Has data")
                                }
                            }
                        } icon: {
                            Image(systemName: metric.systemImage)
                        }
                    }
                    .disabled(busy)
                    .accessibilityIdentifier("kenos.settings.health.metric.\(metric.rawValue)")
                }
            }

            Section {
                TextField("Mac IP override (optional)", text: $syncer.macHost)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.asciiCapable)
                    .accessibilityIdentifier("kenos.settings.health.macHost")
            } header: {
                Text("Mac delivery")
            } footer: {
                Text("Empty uses your Kenos shell host. Delivery: iCloud inbox and/or LAN :5193/ingest.")
                    .font(KenosTypography.caption)
            }
        }
    }

    @ViewBuilder
    private var statusBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: syncer.authorized ? "heart.text.square.fill" : "heart.text.square")
                    .foregroundStyle(syncer.authorized ? .pink : .secondary)
                Text(
                    syncer.authorized
                        ? "Connected"
                        : syncer.authPrompted
                            ? "Permission requested"
                            : "Not connected"
                )
                    .font(.headline)
                if busy {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            Text(syncer.status)
                .font(.callout)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("kenos.settings.health.status")
            if let last = syncer.lastSync {
                Text("Last sync \(last.formatted(date: .abbreviated, time: .shortened))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if syncer.dayCount > 0 {
                Text("\(syncer.dayCount) days · \(syncer.coveredCount)/\(syncer.enabledMetrics.count) metrics with data")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            coreCoverageChips
        }
        .padding(.vertical, 2)
    }

    private var coreCoverageChips: some View {
        FlowWrap {
            ForEach(KenosHealthMetricID.core) { metric in
                let has = syncer.coverage[metric] == true
                Text(metric.title)
                    .font(.caption2.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(has ? Color.green.opacity(0.22) : Color.secondary.opacity(0.14))
                    .foregroundStyle(has ? Color.green : Color.secondary)
                    .clipShape(Capsule())
            }
        }
    }

    private var lookbackPicker: some View {
        Picker("Lookback", selection: $syncer.lookbackDays) {
            Text("14 days").tag(14)
            Text("30 days").tag(30)
        }
        .accessibilityIdentifier("kenos.settings.health.lookback")
    }

    @ViewBuilder
    private var actionButtons: some View {
        Button {
            Task {
                busy = true
                await syncer.authorize(andSync: true)
                busy = false
            }
        } label: {
            Label(
                syncer.authorized ? "Update permissions & sync" : "Connect Apple Health",
                systemImage: syncer.authorized ? "arrow.triangle.2.circlepath" : "heart.text.square"
            )
        }
        .disabled(busy)
        .accessibilityIdentifier("kenos.settings.health.connect")

        Button {
            Task {
                busy = true
                if !syncer.authorized {
                    await syncer.authorize(andSync: false)
                }
                await syncer.sync()
                busy = false
            }
        } label: {
            Label("Sync now", systemImage: "arrow.clockwise")
        }
        .disabled(busy)
        .accessibilityIdentifier("kenos.settings.health.sync")

        Button {
            syncer.openSystemHealthSettings()
        } label: {
            Label("Open Health app", systemImage: "arrow.up.forward.app")
        }
        .accessibilityIdentifier("kenos.settings.health.openApp")
    }
}

/// Simple wrapping HStack for coverage chips (no external dependency).
private struct FlowWrap<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        // LazyVGrid keeps chips tidy without a custom layout engine.
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 72), spacing: 6)],
            alignment: .leading,
            spacing: 6
        ) {
            content()
        }
    }
}
