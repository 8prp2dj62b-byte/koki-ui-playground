import SwiftUI

@main
struct KokiKleinanzeigenBridgeApp: App {
    @StateObject private var bridge = BridgeModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(bridge)
                .onOpenURL { url in
                    bridge.start(from: url)
                }
        }
    }
}

struct ContentView: View {
    @EnvironmentObject private var bridge: BridgeModel

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground).ignoresSafeArea()

            if let authURL = bridge.authURL {
                AuthWebView(url: authURL)
                    .environmentObject(bridge)
                    .ignoresSafeArea(edges: .bottom)
            } else {
                VStack(spacing: 14) {
                    Text("KOKI")
                        .font(.system(size: 28, weight: .black))
                    Text("Kleinanzeigen Bridge")
                        .font(.headline)
                    Text(bridge.statusText)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)

                    if bridge.isWorking {
                        ProgressView()
                            .padding(.top, 8)
                    }
                }
            }
        }
        .alert("Kleinanzeigen", isPresented: $bridge.showError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(bridge.errorText)
        }
    }
}
