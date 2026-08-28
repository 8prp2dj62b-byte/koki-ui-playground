# KOKI Kleinanzeigen Auth Bridge v1

Isolated one-time browser bootstrap for Kleinanzeigen account linking. It is not part of KOKI BUY/SELL runtime.

## Runtime

Deploy this directory as a separate Vercel project with Root Directory `kleinanzeigen-bridge`.

Required environment variables:

- `KOKI_ORIGIN=https://koki.tonyshodling.eu`
- `SUPABASE_URL=https://aqhdzfsspmuvadnlchvj.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=<KOKI publishable key>`
- `KLEINANZEIGEN_STORE_URL=https://aqhdzfsspmuvadnlchvj.supabase.co/functions/v1/koki-command-center-staging-v30/store`
- `BRIDGE_SESSION_SECRET=<random 32+ byte secret>`

## Contract

`POST /api` with the user's KOKI bearer token.

Login:

```json
{"action":"login","email":"user@example.com","password":"..."}
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

The password is held only in the request/process memory and is never written to Supabase. MFA continuation state is AES-256-GCM encrypted and expires after five minutes. Tokens are sent server-to-server to the isolated Supabase integration endpoint and are never returned to the PWA.

## Supabase usage

No polling. One KOKI-profile validation call per explicit login/MFA action. One token-store call only after successful Kleinanzeigen authentication. Status is expected to be lazy-loaded and cached by the KOKI Profile UI.
