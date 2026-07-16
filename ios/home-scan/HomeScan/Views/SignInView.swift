import SwiftUI

/// 登录 —— App 的第一屏,也是唯一一屏「你还什么都没有」。
///
/// 所以它得先回答「这是什么」再要账号:一个 Form 直接怼两个输入框,
/// 装完打开一脸问号。图标 + 一句话是成本最低的解释。
struct SignInView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @FocusState private var focus: Field?
    /// hero 图标夹在文字块里,不跟着长的话大字号下会缩成一颗小点
    @ScaledMetric(relativeTo: .largeTitle) private var hero: CGFloat = 44

    private enum Field { case email, password }

    private var canSubmit: Bool {
        !busy && !email.isEmpty && !password.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: HS.Space.snug) {
                        Image(systemName: "camera.metering.matrix")
                            .font(.system(size: hero, weight: .light))
                            .foregroundStyle(HS.accent.gradient)
                        Text("扫一遍家,把户型、家具和尺寸带进 HomeOS")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, HS.Space.base)
                    .listRowBackground(Color.clear)
                    .accessibilityElement(children: .combine)
                }

                Section {
                    TextField("邮箱", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                    SecureField("密码", text: $password)
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        // 键盘上直接回车登录 —— 不用收键盘再去够按钮
                        .submitLabel(.go)
                        .onSubmit { if canSubmit { submit() } }
                } footer: {
                    Text("使用 Life OS 账号(与 home.kenos.space 同一账号)。")
                }

                if let err = model.lastError {
                    Section {
                        Label(err, systemImage: "exclamationmark.triangle.fill")
                            .labelStyle(.hsIconText)
                            .font(.footnote)
                            // dangerText 不是 danger:这是 Form 浅色底上的正文,
                            // systemRed 实测只有 3.18:1(AA 要 4.5)。见 DesignSystem。
                            .foregroundStyle(HS.dangerText)
                            .accessibilityElement(children: .combine)
                    }
                }

                Section {
                    Button(action: submit) {
                        Group {
                            if busy {
                                ProgressView()
                            } else {
                                Text("登录").fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .hsBigHit()
                    }
                    // 不用 .glass:它坐在 Form 里,背后是一片不动的表单底 ——
                    // 玻璃折射不出任何东西,只剩一层白模糊。玻璃是给**浮在内容
                    // 之上**的控件的(见 DesignSystem 头注释)。
                    .buttonStyle(.borderedProminent)
                    .disabled(!canSubmit)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("HomeScan")
        }
    }

    private func submit() {
        busy = true
        focus = nil
        Task {
            await model.signIn(email: email, password: password)
            busy = false
        }
    }
}
