# Pepperstone CFD Risk Calculator — Instrument Spec & Build Brief

Handoff document for an AI coding agent. Goal: build a tool that takes
**Entry Price, Stop Loss, and Position Size (lots)** and returns the
**monetary risk** of the trade (and ideally the reverse: given a risk
amount, return the correct position size).

> ⚠️ **Data currency warning:** Pepperstone's spreads, margins, swaps and
> exact contract specs change over time and vary slightly by account type
> (Standard/Razor), platform (MT4/MT5/cTrader/TradingView), and regulatory
> entity (UK/EU/AU/etc.). The values below are the *structural* facts
> (contract sizes, pip/point definitions, formulas) which are stable and
> safe to hard-code. Anything marked "variable" (margin %, leverage cap,
> spread) should be pulled live from the platform or exposed as a
> user-editable input rather than hard-coded, and the agent should add a
> "last verified" field the user can update from Pepperstone's live
> Contract Specifications page in-platform (MT5/cTrader "Specification"
> tab) since Anthropic's search does not have a scrapeable live table.

---

## 1. Core concepts the calculator must model

| Concept | Definition |
|---|---|
| **Lot** | Standardized contract size. 1 standard lot = 100,000 units of base currency for FX. Non-FX instruments (indices, commodities) each define their own "1 lot" size. |
| **Pip / Point / Tick** | The minimum meaningful price increment for a given instrument. FX majors: 0.0001 (4th decimal). JPY pairs: 0.01 (2nd decimal). Indices/commodities: usually just "1 point" = smallest quoted decimal move (varies by instrument, e.g. 0.1 for gold, 1.0 for an index). |
| **Pip/Point value** | The $ (or account-currency) change in P&L for a 1-pip/point move at a given lot size. This is the number the whole risk calc hinges on. |
| **Stop distance** | `\|Entry Price − Stop Loss Price\|`, expressed either in raw price units or converted to pips/points. |
| **Monetary risk** | `Stop distance (in pips/points) × Pip/Point value per lot × Position size (lots)` |
| **Margin required** | `(Contract size × Position size × Entry Price) / Leverage` — separate from risk, but usually shown alongside it. |

---

## 2. Instrument categories & contract sizes

### A. FX Pairs (Forex CFDs / Margin FX)

- **Contract size:** 1.0 lot = 100,000 units of the **base currency** (the first currency in the pair). Mini lot = 10,000 units (0.1 lot). Micro lot = 1,000 units (0.01 lot).
- **Minimum trade size:** 0.01 lots on virtually all Pepperstone accounts; max typically 100 lots per order (up to 200 open positions).
- **Pip size:**
  - Most pairs (e.g., EUR/USD, GBP/USD, AUD/USD): **0.0001** (i.e. the 4th decimal place)
  - JPY pairs (e.g., USD/JPY, EUR/JPY, GBP/JPY): **0.01** (2nd decimal place)
- **Pip value formula (per standard lot, before account-currency conversion):**
  `Pip value = (Pip size × Contract size) / Exchange rate-adjustment`
  - If the account currency **is** the quote currency of the pair, pip value per standard lot = Pip size × Contract size (e.g. EUR/USD, USD account: 0.0001 × 100,000 = **$10/pip/lot**).
  - If account currency ≠ quote currency, convert using the current exchange rate between the quote currency and the account currency.
  - For JPY-quoted pairs from a non-JPY account: `Pip value = (0.01 × 100,000) / USDJPY_rate` ≈ $6–9/pip/lot depending on the current rate — this must be computed dynamically, not hard-coded.
- **Lot step:** 0.01
- **Leverage/margin:** Pepperstone uses tiered margin, generally up to 1:500 for major FX for eligible (non-EU/UK retail) clients, capped at 1:30 for EU/UK retail clients under ESMA/FCA rules. Should be a user-configurable input, not assumed.

### B. Commodities (Metals & Energies)

Commodities are **not** standardized to 100,000-unit lots — each instrument has its own contract size. Known examples (verify current values live):

| Instrument | Typical contract size (1.0 lot) | Typical point/pip size | Notes |
|---|---|---|---|
| XAU/USD (Gold) | 100 troy ounces | 0.01 (i.e. $0.01/oz) | Point value per lot ≈ $1 per $0.01 move → $10 per $0.1, $100 per $1.00 move at 1 lot |
| XAG/USD (Silver) | 5,000 troy ounces | 0.001–0.01 | Point value varies; verify live |
| Crude Oil (WTI/Brent) | 1,000 barrels | 0.01 | Point value ≈ $10 per $0.01 move |
| Natural Gas | 10,000 MMBtu | 0.001 | Verify live — quoted "from 0.3 points" per Pepperstone marketing |

- **Point value formula:** `Point value = Point size × Contract size` (then converted to account currency if the commodity is quoted in a currency other than the account base currency).
- **Commission/spread:** commodities are typically spread-only (no separate commission) on Pepperstone, spread embedded in quoted price — irrelevant to *risk* calc but relevant to a full cost calc.
- **Min lot:** 0.01, but check per-instrument — some energies have coarser minimums.

### C. Indices (Cash/Spot Indices & CFD Forwards)

