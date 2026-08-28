# KOKI Bridge — iOS

Isolated native OAuth companion used only for Kleinanzeigen account linking.

## Flow

1. KOKI PWA calls `POST /native/start`.
2. Backend creates a single-use 10-minute state + PKCE session.
3. KOKI opens `koki://kleinanzeigen/connect?...`.
4. KOKI Bridge loads the Kleinanzeigen authorize URL in a user-driven `WKWebView` on the iPhone.
5. The user enters credentials directly into Kleinanzeigen. Credentials never pass through KOKI, Supabase, Vercel or GitHub.
6. `WKNavigationDelegate` intercepts the registered Kleinanzeigen Android HTTPS callback before navigation.
7. Bridge validates OAuth `state` and sends only `session_id`, `state` and `authorization_code` to `POST /native/complete`.
8. Backend uses the server-held PKCE verifier, exchanges the code, stores the Kleinanzeigen tokens and marks the session used.
9. Bridge opens KOKI again.

## Security properties

- No password storage or credential proxying.
- Single-use OAuth session, 10-minute expiry.
- State is stored hashed server-side.
- PKCE verifier stays server-side.
- Native completion endpoint requires possession of the unguessable state and matching session.
- Legacy GitHub/Vercel browser bridge paths are disabled.

## Build

The project is generated with XcodeGen:

```sh
cd native/ios/KokiBridge
xcodegen generate
xcodebuild -project KokiBridge.xcodeproj -scheme KokiBridge -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Installing on a physical iPhone requires normal Apple code signing. This module does not change the KOKI PWA core.
