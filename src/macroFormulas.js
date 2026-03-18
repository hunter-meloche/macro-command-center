// Shared pure-computation formulas used by both the React UI and the server API.
// No fetch logic, no React imports — pure math only.

export const round = (n, d = 2) => {
  const num = Number(n);
  return isNaN(num) ? null : parseFloat(num.toFixed(d));
};

export const MARKET_DATA_DEFAULTS = {
  brentCrude: 92.40, brentCrudePrev: 85.00,
  corePCE: 2.8, corePCEPrev: 2.7,
  unemployment: 4.4, unemploymentPrev: 4.3,
  usdJpy: 156.05, usdJpyPrev: 158.20,
  bojRate: 0.73,
  goldSpot: 5120, goldSpotPrev: 4950,
  silverSpot: 86.50, silverSpotPrev: 81.00,
  mortgage30Y: 6.15, mortgage30YPrev: 5.98,
  landPriceAZ: 145000, landPriceAZPrev: 142000,
  gladstonePrice: 11.81, gladstonePricePrev: 12.03,
  sunCommunitiesPrice: 142.50, sunCommunitiesPricePrev: 138.20,
  usJapanSpread: 1.94,
  vixIndex: 23.75,
  tedSpread: 3.20,
  jpyRealizedVol: 8.77,
  sp500: 6830.71,
  usdJpy1MChange: -1.60,
  fedFundsRate: 4.33, fedFundsRatePrev: 4.33,
  us2y: 4.08, us2yPrev: 4.15,
  yieldCurve: 0.21, yieldCurvePrev: 0.18,
  breakeven10Y: 2.31, breakeven10YPrev: 2.28,
  joblessClaims: 215, joblessClaimsPrev: 217,
  dxy: 103.2, dxyPrev: 104.1,
  jolts: 7.6, joltsPrev: 7.7,
  nfp: 175, nfpPrev: 195,
  wageGrowth: 3.9, wageGrowthPrev: 4.0,
  consumerInflExp: 3.3, consumerInflExpPrev: 3.1,
  ppiYoy: 2.4, ppiYoyPrev: 2.3,
  igSpread: 0.95, igSpreadPrev: 0.88,
  bbbSpread: 1.30, bbbSpreadPrev: 1.18,
  financialStressIdx: 0.12, financialStressIdxPrev: -0.05,
};

export function calcRealizedVol(closes, days = 20) {
  const recent = closes.slice(-(days + 1));
  const returns = [];
  for (let i = 1; i < recent.length; i++) returns.push(Math.log(recent[i] / recent[i - 1]));
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return round(Math.sqrt(variance * 252) * 100);
}

export function computeCarrySeverities(m) {
  return {
    // Spread narrowing from ~4% peak forces carry closures. 0% spread = 100, 4% = 0.
    spread: Math.min(100, Math.max(0, ((4.0 - (m.usJapanSpread || 0)) / 3.5) * 100)),
    // Only JPY strengthening (negative USD/JPY change) triggers carry unwinds. 3% JPY gain = 100.
    change: Math.max(0, Math.min(100, (-(m.usdJpy1MChange || 0) / 3) * 100)),
    // 20-day annualized vol. Floor 6% (calm), ceiling 25% (Aug 2024 unwind peak).
    vol:    Math.min(100, Math.max(0, (((m.jpyRealizedVol || 0) - 6) / 19) * 100)),
    // VIX floor 12 (suppressed), ceiling 40 (severe crisis).
    vix:    Math.min(100, Math.max(0, (((m.vixIndex || 0) - 12) / 28) * 100)),
    // HY OAS: 2% = compressed, 10% = crisis.
    ted:    Math.min(100, Math.max(0, (((m.tedSpread || 0) - 2) / 8) * 100)),
    // BoJ hikes tighten JPY funding. Ceiling 2% = structural shift in Japanese rate policy.
    boj:    Math.min(100, ((m.bojRate || 0) / 2.0) * 100),
  };
}

export function computeCarryTradeScore(severities) {
  const { spread, change, vol, vix, ted, boj } = severities;
  // Weighted: JPY momentum + vol are the most direct carry unwind signals.
  return Math.round(
    change * 0.25 +
    vol    * 0.20 +
    vix    * 0.20 +
    spread * 0.20 +
    ted    * 0.10 +
    boj    * 0.05
  ) || 0;
}

