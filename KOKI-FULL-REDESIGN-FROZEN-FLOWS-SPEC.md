# KOKI — Full Redesign Specification

**Status:** SPECIFICATION ONLY — NO IMPLEMENTATION  
**Scope:** Full application redesign using the frozen KOKI Design System over all frozen product flows  
**Primary references:** `design-system-freeze-registry.md`, `frozen-flow-registry.md`, `prototype.html` / `prototype-v1.html`, canonical frozen flow sources  
**Critical principle:** **Frozen flow defines what exists and how it behaves. Frozen Design System defines how it looks.**  
**Production rule:** This document does **not** authorize implementation, deployment, schema migration, prompt changes, production configuration changes, OLX changes or Gemini changes. A separate explicit implementation approval is required.

---

## 1. Executive decision

The KOKI redesign shall be implemented as a **UI/application-layer replacement over frozen functional flows**, not as a product rewrite.

The redesign must preserve the frozen business structure, transitions, AI-first philosophy, Gemini orchestration semantics, OLX integration semantics, risk controls, human takeover, notifications, auditability and domain logic. The redesign may change composition, visual hierarchy, responsive behavior, navigation presentation, progressive disclosure and interaction ergonomics only where these changes are already represented by the frozen flows and frozen Design System.

The clickable prototype is a **behavioral/composition validation artifact**. It is not allowed to override a frozen business rule. If the prototype conflicts with a frozen flow, the frozen flow wins. If a Design System component conflicts with business meaning, business meaning wins and a separate Design System amendment must be approved before implementation.

### 1.1 Target result

One cohesive KOKI PWA with:

- Login
- Dashboard
- SELL
- BUY
- New Listing
- Messages
- Profile

all using one frozen KOKI Core Design Language, one state vocabulary, one navigation grammar and one AI transparency grammar.

### 1.2 Non-goals

This redesign must **not**:

- replace Gemini or introduce a new default AI provider;
- change the principle that Gemini receives the full relevant conversation/context/strategy/insights/state for AI turns;
- change existing BUY negotiation philosophy;
- split SELL into a separate architecture;
- remove risk/scam controls, stuck detection, audit/events, notifications or human takeover;
- introduce new user-facing product modules not present in frozen flows;
- redesign backend APIs merely to fit visual components;
- hardcode OLX taxonomy;
- introduce scraping where an authorized API/integration is required;
- expose private minimums or owner-private pricing constraints;
- silently redefine any frozen Design System token/component;
- modify production during prototype/design validation.

---

## 2. Source-of-truth hierarchy

When requirements disagree, implementation must use this precedence:

1. **Frozen Flow Registry** — structure, business meaning, screens, states and transitions.
2. **Frozen canonical flow source/baseline** — detailed functional behavior of the specific flow.
3. **Frozen Design System Registry** — visual tokens, components, interaction grammar and platform adaptation.
4. **Clickable prototype** — composition and interaction reference only.
5. **Current production behavior** — reference for unchanged integrations and regression compatibility.

No engineer may resolve a conflict by silently changing a frozen flow or Design System layer.

---

## 3. Full-team review model

This specification is organized as a consolidated review package for the complete development team roles:

| Role | Mandatory responsibility in implementation review |
|---|---|
| Master Architect | Preserve domain boundaries, orchestration, state ownership and rollback safety |
| Master BA | Validate frozen business flows, state transitions and acceptance criteria |
| Master UX | Validate frozen IA + Design System application; no business-function invention |
| Frontend/PWA | Implement components, responsive recomposition, routing, state restoration and accessibility |
| Backend | Preserve API compatibility; expose only missing state required by frozen flows via separately approved contract changes |
| AI/Gemini | Preserve full-context invocation, agent boundaries, evidence/confidence semantics and private-data isolation |
| OLX Integration | Preserve authorized API behavior, dynamic category/attribute handling, media and idempotent publish behavior |
| Security / White-hat | Auth, session, passkey, data isolation, IDOR, injection, secrets, privacy and destructive-action review |
| QA Automation | Contract, component, integration, E2E, visual and regression suites |
| Manual QA | Real mobile-browser/PWA interaction, interruption/recovery, gesture, keyboard, navigation and edge-case testing |
| DevOps / Observability | Feature-flag/canary, telemetry, failure visibility and rollback readiness |

Implementation sign-off is invalid if one of Architecture, BA, UX, Security or QA has unresolved P0/P1 findings.

---

# 4. Cross-application functional changes

## 4.1 Unified navigation and shell

The redesigned application shall use the frozen Navigation Components and preserve the frozen product destinations.

### Required behavior

