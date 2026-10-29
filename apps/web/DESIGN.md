---
name: narbel
description: A whiteboard your team and its agents share, in the intentapp.dev design language.
colors:
  canvas: "#f0f0eb"
  canvas-dark: "#161616"
  surface: "#ffffff"
  surface-dark: "#272727"
  surface-muted: "#e1e1de"
  surface-muted-dark: "#1a1a19"
  hover-fill: "rgb(8 8 8 / 0.06)"
  hover-fill-dark: "rgb(255 255 255 / 0.1)"
  ink: "#080808"
  ink-dark: "#f0f0eb"
  ink-muted: "#525250"
  ink-muted-dark: "#babab7"
  ink-subtle: "#696967"
  ink-subtle-dark: "#979794"
  citrus: "#ddec61"
  citrus-ink: "#080808"
  moss: "#63664a"
  moss-dark: "#c5d357"
  moss-light: "#979a73"
  alert: "#b8461a"
  alert-dark: "#f0955a"
typography:
  display:
    fontFamily: "Roboto Serif Variable, ui-serif, Georgia, serif"
    fontSize: "5.625rem"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Roboto Serif Variable, ui-serif, Georgia, serif"
    fontSize: "2.5rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Roboto Serif Variable, ui-serif, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.035em"
  feature:
    fontFamily: "Roboto Serif Variable, ui-serif, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  code:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "5px"
  sm: "8px"
  md: "10px"
  lg: "15px"
  xl: "20px"
  2xl: "25px"
  full: "9999px"
spacing:
  gutter: "10px"
  margin: "30px"
  margin-mobile: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.citrus}"
    textColor: "{colors.citrus-ink}"
  button-citrus:
    backgroundColor: "{colors.citrus}"
    textColor: "{colors.citrus-ink}"
    rounded: "{rounded.lg}"
    height: "40px"
  button-citrus-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "40px"
  button-large:
    rounded: "{rounded.xl}"
    height: "60px"
    padding: "0 30px"
  button-small:
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 14px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "28px"
  menu-item:
    rounded: "{rounded.md}"
    padding: "8px 12px"
  tab-active:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "32px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
---

# Design System: narbel

## Overview

**Creative North Star: "The Shared Desk"**

narbel borrows its whole visual language from intentapp.dev, by the owner's choice: a warm grey desk surface, white sheets laid on it, a serif voice for names and headlines, and Inter for everything you operate. Nothing on the desk has an outline. Sheets lift off the desk with a soft shadow, and the only colour is citrus, used like a highlighter on the one thing that matters in a region.

The app follows the system theme. Light is a sunlit desk (`#f0f0eb` under white sheets); dark is the same desk at night (`#161616` under `#272727` sheets) with citrus taking over as the focus colour. The canvas follows Excalidraw's own light and dark themes, so chrome around it is quiet, small, and grouped into a few soft islands.

The landing page is the one loud surface: display serif at 90px, a marquee of example boards, and an illustrated board where a teammate's comment is answered by an agent drawing on the canvas.

**Key Characteristics:**

- Warm neutrals with one citrus accent.
- Serif for names and headlines, Inter for controls, mono only for keys and URLs.
- Surfaces separated by tone and shadow, never by borders.
- Generous radii: 10px controls, 15px default controls and islands, 20px surfaces.
- Black buttons that swap to citrus on hover, slowly (500ms, `cubic-bezier(.6,0,.1,1)`).

## Colors

Warm, slightly yellowed greys carry everything; citrus is the single accent.

### Primary

