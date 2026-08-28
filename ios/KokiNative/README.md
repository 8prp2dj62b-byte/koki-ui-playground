# KOKI iOS native wrapper — Kleinanzeigen OAuth

Scope is intentionally isolated from the frozen KOKI web shell.

## Flow

1. The native app loads the existing production KOKI web shell in `WKWebView` using the default persistent website data store.
2. `Profile → Integrations → Kleinanzeigen` opens the existing isolated `/ui` integration route.
3. The `/ui` route calls the native JavaScript bridge `kokiNativeKleinanzeigen` with the already active KOKI access token.
4. The app presents an on-device `WKWebView` and opens the Kleinanzeigen Auth0 Authorization Code + PKCE flow.
5. The user enters credentials only inside `login.kleinanzeigen.de` on the iPhone. KOKI/Vercel/Supabase never receive the password.
6. The native navigation delegate intercepts the allowed Android HTTPS callback before it renders, validates `state`, extracts `code`, and sends only `authorization_code + code_verifier` to `koki-command-center-staging-v30/complete-code` using the active KOKI bearer.
7. Supabase exchanges and stores the Kleinanzeigen OAuth tokens using the existing account contract.
8. The native wrapper reloads KOKI after successful connection.

## Security boundaries

- No cloud/headless browser.
- No GitHub runner or Cloudflare tunnel.
- No copy/paste callback URL.
- No credential storage or credential proxying through KOKI.
- PKCE verifier and OAuth state exist only in app memory for the current attempt.
- Existing BUY/SELL/chat flows are untouched.

## Generate the Xcode project

The source uses XcodeGen so the generated `.xcodeproj` is not committed.

```bash
brew install xcodegen
cd ios/KokiNative
xcodegen generate
open KokiNative.xcodeproj
```

A simulator build requires no signing. Installing on a physical iPhone requires normal Apple code signing.