- Desktop uses the frozen persistent sidebar / collapsed rail behavior.
- Mobile uses the frozen five-position icon-first primary navigation grammar.
- Top utilities keep notifications/theme/profile where required by the corresponding frozen flow.
- Local tabs remain local navigation and must never be promoted into global navigation.
- Back behavior must return to the correct parent context rather than a generic home screen.
- Deep links from Messages must resolve directly to the referenced context.
- Browser refresh / PWA resume must restore the active context where state is safe to restore.

### Functional impact

This is not only visual. Routing must become consistent across all frozen flows, with stable route/context identifiers and deterministic return behavior.

---

## 4.2 Common operational state model

User-facing operational states are frozen as:

- Attention
- Active
- Waiting
- Inactive
- Completed

Severity is a separate axis:

- Info
- Positive
- Warning
- Critical

### Required invariant

Operational state must never imply severity. Example: `Waiting` is not automatically a warning; `Attention` is not automatically critical.

All screens must consume the same state/severity mapping. No screen may create local status colors, badges or labels.

---

## 4.3 AI transparency model

All KOKI intelligence surfaces must follow the frozen grammar:

**Signal → Reason → Evidence → Confidence → Control**

The redesign must expose, where relevant:

- what KOKI recommends or is doing;
- why;
- the supporting evidence/context;
- confidence/uncertainty;
- who currently owns control;
- how the user can intervene.

No generic “AI card”, mystery score, glow/sparkle treatment or unexplained recommendation is allowed.

---

## 4.4 Content model

The frozen content model is:

- **Scan** — dense operational overview;
- **Identify** — media-assisted entity recognition;
- **Inspect** — focused deep context.

Implementation must choose the presentation mode based on information weight, not backend entity type.

Repeated content must not become one card per object by default. Media is shown only when it materially improves identification/evaluation.

---

## 4.5 Selection and bulk actions

Selection must be an explicit temporary mode.

- browse mode contains no permanent checkbox chrome;
- multi-select uses native checkbox state;
- JavaScript/state management enhances count, select-all and action enablement but must not be the only source of checkbox truth;
- destructive action requires explicit confirmation and must not be implied by selection;
- failure must preserve selection when retry is safe.

---

# 5. Login flow

## 5.1 Frozen functional contract

Login is for an existing KOKI account only.

Primary paths:

1. Passkey / biometric on a registered compatible device.
2. Email + password fallback.

Required supporting behavior:

- show/hide password;
- password recovery entry;
- no social login;
- no sign-up flow;
- correct session establishment before application routing;
- explicit error feedback without revealing account existence.

## 5.2 Redesign-specific functional requirements

The rich Mineral Spectrum Login visual direction may use more expressive background/color than the operational application shell, but the authentication state machine remains deterministic.

The login screen must handle:

- passkey supported + credential available;
- passkey supported + no credential;
- passkey cancellation;
- passkey platform error;
- password invalid;
- temporarily unavailable backend;
- expired/revoked session;
- successful login with return-to-intended-context when safe.

No decorative login treatment may obscure keyboard, password-manager autofill, biometric prompts or error text.

---

# 6. Dashboard flow

## 6.1 Frozen structure

Dashboard remains centered around:

- `Какво има значение сега`;
- primary `За решение`;
- `Коки сега`;
- system health;
- active operations;
- SELL before BUY;
- New Listing entry;
- search / notifications / theme / profile access;
- no legacy self-improvement pipeline in the normal user dashboard.

## 6.2 Functional changes from redesign

- Decision items become direct context links, not passive summaries.
- `Коки сега` becomes the canonical human-readable surface for current autonomous activity.
- System health is separated from business decisions and must not visually compete with them.
- Active operations use the same state vocabulary as SELL/BUY details.
- Mobile recomposes priority order rather than shrinking desktop columns.

## 6.3 Required behavior

Every Dashboard count must reconcile with its destination list/context. No stale badge may persist after the underlying state changes.

If a referenced conversation/listing is deleted, completed or inaccessible, the Dashboard must not route to a dead context; it must resolve to the valid parent or a clear unavailable state.

---

# 7. SELL flow

## 7.1 Frozen path

**SELL overview/list/filter → listing detail → buyer pipeline → buyer conversation → Master Seller strategy/pricing → KOKI Copilot → Strategy/Context/AI trace → human takeover**

## 7.2 Redesign functional requirements

- SELL overview must support fast Scan mode and retain filters/state.
- Listing detail must preserve the listing as the parent object for all buyer conversations.
- Buyer pipeline must expose buyer intent and state without turning intent into an unexplained score.
- Conversation must preserve full context when navigating to/from strategy/trace.
- Master Seller recommendation must distinguish owner-private boundaries from buyer-visible negotiation content.
- Human takeover must visibly change control ownership and must be reversible only through the existing approved return-to-KOKI mechanism.
- Media in conversations must render consistently with the existing media interpretation pipeline; unsupported media must have a safe fallback.

