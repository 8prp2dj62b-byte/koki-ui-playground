# KOKI Kleinanzeigen Auth Bridge v2

Isolated one-time browser bootstrap for Kleinanzeigen account linking. It is not part of KOKI BUY/SELL runtime.

## Runtime

Deploy this directory as a separate Vercel project with Root Directory `kleinanzeigen-bridge`.

No runtime environment variables are required.

Active endpoint: `POST /api/link` with the user's KOKI bearer token.

Login:

```json
{"email":"user@example.com","password":"..."}
```

Success:

```json
{"ok":true,"connected":true,"account":{"email":"user@example.com"}}
```

MFA required:

```json
{"ok":true,"mfa_required":true,"continuation":"..."}
```

MFA continuation:

```json
{"action":"otp","continuation":"...","code":"123456"}
```

The password exists only in request/process memory. MFA continuation state is AES-256-GCM encrypted with the active KOKI access token and expires after five minutes. The browser bridge never receives Kleinanzeigen access/refresh tokens: it sends only the PKCE authorization code and verifier server-to-server to the isolated Supabase integration endpoint, which performs the token exchange and one-time persistence.

## Supabase usage

No polling. One profile-validation RPC per explicit login/MFA action. One token-exchange/store call only after successful Kleinanzeigen authentication. Profile status is loaded only when the integration is opened and should remain session-cached by the KOKI UI.
