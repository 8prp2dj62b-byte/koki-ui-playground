# ANT-94 — Simple New Sale production release — 2026-08-25

## Canonical pipeline
1. Short description + condition + photos
2. Gemini receives complete current OLX taxonomy and selects category
3. KOKI validates selected category exists and is a leaf
4. Gemini-only market research; optional
5. Gemini final marketing copy using all previous context, including market when present
6. Preview
7. Publish after explicit user confirmation

If Gemini market research returns no usable result, `market_comparison` is NULL and the Preview contains no market section.

## Production components
- `koki-command-center-staging-v28` v64 ACTIVE — `KOKI_NEW_SALE_BASE_SIMPLE_V1` — SHA256 `347cad7204c85a91331319a1c0b2a635ece02ee03fc02ddb6072f19e11de133b`
- `koki-command-center-staging-v49` v24 ACTIVE — `KOKI_GEMINI_ONLY_MARKET_V1` — SHA256 `d5ea03d2eb7500f5fc377355850eee569cef31a29173acd476f0d8d00ea42d7a`
- `koki-command-center-staging-v50` v26 ACTIVE — `KOKI_NEW_SALE_SIMPLE_V1` — SHA256 `d4695342d0f0206791faae1c7d78543122b967a086bf395fd7c324eaa4d3abfa`
- production shell build `authoritative-redesign-v67-ant94-simple-pipeline`
- production shell MD5 `3a89afabd4c22df72876cea17b1f3db3`
- rollback shell `backup-pre-simple-pipeline-ant94-20260825-1909`

## QA evidence
- v28 QA PASS: Gemini full OLX taxonomy category authority; OLX suggestion disabled; no listing generation; no market research in base.
- v50 unit QA: 5/5 PASS.
- Exact QA replay from latest iPhone listing: draft `5ceefb07-83ee-4024-a65c-ee8e396fc659`, operation `f0a69cce-8a65-4be2-af65-64a0c0c9cb46`, external write false.
- Gemini chose and KOKI validated OLX leaf category 454 / iPhone.
- Runtime order confirmed by AI usage timestamps: `PRODUCT_AND_CATEGORY` → `MARKET_RESEARCH_GEMINI_ONLY` → `FINAL_MARKETING_AFTER_MARKET`.
- Market returned READY: 1050–1300 EUR, mean 1150 EUR.
- Final marketing title: `Apple iPhone 16 Pro 512GB`.
- Final Preview: REVIEW_READY, review_version 2, payload hash `5266a8e6ea0a1ef20420153bc8cb5123ed0d03d8b219d360231388a0bb7f07c3`.
- No external OLX write performed.
- Production command-center GET: HTTP 200.

## Cleanup
- `market_comparison` is nullable; NULL is the canonical no-market value.
- Removed legacy v27 minute cron, legacy research trigger, and three legacy research DB functions.
- No remaining DB/cron references to staging-v27 or staging-v47.
- Removed obsolete Git experiment directories: `koki-market-research-ai-only-v70`, `koki-market-research-v68`, `koki-market-research-v66`, `koki-new-sale-v66`.
- Operational function sources in this branch are only v28, v49 and v50.

## FE scope
Only `showReview` changed. Prefix and suffix versus rollback shell are byte-identical. Market metric/summary are rendered only when a valid market range exists. Legacy background-market copy was removed. BUY/SELL and the rest of the shell are unchanged.