## 7.3 Safety invariants

- floor/private minimum is never disclosed;
- UI must not send a message merely by opening or switching screens;
- retry must not duplicate a seller response;
- human takeover must prevent autonomous send while human owns conversation control;
- state must not show `Active` if automation is hard-stopped by risk.

---

# 8. BUY flow

## 8.1 Frozen path

BUY mirrors SELL interaction quality while preserving BUY philosophy:

**BUY overview / active searches → item/search context → seller conversation → strategy/insights/full relevant context → KOKI recommendation/control → human takeover**

## 8.2 Redesign functional requirements

- BUY must not be visually/structurally treated as a secondary product.
- Search/item identity, budget/limits, seller conversation and KOKI strategy must remain clearly separated.
- KOKI recommendation must expose reason/evidence/confidence/control.
- Any maximum/limit information remains private according to existing negotiation rules.
- Conversation context must survive navigation and resume.

## 8.3 Critical regression requirement

The redesign must not alter the underlying Gemini turn semantics: every AI reply continues to receive the full relevant conversation + strategy + insights + state, not only the latest message.

---

# 9. Messages flow

## 9.1 Frozen contract

Filters:

- Всички
- Нови
- Продава
- Купува
- System

Each message is a concise operational notification with unread/severity and a target context.

## 9.2 Functional requirements

- Opening a message routes directly to its conversation/listing/system context.
- Read state updates idempotently.
- Filtering does not lose unread state.
- Returning from context restores the previous filter where possible.
- A target that no longer exists must produce a safe fallback with explanation.
- Multiple notifications pointing to the same context must not create duplicate logical conversations.
- System messages are visually differentiated by semantics, not by inventing a separate interaction model.

---

# 10. Profile flow

## 10.1 Frozen groups

- OLX profile
- Sessions
- Biometrics & Passkeys
- Notifications
- AI preferences

No intermediate Security screen.

## 10.2 Functional requirements

- Existing synchronized OLX/user data remains read-only where the source is external/system-owned.
- Session termination must be explicit and immediately reflected in the list.
- Passkey management must use platform-native WebAuthn/passkey behavior; no fake biometric UI.
- Notification settings must map 1:1 to actual notification types.
- AI preferences may alter only already approved configurable behavior; they must not silently override hard safety/risk rules.

---

# 11. NEW LISTING — critical redesign specification

New Listing is the highest-risk functional area of the redesign and receives a separate implementation and QA gate.

## 11.1 Frozen stages

1. **Начало**
2. **Детайли**
3. **Пазар**
4. **Обява**
5. **Публикуване**

The implementation must use these five stages as a state machine, not as decorative progress tabs.

---

## 11.2 Core AI-first principle

The user should provide the **minimum information KOKI cannot reliably derive**.

KOKI may infer, research and generate, but it must distinguish:

- `CONFIRMED`
- `INFERRED`
- `UNKNOWN`

Published listing claims must use **CONFIRMED facts only**. `INFERRED` data may assist classification/research but must not silently become a factual public claim. `UNKNOWN` facts must be omitted or explicitly requested only when necessary.

---

## 11.3 Stage 1 — Начало

### Inputs

Support minimum viable combinations:

- text only;
- photos only where visual recognition is sufficient to start classification;
- text + photos.

### Required orchestration

1. Normalize input/media.
2. Gemini extracts product identity + user intent + known facts.
3. Produce category candidate(s) and confidence.
4. Validate candidate against current OLX taxonomy/capabilities.
5. Determine whether more user input is necessary.
6. Determine `Research Decision`:
   - NONE
   - LIGHT
   - STANDARD
   - DEEP
   - SPECIALIZED

### Dynamic questions

There is no generic “additional context” field as a mandatory dumping ground.

Questions are generated only when the missing fact is necessary to:

- identify the product/category;
- satisfy required OLX attributes;
- materially affect market comparison;
- prevent a misleading listing claim;
- enable publish readiness.

Questions must explain why the missing information matters when that is not obvious.

---

## 11.4 Category and OLX taxonomy contract

OLX category/attribute schema must be treated as dynamic integration data, not hardcoded frontend constants.

Implementation must:

- obtain/consume current allowed category and required-attribute definitions from the authorized integration path;
- map KOKI normalized facts to OLX attributes;
- expose only missing required attributes to the user;
- survive taxonomy changes without breaking the entire wizard;
- preserve unknown/unsupported attributes safely;
- never use unauthorized scraping as a replacement for OLX Partner API capabilities.

A category may be considered ready when category confidence and required identifying facts reach the approved threshold/business rule. If not, the wizard stays in a clarification state rather than fabricating certainty.

---

## 11.5 Stage 2 — Детайли

### Required data model

Each product fact must carry at least:

