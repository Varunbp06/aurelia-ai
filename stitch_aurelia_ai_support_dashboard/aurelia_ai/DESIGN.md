---
name: Aurelia AI
colors:
  surface: '#fff8f2'
  surface-dim: '#e0d9d2'
  surface-bright: '#fff8f2'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#faf2eb'
  surface-container: '#f4ede6'
  surface-container-high: '#eee7e0'
  surface-container-highest: '#e8e1db'
  on-surface: '#1e1b17'
  on-surface-variant: '#464555'
  inverse-surface: '#33302c'
  inverse-on-surface: '#f7efe9'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#4849da'
  primary: '#4343d5'
  on-primary: '#ffffff'
  primary-container: '#5d5fef'
  on-primary-container: '#faf7ff'
  inverse-primary: '#c1c1ff'
  secondary: '#ae2f34'
  on-secondary: '#ffffff'
  secondary-container: '#ff6b6b'
  on-secondary-container: '#6d0010'
  tertiary: '#00655c'
  on-tertiary: '#ffffff'
  tertiary-container: '#008075'
  on-tertiary-container: '#ddfff9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c1c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2e2bc2'
  secondary-fixed: '#ffdad8'
  secondary-fixed-dim: '#ffb3b0'
  on-secondary-fixed: '#410006'
  on-secondary-fixed-variant: '#8c1520'
  tertiary-fixed: '#89f5e7'
  tertiary-fixed-dim: '#6bd8cb'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#005049'
  background: '#fff8f2'
  on-background: '#1e1b17'
  surface-variant: '#e8e1db'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 24px
  gutter: 16px
---

## Brand & Style
The design system is built on a philosophy of "Humanistic Utility." It targets AI support teams who manage high-volume, emotionally charged customer interactions. The UI must feel like a calm, supportive partner rather than a cold analytical tool.

The style is a refined **Corporate Modern** with a soft, **Tactile** edge. It avoids the clinical harshness of traditional SaaS by using a warm color temperature and generous whitespace. Surfaces are layered to feel like physical paper on a warm desk, utilizing subtle depth to guide the user’s eye without overwhelming them with data density. The emotional response should be one of clarity, reliability, and approachability.

## Colors
The palette is rooted in warmth. The background uses a soft stone-white to reduce eye strain during long shifts. 

- **Primary (Warm Indigo):** Used for primary actions, active navigation states, and brand identifiers.
- **Secondary (Coral):** Reserved for highlights, notifications, or "human-required" intervention markers.
- **Tertiary (Teal):** Used specifically for "AI-handled" or "Success" states to provide a distinct visual cue from the primary brand color.
- **Neutrals:** A range of warm grays (Stone) is used for text and borders to maintain a cohesive thermal profile across the interface.
- **Status Semantic Colors:** 
    - Success: #0D9488 (Teal)
    - Warning/Pending: #F59E0B (Amber)
    - Critical/Failed: #EF4444 (Red)

## Typography
This design system utilizes **Inter** for its exceptional legibility and neutral-yet-friendly character. To enhance the "approachable" narrative, we employ a generous line-height (1.5x to 1.6x for body text) to ensure the interface feels airy.

Headlines should use a slightly tighter letter spacing to maintain a structured, professional look. Labels and small metadata should be set in Medium (500) weight to ensure accessibility against the warm-white background. For high-density tables, `body-md` is the standard to balance information density with readability.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a maximum content width of 1440px for dashboard views. 

- **Sidebar:** A fixed width of 260px. It uses a light theme to keep the interface feeling open.
- **Margins:** A standard 24px margin on desktop, scaling down to 16px on mobile.
- **Rhythm:** An 8px linear scale is used for all component spacing. 
- **Reflow:** On tablet devices, the sidebar collapses into a hamburger menu or a slim icon-only bar (64px). Tables should transition to a card-based list view on mobile devices to preserve readability of AI-generated snippets.

## Elevation & Depth
Depth is communicated through **Tonal Layering** and soft, natural shadows. 

- **Level 0 (Background):** #FAFAF9.
- **Level 1 (Cards/Surface):** Pure #FFFFFF with a 1px border (#E7E5E4).
- **Level 2 (Dropdowns/Modals):** Pure #FFFFFF with a soft, diffused shadow: `0px 4px 12px rgba(87, 83, 78, 0.08)`.

Avoid harsh blacks in shadows; instead, use a tinted neutral (Stone) to maintain the warmth of the design system. Borders are preferred over heavy shadows for primary structural separation to keep the UI looking "restrained" and "clear."

## Shapes
The shape language is consistent and disciplined. A **0.5rem (8px)** corner radius is applied to all primary containers, buttons, and input fields. This provides a soft, approachable feel without appearing juvenile or overly "bubbly."

- **Buttons/Inputs:** 8px (rounded-md).
- **Cards:** 12px (rounded-lg) to provide a clear nesting visual when smaller components (like chips) are inside.
- **Status Badges:** Use a pill-shape (full radius) to distinguish them from interactive buttons.

## Components
- **Buttons:** Primary buttons use a solid Warm Indigo background with white text. Secondary buttons use a white background with a 1px Stone-200 border. 
- **Status Badges:**
    - *Crawled:* Teal background (10% opacity) with Teal text.
    - *Pending:* Amber background (10% opacity) with Amber text.
    - *Failed:* Red background (10% opacity) with Red text.
    - *AI-Handled:* Warm Indigo background (10% opacity) with Primary text.
- **Input Fields:** Use the #FFFFFF surface with an 8px radius and #E7E5E4 border. On focus, the border transitions to Warm Indigo with a subtle 2px glow.
- **Sidebar Items:** Text in #57534E. The active state features a subtle background tint of Primary (5% opacity) and a 3px vertical "pill" indicator on the left edge in solid Warm Indigo.
- **Tables:** No vertical borders. Use horizontal dividers in #E7E5E4. Header row should be in `label-md` with a subtle Stone-50 background.
- **Sliders:** Soft, rounded tracks in Stone-200 with a Primary Indigo thumb. Use for AI "confidence" or "creativity" thresholds.