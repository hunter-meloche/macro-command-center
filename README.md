# Macro Command Center

A real-time macroeconomic dashboard powered by Claude AI.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example env file and add your Anthropic API key:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and replace `your_api_key_here` with your key from [console.anthropic.com](https://console.anthropic.com/).

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
