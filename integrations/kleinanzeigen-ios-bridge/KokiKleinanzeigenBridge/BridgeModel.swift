import CryptoKit
import Foundation
import SwiftUI
import UIKit

@MainActor
final class BridgeModel: ObservableObject {
    @Published var authURL: URL?
    @Published var statusText = "Отвори свързването от KOKI → Профил → Интеграции."
    @Published var isWorking = false
    @Published var showError = false
    @Published var errorText = ""

    private let clientID = "uV5j90myVPc2XzEOFuWUD2At17OACEGQ"
    private let redirectURI = "https://login.kleinanzeigen.de/android/com.ebay.kleinanzeigen/callback"
    private let scope = "openid email profile offline_access"

    private var sessionID = ""
    private var pairToken = ""
    private var completeURL: URL?
    private var returnURL: URL?
    private var verifier = ""
    private var expectedState = ""
    private var callbackHandled = false

    func start(from url: URL) {
        guard url.scheme == "koki-ka-bridge", url.host == "connect" else {
            fail("Невалидна KOKI bridge заявка.")
            return
        }

        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            fail("Не мога да прочета KOKI bridge заявката.")
            return
        }

        func query(_ name: String) -> String? {
            components.queryItems?.first(where: { $0.name == name })?.value
        }

        guard
            let sessionID = query("session_id"), !sessionID.isEmpty,
            let pairToken = query("pair_token"), pairToken.count >= 32,
            let complete = query("complete_url").flatMap(URL.init(string:)),
            let returnURL = query("return_url").flatMap(URL.init(string:)),
            complete.scheme == "https",
            returnURL.scheme == "https"
        else {
            fail("KOKI bridge заявката е непълна.")
            return
        }

        self.sessionID = sessionID
        self.pairToken = pairToken
        self.completeURL = complete
        self.returnURL = returnURL
        self.callbackHandled = false

        let pkce = makePKCE()
        verifier = pkce.verifier
        expectedState = randomURLSafe(bytes: 24)

        var auth = URLComponents(string: "https://login.kleinanzeigen.de/authorize")!
        auth.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "scope", value: scope),
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: expectedState),
            URLQueryItem(name: "prompt", value: "login")
        ]

        guard let authURL = auth.url else {
            fail("Не мога да създам Kleinanzeigen login URL.")
            return
        }

        statusText = "Влез директно в Kleinanzeigen. Данните остават в WebView-а на този iPhone."
        self.authURL = authURL
    }

    func shouldIntercept(_ url: URL) -> Bool {
        url.absoluteString.hasPrefix(redirectURI)
    }

    func handleCallback(_ url: URL) {
        guard !callbackHandled else { return }
        callbackHandled = true
        authURL = nil
        isWorking = true
        statusText = "Kleinanzeigen потвърди входа. Свързвам профила с KOKI…"

        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            finishWithError("Невалиден Kleinanzeigen callback.")
            return
        }

        let values = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).compactMap { item -> (String, String)? in
            guard let value = item.value else { return nil }
            return (item.name, value)
        })

        if let error = values["error"] {
            finishWithError("Kleinanzeigen отказа входа: \(error)")
            return
        }

        guard let code = values["code"], !code.isEmpty else {
            finishWithError("Kleinanzeigen не върна authorization code.")
            return
        }

        guard values["state"] == expectedState else {
            finishWithError("Kleinanzeigen state проверката не мина.")
            return
        }

        Task {
            await complete(code: code)
        }
    }

    private func complete(code: String) async {
        guard let completeURL else {
            finishWithError("Липсва KOKI callback endpoint.")
            return
        }

        struct Payload: Encodable {
            let session_id: String
            let pair_token: String
            let authorization_code: String
            let code_verifier: String
        }

        struct Response: Decodable {
            let ok: Bool?
            let connected: Bool?
            let error: String?
        }

        var request = URLRequest(url: completeURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 35

        do {
            request.httpBody = try JSONEncoder().encode(Payload(
                session_id: sessionID,
                pair_token: pairToken,
                authorization_code: code,
                code_verifier: verifier
            ))

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                finishWithError("KOKI не върна валиден отговор.")
                return
            }

            let decoded = try? JSONDecoder().decode(Response.self, from: data)
            guard (200..<300).contains(http.statusCode), decoded?.connected == true else {
                finishWithError("KOKI не завърши свързването: \(decoded?.error ?? "HTTP \(http.statusCode)")")
                return
            }

            isWorking = false
            statusText = "Kleinanzeigen е свързан успешно. Връщам те в KOKI…"
            pairToken = ""
            verifier = ""

            if let returnURL {
                try? await Task.sleep(for: .milliseconds(450))
                await UIApplication.shared.open(returnURL)
            }
        } catch {
            finishWithError("Свързването с KOKI не завърши: \(error.localizedDescription)")
        }
    }

    private func makePKCE() -> (verifier: String, challenge: String) {
        let verifier = randomURLSafe(bytes: 32)
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return (verifier, Data(digest).base64URLEncodedString())
    }

    private func randomURLSafe(bytes: Int) -> String {
        var data = Data(count: bytes)
        _ = data.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, bytes, buffer.baseAddress!)
        }
        return data.base64URLEncodedString()
    }

    private func fail(_ message: String) {
        authURL = nil
        isWorking = false
        errorText = message
        showError = true
        statusText = message
    }

    private func finishWithError(_ message: String) {
        callbackHandled = false
        fail(message)
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
