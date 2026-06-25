# Product

## Register

product

## Users

**Photographers (primary):** Wedding photographers who need to distribute photos to clients and collect selections for final editing. They use the admin dashboard to create albums, upload photos, track client selections, and export filenames for Lightroom.

**Clients (secondary):** Wedding couples who receive a PIN to access their private gallery. They browse photos, select their favorites within a limit, and submit their choices.

## Product Purpose

Streamline the wedding photo proofing workflow: from photographer upload to client selection to Lightroom export. Replace manual file sharing, email back-and-forth, and spreadsheet tracking with a beautiful, branded experience.

Success looks like: photographers spend less time managing selections, clients enjoy the selection process, and the handoff to editing is seamless.

## Brand Personality

**Professional, Clean, Intimate**

- Professional: This is a business tool. No frivolity, no decorative fluff. Every element serves a purpose.
- Clean: Minimal chrome, maximum content. Photos are the hero, not the UI.
- Intimate: Wedding context demands warmth. The dark theme with warm accent (#d4a574) creates a premium, personal feel without being saccharine.

Voice: Confident but not loud. Helpful but not chatty. Premium but not pretentious.

## Anti-references

- **Generic SaaS dashboard:** Bland, corporate, template-like UI with blue/gray palettes and cookie-cutter components. YLx should feel crafted, not assembled.
- **Overly decorative wedding sites:** Frilly scripts, pink/pastel palettes, floral ornaments, excessive cursive. YLx is for professionals, not Pinterest mood boards.
- **AI slop patterns:** Gradient text, identical card grids, hero-metric templates, tiny uppercase eyebrows on every section. YLx should feel human-designed.

## Design Principles

1. **Photos are the product.** The UI exists to serve the images, not compete with them. Minimal chrome, generous whitespace, subtle interactions.
2. **Professional warmth.** Dark theme signals professionalism; warm accent signals intimacy. Neither dominates.
3. **Mobile-first craftsmanship.** The gallery experience must be exceptional on phones, where clients spend most of their time.
4. **Progressive disclosure.** Show what's needed when it's needed. PIN entry → gallery → selection → submission. No overwhelming dashboards for clients.
5. **Motion with purpose.** Animations guide attention and confirm actions, not decorate. Framer Motion for smooth, intentional transitions.

## Accessibility & Inclusion

- WCAG AA compliance target
- Reduced motion support via `prefers-reduced-motion`
- High contrast ratios (text on dark backgrounds)
- Keyboard navigable gallery selection
- Screen reader friendly PIN entry
