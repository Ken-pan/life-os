import SwiftUI

struct UploadView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 16) {
            if model.uploadProgress > 0 {
                ProgressView(value: model.uploadProgress)
                    .progressViewStyle(.linear)
                    .frame(maxWidth: 260)
                Text("\(Int(model.uploadProgress * 100))%")
                    .font(.title3.monospacedDigit().weight(.semibold))
            } else {
                ProgressView()
                    .controlSize(.large)
            }
            Text(model.uploadStatus.isEmpty ? "上传中…" : model.uploadStatus)
                .font(.headline)
            Text("照片三路并发;中断了重新点上传就是续传,已传的不重来")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
        // 照片几十张逐张传,息屏会把 App 挂起打断上传 —— 上传期间保持常亮
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }
}
