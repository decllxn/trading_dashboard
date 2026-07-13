# Ultimate Trading Journal — Build Plan for AI Coding Agent

How to use this: work through the phases in order. Each sub-phase (1a, 1b, 1c...) is one
self-contained prompt — paste it into your coding agent as-is, let it finish, review/test,
then move to the next. Don't skip ahead; each phase assumes the previous ones are done.

Every prompt ends with a **Definition of Done** — don't move on until it's true.

---

## 0. Design System (build this FIRST, once)

This is the one-time setup that every later prompt will reference. It exists so your agent
never has to "decide" what something should look like — it just looks it up.

**Concept:** an engineered instrument panel / cockpit console — not a generic SaaS dashboard.
Dense, precise, quiet except for one glowing signal color. This is what gives you the "Jarvis"
feel: not sci-fi decoration, but the sense that every number on screen was placed on purpose.

```
Palette
  bg-base:            #0B0D10
  bg-surface:         #14171C
  bg-surface-raised:  #191D24
  border-hairline:    #242931
  text-primary:       #E8EAED
  text-secondary:     #8B93A1
  text-tertiary:      #565D68
  accent-signal:      #4FD1C5   (primary interactive color — cyan-teal instrument glow)
  accent-alert:       #F5B841   (AI copilot / important callouts only)
  gain:               #34D399   (positive P&L ONLY, never decorative)
  loss:               #F87171   (negative P&L ONLY, never decorative)

Typography
  Display/headers:  Space Grotesk
  Body/UI text:     IBM Plex Sans
  ALL numeric data: IBM Plex Mono, tabular-nums — every price, P&L, stat, percentage,
                     always monospaced, always right-aligned in tables. No exceptions.

Layout
  - Fixed 64px left icon rail (expands label on hover), not a big branded sidebar
  - 32px "signal strip" pinned under the top bar: a live micro-sparkline of the equity
    curve — this is always visible, it's the signature element of the whole app
  - Cards: 1px hairline border (border-hairline), NO drop shadows, max 6px corner radius
  - 8px base spacing unit, 12-column grid
  - Hero dashboard metric: an "Edge Score" radial gauge (0–100, composite of win rate +
    expectancy + consistency), not a big gradient stat card

Motion
  - Numbers count up on load (once), 150ms hover transitions, nothing else animates.
  - No page-transition animation, no bounce/spring easing, no confetti.

Explicit anti-slop rules — never do these:
  - No purple→blue gradients, anywhere
  - No emoji in UI copy, headers, or empty states
  - No default shadow-lg cards
  - No pill-shaped badges for everything
  - No icon-in-colored-circle avatar treatments
  - No "Welcome back! 👋" style copy — plain, direct, active-voice UI text
  - Never center-align a number in a table — right-align, monospace, always
```

**Prompt 0 — create the design system file:**
> Create `DESIGN_SYSTEM.md` at the repo root containing the palette, typography, layout,
> motion, and anti-slop rules below [paste the block above]. Then create a Tailwind config
> that maps every color above to a CSS variable and Tailwind theme token (e.g.
> `bg-base`, `text-primary`, `accent-signal`, `gain`, `loss`) so no component ever hardcodes
> a hex value. Import Space Grotesk, IBM Plex Sans, and IBM Plex Mono via next/font. Set
> `font-mono` with `font-variant-numeric: tabular-nums` globally for any element with class
> `.num`. Do not build any UI yet — this is tokens and config only.
>
> **Definition of done:** `DESIGN_SYSTEM.md` exists, Tailwind theme tokens resolve to the
> correct hex values, all three fonts load, `.num` class applies tabular-nums.

---

### The Style Guard (paste this into every single prompt below, at the top)

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

---

## Phase 1 — Foundation

**1a. Project init**
> [Style Guard] Initialize a Next.js 14+ App Router project with TypeScript, Tailwind,
> ESLint, and Prettier. Set up the folder structure: `/app`, `/components`, `/lib`,
> `/types`, `/hooks`. Install and configure shadcn/ui but do NOT use any component
> unstyled — every shadcn component gets restyled to match DESIGN_SYSTEM.md tokens before
> first use. Add a `.env.local.example` file listing every env var this project will
> eventually need (leave values blank): Supabase URL/key, SnapTrade client ID/secret,
> Alpaca key, Twelve Data key, Anthropic API key.
> **Done when:** `npm run dev` runs a blank styled page with correct fonts/colors loading,
> no console errors.

