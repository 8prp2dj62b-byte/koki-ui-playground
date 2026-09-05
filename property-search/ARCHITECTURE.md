# KOKI Property Search / imot.bg — V1 Architecture Reference

## Data flow

```text
Human language
  -> Gemini intent compiler
  -> PropertySearchRequest JSON
  -> strict schema validation
  -> ImotClient.search(the same JSON object 1:1)
  -> native imot.bg search/detail resources
  -> deterministic parser + validator
  -> factual listing store + dedupe
  -> KOKI Buy grid
```

## Non-negotiable boundaries

1. Gemini owns intent only.
2. ImotClient owns all imot.bg-specific taxonomy, routes and HTTP requests.
3. imot.bg is the only source of listing facts.
4. Missing source fields are `null`.
5. No second AI pass is allowed over listing facts in V1.
6. Daily refresh reuses the saved PropertySearchRequest and does not call Gemini.
7. A real imot.bg listing ID is the listing identity; repeat discovery updates the same listing.
8. Saved-search ownership is KOKI application security context and is kept outside Gemini JSON.
9. Existing KOKI BUY/SELL conversation state machines are outside this bounded context.
10. Navigation redesign is outside V1; entry is currently inside Buy.

## Integrity rule

**NO SOURCE = NO FACT**
