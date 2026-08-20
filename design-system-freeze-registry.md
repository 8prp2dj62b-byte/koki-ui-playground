# KOKI Design System — Freeze Registry

This file is the source-of-truth registry for approved/frozen design-system layers. A frozen layer may be consumed and composed by higher layers, but must not be silently redefined. Any change requires an explicit foundation/component proposal and approval before use.

## Frozen layers

1. **Design identity + Mineral Spectrum**
   - File: `design-system.html`
   - Status: Frozen
   - Palette: Mineral Spectrum, exact approved multi-hue palette

2. **Typography + Geometry**
   - File: `foundations-type-geometry.html`
   - Status: Frozen
   - Contract: native-first typography, approved type scale, 4px spacing system, approved radii/density/layout metrics

3. **Surfaces + Overlap**
   - File: `foundations-surfaces-elevation.html`
   - Status: Stable 1.0 · Frozen
   - Contract: Canvas / Surface / Subtle; static content has no elevation; shadows only for real Floating / Modal overlap; no core glass primitive

4. **Iconography + Motion**
   - File: `foundations-iconography-motion.html`
   - Status: Stable 1.0 · Frozen
   - Contract: 16/20/24px icon grammar, 1.75px optical stroke, ≥44px target, five-level KOKI motion language + gestures, event-driven operational motion, KOKI intelligence signature, reduced-motion support

5. **Core Controls**
   - File: `components-core-controls.html`
   - Status: Stable 1.0 · Frozen
   - Frozen blob SHA at approval: `246a6a8f456e117b935268fea6f6efce55252b88`
   - Contract: buttons, icon buttons, text fields, search/select, checkbox/radio, switch, shared state vocabulary and platform adaptation. No mockup component inheritance.

6. **Navigation Components**
   - File: `components-navigation.html`
   - Status: Stable 1.0 · Frozen
   - Frozen blob SHA at approval: `eddae7141bd1ebac7989a16a27c91460c11b406b`
   - Contract: Instagram-like structural navigation adapted to KOKI identity; mobile uses five fixed icon-only primary positions, desktop uses the same destinations in left sidebar and collapsible icon rail, no selected pills/background, no floating dock, create remains equal in the navigation rhythm, local tabs remain separate from primary navigation.

7. **KOKI Content System**
   - File: `components-content-lists.html`
   - Status: Stable 1.0 · Frozen
   - Frozen blob SHA: `ee17b74b747a24b8eb5a2929e63dd4f2229fac54`
   - Contract: content is organized by reading task rather than backend entity: Scan for high-density operational scanning, Identify for media-assisted object recognition, Inspect for deep single-object context. Mobile is recomposed rather than shrunk. Repeated entities do not become cards by default; media must earn its place; long-form text preserves readable measure; status and KOKI intelligence remain separate layers.

8. **Overlays & Temporary Context**
   - File: `components-overlays.html`
   - Status: Stable 1.0 · Frozen
   - Frozen blob SHA: `8879740d6753e897cb86b270fae9cb0f32b7d859`
   - Contract: overlays exist only for temporary task context; Floating is used for menu/popover and Modal for dialog/sheet. Frozen Surface and depth remain neutral while Mineral Spectrum is used by role: Cobalt for action/selection, Teal for contextual assist, Violet for KOKI ownership/control, Ochre for warning and Critical for destructive consequence. No decorative tinted overlay surfaces, nested modals, new depth levels or glass content.

9. **Feedback & Status**
   - File: `components-feedback-status.html`
   - Stable alias: `feedback-status.html`
   - Status: Stable 1.0 · Frozen
   - Frozen blob SHA: `0bd5618e16fbb58b00532c770d90fe6c94a45662`
   - Contract: operational state and severity are separate axes. Operational vocabulary is Attention / Active / Waiting / Inactive / Completed; severity is Info / Positive / Warning / Critical. State color never silently implies severity. Persistent notices, inline validation and floating toast follow the same semantic contract; operational state changes are event-driven and motion shows only the causal delta.

10. **Selection & Actions**
   - File: `components-selection-actions-v3.html`
   - Stable alias: `selection-actions.html`
   - Status: Stable 1.0 · Frozen
   - Frozen blob SHA: `a261aff32e85bf8b9f3387b9acafd0403aba4de5`
   - Contract: selection is an explicit temporary task mode. Multi-select uses native checkbox state so row selection remains functional independently of enhancement JavaScript; JavaScript only synchronizes count, select-all and action enablement. Browse mode stays free of checkbox chrome. Cobalt is reserved for selection/primary action, Teal for contextual utility, Violet for KOKI delegation/ownership, Ochre for reversible operational change and Critical for destructive consequence. Selection never implies destructive consent.

11. **KOKI Intelligence Components**
   - File: `components-koki-intelligence.html`
   - Stable alias: `koki-intelligence.html`
   - Status: Stable 1.0 · Frozen
   - Frozen blob SHA: `a1ed822c92146819363ff2813522a9511339e4f5`
   - Contract: KOKI intelligence is expressed through Signal → Reason → Evidence → Confidence → Control. Violet identifies KOKI intelligence/ownership, Teal evidence/context, Cobalt primary action/reason, Ochre uncertainty/caution and Coral human attention/intervention. Recommendation, evidence, confidence, autonomy, agent activity, human intervention, AI question and price rating remain explicit and inspectable; no generic AI cards, sparkle/glow, mystery scores or decorative AI chrome.

12. **Platform Expression**
   - File: `platform-expression.html`
   - Status: Stable 1.0 · Frozen
   - Frozen blob SHA: `483ddc71176d69e03661a209a247d7110a6f3ec7`
   - Contract: one KOKI Core Design Language with platform adapters only. iOS PWA uses safe-area handling, ≥44px targets and restrained translucency only in persistent app chrome when supported; Android PWA uses ≥48px targets and solid chrome; Desktop/Web uses the frozen sidebar/rail, pointer/hover and keyboard affordances. Platform expression may adapt chrome, safe areas, target size, input model and responsive composition, but never business meaning, navigation destinations, semantic color roles, component anatomy or information architecture. No fake UIKit, fake Material, fake native controls or platform-specific product forks.

## Governance

- Higher layers consume frozen tokens and components; they do not redefine them.
- Existing KOKI mockups are functional/wireframe references only, never visual source-of-truth.
- No ad-hoc color, typography, radius, spacing, shadow, icon style, motion timing or component treatment may be introduced inside a screen.
- If a valid new use case cannot be expressed by the frozen system, create a design-system proposal first.
