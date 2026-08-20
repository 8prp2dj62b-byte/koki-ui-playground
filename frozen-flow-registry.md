# KOKI Frozen Flow Registry

This registry is the functional source of truth for the KOKI product flows. A frozen flow defines structure, screens, states, transitions and business meaning. The KOKI Design System may change how a frozen flow looks and composes responsively, but may not silently add, remove, rename or reinterpret its business functionality.

## Frozen flows

1. **Dashboard**
   - Frozen baseline commit: `e5b64121dd5cf5b476925b2fbe46f4e1ded0d5a1`
   - Contract: `Какво има значение сега`; primary `За решение`; `Коки сега`; system health; active operations; SELL before BUY; search/notifications/theme/profile available; New Listing entry; no legacy self-improvement pipeline in the user dashboard.

2. **SELL**
   - Frozen baseline commit: `6323e66c39b23a2f68a9c2c96afc9aaec6e9a904`
   - Contract: overview/list/filter → listing detail → buyer pipeline → buyer conversation → Master Seller strategy/pricing → KOKI Copilot → Strategy/Context/AI trace → human takeover/dummy action in prototype.

3. **BUY**
   - Frozen baseline commit: `ec033ce`
   - Contract: BUY overview and active searches → item/search context → seller conversation → strategy/insights/full relevant context → KOKI recommendation/control → human takeover. BUY mirrors SELL interaction quality without changing BUY philosophy.

4. **New Listing**
   - Frozen baseline commit: `5454038`
   - Canonical source: `new-sale.html`
   - Contract: `Начало · Детайли · Пазар · Обява · Публикуване`; AI-first minimum input; category inference/validation; Research Decision NONE/LIGHT/STANDARD/DEEP/SPECIALIZED; owner desired price captured before research but hidden from independent Market Researcher until research completes; market methodology/evidence/confidence; generated listing; publish step.

5. **Profile**
   - Frozen baseline commit: `73b2aee`
   - Canonical source: `profile.html`
   - Contract: OLX profile · Sessions · Biometrics & Passkeys · Notifications · AI preferences. No intermediate Security screen.

6. **Messages**
   - Frozen by explicit user approval on 2026-08-20.
   - Canonical source: `messages.html`
   - Current source blob at freeze reference: `f16988a2f539543ea6355f60326a2cbabd4c5132`
   - Contract: filters `Всички · Нови · Продава · Купува · System`; concise operational messages; unread/severity; every item routes directly to the relevant conversation/listing/system context.

7. **Login**
   - Frozen by explicit user approval on 2026-08-20.
   - Functional contract: PWA entry for existing account; Passkey/biometric is the fast primary path on a registered device; email + password is universal fallback; show/hide password; password recovery entry; no social login and no sign-up flow.
   - Approved visual direction: prominent KOKI `K` app icon and a richer Mineral Spectrum composition using Cobalt, Teal, Violet, Coral and Ochre while remaining premium and readable.
   - Prototype implementation reference: `prototype-v1.html#login`.

## Application rule

**Frozen wireframe/flow defines what exists and how it behaves. Frozen KOKI Design System defines how it looks.**

Higher application layers may:
- apply tokens, components, platform adapters and responsive recomposition;
- use dummy data for playground/prototype validation;
- wire frozen transitions into a clickable prototype.

Higher application layers may not:
- invent product sections or backend functionality;
- remove frozen states or transitions;
- rename frozen navigation/business concepts without explicit approval;
- use old wireframe styling as visual source-of-truth;
- modify production KOKI while the work is in the playground.
