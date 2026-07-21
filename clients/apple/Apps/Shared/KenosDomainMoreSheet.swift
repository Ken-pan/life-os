import SwiftUI

#if os(iOS)

/// Domain More — secondary routes + HomeScan companion actions (not on the 5-slot dock).
struct KenosDomainMoreSheet: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.dismiss) private var dismiss
    @State private var homeScanMissingAlert = false
    @State private var homeScanMissingTitle = "HomeScan"

    var body: some View {
        NavigationStack {
            List {
                ForEach(Array(model.domainMoreDestinations.enumerated()), id: \.offset) { _, dest in
                    moreRow(dest)
                }
            }
            .navigationTitle("More")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("需要 HomeScan", isPresented: $homeScanMissingAlert) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text(missingCompanionMessage)
            }
        }
        .presentationDetents([.medium, .large])
        .accessibilityIdentifier("kenos.domainMore")
    }

    private var missingCompanionMessage: String {
        "「\(homeScanMissingTitle)」在独立的 HomeScan 伴侣应用里（RoomPlan / AR）。请先安装 HomeScan，或在 Settings → Cloud scans 从网页拉取已有扫描。"
    }

    @ViewBuilder
    private func moreRow(_ dest: (title: String, systemImage: String, path: String)) -> some View {
        Button {
            activate(dest)
        } label: {
            Label(dest.title, systemImage: dest.systemImage)
        }
    }

    private func activate(_ dest: (title: String, systemImage: String, path: String)) {
        if let companion = KenosHomeScanBridge.destination(fromMorePath: dest.path) {
            if KenosHomeScanBridge.open(companion) {
                dismiss()
            } else {
                homeScanMissingTitle = companion.title
                homeScanMissingAlert = true
            }
            return
        }
        model.selectDomainMorePath(dest.path)
        dismiss()
    }
}

#endif
