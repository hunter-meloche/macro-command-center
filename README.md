# Macro Command Center

A real-time macroeconomic dashboard powered by Claude AI.

![Macro Command Center](preview.png)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with the following:
   ```
   VITE_ANTHROPIC_API_KEY=your_anthropic_key_here
   VITE_FRED_API_KEY=your_fred_key_here
   ```
   - **Anthropic key** — get one at [console.anthropic.com](https://console.anthropic.com/). Required for the AI Strategy Analysis button.
   - **FRED key** — get one free at [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html). Required for live macro data (PCE, unemployment, yield curve, jobless claims, etc.). Without it the dashboard runs on cached/default values only.

3. Start the dev server:
   ```bash
   npm run dev
   ```

## Features

- **Live Data Sync** — Uses Claude with web search to fetch current market data (Brent crude, PCE, USD/JPY, gold, mortgage rates, etc.)
- **AI Strategy Analysis** — Claude generates a macro strategy based on current conditions
- **Fed Prediction Engine** — Weighted scoring model forecasting Fed policy scenarios
- **Carry Trade Monitor** — Tracks JPY carry trade unwind risk across 6 sub-metrics
- **Real Estate Intel** — Mortgage rates, AZ land prices, Gladstone Land, Sun Communities
- **Metals Ratio** — Gold/silver spot prices and ratio

## Tech Stack

- React 18 + Vite
- Tailwind CSS
- Lucide React icons
- Claude API (claude-sonnet-4-6) with web search
