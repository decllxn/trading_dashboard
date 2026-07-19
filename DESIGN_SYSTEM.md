# Design System

This is the single source of truth for every visual decision in the app. If a
color, font, spacing, or motion value isn't defined here, it doesn't exist in
the UI. **Never hardcode a hex value in a component — use the Tailwind token.**
If you're unsure what something should look like, look it up here.

**Concept:** an engineered instrument panel / cockpit console — not a generic
SaaS dashboard. Dense, precise, quiet except for one glowing signal color. The
"Jarvis" feel comes not from sci-fi decoration but from the sense that every
number on screen was placed on purpose.

---

## Palette

| Token | Hex | Role |
|---|---|---|
| `bg-base` | `#0B0D10` | page background |
| `bg-surface` | `#14171C` | card / panel background |
| `bg-surface-raised` | `#191D24` | raised surface (hover, popovers) |
| `border-hairline` | `#242931` | **1px borders only**, never a fill |
| `text-primary` | `#E8EAED` | primary text |
| `text-secondary` | `#8B93A1` | secondary text |
| `text-tertiary` | `#565D68` | tertiary / disabled text |
| `accent-signal` | `#4FD1C5` | primary interactive color — cyan-teal instrument glow |
| `accent-alert` | `#F5B841` | AI copilot / important callouts **only** |
| `gain` | `#34D399` | **positive P&L ONLY**, never decorative |
| `loss` | `#F87171` | **negative P&L ONLY**, never decorative |

Rules:

- `accent-signal` is the *only* default interactive color. Use it sparingly so
  it keeps its glow — links, focus rings, active nav, primary CTAs.
- `gain` / `loss` map to real, signed performance values. Never use them for
  decoration, status pills, or "good/bad" affordances that aren't P&L.
- Every token supports opacity modifiers: `bg-surface/50`, `text-gain/80`,
  `border-hairline/60`.

> **`base` token caution:** a Tailwind color named `base` also generates a
> `.text-base { color }` rule that collides with the built-in `.text-base`
> *font-size* utility. The design system never uses `base` as a text color
> (text is `primary` / `secondary` / `tertiary` only), so prefer `text-primary`
> over `text-base` everywhere.

---

## Typography

| Use | Font | Tailwind |
|---|---|---|
| Display / headers | Space Grotesk | `font-display` |
| Body / UI text | IBM Plex Sans | `font-sans` (default) |
| **All numeric data** | IBM Plex Mono, `tabular-nums` | `.num` |

Numeric data rule — **no exceptions**:

- Every price, P&L, stat, percentage, count, and timestamp is rendered in an
  element with the `.num` class (IBM Plex Mono + `tabular-nums`).
- Numbers in tables are **right-aligned, monospaced, always.** Never
  center-align a number.
- The `.num` class is defined globally in `app/globals.css`; it applies both
  `font-family: var(--font-mono)` and `font-variant-numeric: tabular-nums` so a
  single class gives you mono digits that hold their column width.

Fonts are loaded via `next/font/google` in `app/layout.tsx` and exposed as CSS
variables (`--font-display`, `--font-body`, `--font-mono`) consumed by the
Tailwind `fontFamily` theme.

---

## Layout

- **64px left icon rail** — icons only, label expands on hover. Not a big
  branded sidebar.
- **32px signal strip** pinned under the top bar: a live micro-sparkline of the
  equity curve. Always visible — the signature element of the whole app.
- **Cards:** 1px `border-hairline` border, **no drop shadows**, max **6px**
  corner radius (`rounded-card`).
- **8px base spacing unit**, 12-column grid.
- **Hero metric:** an "Edge Score" radial gauge (0–100, composite of win rate +
  expectancy + consistency) — not a big gradient stat card.

---

## Motion

- Numbers **count up on load (once)**, then stay still.
- **150ms** hover transitions. Nothing else animates.
- No page-transition animation. No bounce / spring easing. No confetti.

---

## Explicit anti-slop rules — never do these

- [ ] No purple→blue gradients, anywhere.
- [ ] No emoji in UI copy, headers, or empty states.
- [ ] No default `shadow-lg` cards. Hairline borders only.
- [ ] No pill-shaped badges for everything.
- [ ] No icon-in-colored-circle avatar treatments.
- [ ] No "Welcome back! 👋" style copy — plain, direct, active-voice UI text.
- [ ] Never center-align a number in a table — right-align, monospace, always.

---

## Implementation tokens

Every Tailwind utility below resolves through a CSS variable, so components
never hardcode hex. Color vars are RGB triplets (space-separated) consumed as
`rgb(var(--token) / <alpha-value>)` to enable opacity modifiers. Defined in
`app/globals.css` (`:root`); mapped in `tailwind.config.ts`
(`theme.extend.colors`).

