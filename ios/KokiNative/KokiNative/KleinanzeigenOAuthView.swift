import CryptoKit
import Security
import SwiftUI
import WebKit

private enum KleinanzeigenOAuthError: LocalizedError {
    case invalidLoginURL
    case cancelled
    case callbackError(String)
    case stateMismatch
    case missingCode
    case tokenExchange(Int)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidLoginURL: return "Неуспешно създаване на Kleinanzeigen login URL."
        case .cancelled: return "Свързването беше прекъснато."
        case .callbackError(let value): return "Kleinanzeigen върна грешка: \(value)"
        case .stateMismatch: return "OAuth state проверката не мина."
        case .missingCode: return "Kleinanzeigen callback-ът не съдържа authorization code."
        case .tokenExchange(let status): return "Token exchange не завърши (HTTP \(status))."
        case .invalidResponse: return "Невалиден отговор при запис на Kleinanzeigen token."
        }
    }
}

private enum PKCE {
    static func randomURLSafeBytes(count: Int) -> String {
        var data = Data(count: count)
        let status = data.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, count, buffer.baseAddress!)
        }
        precondition(status == errSecSuccess)
        return data.base64URLEncodedString()
    }

    static func challenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncodedString()
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

struct KleinanzeigenOAuthView: View {
    let accessToken: String
    let onFinished: (Bool) -> Void

    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            KleinanzeigenOAuthWebView(accessToken: accessToken) { result in
                switch result {
                case .success:
                    onFinished(true)
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
            .overlay(alignment: .bottom) {
                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.red)
                        .padding(12)
                        .frame(maxWidth: .infinity)
                        .background(.ultraThinMaterial)
                }
            }
            .navigationTitle("Kleinanzeigen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Затвори") {
                        onFinished(false)
                    }
                }
            }
        }
    }
}

private struct KleinanzeigenOAuthWebView: UIViewRepresentable {
    private static let clientID = "uV5j90myVPc2XzEOFuWUD2At17OACEGQ"
    private static let redirectURI = "https://login.kleinanzeigen.de/android/com.ebay.kleinanzeigen/callback"
    private static let authorizeEndpoint = "https://login.kleinanzeigen.de/authorize"
    private static let completeEndpoint = URL(string: "https://aqhdzfsspmuvadnlchvj.supabase.co/functions/v1/koki-command-center-staging-v30/complete-code")!

    let accessToken: String
    let onResult: (Result<Void, Error>) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(accessToken: accessToken, onResult: onResult)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView

        guard let loginURL = context.coordinator.loginURL else {
            DispatchQueue.main.async {
                onResult(.failure(KleinanzeigenOAuthError.invalidLoginURL))
            }
            return webView
        }

        webView.load(URLRequest(url: loginURL, cachePolicy: .reloadIgnoringLocalCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let accessToken: String
        let onResult: (Result<Void, Error>) -> Void
        let verifier: String
        let state: String
        let loginURL: URL?
        weak var webView: WKWebView?
        private var completing = false

        init(accessToken: String, onResult: @escaping (Result<Void, Error>) -> Void) {
            self.accessToken = accessToken
            self.onResult = onResult
            self.verifier = PKCE.randomURLSafeBytes(count: 32)
            self.state = PKCE.randomURLSafeBytes(count: 16)

            var components = URLComponents(string: KleinanzeigenOAuthWebView.authorizeEndpoint)
            components?.queryItems = [
                URLQueryItem(name: "client_id", value: KleinanzeigenOAuthWebView.clientID),
                URLQueryItem(name: "response_type", value: "code"),
                URLQueryItem(name: "redirect_uri", value: KleinanzeigenOAuthWebView.redirectURI),
                URLQueryItem(name: "scope", value: "openid email profile offline_access"),
                URLQueryItem(name: "code_challenge", value: PKCE.challenge(for: verifier)),
                URLQueryItem(name: "code_challenge_method", value: "S256"),
                URLQueryItem(name: "state", value: state),
                URLQueryItem(name: "prompt", value: "login")
            ]
            self.loginURL = components?.url
            super.init()
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url,
                  url.absoluteString.hasPrefix(KleinanzeigenOAuthWebView.redirectURI) else {
                decisionHandler(.allow)
                return
            }

            decisionHandler(.cancel)
            complete(with: url)
        }

        private func complete(with callbackURL: URL) {
            guard !completing else { return }
            completing = true

            let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
            let values = Dictionary(uniqueKeysWithValues: (components?.queryItems ?? []).map { ($0.name, $0.value ?? "") })

            if let error = values["error"], !error.isEmpty {
                finish(.failure(KleinanzeigenOAuthError.callbackError(error)))
                return
            }
            guard values["state"] == state else {
                finish(.failure(KleinanzeigenOAuthError.stateMismatch))
                return
            }
            guard let code = values["code"], !code.isEmpty else {
                finish(.failure(KleinanzeigenOAuthError.missingCode))
                return
            }

            Task {
                do {
                    var request = URLRequest(url: KleinanzeigenOAuthWebView.completeEndpoint)
                    request.httpMethod = "POST"
                    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.cachePolicy = .reloadIgnoringLocalCacheData
                    request.timeoutInterval = 32
                    request.httpBody = try JSONSerialization.data(withJSONObject: [
                        "authorization_code": code,
                        "code_verifier": verifier
                    ])

                    let (data, response) = try await URLSession.shared.data(for: request)
                    guard let http = response as? HTTPURLResponse else {
                        throw KleinanzeigenOAuthError.invalidResponse
                    }
                    guard (200..<300).contains(http.statusCode) else {
                        throw KleinanzeigenOAuthError.tokenExchange(http.statusCode)
                    }
                    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                    guard json?["connected"] as? Bool == true else {
                        throw KleinanzeigenOAuthError.invalidResponse
                    }
                    finish(.success(()))
                } catch {
                    finish(.failure(error))
                }
            }
        }

        private func finish(_ result: Result<Void, Error>) {
            DispatchQueue.main.async { [onResult] in
                onResult(result)
            }
        }
    }
}
