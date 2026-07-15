import SwiftUI
import RoomPlan
import ARKit

struct HomeView: View {
    @Environment(AppModel.self) private var model
    /// 「柜内扫描」选中的扫描(sheet 里再挑柜子)
    @State private var containerTarget: SupabaseService.ScanRow?

    private var scanSupported: Bool {
        RoomCaptureSession.isSupported
    }

    /// 柜内扫描只要普通 ARKit(模拟器 DEBUG 走 mock 联调)
    private var containerScanAvailable: Bool {
        #if DEBUG
        return true
        #else
        return ARWorldTrackingConfiguration.isSupported
        #endif
    }

    var body: some View {
        NavigationStack {
            List {
                if let pending = model.pendingScan {
                    Section {
                        VStack(alignment: .leading, spacing: 6) {
                            Label("有一次没传完的扫描", systemImage: "tray.and.arrow.up")
                                .font(.headline)
                            Text(pendingSummary(pending))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            HStack {
                                Button("继续") { model.restorePendingScan() }
                                    .buttonStyle(.borderedProminent)
                                Button("丢弃", role: .destructive) { model.discardPendingScan() }
                                    .buttonStyle(.bordered)
                            }
                        }
                        .padding(.vertical, 4)
                    } footer: {
                        Text("扫描结果已落盘保存 —— 断网、退出 App 都不会丢,传完自动清理。")
                    }
                }
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

                Section {
                    if model.scans.isEmpty {
                        Text("还没有扫描").foregroundStyle(.secondary)
                    } else {
                        ForEach(model.scans) { scan in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(scan.label ?? "未命名扫描")
                                    Text(Self.dateLabel(ms: scan.updatedAt))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if containerScanAvailable {
                                    // 开柜门量内腔:建「柜→层」容器层级,挂回这次扫描的家具
                                    Button {
                                        containerTarget = scan
                                    } label: {
                                        Label("柜内", systemImage: "archivebox")
                                            .font(.caption)
                                    }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                                }
                            }
                        }
                    }
                } header: {
                    Text("已上传的扫描")
                } footer: {
                    if containerScanAvailable, !model.scans.isEmpty {
                        Text("「柜内」:打开柜门测内宽/内深/内高和层板,数据挂在这次扫描的柜子上。")
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
            .sheet(item: $containerTarget) { scan in
                ContainerPickView(scan: scan)
            }
        }
    }

    private func pendingSummary(_ m: PendingScanStore.Manifest) -> String {
        let photos = m.photoNames.compactMap { $0 }.count
            + m.objectPhotos.values.reduce(0) { $0 + $1.count }
        let when = m.savedAt.formatted(date: .abbreviated, time: .shortened)
        return "\(when) · \(m.project.placements.count + m.project.fixtures.count) 件家具 · \(photos) 张照片"
    }

    static func dateLabel(ms: Int64) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