**1b. Supabase project + connection**
> [Style Guard] Set up a Supabase client in `/lib/supabase.ts` (browser + server variants).
> Add auth helpers for Next.js App Router (SSR-safe session handling). Do not create any
> tables yet — this is just the connection layer.
> **Done when:** a test server component can successfully query `supabase.auth.getUser()`
> without errors.

**1c. Authentication**
> [Style Guard] Build login and signup pages using Supabase email/password auth. Include a
> minimal, non-generic auth screen — no centered-card-on-gradient-background cliché; use
> the instrument-panel aesthetic (dark, hairline border, monospace for any code/OTP input).
> Add a protected route wrapper so `/dashboard/*` redirects to `/login` if unauthenticated.
> Add a simple account menu (email, sign out) in the top bar.
> **Done when:** you can sign up, get redirected to an empty dashboard shell, sign out, and
> get redirected back to login.

**1d. App shell**
> [Style Guard] Build the persistent app shell: the 64px left icon rail (Dashboard, Trades,
> Journal, Simulations, Copilot, Settings — icons only, label on hover), the top bar
> (account menu, active account/timeframe selector), and the 32px signal-strip placeholder
> under the top bar (static flat line for now — real data comes in Phase 5). Every page
> from here on renders inside this shell.
> **Done when:** navigating between empty placeholder pages keeps the shell persistent and
> correctly highlights the active nav item.

---

## Phase 2 — Data Model

