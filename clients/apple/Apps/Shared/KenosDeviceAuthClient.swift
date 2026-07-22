import Foundation

/// Talks to Planner `/api/device/*` for Owner Device Lock pair / challenge / exchange.
enum KenosDeviceAuthClient {
    struct SessionTokens: Equatable {
        var accessToken: String
        var refreshToken: String
        var userId: String?
        var sessionEpoch: Int?
    }

    enum AuthError: Error, LocalizedError {
        case badURL
        case http(Int, String)
        case decoding
        case notPaired
        case limitReached(String)
        case shellLocked

        var errorDescription: String? {
            switch self {
            case .badURL: return "Device auth URL invalid"
            case .http(let code, let body): return "Device auth HTTP \(code): \(body)"
            case .decoding: return "Device auth response decode failed"
            case .notPaired: return "Device is not paired"
            case .limitReached(let msg): return msg
            case .shellLocked: return "Shell must be unlocked before pairing"
            }
        }
    }

    /// Coalesce concurrent SSO→pair storms onto one network attempt.
    @MainActor
    private static var pairInFlight: Task<Void, Error>?

    static var apiBaseURL: URL {
        if let origin = KenosDomainRegistry.definition(for: "plan")?.productionOrigin,
           let url = URL(string: origin)
        {
            return url
        }
        return URL(string: "https://planner.kenos.space")!
    }

    /// After shell Face ID: exchange if paired; else reconcile epoch for any residual vault.
    @MainActor
    static func bootstrapSessionAfterUnlock() async {
        guard KenosUnlockGrantStore.isShellUnlocked() else { return }
        if KenosDeviceIdentityStore.isPaired {
            do {
                let tokens = try await exchangeSession()
                KenosSharedWebAuth.saveSharedTokens(
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    userId: tokens.userId
                )
                if let epoch = tokens.sessionEpoch {
                    KenosDeviceIdentityStore.rememberSessionEpoch(epoch)
                }
                KenosLog.notice(
                    "device exchange session restored",
                    category: .session,
                    metadata: [
                        "keyStorage": KenosDeviceIdentityStore.keyStorage.rawValue,
                        "epoch": String(tokens.sessionEpoch ?? KenosDeviceIdentityStore.storedSessionEpoch),
                    ]
                )
            } catch {
                KenosLog.notice(
                    "device exchange failed",
                    category: .session,
                    metadata: ["error": String(describing: error)]
                )
                if case AuthError.http(let code, _) = error, code == 401 || code == 403 || code == 409 {
                    KenosDeviceIdentityStore.clearPairing()
                    KenosSharedWebAuth.clearSharedTokens()
                } else if case AuthError.notPaired = error {
                    KenosSharedWebAuth.clearSharedTokens()
                }
            }
            return
        }
        await reconcileSessionEpochIfNeeded()
    }

