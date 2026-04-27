# Teenage Engineering Design System for CareerOS

> **What this is:** the design language for the CareerOS UI, derived from Teenage Engineering's product design vocabulary (OP-1, OP-Z, TX-6, Pocket Operator). This document gets handed to whatever frontend gets built (Next.js + Tailwind, or a TUI like career-ops uses, depending on Phase 2 decision).

## The design philosophy in three sentences

1. **Every pixel earns its place.** No decoration. No gradients for vibe. If a label, line, or color isn't communicating, it's removed.
2. **Function before aesthetics, but aesthetics from function.** The look comes from honest exposure of the system — labels are visible, controls are labeled with what they do, every surface has a purpose.
3. **Dense information, generous white space around it.** Charts pack data tightly. Around the data: breathing room. Never the inverse.

## Color palette

Teenage Engineering uses two main color modes. CareerOS uses both as themes.

### Light theme — "OP-1"

```yaml
background:        "#F4F4F4"   # off-white, paper
surface:           "#FFFFFF"   # pure white for cards
border:            "#1A1A1A"   # near-black, hairline borders
text-primary:      "#0A0A0A"   # near-black
text-secondary:    "#666666"   # mid-grey, microtypography
text-tertiary:     "#999999"   # faded labels
accent-primary:    "#FF6B00"   # OP-1 orange — the only saturated color
accent-success:    "#00A86B"   # used sparingly, for "scored well" indicators
accent-error:      "#D32F2F"   # used sparingly, for "rejected" or errors
status-sourced:    "#666666"   # grey
status-applied:    "#0066CC"   # cool blue
status-interview:  "#FF6B00"   # accent orange
status-offer:      "#00A86B"   # green
status-rejected:   "#D32F2F"   # red
status-archived:   "#CCCCCC"   # very faded
```

### Dark theme — "TX-6"

```yaml
background:        "#0A0A0A"   # near-black
surface:           "#1A1A1A"   # slightly lighter for cards
border:            "#333333"   # dark grey hairlines
text-primary:      "#F4F4F4"   # off-white
text-secondary:    "#999999"   # mid-grey
text-tertiary:     "#666666"   # faded
accent-primary:    "#FF6B00"   # same orange — works in both themes
# status colors same as light theme — orange/blue/green/red still legible
```

**Critical rule:** orange is the only saturated brand color. Status colors (blue/green/red) appear only on small UI elements (status pills, score indicators, error messages). Never as backgrounds. Never as accents elsewhere.

## Typography

### The two fonts

**Display + UI:** `Inter` (or `Space Grotesk`)
- Geometric grotesque
- Wide character spacing at small sizes
- Use for: headlines, body text, button labels

**Mono:** `JetBrains Mono` (or `Berkeley Mono` if licensed)
- Used liberally — most of the UI is mono
- Status pills, tags, IDs, dates, scores, file paths, code-like data
- This is the most distinctive choice — TE uses mono everywhere meaningful

### Type scale (rem-based, rems = 16px default)

```yaml
display:      "2.0rem  / 1.1 / -0.02em"   # large numerics
title:        "1.5rem  / 1.2 / -0.01em"   # page titles
heading:      "1.125rem / 1.3 / 0"         # section headings
body:         "0.9375rem / 1.5 / 0"        # default body
small:        "0.8125rem / 1.4 / 0"        # secondary text
label:        "0.6875rem / 1.2 / 0.05em"   # uppercase labels (TE signature)
```

The `label` style is critical. **All UI labels are uppercase, mono, small, with positive letter-spacing.** This is what makes the interface read as Teenage-Engineering rather than generic minimalism.

## Spatial system

Use a **4px base grid**. All spacing values are multiples of 4.

```yaml
spacing:
  xs:    4px
  sm:    8px
  md:   16px
  lg:   24px
  xl:   32px
  xxl:  48px
  xxxl: 64px
```

### Layout rules

