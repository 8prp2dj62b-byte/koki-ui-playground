import SwiftUI

private struct NativeAuthRequest: Identifiable {
    let id = UUID()
    let accessToken: String
}

struct RootView: View {
    @State private var authRequest: NativeAuthRequest?
    @State private var reloadNonce = UUID()

    var body: some View {
        KokiWebView(reloadNonce: reloadNonce) { accessToken in
            authRequest = NativeAuthRequest(accessToken: accessToken)
        }
        .ignoresSafeArea(.container, edges: .bottom)
        .sheet(item: $authRequest) { request in
            KleinanzeigenOAuthView(accessToken: request.accessToken) { connected in
                authRequest = nil
                if connected {
                    reloadNonce = UUID()
                }
            }
        }
    }
}
