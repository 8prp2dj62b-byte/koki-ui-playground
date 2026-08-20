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

## Governance

- Higher layers consume frozen tokens and components; they do not redefine them.
- Existing KOKI mockups are functional/wireframe references only, never visual source-of-truth.
- No ad-hoc color, typography, radius, spacing, shadow, icon style, motion timing or component treatment may be introduced inside a screen.
- If a valid new use case cannot be expressed by the frozen system, create a design-system proposal first.
