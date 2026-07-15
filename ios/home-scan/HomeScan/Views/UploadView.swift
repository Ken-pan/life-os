import SwiftUI

struct UploadView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
            Text(model.uploadStatus.isEmpty ? "上传中…" : model.uploadStatus)
                .font(.headline)
            Text("照片逐张上传,请保持网络连接")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
        // 照片几十张逐张传,息屏会把 App 挂起打断上传 —— 上传期间保持常亮
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }
}
