// Server-side data fetching for the macro dashboard API.
// Pure computation logic lives in src/macroFormulas.js (shared with the React UI).

import {
  round,
  MARKET_DATA_DEFAULTS,
  calcRealizedVol,
  computeCarrySeverities,
  computeCarryTradeScore,
  computePrediction,
  deriveScenario,
} from '../src/macroFormulas.js';

const TRUMP_CUT_BIAS_DEFAULT = 25;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _cache = null;
let _cacheTime = 0;

async function fetchFredObs(seriesId, fredApiKey, units = null) {
  const unitsParam = units ? `&units=${units}` : '';
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${fredApiKey}&limit=3&sort_order=desc&file_type=json${unitsParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const obs = (await res.json())?.observations?.filter(o => o.value !== '.') || [];
  return { current: parseFloat(obs[0]?.value) || null, prev: parseFloat(obs[1]?.value) || null };
}

async function fetchFredHistory(seriesId, fredApiKey, limit = 30) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${fredApiKey}&limit=${limit}&sort_order=desc&file_type=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const obs = (await res.json())?.observations?.filter(o => o.value !== '.') || [];
  const allCloses = obs.map(o => parseFloat(o.value)).filter(v => !isNaN(v)).reverse();
  if (allCloses.length < 2) throw new Error(`Insufficient FRED data: ${seriesId}`);
  return {
    current: allCloses[allCloses.length - 1],
    prev: allCloses[Math.max(0, allCloses.length - 22)],
    allCloses,
  };
}

