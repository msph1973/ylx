---
name: YLx
description: Photo proofing gallery platform for wedding photographers
colors:
  primary: "#b8864e"
  primary-hover: "#c99660"
  primary-dark: "#9e7040"
  neutral-bg: "#0a0a0a"
  neutral-surface: "#141414"
  neutral-surface-elevated: "#1a1a1a"
  neutral-border: "#2a2a2a"
  neutral-text: "#fafafa"
  neutral-text-muted: "#a0a0a0"
  success: "#4ade80"
  error: "#f87171"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontWeight: 600
    letterSpacing: "0.1em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontWeight: 500
    fontSize: "0.875rem"
    letterSpacing: "0.2em"
    textTransform: "uppercase"
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  full: "9999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  6: "1.5rem"
  8: "2rem"
  12: "3rem"
  16: "4rem"
  24: "6rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.lg}"
    padding: "0.75rem 2rem"
  card:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
---

# Design System: YLx

## 1. Overview

**Creative North Star: "The Intimate Gallery"**

YLx is a professional tool that feels personal. The dark theme signals competence and sophistication; the warm amber accent (#d4a574) signals the intimacy of weddings. This is not a corporate dashboard or a frilly wedding site—it's a crafted workspace where photographers manage their art and clients select their memories.

The system rejects both poles: generic SaaS blue-gray palettes that feel interchangeable, and over-decorated wedding aesthetics with cursive scripts and pastel florals. YLx occupies the space between—professional enough for business, warm enough for the occasion.

**Key Characteristics:**
- Dark-forward: near-black backgrounds let photos and warm accents breathe
- Photo-centric: minimal chrome, maximum content area
- Warm professionalism: amber accent on dark surfaces creates intimacy without saccharine
- Mobile-first: designed for phone galleries, scaled up for admin

## 2. Colors

The palette is restrained: one warm accent on a near-black neutral field. Warmth comes from the accent and imagery, not from tinted backgrounds.

### Primary
- **Warm Amber** (#d4a574): The signature accent. Used on interactive elements, active states, brand moments. Carries the "intimate" half of the brand personality.
- **Amber Hover** (#e0b88a): Lighter variant for hover/focus states.

### Neutral
- **Deep Black** (#0a0a0a): Body background. Near-black, not pure black—avoids harsh contrast while maintaining premium feel.
- **Surface** (#141414): Elevated surfaces, cards, sidebars. One step lighter than background.
- **Surface Elevated** (#1a1a1a): Hover states, dropdowns, modals. Two steps lighter.
- **Border** (#2a2a2a): Subtle dividers. Low contrast against surfaces—present but not shouting.
- **Text** (#fafafa): Primary text. Near-white for readability on dark backgrounds.
- **Text Muted** (#8a8a8a): Secondary text, labels, timestamps. Reduced opacity for hierarchy.

### Semantic
- **Success** (#4ade80): Active status badges, confirmation states.
- **Error** (#f87171): Validation errors, locked states, destructive actions.

### Named Rules
**The Warmth-Through-Accent Rule.** The body background is never tinted warm. Warmth enters through the accent color, imagery, and typography—not through beige, cream, or sand backgrounds. The dark field is the canvas; the amber is the signature.

**The 10% Accent Rule.** The primary accent appears on ≤15% of any given screen. Its rarity creates focus. When every element is amber, nothing is special.

## 3. Typography

**Display Font:** Playfair Display (with Georgia, serif fallback)
**Body Font:** Inter (with system font stack fallback)

**Character:** The serif/sans pairing creates editorial contrast. Playfair Display brings warmth and craftsmanship to headlines; Inter brings clarity and professionalism to body text. This is a magazine layout, not a dashboard.

### Hierarchy
- **Display** (600 weight, clamp(3rem, 5vw, 4.5rem), 1.25 line-height): Brand name, hero moments. Reserved for YLx wordmark and major section headers.
- **Headline** (500 weight, 1.5rem, 1.25): Page titles, section headers. The workhorse heading.
- **Body** (400 weight, 1rem, 1.5): All readable content. Line length capped at 65-75ch.
- **Label** (500 weight, 0.875rem, 0.2em letter-spacing, uppercase): Navigation, status badges, metadata. Creates hierarchy without competing with headings.

### Named Rules
**The Two-Family Rule.** Never pair two fonts from the same category. Playfair (serif) + Inter (sans) works because they're on opposite axes. Don't add a third family unless replacing one of the two.

## 4. Elevation

The system uses tonal layering over shadows. Depth is conveyed through background color shifts (bg → surface → surface-elevated), not drop shadows. Shadows are reserved for floating elements that脱离 the layout: modals, dropdowns, toast notifications.

### Shadow Vocabulary
- **Ambient** (0 4px 6px -1px rgba(0,0,0,0.5)): Subtle lift for cards on hover.
- **Elevated** (0 10px 15px -3px rgba(0,0,0,0.5)): Dropdowns, popovers.
- **Modal** (0 20px 25px -5px rgba(0,0,0,0.5)): Full overlays, dialogs.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover) or layering (modal, dropdown). If an element always has a shadow, the shadow is wrong.

## 5. Components

### Buttons
- **Shape:** Gently rounded (0.5rem radius)
- **Primary:** Warm amber background (#d4a574), dark text (#0a0a0a), padding 0.75rem 2rem
- **Hover / Focus:** Lighter amber (#e0b88a), subtle translate up (-2px), 200ms ease
- **Ghost/Secondary:** Transparent background, border 1px solid border color, text color

### Cards / Containers
- **Corner Style:** Rounded (0.75rem radius)
- **Background:** Surface color (#141414)
- **Shadow Strategy:** Flat by default; ambient shadow on hover
- **Border:** 1px solid border color (#2a2a2a)
- **Internal Padding:** 1.5rem (spacing-6)

### Inputs / Fields
- **Style:** Dark background (#141414), 2px border (#2a2a2a), rounded (0.5rem)
- **Focus:** Border shifts to accent (#d4a574), subtle glow (0 0 0 3px rgba(212,165,116,0.2))
- **Error:** Border shifts to error color (#f87171)

### Navigation (Admin Sidebar)
- **Style:** Surface background, full height, 250px width
- **Typography:** Label style (uppercase, tracked)
- **Default:** Muted text (#8a8a8a)
- **Hover:** Text brightens to primary text (#fafafa), subtle background shift
- **Active:** Accent text (#d4a574)

### Status Badges
- **Active:** Success color (#4ade80) at 15% opacity, success text
- **Locked:** Error color (#f87171) at 15% opacity, error text
- **Shape:** Small, uppercase, tight padding

## 6. Do's and Don'ts

### Do:
- **Do** use the dark theme as the canvas—let photos and warm accents create the visual interest.
- **Do** use Playfair Display for brand moments and headlines, Inter for everything readable.
- **Do** use tonal layering (bg → surface → elevated) for depth, not shadows.
- **Do** keep the accent rare—its power comes from scarcity.
- **Do** design mobile-first—the gallery experience lives on phones.
- **Do** use motion purposefully: Framer Motion for transitions that guide attention.

### Don't:
- **Don't** use generic SaaS palettes (blue/gray corporate) or template-like UI. YLx should feel crafted, not assembled.
- **Don't** use overly decorative wedding aesthetics (cursive scripts, pink/pastel, floral ornaments). YLx is for professionals.
- **Don't** use AI slop patterns: gradient text, identical card grids, hero-metric templates, tiny uppercase eyebrows on every section.
- **Don't** tint the body background warm (beige, cream, sand). Warmth comes from accent + imagery, not background.
- **Don't** use shadows on flat surfaces—save them for floating layers only.
- **Don't** animate for decoration—every motion should guide attention or confirm an action.
- **Don't** use border-left/right as colored accent stripes on cards or list items.