**2a. Trades schema**
> [Style Guard] Design and create a Supabase Postgres table `trades` with row-level
> security scoped to `auth.uid()`. Columns: id, user_id, instrument, asset_class (equity/
> forex/futures/crypto/option), direction (long/short), entry_price, exit_price, size,
> stop_price, target_price, entry_time, exit_time, pnl, r_multiple, status (open/closed),
> source (manual/csv/snaptrade), broker_connection_id (nullable), created_at. Write the
> Drizzle (or Prisma — pick one and use it consistently everywhere after this) schema and
> migration.
> **Done when:** migration runs clean, RLS confirmed (a second test user cannot see the
> first user's rows).

**2b. Tags & setups schema**
> [Style Guard] Create `tags` (id, user_id, name, category — where category is one of
> setup/ict_concept/session/emotion) and a join table `trade_tags` (trade_id, tag_id).
> Seed each new user with a default tag set on signup: ICT concepts (Order Block, FVG,
> Liquidity Sweep, Breaker, Mitigation Block), sessions (London, New York, Asia), and a
> few emotion tags (Disciplined, FOMO, Revenge Trade, Hesitant).
> **Done when:** a new signup automatically has the default tags in their account, tags
> are user-scoped via RLS.

**2c. Journal schema**
> [Style Guard] Create `journal_entries` (id, user_id, date, content — store as Tiptap
> JSON, mood, created_at) and `journal_trade_links` (journal_entry_id, trade_id) so notes
> can reference specific trades.
> **Done when:** migration runs clean, RLS confirmed.

**2d. Broker connections schema**
> [Style Guard] Create `broker_connections` (id, user_id, provider — snaptrade/manual,
> external_account_id, broker_name, status, last_synced_at, created_at). This table will
> be populated in Phase 8 — just get the schema right now.
> **Done when:** migration runs clean.

---

## Phase 3 — Manual Trade Logging (this is your MVP core)

**3a. Trade entry form**
> [Style Guard] Build a trade entry form (modal or dedicated page — your choice, but be
> consistent) covering all `trades` fields from 2a plus tag selection (multi-select from
> `tags`, grouped by category). Validate: exit fields optional if status=open, R-multiple
> auto-calculated from entry/stop/exit if all three are present (don't make the user type
> it). Numeric inputs use monospace font per the design system.
> **Done when:** submitting creates a row in `trades` and any selected tags in `trade_tags`,
> visible immediately (no page reload needed).

**3b. Trade list view**
> [Style Guard] Build `/trades` — a dense, sortable, filterable table (not cards) of all
> trades: instrument, direction, entry/exit, P&L (color-coded gain/loss, monospace,
> right-aligned), R-multiple, tags (small hairline-bordered chips, not colored pills),
> date. Add filters for asset class, tag, date range, status. Add column sorting.
> **Done when:** table correctly reflects all trades, filters and sorts work without full
> page reload, empty state has real instructional copy (no emoji, no filler).

**3c. Trade detail page**
> [Style Guard] Build `/trades/[id]` showing full trade detail: all fields, tags, any
> linked journal entries (from 2c/7b, can be empty for now), and a placeholder for the
> chart (real chart comes in Phase 6). Include edit and delete actions.
> **Done when:** navigating from the trade list opens the correct detail page; edits
> persist; delete removes the row and redirects to the list.

**3d. Edit/delete polish**
> [Style Guard] Add inline editing on the trade list (double-click a cell to edit, common
> in real trading journals) as an alternative to the full edit form, plus bulk actions
> (select multiple rows → bulk delete or bulk tag). Add optimistic UI updates so edits feel
> instant.
> **Done when:** inline edits save correctly with optimistic UI and rollback-on-error;
> bulk select/delete/tag works.

---

## Phase 4 — CSV / Statement Import

**4a. CSV upload UI**
> [Style Guard] Build an import flow: file drop zone (styled per design system, not a
> default browser file input look), file parses client-side (Papaparse), shows a preview
> table of the first 10 rows before committing.
> **Done when:** dropping a CSV shows an accurate preview without hitting the server.

**4b. Column mapping**
> [Style Guard] Since every broker's CSV export has different column names, build a
> mapping UI: detected columns on one side, required `trades` fields on the other, with
> auto-suggested matches (fuzzy match column names) that the user can override via
> dropdown. Save the user's mapping per broker name so re-imports from the same broker
> skip this step next time.
> **Done when:** an unmapped CSV can be manually mapped and imported correctly; a
> previously-mapped broker's CSV auto-applies the saved mapping.

**4c. Dedup logic**
> [Style Guard] Before inserting imported rows, check for duplicates against existing
> trades (match on instrument + entry_time + size within a small tolerance). Show the user
> a summary before committing: "N new trades, M duplicates skipped" with the ability to
> review skipped rows.
> **Done when:** re-importing the same file twice does not create duplicate trades.

**4d. PDF statement parsing (stretch)**
> [Style Guard] Add PDF broker-statement upload: extract text server-side, use the
> Anthropic API with a structured-output prompt to extract trade rows into the same shape
> as the CSV importer, then route through the same mapping/dedup flow from 4b/4c.
> **Done when:** a real PDF broker statement produces correctly-parsed trades, routed
> through the existing dedup check.

---

## Phase 5 — Core Analytics Dashboard

**5a. Stats engine**
> [Style Guard] Build `/lib/stats.ts`: pure functions taking a trades array and returning
> win rate, expectancy, profit factor, average R, max drawdown, current streak, Sharpe and
> Sortino (using daily P&L series). Write unit tests with a known sample trade set and
> hand-verified expected outputs — do not trust the formulas without a test.
> **Done when:** tests pass against hand-calculated expected values.

**5b. Dashboard overview**
> [Style Guard] Build `/dashboard` as the home page: the Edge Score radial gauge (hero
> element, composite of win rate/expectancy/consistency — define the composite formula
> explicitly and document it in a comment), plus a stat grid (win rate, expectancy,
> profit factor, max drawdown, current streak) using monospace numerals, hairline-bordered
> cards, no shadows.
> **Done when:** all numbers match `/lib/stats.ts` output for the logged-in user's real
> trade data.

**5c. Equity curve**
> [Style Guard] Build the equity curve chart using TradingView Lightweight Charts (area
> series), driven by real trade P&L over time. Wire this same data into the top-bar signal
> strip from 1d, replacing the static placeholder line.
> **Done when:** equity curve renders correctly, signal strip mirrors it in miniature.

**5d. R-multiple distribution**
> [Style Guard] Build a histogram of R-multiples across all closed trades (use Recharts or
> similar — this one doesn't need to be a candlestick library). Bucket sensibly (e.g. -3R
> to +5R in 0.5R buckets), color bars using gain/loss tokens based on sign.
> **Done when:** histogram accurately reflects the trade set and updates when trades change.

---

## Phase 6 — Charting

**6a. Lightweight Charts setup**
> [Style Guard] Install `lightweight-charts`. Build a reusable `<TradeChart />` component
> that takes an instrument + time range and renders a candlestick chart (initially fed by
> mock/static OHLC data — live data connects in Phase 9).
> **Done when:** the component renders a correct candlestick chart in isolation (e.g. on a
> test page).

**6b. Entry/exit markers**
> [Style Guard] Extend `<TradeChart />` to accept a trade object and overlay entry, stop,
> target, and exit as markers/lines on the chart. Wire it into the trade detail page from
> 3c, replacing the placeholder.
> **Done when:** opening any trade's detail page shows its actual entry/exit/stop plotted
> correctly on the chart.

**6c. ICT annotation tool**
> [Style Guard] Add a lightweight drawing tool on `<TradeChart />` for manually marking a
> Fair Value Gap (a shaded price-range rectangle) or Order Block (a highlighted candle
> range), savable per trade and re-rendered on load. Keep the tool minimal — this is
> annotation, not a full charting-platform drawing suite.
> **Done when:** a user can draw and save an FVG/OB box on a trade's chart and it persists
> and reloads correctly.

**6d. Session overlays**
> [Style Guard] Add optional shaded vertical bands on the chart marking London/New York/
> Asia session windows (configurable in settings, since these are timezone-dependent),
> toggleable via a small control above the chart.
> **Done when:** toggling sessions on/off correctly shades the right time windows for the
> instrument's timezone.

---

## Phase 7 — Journal

**7a. Rich text editor**
> [Style Guard] Integrate Tiptap for the journal entry editor: basic formatting
> (bold/italic/lists/headings), styled to match the design system (no default browser
> prose styling — use the type scale from DESIGN_SYSTEM.md).
> **Done when:** content saves as Tiptap JSON to `journal_entries` and re-renders correctly
> on reload.

**7b. Daily journal + trade linking**
> [Style Guard] Build `/journal` as a calendar-style view (week or month toggle) where each
> day shows a dot if an entry exists, opens the editor for that date on click. Add the
> ability to link specific trades to an entry (search/select from that day's trades).
> **Done when:** creating an entry for a date with trades correctly links them, and the
> trade detail page (3c) now shows linked journal entries.

**7c. Mood/mistake tagging**
> [Style Guard] Add mood tag selection to each journal entry (from the emotion tags seeded
> in 2b) and a simple "mistake" checkbox/tag list (e.g. "Moved stop", "Oversized",
> "Chased entry"). Surface a mood-over-time mini chart on the dashboard.
> **Done when:** mood/mistake tags save correctly and the mini chart on `/dashboard`
> reflects real data.

**7d. Journal search**
> [Style Guard] Add full-text search across journal entries (Postgres full-text search is
> fine, no need for a separate search service at this scale).
> **Done when:** searching a keyword returns entries containing it, ranked reasonably.

---

## Phase 8 — Broker Sync (SnapTrade)

**8a. SnapTrade connection flow**
> [Style Guard] Integrate the SnapTrade SDK server-side. Build the "Connect a broker" flow
> in Settings: register the user with SnapTrade, launch their connection portal, handle
> the callback, store the resulting connection in `broker_connections` (2d).
> **Done when:** a real (or SnapTrade sandbox) brokerage account connects successfully and
> appears in Settings with correct status.

**8b. Initial sync**
> [Style Guard] Build a sync endpoint that pulls historical activities/trades for a
> connected account from SnapTrade, normalizes them into the `trades` schema shape, and
> routes them through the same dedup logic built in 4c before inserting.
> **Done when:** connecting a broker with existing trade history populates `/trades`
> correctly with no duplicates.

**8c. Webhook handling**
> [Style Guard] Set up a SnapTrade webhook endpoint to receive new-activity notifications
> and auto-insert new trades as they happen, tagging them `source: snaptrade`.
> **Done when:** a new fill on the connected sandbox/broker account appears in the app
> without a manual re-sync.

**8d. Background re-sync**
> [Style Guard] Add a scheduled job (Inngest or Trigger.dev — pick one) that re-syncs all
> active broker connections periodically as a fallback to webhooks, and updates
> `last_synced_at`. Show sync status/last-synced time in Settings.
> **Done when:** the scheduled job runs on its interval and Settings reflects accurate
> sync timestamps.

---

## Phase 9 — Live Market Data & Alpha

**9a. Alpaca integration**
> [Style Guard] Add a server-side Alpaca client for SPY daily/intraday price data. Cache
> responses (don't hit the API on every page load) — a simple daily-refresh cache in
> Supabase is fine.
> **Done when:** SPY price series is fetched and cached correctly, verified against a
> known price on a known date.

**9b. Twelve Data integration (optional, if trading forex/futures)**
> [Style Guard] Add a Twelve Data client for forex/index instruments not covered by
> Alpaca, using the same caching pattern as 9a.
> **Done when:** a forex pair's price series fetches and caches correctly.

**9c. Alpha/beta calculation**
> [Style Guard] Extend `/lib/stats.ts` with rolling alpha and beta of the user's daily
> equity returns against SPY daily returns (standard OLS regression, document the window
> length you choose, e.g. 30/60/90-day rolling). Unit test against a hand-computed
> example.
> **Done when:** tests pass against hand-calculated expected values.

**9d. Benchmark comparison view**
> [Style Guard] Build a chart overlaying the user's equity curve (normalized to % return)
> against SPY buy-and-hold over the same period, plus a small stat row showing current
> rolling alpha/beta/correlation.
> **Done when:** chart and stats reflect real account data and update as new trades close.

---

## Phase 10 — Monte Carlo & Simulation

**10a. Python service scaffold**
> [Style Guard — applies to UI only, this task is backend] Set up a separate FastAPI
> service (`/simulation-service`) with numpy/pandas/scipy, a health-check endpoint, and a
> Dockerfile ready for Railway/Render/Fly deployment. Do not deploy yet — get it running
> locally first.
> **Done when:** the service runs locally and `/health` returns 200.

**10b. Monte Carlo endpoint**
> [Style Guard — backend] Build a `/simulate/monte-carlo` endpoint: accepts an array of
> historical R-multiples and a number of simulations (default 1000), resamples-with-
> replacement to generate that many alternate equity curves, returns the distribution
> (percentile bands, max drawdown distribution, probability of a specified ruin threshold).
> **Done when:** endpoint returns correct, sane statistics against a known synthetic trade
> sequence you can hand-verify roughly.

**10c. Position sizing simulator**
> [Style Guard — backend] Add `/simulate/position-sizing`: given the trade history and a
> range of risk-per-trade percentages, return simulated ending equity and drawdown for
> each, to answer "what if I sized differently."
> **Done when:** endpoint returns sensible, monotonic-where-expected results across the
> tested range.

**10d. Frontend simulation UI**
> [Style Guard] Build `/simulations`: a form to configure simulation parameters, calls the
> Python service, renders the percentile-band fan chart (Lightweight Charts or Recharts)
> and a probability-of-ruin readout. Handle loading/error states explicitly — no silent
> failures.
> **Done when:** running a simulation against real trade data returns and renders results
> end to end.

---

## Phase 11 — AI Copilot ("Jarvis") — Gemini Edition

Same structure as before, updated to swap Anthropic for Google Gemini. Package: `@google/genai` (the current official SDK), env var: `GEMINI_API_KEY`. Gemini supports function calling (their term for tool use) the same way — you define tool schemas, the model decides when to call them, you execute and return results.

**11a. Gemini API route + tools**

**Prompt for your agent:**

[Style Guard] Build a server route calling the Google Gemini API (use the `@google/genai` SDK, model `gemini-2.5-pro` or `gemini-2.5-flash` for lower latency — pick flash unless answer quality is clearly worse) with function-calling tool definitions that query the user's own data: `get_trade_stats(filters)`, `search_journal(query)`, `get_trades(filters)`. Each tool executes a real, scoped (RLS-respecting) database query — never let the model see another user's data. Handle Gemini's function-calling response format: when the model returns a `functionCall` part, execute the matching tool, send the result back as a `functionResponse` part, and continue the conversation loop until the model returns a final text response.

**Done when:** a test query like "how did my FVG trades do last month" correctly invokes the right tool and returns an accurate, grounded answer.

**Env setup:**

```dotenv
GEMINI_API_KEY=your_key_here
```

Get it free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — sign in with Google, generate a key, no card required for the free tier.

**Verify install/env:**

```powershell
npm ls @google/genai
Get-Content .env.local | Select-String "GEMINI_API_KEY"
```

**11b. Chat UI**

**Prompt for your agent:**

[Style Guard] Build `/copilot`: a chat interface styled per the design system (no generic rounded-bubble chat cliché — keep it consistent with the instrument-panel look, monospace for any numbers the assistant returns), streaming responses using Gemini's `generateContentStream`, showing which tool was called for transparency (small inline indicator, not a big debug panel).

**Done when:** conversation flows naturally, tool calls are visible, numeric answers are correct against the underlying data.

**11c. Weekly auto-review**

**Prompt for your agent:**

[Style Guard] Add a scheduled job (reuse the same job runner from Phase 8d) that generates a weekly review: feeds the week's trades + journal entries to Gemini with a prompt asking it to identify patterns and recurring mistakes grounded only in what's provided (no speculation, explicitly instruct the model not to infer beyond the data given), stores the result in a new `weekly_reviews` table (RLS-scoped like every other table — don't forget the grant this time), surfaces it on the dashboard.

**Done when:** the job runs on schedule and produces a grounded, specific review (not generic platitudes) from real data.

**11d. Copilot polish**

**Prompt for your agent:**

[Style Guard] Add conversation history/persistence per user (new `copilot_conversations` + `copilot_messages` tables, RLS-scoped), and a few suggested-prompt chips on first load (real, useful ones — "Compare my London vs New York session performance", not filler).

**Done when:** history persists across sessions, suggested prompts work correctly when clicked.

## One thing worth flagging before you start 11a

Gemini's tool-calling loop has a slightly different shape than the Claude-based version this plan originally assumed — specifically, multi-turn tool use (model calls a tool, gets a result, decides to call another tool before answering) needs to be handled as an explicit loop in your route rather than a single request/response. Worth telling the agent that explicitly if the first pass only handles a single tool call correctly:

**Update the Gemini route to loop:** after executing a tool and sending back the `functionResponse`, check if the next model response contains another `functionCall` before treating it as final — repeat until you get a plain text response, with a max of 5 iterations as a safety cap.

---

## Phase 12 — Polish, Performance, Deploy

**12a. Responsive pass**
> [Style Guard] Audit every page built so far at mobile/tablet/desktop widths. Fix layout
> breaks. The left icon rail should collapse to a bottom bar on mobile, not just squish.
> **Done when:** every page is usable (not just "doesn't break") down to 375px width.

**12b. Loading/error/empty states**
> [Style Guard] Audit every data-fetching component for: a real loading skeleton (matching
> the final layout, not a generic spinner), a real error state with a retry action, and a
> real empty state with specific instructional copy. No component should be able to render
> blank/broken.
> **Done when:** every list/chart/stat component has all three states verified.

**12c. Performance pass**
> [Style Guard — non-visual] Add database indexes on frequently filtered/sorted `trades`
> columns (user_id, entry_time, instrument, status). Audit for N+1 queries. Add React
> Query caching with sensible stale times so navigating back to a page doesn't refetch
> everything.
> **Done when:** trade list with 500+ rows loads and filters smoothly; no redundant
> network requests on back-navigation.

**12d. Deploy**
> [Style Guard — non-visual] Deploy the Next.js app to Vercel and the Python simulation
> service to Railway/Render/Fly. Set all production env vars. Point the frontend's
> simulation calls at the deployed Python service URL. Add a custom domain if desired.
> **Done when:** the production URL is fully functional end to end — auth, trade logging,
> charts, simulations, and copilot all work on the live deployment.

---

That's the full build, 12 phases, 47 sub-prompts. Work through them in order, test each
one before moving on, and don't let the agent "helpfully" jump ahead — small verified
steps are what keep 6-month builds like this from turning into an unmaintainable mess.