- **Cards have hairline borders, not shadows.** TE doesn't use elevation. 1px solid border, that's it.
- **Dividers are hairlines too.** 1px, full bleed where appropriate.
- **Padding inside cards: 16-24px.** Padding around cards: 24-32px.
- **Corner radius: 0px or 2px.** Not 8px, not 12px. TE products are not rounded — they're sharp with slight softening at most.

## Components vocabulary

### Status pill

```
[ APPLIED · 14D ]        # uppercase, mono, hairline border, label-style
[ INTERVIEW · 2H ]       # subtle accent color for active states
[ REJECTED · STALE ]     # muted color for terminal states
```

Pills are **always** monospace, **always** uppercase, **always** include a secondary metadata field (time, score, count).

### Score indicator

```
SCORE  ████████░░  8.2
```

Filled blocks (Unicode `█`) for filled portion, light blocks (`░`) for empty. Number on the right, mono. The bar IS the score, not a decoration.

### Application card

```
┌───────────────────────────────────────────────────┐
│ TALABAT — SR PRODUCT MANAGER, AI                  │
│ ──────────────────────────────────────────────    │
│ DUBAI · REMOTE OK    [ TAILORED · 3D ]           │
│                                                   │
│ SCORE  ████████░░  8.2     BUCKET  AI-PRODUCT    │
│                                                   │
│ NEXT: AWAITING RESPONSE                           │
└───────────────────────────────────────────────────┘
```

Notice: hairline border, no shadow, mono labels in caps, content left-aligned to label, plenty of internal whitespace, two-column data presentation.

### Button

```
[ TAILOR ]      [ ARCHIVE ]      [ APPLY · DRY-RUN ]
```

Buttons are: hairline border, uppercase mono label, internal padding 12px horizontal × 8px vertical, hover state inverts (background becomes border color).

**Primary action:** orange background, white text, no border.
**Secondary action:** transparent background, hairline border, text in primary color.
**Destructive:** red border, red text, transparent background. On hover: red fill, white text.

### Input field

```
[ company name ____________________ ]
[ jd url       ____________________ ]
```

Underline-only, no box. Label below in uppercase mono.

## Microtypography rules

- **Numbers are mono.** Always. Even inline in body text.
- **Dates are formatted as `DD MMM YYYY` or `YYYY-MM-DD` ISO.** Never `MM/DD/YY`.
- **Times are 24-hour.** `14:30`, never `2:30 PM`.
- **File paths and IDs are mono and selectable.**
- **Status labels are uppercase.** "applied" → `APPLIED`.
- **Counts always include the unit.** `12 jobs`, not just `12`.

## What NOT to do

- No drop shadows
- No gradients (except in the OP-Z LED meter style, which we're not building)
- No icons except a handful of monochromatic ones (clock, arrow, search, plus, x). No emoji.
- No rounded corners on cards
- No decorative elements
- No "fun" colors. The palette above is the entire palette.
- No hover animations longer than 150ms
- No splash screens, loading spinners (use a one-pixel progress bar instead)

## Reference products

If you're unsure about a design choice, cross-check against these:

- **OP-1 field** — the visual language reference for cards and primary controls
- **OP-Z** — the dense data display reference for the tracker grid
- **TX-6** — the dark mode reference
- **Pocket Operator** series — the small numeric display style
- **TP-7** — the audio recorder, for status indicators and minimalist control labeling

Look at the actual products at teenage.engineering. The website itself is also a reference — it's the design system applied to a website.

## Implementation hint

For Tailwind CSS users, the entire color and spacing system maps directly to the `tailwind.config.js` `theme` extension. The mono font requires a `@font-face` import or self-hosting JetBrains Mono.

For a TUI (terminal UI) implementation like career-ops uses, the design language adapts naturally — terminals are already monospace, and ANSI colors approximate the palette well enough.

## How to test if a design is "TE enough"

A simple check: **squint at the screen.** If you can still tell what's primary information vs metadata vs controls, you've succeeded. If everything blurs together into a uniform grey, you've over-decorated. If it looks like a SaaS dashboard from any startup, you've under-committed to the language.
