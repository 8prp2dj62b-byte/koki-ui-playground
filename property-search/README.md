# KOKI Property Search / imot.bg V1

Isolated property-search bounded context for KOKI.

## Hard architecture rule

```text
Human language
  -> Gemini PropertySearchRequest JSON
  -> ImotClient.search(the exact same JSON object)
  -> imot.bg
  -> deterministic source parser
  -> SQLite dedupe/store
  -> KOKI factual grid
```

Gemini has no path to listing facts. It does not browse, create listings, URLs, phone numbers, prices, IDs, contacts, images or source taxonomy values.

`NO SOURCE = NO FACT`.

## Runtime

Node.js 22+.

```bash
cd property-search
npm install
export GEMINI_API_KEY='...'
npm run typecheck
npm test
```

Persistence is local SQLite by default:

```text
./data/koki-property-search.sqlite
```

Override with:

```bash
KOKI_PROPERTY_DB=/var/lib/koki/property-search.sqlite
```

No Supabase dependency is used by this module.

## HTTP mounting and KOKI ownership

The KOKI host authenticates the request with its existing auth and resolves the current KOKI owner/profile before dispatching to the module.

```ts
const handler = createPropertySearchHttpHandler(service, {
  resolveOwner: async (req) => {
    const session = await existingKokiAuth(req);
    return session?.profileId ?? null;
  },
});
```

Mount the handler for `/api/property-search/*`.

The owner identifier is application security context, not search intent. It never enters the Gemini prompt or `PropertySearchRequest`, so the hard 1:1 contract remains:

```text
Gemini output JSON === ImotClient.search() input JSON
```

Saved searches are scoped by `owner_key`; another KOKI profile cannot read or mutate them by knowing a search UUID.

The property-search module intentionally does not create a second login/authentication system.

## Buy UI entry

Load this file after the existing KOKI page runtime:

```html
<script src="./property-search/buy-entry.js"></script>
```

It adds one isolated card inside the existing **Купува** screen and creates a separate `property-search` screen. Existing SELL/BUY conversation logic is not modified. Navigation redesign is intentionally out of scope for V1.

The browser talks to same-origin `/api/property-search` by default. If the host mounts it elsewhere:

```js
window.KOKI_PROPERTY_SEARCH_API_BASE = '/your/path';
```

If KOKI needs custom request auth headers:

```js
window.KOKI_PROPERTY_SEARCH_AUTH_HEADERS = async () => ({
  Authorization: 'Bearer ...'
});
```

## Daily refresh

Saved searches store the compiled Gemini JSON. Daily refresh never calls Gemini again.

```bash
npm run refresh:daily
```

Example cron (host-level example only):

```cron
17 6 * * * cd /opt/koki/property-search && /usr/bin/npm run refresh:daily >> /var/log/koki-property-search.log 2>&1
```

The scheduler should be owned by the KOKI host. Do not run one crawler job per listing.

## Dedupe

A real imot.bg `listingId` is the identity of a listing. A listing already known to KOKI is updated in place. It is not inserted again as a new result.

States:

```text
NEW
SEEN
SAVED
DISMISSED
INACTIVE
```

`DISMISSED` results stay hidden for that saved search. A listing that disappears from the current result set becomes `INACTIVE`. A previously inactive listing that reappears is surfaced as `NEW` again.

Source fingerprints exclude `fetchedAt`, so a routine daily fetch cannot create a false change event. Real source fields such as price, description, photos or contact data do change the fingerprint.

## V1 imot taxonomy

V1 intentionally starts narrow and deterministic. The confirmed route used for the initial scenario is:

```text
sale + Bansko + 3-room
-> https://www.imot.bg/obiavi/prodazhbi/oblast-blagoevgrad/gr-bansko/tristaen
```

Other cities/types are mapped inside `ImotClient`; unsupported taxonomy fails closed with `IMOT_TAXONOMY_RESOLUTION_FAILED` / `IMOT_PROPERTY_TYPE_UNSUPPORTED` rather than guessing a route.

## Source integrity

User-facing values are rendered only from normalized source objects returned by `ImotClient`.

- phone: only from a source `tel:` value; otherwise `null`
- inquiry/contact: only from a source contact link; otherwise `null`
- canonical URL: only a validated `imot.bg` URL
- image URLs: only URLs found in the source HTML
- missing field: `null`

No AI fallback exists for source data.
