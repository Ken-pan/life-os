import SwiftUI
import RoomPlan

struct HomeView: View {
    @Environment(AppModel.self) private var model

    private var scanSupported: Bool {
        RoomCaptureSession.isSupported
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        model.startScanning()
                    } label: {
                        Label("开始扫描", systemImage: "camera.metering.matrix")
                            .font(.headline)
                    }
                    .disabled(!scanSupported)
                    #if DEBUG
                    if !scanSupported {
                        Button {
                            model.loadMockScan()
                        } label: {
                            Label("载入模拟扫描(联调)", systemImage: "wand.and.stars")
                        }
                    }
                    #endif
                } footer: {
                    if !scanSupported {
                        Text("此设备不支持 RoomPlan(需要带 LiDAR 的 iPhone Pro / iPad Pro)。")
                    } else {
                        Text("逐个房间扫描,全部完成后合并、预览并上传。")
                    }
                }

                Section("已上传的扫描") {
                    if model.scans.isEmpty {
                        Text("还没有扫描").foregroundStyle(.secondary)
                    } else {
                        ForEach(model.scans) { scan in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(scan.label ?? "未命名扫描")
                                Text(Self.dateLabel(ms: scan.updatedAt))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if let err = model.lastError {
                    Section { Text(err).foregroundStyle(.red) }
                }
            }
            .navigationTitle("HomeScan")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if let email = model.userEmail {
                            Text(email)
                        }
                        Button("退出登录", role: .destructive) {
                            Task { await model.signOut() }
                        }
                    } label: {
                        Image(systemName: "person.circle")
                    }
                }
            }
            .refreshable { await model.refreshScans() }
        }
    }

    static func dateLabel(ms: Int64) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
