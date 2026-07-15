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
    }
}
