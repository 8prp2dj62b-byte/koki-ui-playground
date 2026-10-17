# KOKI ChatGPT App

Interactive KOKI frontend inside ChatGPT, implemented with the current MCP Apps standard.

## Architecture

```text
ChatGPT
  ├─ natural language
  └─ KOKI interactive widget
          │ MCP Apps
          ▼
KOKI ChatGPT Gateway
          │ authenticated internal API
          ▼
KOKI Backend (source of truth)
  ├─ Gemini orchestration
  ├─ BUY / SELL
  ├─ conversations / negotiation
  ├─ listing creation / publish
  ├─ notifications / profile
  ├─ OLX adapter
  ├─ Kleinanzeigen adapter
  └─ imot.bg property-search
```

The ChatGPT app does not implement marketplace business logic and does not use Supabase as a primary auth/database/business-flow component.

## What is implemented

- Dashboard / current operations / system health
- BUY operations
- SELL listings
- Listing detail
- Conversations with original + Bulgarian translation rendering
- Manual refresh and copy-all
- Send message
- Start/stop KOKI negotiation
- Human takeover / return to KOKI
- Archive conversation
- Decision queue: accept / counter / continue / archive
- Saved property searches
- Bulgarian natural-language imot.bg search
- Real search results / refresh / add criterion / save / dismiss
- SELL draft wizard
- Up to five image upload targets
- Condition / title / description / price
- Product/category analysis
- Market-price analysis
- Title/description optimization
- Review validation / publish / delete draft
- Notifications / read state
- Profile / marketplace connections
- Settings
- Frozen KOKI Mineral Spectrum design tokens and semantic roles
- Self-contained widget build for ChatGPT iframe/CSP stability
- Read/write/destructive MCP annotations
- Explicit in-widget confirmation for destructive/high-consequence actions
- Mock mode for UI/contract testing without production writes

## Environment

```bash
PORT=8787
PUBLIC_BASE_URL=https://chatgpt-koki.example.com
KOKI_API_BASE_URL=https://koki-internal.example.com
KOKI_API_TIMEOUT_MS=20000
KOKI_UPLOAD_ORIGINS=https://uploads.example.com
```

Authentication options:

```bash
# Preferred: incoming short-lived KOKI bearer forwarded from ChatGPT authorization.

# Temporary private-development fallback only:
KOKI_SERVICE_TOKEN=...
KOKI_OWNER_KEY=...
```

Local safe preview:

```bash
KOKI_MOCK_MODE=1
```

## Build

```bash
npm install
npm run build
npm test
npm start
```

Health:

```text
GET /health
```

MCP endpoint to register in ChatGPT Developer Mode / app configuration:

```text
https://<public-koki-app-host>/mcp
```

## Backend integration

Property search already uses the concrete repository contract under `/api/property-search/*`.

All other KOKI functions use the narrow internal adapter:

```text
POST /api/chatgpt/v1/actions
```

See `BACKEND-ADAPTER.md` for action-by-action delegation and security invariants.

## Deployment rule

Deploy this service as a separate process/container beside KOKI. Do not replace or mutate the frozen PWA runtime. The gateway calls the existing KOKI backend and can be independently rolled back.

Recommended public route:

```text
https://chatgpt.koki.<domain>/mcp
```

or a dedicated path behind the existing reverse proxy:

```text
https://<koki-domain>/chatgpt/mcp
```

The public endpoint must be HTTPS.

## Safety / audit

- External writes remain KOKI-domain writes, not direct marketplace requests from ChatGPT.
- Marketplace credentials never enter widget structured content.
- The backend must validate owner/entity authorization on every action.
- Every write should be logged with `source=CHATGPT_APP`.
- Publish and message sends remain idempotent through the existing domain service.
- Stale review/ownership state fails closed.