- field/key;
- value;
- source (`USER`, `IMAGE_AI`, `TEXT_AI`, `OLX_SCHEMA`, other approved source);
- epistemic state (`CONFIRMED`, `INFERRED`, `UNKNOWN`);
- confidence where applicable;
- timestamp/version where needed for invalidation.

### Owner desired price

The owner desired price is intentionally captured **before independent market research** so KOKI can later compare owner expectations with the market.

However:

> **The owner desired price MUST NOT be visible to the independent Market Researcher or evidence collection step before independent research is finalized.**

This is a hard privacy/analysis-isolation invariant.

The private floor/minimum remains governed by existing private-minimum rules and must never be disclosed to buyers or research sources.

---

## 11.6 Research trigger

Research may start only when there is sufficient category confidence and enough identifying facts to build meaningful comparables.

The research controller chooses the frozen decision level: NONE/LIGHT/STANDARD/DEEP/SPECIALIZED.

Research should not be delayed for irrelevant missing facts, but must not start against an ambiguous product identity that would pollute the evidence set.

---

## 11.7 Research invalidation

A critical identifying fact change after research starts/completes must invalidate affected downstream artifacts.

Examples of critical changes:

- model/version;
- storage/capacity where market-significant;
- vehicle generation/engine/trim where market-significant;
- condition class;
- category;
- bundle/quantity;
- material/size where category-significant.

Invalidation must be dependency-aware:

`critical fact change → category/comparable query re-evaluation → research result stale → valuation stale → generated listing sections depending on stale facts flagged/regenerated`.

The user must never see a stale valuation presented as current after a critical fact change.

---

## 11.8 Market Researcher isolation and evidence model

The Master Market Researcher is an evidence researcher, not a salesperson.

Inputs are normalized product facts with `CONFIRMED / INFERRED / UNKNOWN` state and approved research scope.

**Forbidden input before independent research completes:**

- owner desired price;
- private minimum/floor;
- target negotiated price intended to bias valuation.

### Evidence record

Every comparable/evidence item must preserve, where available:

- source;
- URL/reference;
- retrieval timestamp;
- currency;
- price;
- price type;
- location/market;
- seller/source type;
- relevant product facts;
- comparable score/classification;
- acceptance/rejection reason.

### Price types

At minimum:

- ASKING
- TRANSACTION
- OFFER
- NEGOTIATED
- UNKNOWN

ASKING must not be silently treated as TRANSACTION.

### Comparable quality

At minimum:

- EXACT
- STRONG
- WEAK
- REJECTED

Rejected evidence retains a rejection reason. Outliers are not deleted merely because they are unusual.

### Confidence

At minimum:

- HIGH
- MEDIUM
- LOW
- INSUFFICIENT

When evidence is insufficient, the result is explicitly `INSUFFICIENT_MARKET_EVIDENCE`; the UI must not fabricate a precise market price.

---

## 11.9 Research validation

Before valuation reaches Master Seller:

1. validate comparable acceptance/rejection;
2. validate price type classification;
3. validate currency/normalization;
4. validate duplicate handling;
5. validate deterministic math/statistics;
6. validate confidence classification;
7. validate isolation from owner desired price.

Only after independent research is finalized may Master Seller receive:

- research evidence/result;
- owner desired price/objectives;
- private constraints according to existing authorization rules.

Master Seller may then explain the gap between owner expectation and independent evidence.

---

## 11.10 Stage 3 — Пазар

The compact market view must contain:

- owner desired price;
- five-segment price rating;
- classification;
- concise confidence/evidence summary;
- info action opening the full methodology view.

The full `Оценка на цената` view must expose:

- methodology;
- ranges;
- selected comparables/evidence;
- confidence;
- asking vs transaction distinction;
- insufficient-evidence state;
- rationale for the classification.

The five-segment visualization is a rating/explanation device, not a hidden score.

---

## 11.11 Stage 4 — Обява

Master Listing generates title/description/channel-specific listing content.

### Hard rule

**Only CONFIRMED factual claims may appear as factual public listing content.**

Implementation must:

- exclude unsupported inferred claims;
- request confirmation for a high-value/high-risk uncertain fact when necessary;
- preserve user edits;
- distinguish user-edited facts from AI-generated phrasing;
- regenerate dependent text when a confirmed critical fact changes, without overwriting unrelated user edits;
- keep image ordering and media selection explicit.

---

## 11.12 Stage 5 — Публикуване

Publish readiness requires validation of:

- category;
- mandatory OLX attributes;
- confirmed publishable facts;
- title/description constraints;
- price;
- selected media and upload readiness;
- authorization/session/integration readiness;
- duplicate/idempotency state.

### Publish safety

Publish must be idempotent.

Double-click, network retry, browser resume or integration timeout must not create duplicate listings.

If OLX returns an ambiguous outcome (request timed out after server may have accepted), KOKI must reconcile status before retrying creation.

