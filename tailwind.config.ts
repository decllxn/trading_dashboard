import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

/**
 * Tailwind theme for the trading dashboard instrument-panel aesthetic.
 *
 * Design colors are stored as RGB triplets in app/globals.css (:root) and
 * consumed here via `rgb(var(--token) / <alpha-value>)`. This gives every
 * design token opacity-modifier support (e.g. `bg-surface/50`, `text-gain/80`)
 * WITHOUT any component ever hardcoding a hex value.
 *
 * shadcn/ui semantic keys (background, card, popover, muted, destructive,
 * border, input, ring) are stored as HSL channels and consumed via
 * `hsl(var(--x) / <alpha>)` — the shadcn convention. They are aliases to the
 * design palette, not a second palette; never reference them in hand-written
 * code. Colliding keys (primary/secondary/accent) are intentionally NOT in the
 * shadcn layer — design tokens own them. See DESIGN_SYSTEM.md.
 *
 * Token map (see DESIGN_SYSTEM.md for roles):
 *   base            #0B0D10   page background         -> bg-base
 *   surface         #14171C   card/panel background   -> bg-surface
 *   surface-raised  #191D24   raised surface          -> bg-surface-raised
 *   hairline        #242931   1px borders ONLY        -> border-hairline
 *   primary         #E8EAED   primary text            -> text-primary
 *   secondary       #8B93A1   secondary text          -> text-secondary
 *   tertiary        #565D68   tertiary text           -> text-tertiary
 *   accent-signal   #4FD1C5   primary interactive     -> bg-/text-/border-accent-signal
 *   accent-alert    #F5B841   AI copilot / callouts   -> bg-/text-/border-accent-alert
 *   gain            #34D399   positive P&L ONLY       -> text-gain (never decorative)
 *   loss            #F87171   negative P&L ONLY       -> text-loss (never decorative)
 *
 * CAUTION: a color named `base` also emits a `.text-base { color }` utility
 * that collides with Tailwind's built-in `.text-base` (font-size). The design
 * system never uses `base` as a text color — text is primary/secondary/tertiary
 * only — so prefer `text-primary` over `text-base` everywhere.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // --- Design tokens (authoritative; use these in hand-written code) ---
        base: 'rgb(var(--base) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        secondary: 'rgb(var(--secondary) / <alpha-value>)',
        tertiary: 'rgb(var(--tertiary) / <alpha-value>)',
        'accent-signal': 'rgb(var(--accent-signal) / <alpha-value>)',
        'accent-alert': 'rgb(var(--accent-alert) / <alpha-value>)',
        gain: 'rgb(var(--gain) / <alpha-value>)',
        loss: 'rgb(var(--loss) / <alpha-value>)',

        // --- shadcn/ui semantic aliases (HSL; used by shadcn components) ---
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        // DESIGN_SYSTEM.md: max 6px corner radius. Cards use rounded-card (6px);
        // small controls use rounded-sm (3px). rounded-full / 2xl / 3xl are
        // intentionally absent to prevent the pill/blob anti-slop patterns.
        // lg/xl below are capped at 6px so shadcn's default `rounded-lg`/`rounded-xl`
        // cannot exceed the design-system cap when components are added.
        sm: '3px',
        DEFAULT: '6px',
        card: '6px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        xl: 'var(--radius)',
      },
      boxShadow: {
        // DESIGN_SYSTEM.md: NO drop shadows. Hairline borders only.
        none: 'none',
      },
      transitionDuration: {
        // DESIGN_SYSTEM.md: 150ms hover transitions, nothing else.
        DEFAULT: '150ms',
      },
      spacing: {
        // 8px base spacing unit exposed as a named token alongside the
        // default Tailwind scale.
        unit: '8px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