    /// Drop vault when remote session_epoch moved ahead (hangup / mass revoke).
    @MainActor
    static func reconcileSessionEpochIfNeeded() async {
        guard let tokens = KenosSharedWebAuth.loadSharedTokens() else { return }
        let url = apiBaseURL.appendingPathComponent("api/device/state")
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status >= 200, status < 300,
                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return }
            let remote = (json["sessionEpoch"] as? Int) ?? (json["session_epoch"] as? Int) ?? 0
            let local = KenosDeviceIdentityStore.storedSessionEpoch
            if remote > local {
                KenosLog.notice(
                    "session epoch advanced — clearing vault",
                    category: .session,
                    metadata: ["local": String(local), "remote": String(remote)]
                )
                KenosDeviceIdentityStore.clearPairing()
                KenosSharedWebAuth.clearSharedTokens()
                KenosDeviceIdentityStore.rememberSessionEpoch(remote)
            }
        } catch {
            // Offline — keep vault; exchange path will reconcile later.
        }
    }

    /// One-time pair using an existing SSO access token (after owner signs in once).
    @MainActor
    static func pairWithAccessToken(_ accessToken: String) async throws {
        guard KenosUnlockGrantStore.isShellUnlocked() else {
            throw AuthError.shellLocked
        }
        if KenosDeviceIdentityStore.isPaired { return }
        if let pairInFlight {
            try await pairInFlight.value
            return
        }
        let task = Task { @MainActor in
            try await performPair(accessToken: accessToken)
        }
        pairInFlight = task
        defer { pairInFlight = nil }
        try await task.value
    }

    @MainActor
    private static func performPair(accessToken: String) async throws {
        if KenosDeviceIdentityStore.isPaired { return }
        let identity = try KenosDeviceIdentityStore.ensureIdentity()
        let url = apiBaseURL.appendingPathComponent("api/device/pair")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        var body: [String: Any] = [
            "deviceId": identity.deviceId,
            "deviceClass": identity.deviceClass,
            "publicKey": identity.publicKeyBase64,
            "platform": identity.platform,
            "label": identity.label,
            "keyStorage": identity.keyStorage.rawValue,
            "userAgent": "KenosAppleShell/\(identity.platform)",
        ]
        if let attest = await KenosAppAttest.prepareAttestation(apiBase: apiBaseURL) {
            body["attestKeyId"] = attest.keyId
            body["attestation"] = attest.attestationBase64
            body["attestChallenge"] = attest.challenge
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let text = String(data: data, encoding: .utf8) ?? ""
        if status == 409 {
            throw AuthError.limitReached(text)
        }
        guard status >= 200, status < 300 else {
            throw AuthError.http(status, text)
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let device = json?["device"] as? [String: Any]
        let rowId = device?["id"] as? String
        KenosDeviceIdentityStore.markPaired(rowId: rowId)
        KenosLog.notice(
            "device paired",
            category: .session,
            metadata: [
                "class": identity.deviceClass,
                "platform": identity.platform,
                "attest": KenosAppAttest.storedKeyId != nil ? "1" : "0",
            ]
        )
    }

    /// Challenge → sign → (optional App Attest assertion) → exchange → session tokens.
    static func exchangeSession() async throws -> SessionTokens {
        let identity = try KenosDeviceIdentityStore.ensureIdentity()
        guard KenosDeviceIdentityStore.isPaired else { throw AuthError.notPaired }

        let challengeURL = apiBaseURL.appendingPathComponent("api/device/challenge")
        var challengeReq = URLRequest(url: challengeURL)
        challengeReq.httpMethod = "POST"
        challengeReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        challengeReq.httpBody = try JSONSerialization.data(withJSONObject: [
            "deviceId": identity.deviceId,
        ])
        let (challengeData, challengeResponse) = try await URLSession.shared.data(for: challengeReq)
        let challengeStatus = (challengeResponse as? HTTPURLResponse)?.statusCode ?? 0
        guard challengeStatus >= 200, challengeStatus < 300,
              let challengeJSON = try JSONSerialization.jsonObject(with: challengeData) as? [String: Any],
              let challenge = challengeJSON["challenge"] as? String
        else {
            throw AuthError.http(challengeStatus, String(data: challengeData, encoding: .utf8) ?? "")
        }

        let signature = try KenosDeviceIdentityStore.sign(challenge: challenge)
        var exchangeBody: [String: Any] = [
            "challenge": challenge,
            "signature": signature,
        ]
        if let assertion = await KenosAppAttest.prepareAssertion(challenge: challenge) {
            exchangeBody["assertion"] = assertion
        }

        let exchangeURL = apiBaseURL.appendingPathComponent("api/device/exchange")
        var exchangeReq = URLRequest(url: exchangeURL)
        exchangeReq.httpMethod = "POST"
        exchangeReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        exchangeReq.httpBody = try JSONSerialization.data(withJSONObject: exchangeBody)
        let (exchangeData, exchangeResponse) = try await URLSession.shared.data(for: exchangeReq)
        let exchangeStatus = (exchangeResponse as? HTTPURLResponse)?.statusCode ?? 0
        guard exchangeStatus >= 200, exchangeStatus < 300,
              let exchangeJSON = try JSONSerialization.jsonObject(with: exchangeData) as? [String: Any],
              let session = exchangeJSON["session"] as? [String: Any],
              let access = session["access_token"] as? String,
              let refresh = session["refresh_token"] as? String
        else {
            throw AuthError.http(exchangeStatus, String(data: exchangeData, encoding: .utf8) ?? "")
        }
        let userId = session["user_id"] as? String
        let epoch = session["session_epoch"] as? Int
        return SessionTokens(
            accessToken: access,
            refreshToken: refresh,
            userId: userId,
            sessionEpoch: epoch
        )
    }
}