async function fetchYahooChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No Yahoo data: ${symbol}`);
  const allCloses = result.indicators.quote[0].close.filter(v => v != null);
  if (allCloses.length < 2) throw new Error(`Insufficient data: ${symbol}`);
  return {
    current: allCloses[allCloses.length - 1],
    prev: allCloses[Math.max(0, allCloses.length - 22)],
    allCloses,
  };
}

async function fetchLiveMacroData(fredApiKey) {
  const [
    brentRes, usdJpyRes, goldRes, silverRes, vixRes, sp500Res, landRes, suiRes,
    corePCERes, unemploymentRes, mortgageRes, us10yRes, jp10yRes, bojRes, tedRes,
    us2yRes, yieldCurveRes, breakevenRes, joblessRes, fedFundsRes, dxyRes,
    joltsRes, payemsRes, aheRes, michRes, ppiRes,
    igSpreadRes, bbbSpreadRes, fsiRes,
  ] = await Promise.allSettled([
    fetchFredHistory('DCOILBRENTEU', fredApiKey, 30),
    fetchFredHistory('DEXJPUS', fredApiKey, 30),
    fetchYahooChart('GC=F'),
    fetchYahooChart('SI=F'),
    fetchFredObs('VIXCLS', fredApiKey),
    fetchYahooChart('^GSPC'),
    fetchYahooChart('LAND'),
    fetchYahooChart('SUI'),
    fetchFredObs('PCEPILFE', fredApiKey, 'pc1'),
    fetchFredObs('UNRATE', fredApiKey),
    fetchFredObs('MORTGAGE30US', fredApiKey),
    fetchFredObs('DGS10', fredApiKey),
    fetchFredObs('IRLTLT01JPM156N', fredApiKey),
    fetchFredObs('IRSTCI01JPM156N', fredApiKey),
    fetchFredObs('BAMLH0A0HYM2', fredApiKey),
    fetchFredObs('DGS2', fredApiKey),
    fetchFredObs('T10Y2Y', fredApiKey),
    fetchFredObs('T10YIE', fredApiKey),
    fetchFredHistory('ICSA', fredApiKey, 10),
    fetchFredObs('DFEDTARU', fredApiKey),
    fetchYahooChart('DX-Y.NYB'),
    fetchFredObs('JTSJOL', fredApiKey),
    fetchFredHistory('PAYEMS', fredApiKey, 5), // limit=5 ensures nfpPrev survives filtered observations
    fetchFredObs('AHETPI', fredApiKey, 'pc1'),
    fetchFredObs('MICH', fredApiKey),
    fetchFredObs('PPIACO', fredApiKey, 'pc1'),
    fetchFredObs('BAMLC0A0CM', fredApiKey),
    fetchFredObs('BAMLC0A4CBBB', fredApiKey),
    fetchFredObs('STLFSI3', fredApiKey),
  ]);

  const ok = (r) => r.status === 'fulfilled' ? r.value : null;
  const out = { ...MARKET_DATA_DEFAULTS };

  const setPair = (r, key, prevKey) => {
    const d = ok(r);
    if (d?.current != null) {
      out[key] = round(d.current);
      if (d.prev != null) out[prevKey] = round(d.prev);
    }
  };

  setPair(brentRes,        'brentCrude',           'brentCrudePrev');
  setPair(goldRes,         'goldSpot',              'goldSpotPrev');
  setPair(silverRes,       'silverSpot',            'silverSpotPrev');
  setPair(landRes,         'gladstonePrice',        'gladstonePricePrev');
  setPair(suiRes,          'sunCommunitiesPrice',   'sunCommunitiesPricePrev');
  setPair(corePCERes,      'corePCE',               'corePCEPrev');
  setPair(unemploymentRes, 'unemployment',          'unemploymentPrev');
  setPair(mortgageRes,     'mortgage30Y',           'mortgage30YPrev');

  const vixD = ok(vixRes);   if (vixD?.current  != null) out.vixIndex  = round(vixD.current);
  const spD  = ok(sp500Res); if (spD?.current   != null) out.sp500     = round(spD.current);
  const bojD = ok(bojRes);   if (bojD?.current  != null) out.bojRate   = bojD.current;
  const tedD = ok(tedRes);   if (tedD?.current  != null) out.tedSpread = round(tedD.current);

  const usdJpyD = ok(usdJpyRes);
  if (usdJpyD?.current != null) {
    out.usdJpy = round(usdJpyD.current);
    if (usdJpyD.prev != null)
      out.usdJpy1MChange = round((usdJpyD.current - usdJpyD.prev) / usdJpyD.prev * 100);
    const vol = calcRealizedVol(usdJpyD.allCloses);
    if (vol != null) out.jpyRealizedVol = vol;
  }

  const us10y = ok(us10yRes)?.current;
  const jp10y = ok(jp10yRes)?.current;
  if (us10y != null && jp10y != null) out.usJapanSpread = round(us10y - jp10y);

  const us2yD = ok(us2yRes);
  if (us2yD?.current != null) { out.us2y = round(us2yD.current); if (us2yD.prev != null) out.us2yPrev = round(us2yD.prev); }
  const ycD = ok(yieldCurveRes);
  if (ycD?.current != null) { out.yieldCurve = round(ycD.current); if (ycD.prev != null) out.yieldCurvePrev = round(ycD.prev); }
  const bkD = ok(breakevenRes);
  if (bkD?.current != null) { out.breakeven10Y = round(bkD.current); if (bkD.prev != null) out.breakeven10YPrev = round(bkD.prev); }
  const ffD = ok(fedFundsRes);
  if (ffD?.current != null) { out.fedFundsRate = round(ffD.current); if (ffD.prev != null) out.fedFundsRatePrev = round(ffD.prev); }

  const jcD = ok(joblessRes);
  if (jcD?.allCloses?.length >= 4) {
    const avg4 = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length / 1000);
    out.joblessClaims = avg4(jcD.allCloses.slice(-4));
    if (jcD.allCloses.length >= 8) out.joblessClaimsPrev = avg4(jcD.allCloses.slice(-8, -4));
  }

  const dxyD = ok(dxyRes);
  if (dxyD?.current != null) { out.dxy = round(dxyD.current, 1); if (dxyD.prev != null) out.dxyPrev = round(dxyD.prev, 1); }

  const joltsD = ok(joltsRes);
  if (joltsD?.current != null) {
    out.jolts = round(joltsD.current / 1000, 1);
    if (joltsD.prev != null) out.joltsPrev = round(joltsD.prev / 1000, 1);
  }

  const payemsD = ok(payemsRes);
  if (payemsD?.allCloses?.length >= 2) {
    const c = payemsD.allCloses;
    out.nfp = Math.round(c[c.length - 1] - c[c.length - 2]);
    if (c.length >= 3) out.nfpPrev = Math.round(c[c.length - 2] - c[c.length - 3]);
  }

  const aheD = ok(aheRes);
  if (aheD?.current != null) { out.wageGrowth = round(aheD.current); if (aheD.prev != null) out.wageGrowthPrev = round(aheD.prev); }

  const michD = ok(michRes);
  if (michD?.current != null) { out.consumerInflExp = round(michD.current); if (michD.prev != null) out.consumerInflExpPrev = round(michD.prev); }

  const ppiD = ok(ppiRes);
  if (ppiD?.current != null) { out.ppiYoy = round(ppiD.current); if (ppiD.prev != null) out.ppiYoyPrev = round(ppiD.prev); }

  const igD = ok(igSpreadRes);
  if (igD?.current != null) { out.igSpread = round(igD.current); if (igD.prev != null) out.igSpreadPrev = round(igD.prev); }
  const bbbD = ok(bbbSpreadRes);
  if (bbbD?.current != null) { out.bbbSpread = round(bbbD.current); if (bbbD.prev != null) out.bbbSpreadPrev = round(bbbD.prev); }
  const fsiD = ok(fsiRes);
  if (fsiD?.current != null) { out.financialStressIdx = round(fsiD.current); if (fsiD.prev != null) out.financialStressIdxPrev = round(fsiD.prev); }

  return out;
}

async function buildDashboardData(fredApiKey) {
  const marketData = await fetchLiveMacroData(fredApiKey);
  const carrySeverities = computeCarrySeverities(marketData);
  const carryTradeScore = computeCarryTradeScore(carrySeverities);
  const prediction = computePrediction(marketData, carryTradeScore);

  const adjCutPressure = Math.min(100, prediction.cutPressure + TRUMP_CUT_BIAS_DEFAULT);
  const adjNetScore = prediction.inflationPressure - adjCutPressure;
  const adjScenario = deriveScenario(prediction.inflationPressure, adjCutPressure, adjNetScore);
  const adjConfidence = Math.min(100, Math.abs(adjNetScore));

  return {
    timestamp: new Date().toISOString(),
    trumpCutBias: TRUMP_CUT_BIAS_DEFAULT,
    marketData,
    carryTradeScore,
    carrySeverities: Object.fromEntries(
      Object.entries(carrySeverities).map(([k, v]) => [k, Math.round(v)])
    ),
    prediction: { ...prediction, adjCutPressure, adjNetScore, adjScenario, adjConfidence },
  };
}

export async function getDashboardData(fredApiKey) {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL_MS) return _cache;
  _cache = await buildDashboardData(fredApiKey);
  _cacheTime = now;
  return _cache;
}