Partial media failure must not silently publish a listing that violates the selected media contract. The user receives a clear recoverable state.

---

## 11.13 Draft persistence and resume

New Listing must be safely resumable.

Persist enough state to restore:

- current stage;
- normalized facts + epistemic state;
- category candidate/confirmed category;
- user answers;
- owner desired price/private fields according to authorization;
- research status/version/result reference;
- generated listing draft and user edits;
- selected media/order/upload state;
- publish readiness.

On resume, stale external data/research is revalidated according to freshness rules rather than blindly trusted.

---

## 11.14 New Listing failure model

Every asynchronous operation must have explicit states:

- idle/not-started;
- running;
- succeeded;
- failed-retryable;
- failed-terminal/user-action-required;
- stale/invalidated where applicable.

No indefinite spinner without watchdog/timeout behavior.

A retry must not:

- duplicate research jobs;
- duplicate AI-generated committed facts;
- duplicate uploads;
- duplicate publish calls;
- lose user edits;
- leak owner-private pricing into Market Researcher context.

---

# 12. Security and privacy requirements

## 12.1 Authentication/session

- Passkey/WebAuthn uses native browser/platform capability.
- Password fallback must preserve existing authentication security controls.
- Session lifetime/policy remains governed by approved KOKI security policy.
- Session termination is enforced server-side, not only visually.

## 12.2 Authorization

Every context route must re-check authorization server-side. Client route IDs are not trusted authorization evidence.

Test IDOR across:

- listing IDs;
- conversation IDs;
- message/context IDs;
- user/profile/session IDs;
- draft IDs;
- research result IDs.

## 12.3 AI data isolation

Automated tests must prove that owner desired price/private minimum are absent from Market Researcher payloads before independent result finalization.

No debug UI/log/trace may accidentally display protected private values to a peer/buyer-facing surface.

## 12.4 Output safety

All user-generated/AI-generated text rendered in PWA must be escaped/sanitized against script/HTML injection.

URLs from external evidence/messages must not become unsafe executable links.

---

# 13. Accessibility and platform requirements

All flows must meet the frozen platform grammar:

- iOS PWA: safe areas, ≥44px targets, restrained supported translucency only in persistent chrome;
- Android PWA: ≥48px targets, solid chrome;
- Desktop/Web: sidebar/rail, pointer/hover and full keyboard support.

Required QA:

- keyboard-only navigation;
- visible focus;
- screen-reader labels for icon-only actions;
- form error association;
- no state communicated only by color;
- reduced-motion behavior;
- zoom/text scaling;
- mobile keyboard not hiding primary actions/fields;
- landscape/small viewport behavior;
- safe-area correctness.

---

# 14. Performance and resilience

The redesign must not materially degrade the current production baseline.

Mandatory performance gates:

- record baseline before redesign deployment;
- compare route startup, interaction latency, bundle size and memory on representative mobile hardware;
- block release for unexplained material regression;
- defer non-critical heavy panels/trace/evidence until requested where possible;
- images/media use appropriate sizing/lazy loading;
- no heavy decorative canvas/WebGL or animation framework;
- offline/PWA resume must fail predictably and never imply an action completed when it did not.

---

# 15. Observability requirements

The redesign must improve diagnosability without changing business semantics.

At minimum correlate:

- user-visible flow + screen;
- domain (`BUY`, `SELL`, `NEW_LISTING`, `SYSTEM`);
- object/context ID;
- conversation ID where applicable;
- draft/research/publish operation IDs;
- state transition;
- retry/attempt type;
- failure classification;
- user takeover state;
- route/deep-link source.

Sensitive/private values must not be placed in telemetry merely for debugging convenience.

---

# 16. Test strategy — release-blocking

Testing is not a final visual pass. It is part of the redesign contract.

## 16.1 Test layers

1. **Design-system contract tests** — tokens/components/states not redefined locally.
2. **Unit/state-machine tests** — navigation, wizard, status, selection, invalidation.
3. **API/contract tests** — backend, Gemini payloads, OLX category/attributes/media/publish.
4. **Integration tests** — complete frontend ↔ services behavior.
5. **E2E tests** — all frozen happy paths and critical failures.
6. **Visual regression** — desktop/mobile/light/dark and key states.
7. **Accessibility tests** — automated + manual.
8. **Security tests** — auth, authorization, injection, private-data isolation, destructive actions.
9. **Performance tests** — baseline comparison.
10. **Manual brutal QA** — interruption, duplicate interaction, stale data, network failure, PWA resume.

---

# 17. Brutal regression pack — all frozen flows

The following are release-blocking:

### Login

