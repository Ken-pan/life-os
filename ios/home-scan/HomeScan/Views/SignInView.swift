import SwiftUI

struct SignInView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("邮箱", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("密码", text: $password)
                        .textContentType(.password)
                } footer: {
                    Text("使用 Life OS 账号(与 home.kenos.space 同一账号)。")
                }

                if let err = model.lastError {
                    Section { Text(err).foregroundStyle(.red) }
                }

                Section {
                    Button {
                        busy = true
                        Task {
                            await model.signIn(email: email, password: password)
                            busy = false
                        }
                    } label: {
                        if busy {
                            ProgressView()
                        } else {
                            Text("登录")
                        }
                    }
                    .disabled(busy || email.isEmpty || password.isEmpty)
                }
            }
            .navigationTitle("HomeScan")
        }
    }
}
