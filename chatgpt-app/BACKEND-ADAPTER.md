# KOKI ChatGPT backend adapter contract

## Principle

The ChatGPT App is a second KOKI client. It MUST NOT contain marketplace, Gemini, pricing, classification or negotiation business logic. Production KOKI remains the single source of truth.

Core operations use one internal endpoint:

`POST /api/chatgpt/v1/actions`

Request:

```json
{
  "action": "get_conversation",
  "arguments": { "conversationId": "..." }
}
```

Success:

```json
{
  "ok": true,
  "conversation": { "...": "canonical KOKI state" }
}
```

Failure:

```json
{
  "ok": false,
  "error": "STABLE_KOKI_ERROR_CODE"
}
```

The adapter authenticates the KOKI user first, validates ownership for every entity and delegates to the same services used by the PWA/admin runtime. No call below may call OLX/Kleinanzeigen/Gemini directly from the adapter.

## Action mapping

| ChatGPT action | Delegate to existing KOKI domain operation | Mutation |
|---|---|---:|
| `get_dashboard` | dashboard/current-operations query | no |
| `get_status` | KOKI health/integration query | no |
| `list_buy` | BUY operations query | no |
| `list_sell` | SELL listings/operations query | no |
| `get_listing` | listing detail query | no |
| `refresh_listings` | existing marketplace sync coordinator | yes |
| `get_conversations` | conversation query | no |
| `get_conversation` | canonical conversation context query | no |
| `refresh_conversation` | existing chat sync coordinator | yes |
| `send_message` | existing user/admin send service | yes/external |
| `start_negotiation` | automation ownership service | yes |
| `stop_negotiation` | automation ownership service | yes |
| `take_over_conversation` | human takeover service | yes |
| `return_to_koki` | return-to-KOKI service | yes |
| `archive_conversation` | conversation archive service | destructive |
| `get_decisions` | decision queue query | no |
| `resolve_decision` | existing decision resolver | yes/external possible |
| `list_property_searches` | property-search store query | no |
| `create_sell_draft` | new-sale draft service | yes |
| `get_sell_draft` | new-sale draft query | no |
| `update_sell_draft` | draft mutation service | yes |
| `prepare_sell_upload` | media upload-target service | yes |
| `analyze_sell_draft` | frozen AI-first product/category pipeline | yes |
| `analyze_market` | frozen market-analysis pipeline | yes |
| `optimize_sell_draft` | frozen title/description proposal pipeline | yes |
| `validate_sell_draft` | current publish readiness validator | no |
| `publish_sell_draft` | current idempotent marketplace publish service | yes/external |
| `delete_sell_draft` | permanent draft deletion service | destructive |
| `get_notifications` | notification query | no |
| `mark_notifications_read` | notification read-state service | yes |
| `get_profile` | KOKI profile query | no |
| `update_profile` | KOKI-owned profile mutation | yes |
| `get_connections` | marketplace connection-state query | no |
| `connect_marketplace` | existing marketplace auth/link flow | yes |
| `disconnect_marketplace` | existing disconnect service | destructive |
| `get_settings` | user settings query | no |
| `update_settings` | settings mutation service | yes |

The existing imot.bg property-search HTTP API is intentionally called directly by the MCP gateway because it already exposes an authenticated, ownership-checked KOKI service contract:

- `POST /api/property-search/searches`
- `GET /api/property-search/searches/:id`
- `GET /api/property-search/searches/:id/results`
- `POST /api/property-search/searches/:id/refresh`
- `POST /api/property-search/searches/:id/criteria`
- `PATCH /api/property-search/searches/:id/status`
- `PATCH /api/property-search/searches/:id/results/:listingId`

## Security invariants

1. Resolve the authenticated KOKI user server-side. Never trust `ownerId`/`userId` supplied as action arguments.
2. Validate entity ownership before every listing, conversation, draft, search or notification operation.
3. Never return marketplace cookies, tokens, passwords, Supabase secrets, Gemini keys or internal credentials.
4. Preserve existing BUY/SELL classification rules; FE does not classify.
5. Preserve full-context Gemini invocation semantics; ChatGPT App never generates marketplace replies itself.
6. Preserve idempotency for external sends and publishes. Accept/derive an idempotency key in the existing domain service, not in marketplace clients in the UI.
7. Log `source=CHATGPT_APP`, action, KOKI user, target entity, result and timestamp for every write.
8. `publish_sell_draft`, `send_message`, `resolve_decision` and automation changes must fail closed on stale ownership/review state.
9. Do not move primary auth, database or business flow to Supabase. Existing KOKI backend remains primary; Supabase remains backup/recovery only.

## Media upload response

`prepare_sell_upload` returns up to five short-lived upload targets:

```json
{
  "ok": true,
  "uploadTargets": [
    {
      "id": "media-id",
      "uploadUrl": "https://koki-host/...",
      "method": "PUT",
      "headers": { "content-type": "image/jpeg" },
      "key": "opaque-storage-reference"
    }
  ]
}
```

The widget uploads bytes directly to the KOKI-controlled upload target. The target origin must be included in `KOKI_UPLOAD_ORIGINS`. After successful uploads the widget calls `update_sell_draft` with opaque media references. ChatGPT/MCP never receives or stores marketplace credentials.

## Auth

The MCP gateway forwards an incoming KOKI access bearer to the backend. During private single-user development a `KOKI_SERVICE_TOKEN` may be used only as an explicit temporary development configuration. Public/multi-user deployment must use the real KOKI authorization flow with short-lived user tokens.
