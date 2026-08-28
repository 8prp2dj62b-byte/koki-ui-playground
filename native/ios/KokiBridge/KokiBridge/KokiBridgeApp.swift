import SwiftUI
import WebKit
import UIKit

private let backendBase = URL(string: "https://aqhdzfsspmuvadnlchvj.supabase.co/functions/v1/koki-command-center-staging-v30")!
private let callbackHost = "login.kleinanzeigen.de"
private let callbackPath = "/android/com.ebay.kleinanzeigen/callback"

@main
struct KokiBridgeApp: App {
    @StateObject private var model = BridgeModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .onOpenURL { url in
                    model.handleDeepLink(url)
                }
        }
    }
}

@MainActor
final class BridgeModel: ObservableObject {
    @Published var status = "Отвори Kleinanzeigen интеграцията от KOKI."
    @Published var detail = ""
    @Published var authorizeURL: URL?
    @Published var isWorking = false

    private var sessionID = ""
    private var state = ""

    func handleDeepLink(_ url: URL) {
        guard url.scheme == "koki",
              url.host == "kleinanzeigen",
              url.path == "/connect",
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let session = parts.queryItems?.first(where: { $0.name == "session_id" })?.value,
              let state = parts.queryItems?.first(where: { $0.name == "state" })?.value,
              !session.isEmpty,
              !state.isEmpty else {
            status = "Невалидна KOKI login сесия."
            detail = "Върни се в KOKI → Интеграции → Kleinanzeigen и стартирай отново."
            return
        }

        self.sessionID = session
        self.state = state
        status = "Подготвям Kleinanzeigen login…"
        detail = "Сесията е еднократна и изтича автоматично."
        isWorking = true

        Task { await loadAuthorizeURL() }
    }

    private func loadAuthorizeURL() async {
        do {
            var components = URLComponents(url: backendBase.appendingPathComponent("native/session"), resolvingAgainstBaseURL: false)!
            components.queryItems = [
                URLQueryItem(name: "session_id", value: sessionID),
                URLQueryItem(name: "state", value: state)
            ]
            guard let url = components.url else { throw BridgeError.invalidURL }

            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.timeoutInterval = 20
            request.cachePolicy = .reloadIgnoringLocalCacheData

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw BridgeError.sessionUnavailable
            }
            let payload = try JSONDecoder().decode(SessionResponse.self, from: data)
            guard payload.ok, let authorize = URL(string: payload.authorize_url) else {
                throw BridgeError.sessionUnavailable
            }

            status = "Влез в Kleinanzeigen"
            detail = "Login-ът е директно на този iPhone. KOKI не вижда и не съхранява паролата ти."
            authorizeURL = authorize
            isWorking = false
        } catch {
            authorizeURL = nil
            isWorking = false
            status = "Не успях да подготвя login-а."
            detail = error.localizedDescription
        }
    }

    func handleNavigation(_ url: URL) -> Bool {
        guard url.host == callbackHost, url.path == callbackPath else { return false }

        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            fail("Невалиден Kleinanzeigen callback.")
            return true
        }

        if let error = parts.queryItems?.first(where: { $0.name == "error" })?.value {
            fail("Kleinanzeigen прекрати login-а: \(error)")
            return true
        }

        guard let returnedState = parts.queryItems?.first(where: { $0.name == "state" })?.value,
              returnedState == state else {
            fail("OAuth state проверката не мина.")
            return true
        }

        guard let code = parts.queryItems?.first(where: { $0.name == "code" })?.value,
              !code.isEmpty else {
            fail("Kleinanzeigen не върна authorization code.")
            return true
        }

        authorizeURL = nil
        status = "Завършвам свързването…"
        detail = "Authorization code е получен. Записвам token-а в KOKI."
        isWorking = true
        Task { await complete(code: code) }
        return true
    }

    private func complete(code: String) async {
        do {
            let url = backendBase.appendingPathComponent("native/complete")
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 35
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(CompleteRequest(
                session_id: sessionID,
                state: state,
                authorization_code: code
            ))

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw BridgeError.badResponse }
            let payload = try JSONDecoder().decode(CompleteResponse.self, from: data)
            guard http.statusCode == 200, payload.ok, payload.connected else {
                throw BridgeError.completeFailed(payload.error ?? "HTTP \(http.statusCode)")
            }

            isWorking = false
            status = "Kleinanzeigen е свързан успешно."
            detail = "Връщам те към KOKI."
            sessionID = ""
            state = ""

            let returnURL = URL(string: payload.return_url ?? "https://koki.tonyshodling.eu/koki-command-center?ka_native=connected")!
            try? await Task.sleep(for: .milliseconds(450))
            UIApplication.shared.open(returnURL)
        } catch {
            isWorking = false
            status = "Свързването не завърши."
            detail = error.localizedDescription
        }
    }

    private func fail(_ message: String) {
        authorizeURL = nil
        isWorking = false
        status = "Свързването не завърши."
        detail = message
    }
}

struct ContentView: View {
    @EnvironmentObject private var model: BridgeModel

    var body: some View {
        ZStack {
            Color(uiColor: .systemGroupedBackground).ignoresSafeArea()

            if let url = model.authorizeURL {
                OAuthWebView(url: url) { callbackURL in
                    _ = model.handleNavigation(callbackURL)
                }
                .ignoresSafeArea(edges: .bottom)
            } else {
                VStack(spacing: 14) {
                    Text("KOKI · Kleinanzeigen")
                        .font(.title2.bold())
                    if model.isWorking {
                        ProgressView()
                            .controlSize(.large)
                    }
                    Text(model.status)
                        .font(.headline)
                        .multilineTextAlignment(.center)
                    if !model.detail.isEmpty {
                        Text(model.detail)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(24)
            }
        }
    }
}

struct OAuthWebView: UIViewRepresentable {
    let url: URL
    let onCallback: (URL) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCallback: onCallback) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let onCallback: (URL) -> Void

        init(onCallback: @escaping (URL) -> Void) {
            self.onCallback = onCallback
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if let url = navigationAction.request.url,
               url.host == callbackHost,
               url.path == callbackPath {
                onCallback(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}

private struct SessionResponse: Decodable {
    let ok: Bool
    let authorize_url: String
}

private struct CompleteRequest: Encodable {
    let session_id: String
    let state: String
    let authorization_code: String
}

private struct CompleteResponse: Decodable {
    let ok: Bool
    let connected: Bool
    let return_url: String?
    let error: String?
}

private enum BridgeError: LocalizedError {
    case invalidURL
    case sessionUnavailable
    case badResponse
    case completeFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Невалиден backend URL."
        case .sessionUnavailable: return "KOKI login сесията е невалидна или е изтекла."
        case .badResponse: return "Невалиден отговор от KOKI backend."
        case .completeFailed(let detail): return "Token exchange не завърши: \(detail)"
        }
    }
}