- **Citrus** (#ddec61): the primary call to action in a region (header "Start drawing", board "Share"), the selected Excalidraw tool, the live sync dot, the pressed comment toggle, the agent in illustrations, and text selection. Always with ink text (#080808, 15.5:1). Never the only cue for state on light surfaces (1.1 to 1.3:1 against the desk); pair it with ink.

### Secondary

- **Moss** (#63664a light, #c5d357 dark): endpoint and code text, such as the MCP URL.
- **Light Moss** (#979a73): illustrative avatars and chart fills only.

### Neutral

- **Desk** (#f0f0eb light, #161616 dark): page canvas.
- **Sheet** (#ffffff light, #272727 dark): cards, dialogs, popovers, inputs, toolbar islands.
- **Recess** (#e1e1de light, #1a1a19 dark): muted fills, skeletons, code wells, grouped choices.
- **Hover Fill** (ink at 6% / white at 10%): ghost, tab and menu hover. Translucent so it shows on both the desk and sheets.
- **Ink** (#080808 / #f0f0eb): text and primary buttons. In dark mode the primary button inverts to white.
- **Muted Ink** (#525250 / #babab7): secondary copy. 6.8:1 on the light desk.
- **Subtle Ink** (#696967 / #979794): timestamps and meta. Tuned from Intent's #757575 to reach 4.8:1 on the desk.
- **Hairline** (ink at 10% / white at 10%): dividers inside floating layers only.
- **Alert** (#b8461a / #f0955a): destructive text and actions, warm like Intent's #e87f39 but darkened for 4.5:1.

### Named Rules

**The Highlighter Rule.** Citrus marks the primary action and live state. It never fills a large region of app UI, and it never carries meaning alone.

## Typography

**Display Font:** Roboto Serif Variable (fallback ui-serif, Georgia). An open-license stand-in for Intent's ABC Arizona Mix, chosen after rendering six open serifs against it for contrast and width. **Body Font:** Inter Variable (fallback system-ui). **Mono Font:** JetBrains Mono Variable, for API keys, URLs, and code only.

**Character:** a calm, slightly wide serif that names things, over a workhorse sans that does things.

### Hierarchy

- **Display** (400, 90px desktop / 72px tablet / 44px mobile, 0.95, -0.04em): landing hero only.
- **Status word** (400, clamp(7rem, 24vw, 18rem), 1, -0.04em): the "404" and "Oops" words on the not-found and error pages only.
- **Title** (400, 40px, 1, -0.035em): page titles ("Boards"), landing section headings on desktop.
- **Headline** (400, 32px, 1, -0.035em): section headings, dialog titles, auth panel titles.
- **Feature** (400, 24px, 1.05, -0.02em): board card titles, empty-state titles, card titles.
- **Body** (400, 14px to 17px, 1.4 to 1.45, -0.01em): copy. Landing paragraphs run 17px.
- **Label** (500, 14px or 13px, 1.15): buttons, field labels, tabs.

### Named Rules

**The Never-Bold Serif Rule.** Display faces stay at weight 400. Emphasis comes from size.

## Layout

A 30px outer margin (20px on mobile) and 10px gutters, as on intentapp.dev. App pages sit in a centred `max-w-6xl` column; board grids are 1, 2, then 3 columns with 10px gaps. The header is an 80px three-column grid: links left, mark centred, account right. Board routes drop the header and use their own 56px window bar plus a 44px tab row, so the canvas gets the rest. Landing sections are separated by 112 to 160px of space, never by rules.

## Elevation & Depth

Depth comes from tone first (desk, sheet, recess) and a single soft shadow second. Floating layers add a hairline ring because they overlap arbitrary content.

### Shadow Vocabulary

- **Surface** (`0 10px 20px rgb(71 71 65 / .05)`, dark `rgb(0 0 0 / .25)`): resting cards, islands, the active tab, secondary buttons.
- **Elevated** (`0 10px 20px rgb(0 0 0 / .1)`, dark `rgb(0 0 0 / .45)`): dialogs, menus, toasts, comment threads, hovered board cards.

### Named Rules

**The No-Outline Rule.** A resting surface never has a border. If it needs separating, change its tone.

## Shapes

Soft rectangles throughout. Radii step 8px (extra-small controls), 10px (small controls, inputs, menu items, tabs), 15px (default controls, islands, toasts), 20px (cards, dialogs, popovers), 25px (the landing window frame). Full rounding is reserved for avatars, status dots, and the account pill. The brand mark is one rounded pen stroke forming an "n" with a dot for a collaborator's cursor.

## Components

### Buttons

- **Shape:** 15px radius at 40px tall; 20px at 60px (landing); 10px at 32px; 8px at 28px.
- **Primary:** ink background, desk-coloured text, 20px horizontal padding, 14px medium Inter.
- **Hover / Focus:** primary and secondary swap to citrus over 500ms with `cubic-bezier(.6,0,.1,1)`; citrus swaps to ink. Large landing buttons also roll their label upward. Focus is a 2px solid outline in the ring colour (ink light, citrus dark) offset by 3px. Tailwind v4's `outline-none` and `outline-hidden` both zero the outline style, so every focus variant pairs `outline-2` with `outline-solid`.
- **Secondary:** sheet background with the surface shadow. **Ghost:** transparent with hover fill, 150ms. **Outline:** 15% ink hairline. **Destructive:** alert at 12% tint, solid on hover.

### Chips

- **Status pill:** 24px tall, full radius, sheet background with a 6px dot (citrus live, subtle ink pulsing while syncing, alert offline).
- **Method chip:** citrus, 8px radius, 12px medium text ("POST").

### Cards / Containers

- **Corner Style:** 20px.
- **Background:** sheet.
- **Shadow Strategy:** surface at rest, elevated on hover for clickable cards (with a 2px lift).
- **Border:** none.
- **Internal Padding:** 20px (board cards), 28px (auth panels, dialogs).

### Inputs / Fields

- **Style:** 40px tall, 10px radius, sheet background, 1px input stroke (ink at 20%), 14px text, subtle-ink placeholder.
- **Focus:** 2px ring-colour outline offset 2px; no glow.
- **Error / Disabled:** alert outline and 13px alert message; disabled uses the recess fill.

### Navigation

- **Header links:** 14px Inter, underline appears on hover and stays on the active route.
- **Board tabs:** 32px tall, 10px radius; inactive muted ink with hover fill, active on a sheet with the surface shadow.
- **Account pill:** full radius sheet with a citrus initials disc; its menu holds identity, the theme choice (System, Light, Dark), and sign out.

### Board Canvas

The board is a full-viewport Excalidraw canvas. A name card (mark, serif title, status) floats beside Excalidraw's menu button; presence, comment toggle, a citrus Share and the account pill sit in Excalidraw's top-right slot; page tabs sit in its footer; preferences, theme and export live in its main menu. Phones get one bottom drawer instead. Excalidraw's islands are re-tokenised to the same radii, Inter, white surfaces and citrus selection.

### Status Pages

Not-found and error pages show their status word as a shape selected on a dotted canvas: a 1.5px selection box with Excalidraw-style corner and rotation handles (moss for missing, alert for errors), and the agent's cursor at the bottom-right handle saying one line in an ink bubble. One CSS sequence (word rises, box snaps on, cursor arrives, bubble appears) that ends visible and is skipped under reduced motion. The error page offers Try again (resets the boundary and reloads route data), Back home, and collapsible error details in a mono well.

## Do's and Don'ts

### Do:

- **Do** reserve citrus for the primary action and live state, always with ink text.
- **Do** separate surfaces by tone and the surface shadow, not borders.
- **Do** set every name and heading in the serif at weight 400, and every control in Inter.
- **Do** follow the system theme and check both themes before shipping.
- **Do** keep letter-spacing at or above -0.04em.

### Don't:

- **Don't** add borders to resting cards or put a border under a shadow.
- **Don't** use mono for anything that isn't a key, URL, or code.
- **Don't** add eyebrow labels above headings or gradient text.
- **Don't** paint large citrus fields in app UI; citrus is a highlighter, not a background.
- **Don't** recolour the drawing canvas beyond Excalidraw's own light and dark themes.
- **Don't** write a focus `outline-2` without `outline-solid` next to it; on a control with `outline-none` or `outline-hidden` it renders nothing.