| Tailwind utility | CSS variable | Value |
|---|---|---|
| `bg-base` | `--base` | `11 13 16` (#0B0D10) |
| `bg-surface` | `--surface` | `20 23 28` (#14171C) |
| `bg-surface-raised` | `--surface-raised` | `25 29 36` (#191D24) |
| `border-hairline` | `--hairline` | `36 41 49` (#242931) |
| `text-primary` | `--primary` | `232 234 237` (#E8EAED) |
| `text-secondary` | `--secondary` | `139 147 161` (#8B93A1) |
| `text-tertiary` | `--tertiary` | `86 93 104` (#565D68) |
| `*-accent-signal` | `--accent-signal` | `79 209 197` (#4FD1C5) |
| `*-accent-alert` | `--accent-alert` | `245 184 65` (#F5B841) |
| `text-gain` | `--gain` | `52 211 153` (#34D399) |
| `text-loss` | `--loss` | `248 113 113` (#F87171) |

Font variables (set by `next/font` in `app/layout.tsx`):

| Tailwind | CSS variable | Font |
|---|---|---|
| `font-display` | `--font-display` | Space Grotesk |
| `font-sans` | `--font-body` | IBM Plex Sans |
| `font-mono` / `.num` | `--font-mono` | IBM Plex Mono |

Border radius is capped at **6px** (`rounded-card` / default `rounded`). The
`rounded-full`, `rounded-2xl`, and `rounded-3xl` utilities are intentionally
absent from the theme to prevent pill/blob shapes. `boxShadow` is set to
`none` to enforce the no-shadows rule. `rounded-lg` / `rounded-xl` are capped
at `--radius` (6px) so any shadcn component using them cannot exceed the cap.

---

## shadcn/ui token mapping

shadcn components are configured (`components.json`, `new-york` style) but
**never used unstyled**. Every shadcn component is restyled to design tokens
before first use. To make that automatic, shadcn's semantic color slots are
aliased to design tokens in `app/globals.css` (`:root`) and consumed via the
shadcn `hsl(var(--x) / <alpha>)` convention in `tailwind.config.ts`.

Colliding key names — **`primary`, `secondary`, `accent`** — are owned by the
design system (they're text colors here, not shadcn's button states), so
shadcn's `bg-primary` / `bg-secondary` / `bg-accent` are intentionally **not**
mapped. When a shadcn component references them, restyle it before first use:

| shadcn slot | Restyle to |
|---|---|
| `bg-primary` (primary button/action) | `bg-accent-signal` |
| `text-primary-foreground` | `text-base` (dark on accent-signal) |
| `bg-secondary` / `bg-accent` (quiet surface) | `bg-surface-raised` |
| `text-secondary-foreground` / `text-accent-foreground` | `text-primary` |

The non-colliding shadcn slots are pre-aliased and resolve correctly out of
the box:

| shadcn utility | Resolves to |
|---|---|
| `bg-background` / `text-foreground` | base / primary text |
| `bg-card` / `text-card-foreground` | surface / primary text |
| `bg-popover` / `text-popover-foreground` | surface / primary text |
| `bg-muted` / `text-muted-foreground` | surface-raised / secondary text |
| `bg-destructive` / `text-destructive-foreground` | loss / primary text |
| `border-border` / `border-input` | hairline |
| `ring-ring` | accent-signal |

Rules:

- Prefer the **named design tokens** (`bg-base`, `text-primary`, `accent-signal`…) in hand-written code. The shadcn utilities above exist only so shadcn components inherit the palette on add.
- `gain` / `loss` are never aliased into a shadcn semantic slot — they stay exclusive to real P&L values. `destructive` happens to share loss's red, but that's for destructive-action red, not for displaying a loss.

---

## Style Guard

Paste this block at the top of every build prompt:

```
Design constraint: follow DESIGN_SYSTEM.md exactly. Dark instrument-panel aesthetic —
bg-base #0B0D10, surface #14171C, hairline borders #242931 only (no shadows), accent
#4FD1C5 used sparingly for interactive/signal elements only, gain #34D399 / loss #F87171
used ONLY for real P&L values. Headers in Space Grotesk, body in IBM Plex Sans, every
number in IBM Plex Mono tabular-nums, right-aligned in tables. Max 6px radius. No
gradients, no emoji, no drop shadows, no pill badges, no default shadcn card styling
unmodified. Write clean, typed, componentized code — no inline styles, no dead code,
no placeholder comments left in. If unsure about a color, font, or spacing value, look
it up in DESIGN_SYSTEM.md rather than guessing.
```
