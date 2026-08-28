import SwiftUI
import WebKit

struct KokiWebView: UIViewRepresentable {
    private static let rootURL = URL(string: "https://koki.tonyshodling.eu/koki-command-center")!

    let reloadNonce: UUID
    let onKleinanzeigenConnect: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "kokiNativeKleinanzeigen")

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        context.coordinator.webView = webView
        context.coordinator.lastReloadNonce = reloadNonce
        webView.load(URLRequest(url: Self.rootURL, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        guard context.coordinator.lastReloadNonce != reloadNonce else { return }
        context.coordinator.lastReloadNonce = reloadNonce
        webView.load(URLRequest(url: Self.rootURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "kokiNativeKleinanzeigen")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: KokiWebView
        weak var webView: WKWebView?
        var lastReloadNonce: UUID?

        init(parent: KokiWebView) {
            self.parent = parent
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "kokiNativeKleinanzeigen" else { return }
            guard let body = message.body as? [String: Any],
                  let accessToken = body["accessToken"] as? String,
                  !accessToken.isEmpty else { return }

            DispatchQueue.main.async { [parent] in
                parent.onKleinanzeigenConnect(accessToken)
            }
        }
    }
}
