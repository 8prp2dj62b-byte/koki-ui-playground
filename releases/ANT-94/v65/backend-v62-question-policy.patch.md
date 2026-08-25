# ANT-94 backend v62 — minimum clarification policy

Target: `koki-command-center-staging-v28` v61 → v62.

## Code change

```diff
- const CONTRACT='KOKI_NEW_SALE_V1',REVIEW_CONTRACT='KOKI_NEW_SALE_REVIEW_V1',ENGINE='KOKI_NEW_SALE_AI_FIRST_VNEXT_V2';
+ const CONTRACT='KOKI_NEW_SALE_V1',REVIEW_CONTRACT='KOKI_NEW_SALE_REVIEW_V1',ENGINE='KOKI_NEW_SALE_AI_FIRST_VNEXT_V3';

+ function blockingProductQuestions(qs:any[]){
+   return (qs||[]).filter(q=>['IDENTITY','OLX_REQUIRED'].includes(String(q?.blocking_for||''))).slice(0,3)
+ }

- const PRODUCT=`... Ask at most 3 short Bulgarian questions only when required for identity, mandatory OLX data, truthful public listing or publish readiness. ...`;
+ const PRODUCT=`... Ask at most 3 short Bulgarian questions only when required for product identity or mandatory OLX data. Do not block on unknown optional condition details, repair history, accessories or other non-mandatory facts; omit unsupported claims from the public listing instead. ...`;

- const facts=mergeFacts(...),questions=(r.data.dynamic_questions||[]).slice(0,3),ctx=...
+ const facts=mergeFacts(...),questions=blockingProductQuestions(r.data.dynamic_questions||[]),ctx=...
```

## Rationale

Product Understanding runs before the validated OLX category schema exists. Optional AI questions labelled `TRUTHFUL_LISTING` or `PUBLISH` must not become hard blockers. Actual OLX-required fields are enforced later by `requiredQuestions(category_schema, confirmed_facts)`, while MASTER_LISTING is already forbidden from inventing unsupported facts.

## Regression canary

Source draft: `f9f7b4dd-f9b1-49e1-9ca0-5066e9d4b96e`.

Confirmed user additions: `battery_health=85%`, `storage_capacity=128GB`. Expected after fix: both remain CONFIRMED and optional repair/accessory questions do not block category/listing/review. Any actual OLX-required missing field may still block.