- Passkey success.
- Passkey cancel returns to usable login.
- Passkey unavailable exposes password fallback.
- Wrong password does not reveal account existence.
- Show/hide password preserves value and cursor behavior.
- Recovery entry works without losing route intent.
- Expired session returns to Login without broken state loop.

### Dashboard

- Decision count equals actual actionable contexts.
- Every decision deep link lands in correct context.
- SELL appears before BUY where frozen.
- State update in a child flow reconciles Dashboard on return.
- Deleted/completed target uses safe fallback.
- Mobile priority order matches frozen hierarchy.

### SELL

- Filter/list/detail/back roundtrip preserves filter/scroll where feasible.
- Buyer pipeline opens correct conversation.
- Full conversation context retained after strategy/trace navigation.
- Human takeover prevents autonomous send.
- Return-to-KOKI re-enables only the approved automation state.
- Duplicate send protection under rapid tap/retry.
- Risk hard stop cannot display an active-autonomy state.
- Attachments/media fallback safe.

### BUY

- Search/item context routes to correct seller conversation.
- Maximum/private limit never leaks to seller-visible output.
- Full-context Gemini payload regression test.
- Human takeover ownership respected.
- Stuck/retry handling creates no duplicate message.

### Messages

- All five filters.
- Read/unread idempotency.
- Deep link to SELL context.
- Deep link to BUY context.
- Deep link to system context.
- Missing target fallback.
- Multiple notifications to same conversation preserve one logical conversation.

### Profile

- OLX data display/source ownership.
- Session termination.
- Current session handling.
- Passkey add/remove failure states.
- Notification toggle persistence.
- AI preference cannot disable hard safety rule.

---

# 18. NEW LISTING — BRUTAL TEST PACK

No New Listing implementation may ship until this pack is green.

## NL-01 Minimal text identification

Input: short but sufficient product text, no image.  
Expected: product/category identified, only necessary clarification asked, wizard proceeds without forcing irrelevant fields.

## NL-02 Photo-first identification

Input: useful product photos, minimal/no text.  
Expected: AI extracts inferred identity; uncertain claims remain INFERRED; user confirms only required/high-impact facts.

## NL-03 Ambiguous product

Input: generic text such as a brand without model.  
Expected: no premature research; dynamic clarification requests identifying fact.

## NL-04 Wrong category suggestion

User corrects category.  
Expected: required attributes refresh from new category; stale old category requirements removed; dependent research invalidated if already started.

## NL-05 Dynamic OLX taxonomy change

Backend/fixture changes required attribute/category mapping.  
Expected: UI consumes new schema without hardcoded crash; missing mandatory field is surfaced correctly.

## NL-06 Unknown optional attribute

Optional fact is unknown.  
Expected: no unnecessary blocking; unknown fact not fabricated into listing.

## NL-07 Confirmed vs inferred publication guard

AI infers a fact that user never confirms.  
Expected: the fact is absent as a factual claim from final listing.

## NL-08 Owner desired price capture

Owner enters desired price before research.  
Expected: value persists and later appears in owner comparison UI.

## NL-09 Market Researcher privacy isolation — HARD GATE

Owner desired price is set.  
Inspect Market Researcher request payload.  
Expected: owner desired price/private floor/target bias values are absent.

## NL-10 Private minimum isolation — HARD GATE

Private minimum exists in sale state.  
Expected: absent from Market Researcher payload and all public listing/buyer-visible text.

## NL-11 Independent research then Master Seller comparison

Research completes.  
Expected: only after completion Master Seller receives independent evidence + permitted owner objectives and produces comparison/rationale.

## NL-12 Research decision NONE

Low-need category/scenario.  
Expected: wizard does not create fake research activity; explains/continues according to business rule.

## NL-13 Research decision LIGHT

Expected: limited evidence path, correct confidence, no deep-research UI claims.

## NL-14 Research decision STANDARD

Expected: standard comparable set and validation.

## NL-15 Research decision DEEP

Expected: deeper evidence path; progress/async state accurate; resume supported.

## NL-16 Research decision SPECIALIZED

Expected: category-specific research workflow; unsupported specialist source produces explicit insufficient evidence rather than guessed valuation.

## NL-17 Research starts too early prevention

Identity lacks critical model/version.  
Expected: research does not start until sufficient identifying facts exist.

## NL-18 Critical fact change during research

Change model/version while research is running.  
Expected: old job/result marked invalid/stale; stale result cannot overwrite new state.

## NL-19 Critical fact change after research

Change market-significant capacity/condition/category.  
Expected: research + valuation dependent artifacts invalidated; UI clearly marks recomputation required.

## NL-20 Non-critical fact change

Change a cosmetic description fact irrelevant to comparables.  
Expected: no unnecessary market research rerun; dependent listing text updates only where required.

## NL-21 Duplicate comparables

Evidence source returns duplicate listings/items.  
Expected: duplicate handling deterministic; duplicate does not overweight valuation.