- **Contract size:** 1.0 lot = **1 unit of the index** per point (i.e., "$1 per point per lot" is the common convention for indices like US500, NAS100, US30, GER40, UK100 — but the $-per-point value differs by index and must be verified live; some brokers use $1/point, others $10/point for the same nominal "1 lot").
- **Point size:** 1 index point (whole number index moves) — indices generally don't use "pips," they use "points."
- **Point value formula:** `Point value = Value-per-point-per-lot (instrument-specific constant) × Position size in lots`
- **Min lot:** 0.01 (fractional index CFDs allowed, unlike futures which require whole contracts) — confirmed by Pepperstone's own materials.
- Examples of index CFDs offered: US500 (S&P 500), NAS100/US-Tech (Nasdaq), US30 (Dow), GER40 (DAX), UK100 (FTSE), plus ~25 major global index CFDs total.
- Overnight funding for indices is calculated differently from FX (uses an interbank/ARR-based rate, not swap points) — not needed for a pure entry/stop/size risk calc, but worth a note if the agent later adds carry-cost.

---

## 3. The actual risk formulas to implement

### 3.1 Monetary risk (the core ask)

```
stop_distance_price_units = abs(entry_price - stop_loss_price)
stop_distance_in_pips_or_points = stop_distance_price_units / pip_or_point_size

risk_amount = stop_distance_in_pips_or_points
              × pip_or_point_value_per_lot
              × position_size_lots
```

Equivalently, skip the pip conversion entirely and go straight from price:

```
risk_amount = stop_distance_price_units × contract_size × position_size_lots
              × (conversion_rate_to_account_currency, if applicable)
```

Both routes must give the same answer — implement one, use the other as a
unit test.

### 3.2 Reverse calc: risk-based position sizing (very likely wanted next)

```
position_size_lots = risk_amount_you_want_to_risk
                      / (stop_distance_in_pips_or_points × pip_or_point_value_per_lot)
```

This is the "risk 1% of account" style calculator most traders actually
want day to day — recommend the agent build both directions from the same
underlying instrument-spec table so they can't drift out of sync.

### 3.3 Risk as % of account

```
risk_percent = (risk_amount / account_balance) × 100
```

### 3.4 Margin required (secondary, but usually shown next to risk)

```
margin_required = (contract_size × position_size_lots × entry_price) / leverage
```

### 3.5 Risk:Reward (if a take-profit is also provided)

```
reward_distance = abs(take_profit_price - entry_price)
risk_reward_ratio = reward_distance / stop_distance_price_units
```

---

## 4. Data model to hand the AI agent

Suggest an instrument lookup table like this (agent should treat the
numeric values as **defaults/examples the user can override**, not gospel —
flag them as "verify against your Pepperstone platform" in the UI):

```json
{
  "EURUSD": { "class": "fx", "contract_size": 100000, "pip_size": 0.0001, "quote_currency": "USD" },
  "USDJPY": { "class": "fx", "contract_size": 100000, "pip_size": 0.01, "quote_currency": "JPY" },
  "GBPUSD": { "class": "fx", "contract_size": 100000, "pip_size": 0.0001, "quote_currency": "USD" },
  "XAUUSD": { "class": "commodity", "contract_size": 100, "point_size": 0.01, "quote_currency": "USD" },
  "XAGUSD": { "class": "commodity", "contract_size": 5000, "point_size": 0.001, "quote_currency": "USD" },
  "USOIL":  { "class": "commodity", "contract_size": 1000, "point_size": 0.01, "quote_currency": "USD" },
  "US500":  { "class": "index", "contract_size": 1, "point_size": 1, "value_per_point": 1, "quote_currency": "USD" },
  "NAS100": { "class": "index", "contract_size": 1, "point_size": 1, "value_per_point": 1, "quote_currency": "USD" },
  "GER40":  { "class": "index", "contract_size": 1, "point_size": 1, "value_per_point": 1, "quote_currency": "EUR" }
}
```

Fields the agent will need per instrument, regardless of class:
- `class` (fx / commodity / index) — determines which formula branch runs
- `contract_size`
- `pip_size` or `point_size`
- `quote_currency` — needed to convert P&L into the user's account currency when quote_currency ≠ account_currency (fetch a live FX rate for that conversion; this is the single most common bug source in DIY risk calculators)
- `min_lot` (default 0.01), `lot_step` (default 0.01), `max_lot` (default 100)

## 5. UX/inputs the calculator should expose

- Instrument selector (or free-text symbol + class dropdown for anything not in the table)
- Account currency
- Account balance (for the % risk figure)
- Entry price, Stop loss price, optional Take profit price
- Position size in lots (for the "what's my risk" direction) OR risk amount/% (for the "what size should I trade" direction) — support both directions
- Live/manual exchange rate override for cross-currency pip value conversion
- Output: risk in account currency, risk as % of balance, pip/point distance, margin required, R:R ratio if TP given

## 6. Caveats to bake into the tool itself

- This is a **position-sizing/risk calculator**, not trading advice — the agent should avoid presenting outputs as recommendations.
- Actual $ pip/point values, margin %, and leverage caps are broker- and jurisdiction-specific and change; the tool should let the user edit every constant rather than freezing them, and ideally timestamp when values were last confirmed.
- Slippage, spread cost, swaps/overnight funding, and commissions are **not** part of "risk from stop distance" and should be a clearly separate optional add-on if the user wants total cost-of-trade, not folded silently into the risk number.

---

### Sources consulted (for the agent's own reference / re-verification)
- pepperstone.com — CFD trading guide (forex contract sizes: 100k/10k/1k units)
- pepperstone.com — "Factors Affecting Pip Value" guide
- pepperstone.com — Index trading education page (fractional lot sizing down to 0.01)
- pepperstone.com — Commodities product page
- Pepperstone Costs & Charges disclosure PDFs (UK/EU/CY entities) — commission/margin/overnight funding formulas
- Pepperstone PDS (AU) — margin FX and CFD P&L mechanics