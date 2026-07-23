import SwiftUI

/// In-app diagnostics: browse / filter / export / clear Kenos native logs.
struct KenosLogViewer: View {
    @State private var events: [KenosLogEvent] = []
    @State private var minLevel: KenosLogLevel = .debug
    @State private var categoryFilter: KenosLogCategory? = nil
    @State private var query: String = ""
    @State private var autoRefresh = true
    @State private var exportURL: URL?
    @State private var showShare = false
    @State private var statusMessage: String?
    @State private var showClearConfirm = false
    #if os(iOS)
    @ObservedObject private var cloud = KenosLogCloudSync.shared
    #endif

    private let refreshTimer = Timer.publish(every: 1.2, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 0) {
            filterBar
            #if os(iOS)
            cloudBar
            #endif
            Divider()
            if filtered.isEmpty {
                ContentUnavailableView(
                    "No log lines",
                    systemImage: "text.alignleft",
                    description: Text("Native events will appear as you navigate Korben.")
                )
            } else {
                List(filtered.reversed()) { event in
                    logRow(event)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Diagnostics")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Refresh", systemImage: "arrow.clockwise") { reload() }
                    Toggle("Auto-refresh", isOn: $autoRefresh)
                    #if os(iOS)
                    Divider()
                    Button("Upload to Supabase", systemImage: "icloud.and.arrow.up") {
                        Task { await uploadNow() }
                    }
                    .disabled(cloud.isUploading)
                    #endif
                    Divider()
                    Button("Export package", systemImage: "square.and.arrow.up") {
                        exportLogs()
                    }
                    Button("Clear logs", systemImage: "trash", role: .destructive) {
                        showClearConfirm = true
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .onAppear { reload() }
        .onReceive(refreshTimer) { _ in
            guard autoRefresh else { return }
            reload()
        }
        .confirmationDialog("Clear persisted logs?", isPresented: $showClearConfirm, titleVisibility: .visible) {
            Button("Clear", role: .destructive) {
                KenosLog.clearPersisted()
                reload()
                statusMessage = "Logs cleared"
            }
            Button("Cancel", role: .cancel) {}
        }
        #if os(iOS)
        .sheet(isPresented: $showShare) {
            if let exportURL {
                KenosLogShareSheet(items: [exportURL])
            }
        }
        #endif
        .safeAreaInset(edge: .bottom) {
            if let statusMessage {
                Text(statusMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
            }
        }
        .accessibilityIdentifier("kenos.diagnostics")
    }

    private var filterBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Filter message / category", text: $query)
                    .textFieldStyle(.plain)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    #endif
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    levelMenu
                    categoryMenu
                    statsChip
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    #if os(iOS)
    private var cloudBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle("Sync to Supabase", isOn: $cloud.enabled)
                .font(.subheadline)
                .accessibilityIdentifier("kenos.diagnostics.cloud.enabled")
            HStack(spacing: 8) {
                Menu {
                    ForEach([KenosLogLevel.info, .notice, .warning, .error], id: \.rawValue) { level in
                        Button(level.label) { cloud.cloudMinLevel = level }
                    }
                } label: {
                    chip(title: "Cloud ≥ \(cloud.cloudMinLevel.label)", systemImage: "icloud")
                }
                chip(
                    title: cloud.isUploading
                        ? "Uploading…"
                        : "Pending \(cloud.pendingCount)",
                    systemImage: cloud.isUploading ? "arrow.triangle.2.circlepath" : "tray.full"
                )
                if let last = cloud.lastUploadAt {
                    chip(
                        title: last.formatted(date: .omitted, time: .shortened),
                        systemImage: "checkmark.icloud"
                    )
                }
            }
            Text("Session \(KenosLog.shared.sessionId.prefix(8))… · host \(KenosSupabaseConfig.url?.host ?? "—")")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .textSelection(.enabled)
            if let err = cloud.lastUploadError, !err.isEmpty {
                Text(err)
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }
    #endif

    private var levelMenu: some View {
        Menu {
            ForEach(KenosLogLevel.allCases, id: \.rawValue) { level in
                Button(level.label) { minLevel = level }
            }
        } label: {
            chip(title: "≥ \(minLevel.label)", systemImage: "slider.horizontal.3")
        }
    }

    private var categoryMenu: some View {
        Menu {
            Button("All categories") { categoryFilter = nil }
            Divider()
            ForEach(KenosLogCategory.allCases) { category in
                Button(category.title) { categoryFilter = category }
            }
        } label: {
            chip(
                title: categoryFilter?.title ?? "All",
                systemImage: "tag"
            )
        }
    }

    private var statsChip: some View {
        let stats = KenosLog.shared.stats()
        return chip(
            title: "\(filtered.count)/\(stats.memoryCount) · \(ByteCountFormatter.string(fromByteCount: Int64(stats.diskBytes), countStyle: .file))",
            systemImage: "internaldrive"
        )
    }

    private func chip(title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.quaternary.opacity(0.55), in: Capsule())
    }

    private var filtered: [KenosLogEvent] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return events.filter { event in
            guard event.level >= minLevel else { return false }
            if let categoryFilter, event.category != categoryFilter { return false }
            guard !q.isEmpty else { return true }
            if event.message.lowercased().contains(q) { return true }
            if event.category.rawValue.contains(q) { return true }
            if event.metadata.values.contains(where: { $0.lowercased().contains(q) }) { return true }
            return false
        }
    }

    private func logRow(_ event: KenosLogEvent) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(event.level.shortLabel)
                    .font(.caption2.weight(.bold).monospaced())
                    .foregroundStyle(levelColor(event.level))
                    .frame(width: 14, alignment: .leading)
                Text(event.category.title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text(KenosLogFormatting.compactTime(event.timestamp))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.tertiary)
            }
            Text(event.message)
                .font(.footnote)
                .textSelection(.enabled)
            if !event.metadata.isEmpty {
                Text(KenosLogFormatting.metadataSuffix(event.metadata).trimmingCharacters(in: CharacterSet(charactersIn: " {}")))
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 2)
        .accessibilityIdentifier("kenos.diagnostics.row")
    }

    private func levelColor(_ level: KenosLogLevel) -> Color {
        switch level {
        case .trace, .debug: return .secondary
        case .info: return .cyan
        case .notice: return .blue
        case .warning: return .orange
        case .error, .fault: return .red
        }
    }

    private func reload() {
        events = KenosLog.recent(limit: 800)
        #if os(iOS)
        cloud.refreshPendingCount()
        #endif
    }

    #if os(iOS)
    private func uploadNow() async {
        statusMessage = "Uploading…"
        let result = await cloud.uploadPending(reason: "manual")
        statusMessage = result.summary
        reload()
    }
    #endif

    private func exportLogs() {
        do {
            let url = try KenosLog.exportPackage()
            exportURL = url
            #if os(iOS)
            showShare = true
            #else
            statusMessage = "Exported to \(url.path)"
            #endif
            KenosLog.info("diagnostics export ready", category: .bugReport, metadata: ["path": url.lastPathComponent])
        } catch {
            statusMessage = "Export failed: \(error.localizedDescription)"
            KenosLog.error("diagnostics export failed", category: .bugReport, metadata: ["error": error.localizedDescription])
        }
    }
}

#if os(iOS)
import UIKit

private struct KenosLogShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
#endif