## NL-22 Asking vs transaction separation

Dataset contains both.  
Expected: types remain distinct in evidence/methodology and math.

## NL-23 Unknown price type

Expected: classified UNKNOWN, not silently asking/transaction.

## NL-24 Weak comparable

Expected: retained as WEAK with reason; weighting/interpretation follows approved logic.

## NL-25 Rejected comparable

Mismatch/parts/wanted/stale/suspicious item.  
Expected: REJECTED with reason; excluded from accepted valuation math while remaining auditable.

## NL-26 Genuine outlier

Valid but unusual comparable.  
Expected: not deleted merely for being unusual; deterministic outlier treatment visible in methodology.

## NL-27 Currency normalization

Mixed currencies.  
Expected: deterministic conversion/normalization using approved rate source/time; raw value/source preserved.

## NL-28 Insufficient evidence

Too few/low-quality comparables.  
Expected: `INSUFFICIENT_MARKET_EVIDENCE`; no invented precise valuation; confidence INSUFFICIENT.

## NL-29 Evidence source unavailable

Expected: retryable error and/or reduced evidence path per policy; no infinite spinner.

## NL-30 Research retry idempotency

Retry after timeout.  
Expected: no duplicate logical research result; previous attempt correlation preserved.

## NL-31 Rating methodology detail

Open `Оценка на цената`.  
Expected: rating, ranges, evidence, confidence and methodology reconcile numerically with compact view.

## NL-32 Owner price extreme low/high

Expected: classification explains discrepancy without changing independent research result retroactively.

## NL-33 User edits generated title

Then another non-title-dependent field changes.  
Expected: user title edit survives unless dependency explicitly requires regeneration and user is warned/asked.

## NL-34 User edits generated description

Expected: regeneration does not blindly overwrite unrelated manual edits.

## NL-35 AI hallucination guard

Model attempts to insert an unconfirmed specification.  
Expected: validation removes/blocks claim before publish.

## NL-36 Required OLX attribute missing

Expected: Publish blocked with field-specific action; no generic failure.

## NL-37 Photo upload partial failure

Some selected images fail.  
Expected: exact failed items identified; retry only failed items; ordering preserved; no silent publish with unintended set.

## NL-38 Photo remove after AI analysis

Expected: dependent media analysis/listing references update; removed image cannot publish.

## NL-39 Duplicate image

Expected: predictable duplicate handling; no accidental repeated publish media.

## NL-40 Unsupported/corrupt media

Expected: safe validation error; rest of draft preserved.

## NL-41 Draft browser refresh

Refresh at each of the five stages.  
Expected: safe restore to same logical stage with state preserved.

## NL-42 PWA background/resume

Background app during research/upload and resume later.  
Expected: operation reconciles server truth; no phantom progress or duplicate retry.

## NL-43 Offline during editing

Expected: local/user changes preserved according to approved draft model; publish/research actions clearly unavailable or queued only if explicitly supported.

## NL-44 Offline during publish

Expected: never show success without confirmed server result; reconcile before retry.

## NL-45 Rapid double publish click — HARD GATE

Expected: exactly one logical listing creation.

## NL-46 Publish timeout after possible OLX acceptance — HARD GATE

Expected: reconcile remote state before any second create call.

## NL-47 OLX validation rejection

Expected: map integration validation to actionable field/state; draft retained.

## NL-48 OLX auth/session expired

Expected: recover auth/integration state safely; no draft loss; no duplicate publish.

## NL-49 Back navigation from each stage

Expected: no accidental destructive reset; stale dependencies handled correctly.

## NL-50 Deep link/restore to draft

Expected: authorized user returns to correct draft; unauthorized draft access denied server-side.

## NL-51 IDOR draft access — SECURITY HARD GATE

Change draft ID manually.  
Expected: server denies access; no metadata leakage.

## NL-52 Injection in title/description

Input HTML/script-like content.  
Expected: safe encoding/sanitization in UI and outbound listing payload according to integration contract.

## NL-53 Malicious evidence URL

Expected: safe rendering; no script execution/unsafe navigation.

## NL-54 Accessibility — full wizard keyboard

Expected: entire five-stage flow operable without pointer; focus order correct; dialogs return focus.

## NL-55 Accessibility — screen reader

Expected: stage, validation, confidence, evidence, required fields, upload status and buttons announced meaningfully.

## NL-56 Reduced motion

Expected: state meaning preserved without decorative/continuous animation.

## NL-57 Mobile keyboard

Expected: focused input and primary continue action remain reachable; no viewport trap.

## NL-58 Small mobile / safe area

Expected: no clipped wizard navigation or publish action.

## NL-59 Dark mode

Expected: contrast and semantic meaning preserved; no hardcoded legacy colors.

## NL-60 Full end-to-end golden path

