# My Trading Dashboard (SJ Cockpit)

A Next.js-native, Supabase-backed, premium manual trading cockpit and performance journal. It integrates live risk guards, gamified milestone progression scaling, and an interactive AI terminal companion named **SJ**.

[![framework](https://img.shields.io/badge/Framework-Next.js%2014-000000?style=flat&logo=nextdotjs)](https://nextjs.org/)
[![database](https://img.shields.io/badge/Database-Supabase-3ECF8E?style=flat&logo=supabase)](https://supabase.com/)
[![orm](https://img.shields.io/badge/ORM-Drizzle-C5F74F?style=flat&logo=drizzle)](https://orm.drizzle.team/)
[![ai](https://img.shields.io/badge/AI-Nvidia%20API-76B900?style=flat&logo=nvidia)](https://integrate.api.nvidia.com/)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

| Module | Core Features | Purpose | Status |
| :--- | :--- | :--- | :--- |
| **Cockpit Console** | Pre-Trade checks, automatic drawdowns, session alerts | execution discipline & entry locks | ![status](https://img.shields.io/badge/stable-green) |
| **Behavioral Stats**| Winner/Loser hold ratios, weekday performance, risk profiles | psychology & expectancy metrics | ![status](https://img.shields.io/badge/stable-green) |
| **Gamification** | $150 to $1M doubling milestones timeline, top bar sync, simulator | psychology & growth projection | ![status](https://img.shields.io/badge/stable-green) |
| **SJ Copilot** | Thought logs, prompt editing, version branching, cancellations | interactive log query agent | ![status](https://img.shields.io/badge/stable-green) |

---

## Introduction

The **My Trading Dashboard** is a state-of-the-art instrument panel constructed specifically for manual traders navigating financial markets. The system enforces execution rules directly at the point of trade entry, maps psychological compounding progress, and compiles detailed behavioral metrics from historical performance.

Rather than relying on generic stats, this dashboard analyzes the **psychology of execution**: tracking whether you hold losing trades longer than winners, enforcing session timings (e.g. no trading in the Asian session), and locking entries during drawdowns.

Every visual element is designed to follow a strict **dark cockpit instrument aesthetic** (bg-base `#0B0D10`, surface `#14171C`, borders `#242931`) with headers in Space Grotesk, body text in IBM Plex Sans, and monospaced tabular numbers.

---

## Core Architecture & Features

### 1. Pre-Trade Checklist & Live Position Logger
* **Discipline-Locked Entry**: The quick-entry logger console remains completely disabled until all 9 pre-trade checklist rules (HTF setups, engineered liquidity, 6C1! futures confirmation) are completed.
* **Database Sync**: Logging a live position inserts a trade in the database with an `open` status and timestamps the entry, resetting the checklist for the next trade opportunity.

### 2. Behavioral & Discipline Analytics
* **Hold Time Ratio**: Compares the average holding time of your winning trades versus your losing trades. If you hold losers longer than winners (Ratio $< 1.0$), it flags a warning advising you to cut losses faster.
* **Risk-to-Reward Expectancy**: Calculates your realized reward-to-risk ratio profile (`avgWinR / avgLossR`) to determine statistical edge.
* **Performance by Weekday**: Groups net P&L and trade volume by weekday (Monday to Friday) to reveal if news-heavy or low-volume days drag your performance.

### 3. Gamified Rank Progression
* **Compounding Timeline**: Maps out a 14-stage journey scaling starting capital from $150 to $1,000,000 via doubling milestones.
* **Top Bar Integration**: Centers your current Rank name (e.g., *Novice Cadet*), active equity balance, next milestone target, and a visual progress bar inside the persistent top bar header.
* **Compounding Path Simulator**: Built-in sandbox allowing you to simulate compounding paths based on customized win rates and reward-to-risk targets.

### 4. SJ Copilot Analysis Terminal
* **SJ Rebranding**: The AI assistant identifies itself as **SJ** and operates with access to your trade logs, database statistics, and daily journals.
* **Collapsible Thought Process**: SJ outputs its step-by-step thinking logs inside a collapsible reasoning box before generating final responses.
* **Prompt Editing & Version Branching**: Users can edit sent messages and toggle between version branches (e.g., `1/2`) using arrow buttons.
* **Background Queries & Cancellation**: Switching chat tabs preserves active requests, and prompts can be cancelled instantly via the UI.

---

## Automated Risk Guards

To enforce risk management, the application calculates parameters from database logs to trigger system guards:
* **Drawdown Freeze Lockout**: Checks your last 4 closed trades. If they are consecutive losses OR their sum total is $\le -4R$, the dashboard activates a warning banner instructing you to take a **mandatory 2-week break**.
* **Daily Trade Limit**: Tracks trades entered today. If count is $\ge 2$, it flags that your daily limit has been hit.
* **Session Timing Guard**: Displays Tokyo/Asia session warnings, reminding you to restrict trading to London/New York sessions.
* **No News Monday Guard**: Highlights Mondays to caution against news volatility or low-volume ranges.

---

## Installation & Local Setup

### Prerequisites
* **Node.js**: `v18.x` or newer.
* **Database**: PostgreSQL (Supabase).
* **API Keys**: Twelve Data API (for SPY comparison) and Nvidia API (for SJ Copilot).

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/trading_dashboard.git
   cd trading_dashboard
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file at the root of the project and add your credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   NVIDIA_API_KEY=your_nvidia_api_key
   TWELVE_DATA_API_KEY=your_twelve_data_api_key
   ```

4. **Initialize Database Schema & Migrations**:
   Run Drizzle migrations to configure settings, trades, journal logs, and copilot tables:
   ```bash
   npx drizzle-kit push
   ```

5. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser to view your trading cockpit.

---

## Testing & Quality Control

Verify database stats calculators, Regressions, Sharpe/Sortino ratios, and Copilot tools handlers with the automated test suite:
```bash
npm test
```

Build the optimized production package:
```bash
npm run build
```

---

## License

This software is distributed under the MIT License. See [LICENSE](LICENSE) for details.

© 2026 Declan Munene. All rights reserved.