export function deriveScenario(inflationPressure, cutPressure, netScore) {
  if (inflationPressure >= 55 && cutPressure >= 55) return 'stagflation';
  if (netScore > 25)   return 'hold';
  if (netScore >= 0)   return 'wait';
  if (netScore >= -25) return 'cut_lean';
  return 'cut';
}

export function computePrediction(m, carryTradeScore) {
  // === INFLATION PRESSURE (0–100): signals pushing the Fed to hold or hike ===
  // Core PCE: 2.0% = 0, 3.5% = 100. Primary Fed mandate target.
  const pceScore = Math.min(100, Math.max(0, ((m.corePCE || 0) - 2.0) / 1.5 * 100));
  // Momentum multiplier: rising PCE amplifies pressure, falling PCE dampens it.
  const pceMomentum = (m.corePCE || 0) > (m.corePCEPrev || 0) ? 1.2 : 0.85;
  // 10Y breakeven inflation: market-implied expectations. 2.0% = 0, 3.5% = 100.
  const breakevenScore = Math.min(100, Math.max(0, ((m.breakeven10Y || 0) - 2.0) / 1.5 * 100));
  // Oil supply shock above $90: $90 = 0, $120 = 100.
  const oilScore = Math.min(100, Math.max(0, ((m.brentCrude || 0) - 90) / 30 * 100));
  // Tight labor market below NAIRU (~4.5%): wage inflation risk. 3.5% = 100, 4.5% = 0.
  const tightLaborScore = Math.min(100, Math.max(0, (4.5 - (m.unemployment || 0)) / 1.0 * 100));
  // Avg Hourly Earnings YoY: above 3.5% = wage-price spiral risk. 3.5% = 0, 5.0% = 100.
  const wageScore = Math.min(100, Math.max(0, ((m.wageGrowth || 0) - 3.5) / 1.5 * 100));
  // NFP hot jobs: above trend (150k) = tight labor demand. 150k = 0, 350k = 100.
  const nfpInflScore = Math.min(100, Math.max(0, ((m.nfp || 0) - 150) / 200 * 100));
  // JOLTS openings elevated: above 8M = demand still hot. 8M = 0, 12M = 100.
  const joltsInflScore = Math.min(100, Math.max(0, ((m.jolts || 0) - 8.0) / 4.0 * 100));
  // Consumer 1Y inflation expectations: unanchored expectations are self-fulfilling. 2.5% = 0, 4.5% = 100.
  const michScore = Math.min(100, Math.max(0, ((m.consumerInflExp || 0) - 2.5) / 2.0 * 100));
  // PPI YoY: upstream of PCE by 3–6 months. Signals pipeline inflation before it hits consumers. 2% = 0, 10% = 100.
  const ppiScore = Math.min(100, Math.max(0, ((m.ppiYoy || 0) - 2.0) / 8.0 * 100));

  const inflationPressure = Math.min(100, Math.round(
    Math.min(100, pceScore * pceMomentum) * 0.25 +
    breakevenScore  * 0.15 +
    michScore       * 0.12 +
    wageScore       * 0.12 +
    nfpInflScore    * 0.10 +
    oilScore        * 0.08 +
    tightLaborScore * 0.08 +
    ppiScore        * 0.06 +
    joltsInflScore  * 0.04
  ));

  // === CUT PRESSURE (0–100): signals pushing the Fed to cut ===
  // Rising unemployment: 4.1% = 0, 5.5% = 100. Primary recession signal.
  const unempScore = Math.min(100, Math.max(0, ((m.unemployment || 0) - 4.1) / 1.4 * 100));
  // Yield curve inversion (T10Y2Y): +0.5% = 0, flat = 25, -0.5% = 50, -1.5% = 100.
  const yieldCurveScore = Math.min(100, Math.max(0, (0.5 - (m.yieldCurve || 0)) / 2.0 * 100));
  // Initial jobless claims: 220k = 0, 500k = 100. Leading labor market indicator.
  const joblessScore = Math.min(100, Math.max(0, ((m.joblessClaims || 0) - 220) / 280 * 100));
  // Disinflation: PCE falling below 2.5% = Fed has room to cut. 2.5% = 0, 1.5% = 100.
  const disinfScore = Math.min(100, Math.max(0, (2.5 - (m.corePCE || 0)) / 1.0 * 100));
  // Financial stress: carry trade score represents systemic deleveraging risk.
  const financialScore = carryTradeScore;
  // Restrictive mortgage rate: above 6% = housing already stifled. 6% = 0, 8% = 100.
  const mortgageScore = Math.min(100, Math.max(0, ((m.mortgage30Y || 0) - 6.0) / 2.0 * 100));
  // Rate cut premium: Fed Funds − 2Y Treasury. When 2Y trades well below Fed Funds,
  // bond markets are pricing in cuts aggressively. 0% gap = 0, 1.5% gap = 100.
  const rateCutPremiumScore = Math.min(100, Math.max(0, ((m.fedFundsRate || 0) - (m.us2y || 0)) / 1.5 * 100));
  // NFP weak jobs: below trend signals labor softening. 150k = 0, job losses (-50k) = 100.
  const nfpCutScore = Math.min(100, Math.max(0, (150 - (m.nfp || 0)) / 200 * 100));
  // JOLTS openings declining: below 8M = demand cooling, leading unemployment by ~6 months. 8M = 0, 5M = 100.
  const joltsCutScore = Math.min(100, Math.max(0, (8.0 - (m.jolts || 0)) / 3.0 * 100));
  // Credit market stress: IG OAS (80bps=0, 250bps=100) and BBB OAS (100bps=0, 300bps=100).
  // BBB is the private credit bellwether — first to widen when direct lending portfolios deteriorate.
  const igScore  = Math.min(100, Math.max(0, ((m.igSpread  || 0) - 0.80) / 1.70 * 100));
  const bbbScore = Math.min(100, Math.max(0, ((m.bbbSpread || 0) - 1.00) / 2.00 * 100));
  const creditStressScore = Math.round((igScore + bbbScore) / 2);
  // St. Louis FSI: 0 = historical average stress. Each +1 unit = significant tightening.
  const fsiScore = Math.min(100, Math.max(0, (m.financialStressIdx || 0) / 2.0 * 100));

  const cutPressure = Math.min(100, Math.round(
    unempScore          * 0.17 +
    yieldCurveScore     * 0.16 +
    joblessScore        * 0.14 +
    nfpCutScore         * 0.16 +
    rateCutPremiumScore * 0.12 +
    joltsCutScore       * 0.09 +
    creditStressScore   * 0.05 +
    fsiScore            * 0.03 +
    disinfScore         * 0.05 +
    financialScore      * 0.02 +
    mortgageScore       * 0.01
  ));

  const netScore = inflationPressure - cutPressure;
  const confidence = Math.min(100, Math.abs(netScore));
  const scenario = deriveScenario(inflationPressure, cutPressure, netScore);

  return {
    scenario, confidence, inflationPressure, cutPressure, netScore,
    sub: {
      pceScore: Math.round(Math.min(100, pceScore * pceMomentum)),
      pceMomentum,
      breakevenScore: Math.round(breakevenScore),
      oilScore: Math.round(oilScore),
      tightLaborScore: Math.round(tightLaborScore),
      wageScore: Math.round(wageScore),
      nfpInflScore: Math.round(nfpInflScore),
      joltsInflScore: Math.round(joltsInflScore),
      michScore: Math.round(michScore),
      ppiScore: Math.round(ppiScore),
      unempScore: Math.round(unempScore),
      yieldCurveScore: Math.round(yieldCurveScore),
      joblessScore: Math.round(joblessScore),
      disinfScore: Math.round(disinfScore),
      financialScore: Math.round(financialScore),
      mortgageScore: Math.round(mortgageScore),
      rateCutPremiumScore: Math.round(rateCutPremiumScore),
      nfpCutScore: Math.round(nfpCutScore),
      joltsCutScore: Math.round(joltsCutScore),
      creditStressScore,
      fsiScore: Math.round(fsiScore),
    },
  };
}