Minimal user input → category → required details → independent market research → owner comparison → generated confirmed-facts-only listing → media readiness → publish confirmation.  
Expected: one listing, complete audit trail, no private value leak, correct state transitions.

---

# 19. Contract tests that MUST inspect payloads

UI/E2E alone is insufficient. Automated contract tests must inspect actual request payloads/mocks for:

1. Gemini conversation reply — contains full relevant conversation/context/strategy/insights/state.
2. Market Researcher — does **not** contain owner desired price/private floor before independent research finalization.
3. Master Seller post-research — receives permitted research result and owner objectives only at the correct phase.
4. Master Listing — receives publishable confirmed facts; unconfirmed inferred facts cannot become factual public claims.
5. OLX category/attributes — uses dynamic authorized taxonomy contract.
6. OLX publish — idempotency key/logical operation identity retained across retries.
7. Message deep link — context identifiers route to authorized target only.
8. Human takeover — autonomous send command blocked while human owns conversation control.

---

# 20. Visual regression matrix

Capture/compare at minimum:

| Flow | Desktop light | Desktop dark | Mobile light | Mobile dark | Critical state variants |
|---|---:|---:|---:|---:|---|
| Login | ✓ | ✓ | ✓ | ✓ | passkey unavailable, auth error |
| Dashboard | ✓ | ✓ | ✓ | ✓ | Attention/Waiting/System warning |
| SELL overview/detail | ✓ | ✓ | ✓ | ✓ | active/waiting/attention |
| SELL conversation | ✓ | ✓ | ✓ | ✓ | takeover/risk stop/media |
| BUY overview/conversation | ✓ | ✓ | ✓ | ✓ | takeover/recommendation |
| New Listing 5 stages | ✓ | ✓ | ✓ | ✓ | validation/research/loading/error/stale/insufficient |
| Messages | ✓ | ✓ | ✓ | ✓ | unread/system/missing target |
| Profile | ✓ | ✓ | ✓ | ✓ | passkey/session error |

Visual differences are release-blocking when they alter hierarchy, accessibility, target size, overflow, state meaning or frozen component anatomy.

---

# 21. Migration and rollout plan

Implementation must be isolated from production until the complete test gate is green.

Recommended rollout mechanics:

1. keep existing production UI intact;
2. implement redesigned application behind a controlled UI release boundary/feature flag or isolated build;
3. run contract + E2E against staging/pre-prod services;
4. perform manual PWA QA on iOS Safari/Home Screen, Android Chrome/PWA and desktop Safari/Chrome;
5. canary to controlled users only after P0/P1 = 0;
6. compare telemetry/error/latency against baseline;
7. full rollout only after explicit approval;
8. retain immediate rollback to previous UI build without data rollback.

### Schema/API rule

This MD does not pre-authorize database/schema/API migrations. If implementation discovers a missing persisted state or API field required to realize a frozen flow, the team must produce a separate explicit contract/migration amendment before changing production schema.

---

# 22. Release gates

Release is blocked unless all are true:

- all frozen flows represented;
- no frozen business function removed/renamed/reinterpreted;
- Design System contract audit passes;
- New Listing NL-01…NL-60 passes, with all HARD GATE cases green;
- Gemini full-context regression passes;
- Market Researcher privacy-isolation payload test passes;
- no duplicate send/publish under retry/double-click tests;
- OLX dynamic taxonomy contract passes;
- human takeover ownership tests pass;
- auth/passkey/session tests pass;
- authorization/IDOR tests pass;
- accessibility critical issues = 0;
- P0/P1 defects = 0;
- performance shows no unexplained material regression;
- rollback is tested;
- manual PWA QA sign-off completed.

---

# 23. Definition of Done

The redesign is done only when:

1. The application visually uses the frozen KOKI Design System everywhere.
2. Every frozen flow behaves according to its functional source-of-truth.
3. The prototype interactions have been replaced by real authorized data/state without altering flow meaning.
4. Dummy behavior is absent from production.
5. New Listing passes the full isolation, evidence, invalidation, draft-resume and idempotent-publish test suite.
6. All AI actions remain explainable through Signal → Reason → Evidence → Confidence → Control where applicable.
7. User-private constraints are never leaked.
8. Responsive behavior is native-feeling PWA adaptation, not a separate product fork.
9. All critical integrations are regression-tested.
10. Rollback to the previous UI build is verified.

---

# 24. Explicit implementation prohibition for this document

**This MD is a specification and test plan only.**

Creation/approval of this file must not automatically trigger:

- implementation;
- code generation into production paths;
- database migrations;
- prompt changes;
- Gemini model/provider changes;
- OLX configuration/API changes;
- Vercel production deployment;
- feature-flag activation;
- production data changes.

Implementation starts only after a separate explicit user instruction.
