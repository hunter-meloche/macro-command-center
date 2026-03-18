import { useState, useMemo, useEffect } from 'react';
import {
  round,
  MARKET_DATA_DEFAULTS,
  calcRealizedVol,
  computeCarrySeverities,
  computeCarryTradeScore,
  computePrediction,
} from './macroFormulas.js';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Droplet,
  Percent,
  AlertTriangle,
  Scale,
  Landmark,
  Loader2,
  ChevronRight,
  MessageSquare,
  Home,
  Map,
  Shovel,
  X,
  Gauge,
  Info,
  BarChart3,
  Calculator,
  Coins,
  ArrowRightLeft,
  ExternalLink,
  RefreshCw,
  Clock,
  Globe,
  Users,
  Waves,
} from 'lucide-react';

// --- Configuration & Sources ---
const DATA_SOURCES = {
  brentCrude: "https://fred.stlouisfed.org/series/DCOILBRENTEU",
  corePCE: "https://fred.stlouisfed.org/series/PCEPILFE",
  unemployment: "https://fred.stlouisfed.org/series/UNRATE",
  usdJpy: "https://fred.stlouisfed.org/series/DEXJPUS",
  gold: "https://www.kitco.com/charts/gold",
  silver: "https://www.kitco.com/charts/silver",
  fedWatch: "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html",
  mortgage30Y: "https://fred.stlouisfed.org/series/MORTGAGE30US",
  landAZ: "https://www.landwatch.com/arizona-land-for-sale",
  gladstone: "https://www.google.com/finance/quote/LAND:NASDAQ",
  sunCommunities: "https://www.google.com/finance/quote/SUI:NYSE",
  vix: "https://fred.stlouisfed.org/series/VIXCLS",
  sp500: "https://www.google.com/finance/quote/.INX:INDEXSP",
  tedSpread: "https://fred.stlouisfed.org/series/BAMLH0A0HYM2",
  bojRate: "https://fred.stlouisfed.org/series/IRSTCI01JPM156N",
  usJapanSpread: "https://fred.stlouisfed.org/series/IRLTLT01JPM156N",
  jpyVol: "https://fred.stlouisfed.org/series/DEXJPUS",
  fedFundsRate: "https://fred.stlouisfed.org/series/DFEDTARU",
  us2y: "https://fred.stlouisfed.org/series/DGS2",
  yieldCurve: "https://fred.stlouisfed.org/series/T10Y2Y",
  breakeven10Y: "https://fred.stlouisfed.org/series/T10YIE",
  joblessClaims: "https://fred.stlouisfed.org/series/ICSA",
  dxy: "https://fred.stlouisfed.org/series/DTWEXBGS",
  nfp: "https://fred.stlouisfed.org/series/PAYEMS",
  wageGrowth: "https://fred.stlouisfed.org/series/AHETPI",
  jolts: "https://fred.stlouisfed.org/series/JTSJOL",
  consumerInflExp: "https://fred.stlouisfed.org/series/MICH",
  ppiYoy: "https://fred.stlouisfed.org/series/PPIACO",
  igSpread: "https://fred.stlouisfed.org/series/BAMLC0A0CM",
  bbbSpread: "https://fred.stlouisfed.org/series/BAMLC0A4CBBB",
  financialStressIdx: "https://fred.stlouisfed.org/series/STLFSI3",
};

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
const FRED_API_KEY = import.meta.env.VITE_FRED_API_KEY;
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// --- Status Helpers (Defined here to fix ReferenceError) ---

const getCarryStatus = (score) => {
  const s = Number(score) || 0;
  if (s < 30)  return { label: 'Low',      sublabel: 'Carry trade stable',           color: 'text-emerald-500' };
  if (s < 50)  return { label: 'Moderate', sublabel: 'Normal fluctuations',          color: 'text-yellow-400' };
  if (s < 70)  return { label: 'Elevated', sublabel: 'Consider reducing exposure',   color: 'text-orange-400' };
  if (s < 85)  return { label: 'High',     sublabel: 'Unwind likely in progress',    color: 'text-rose-500' };
  return       { label: 'Critical',        sublabel: 'Maximum caution',              color: 'text-red-600' };
};

const getREStatus = (rate) => {
  const r = Number(rate) || 0;
  if (r < 5) return { label: 'BULLISH', color: 'text-emerald-400' };
  if (r < 6.5) return { label: 'NEUTRAL', color: 'text-orange-400' };
  return { label: 'BEARISH', color: 'text-rose-500' };
};

const SCENARIOS = {
  hold: {
    label: 'HIGHER FOR LONGER',
    color: 'text-blue-400',
    border: 'border-blue-500/30',
    bg: 'bg-blue-900/20',
    desc: 'Inflation signals are clearly dominant. The Fed has no compelling reason to cut — expect borrowing costs to stay elevated until Core PCE meaningfully and consistently falls back to 2%.',
    implication: 'Avoid long-duration bonds. Favor short-term Treasuries (3–6 month T-bills), value stocks, and real assets like land, gold, and commodities.',
    implColor: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  },
  wait: {
    label: 'WAIT AND SEE',
    color: 'text-slate-300',
    border: 'border-slate-500/30',
    bg: 'bg-slate-800/30',
    desc: 'Neither force is decisively dominant. The Fed is in a data-dependent holding pattern, watching incoming PCE and jobs prints before committing to a direction.',
    implication: 'Stay balanced. Short-term Treasuries for safety. Avoid aggressive directional bets until the macro picture clarifies over the next 2–3 data cycles.',
    implColor: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  },
  cut_lean: {
    label: 'CUT WATCH',
    color: 'text-yellow-400',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-900/20',
    desc: 'Recession pressure is gaining on inflation. The Fed is increasingly likely to pivot toward cuts. Watch upcoming unemployment and PCE prints — one or two weak readings could trigger the shift.',
    implication: 'Begin tilting toward intermediate-duration bonds. Defensive sectors (utilities, consumer staples) and gold tend to outperform in pre-cut environments.',
    implColor: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  },
  cut: {
    label: 'RATE CUT CYCLE',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-900/20',
    desc: 'Labor market weakness and recession pressure clearly dominate. The Fed is cutting or under significant pressure to cut. Inflation is no longer the primary constraint.',
    implication: 'Favor long-duration bonds and rate-sensitive assets. REITs, dividend growth stocks, and hard assets benefit as rates fall and the yield curve steepens.',
    implColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  stagflation: {
    label: 'STAGFLATION TRAP',
    color: 'text-orange-400',
    border: 'border-orange-500/30',
    bg: 'bg-orange-900/20',
    desc: "Both inflation and recession forces are simultaneously elevated — the Fed's worst dilemma. Cutting risks reigniting inflation; holding risks deepening the slowdown.",
    implication: 'TIPS, gold, commodities, and short-duration bonds offer the best protection. Avoid nominal long-duration bonds and speculative or leveraged equities.',
    implColor: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
  },
};

// --- Free Market Data (Yahoo Finance + FRED) ---

const withRetry = async (fn, retries = 3, delayMs = 800) => {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
};

const fetchYahooChart = (symbol) => withRetry(async () => {
  const res = await fetch(`${API_BASE}/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`);
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
});

const fetchFredObs = (seriesId, units = null) => {
  if (!FRED_API_KEY) return Promise.resolve(null);
  const unitsParam = units ? `&units=${units}` : '';
  return withRetry(async () => {
    const res = await fetch(`${API_BASE}/api/fred/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&limit=3&sort_order=desc&file_type=json${unitsParam}`);
    if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
    const obs = (await res.json())?.observations?.filter(o => o.value !== '.') || [];
    return { current: parseFloat(obs[0]?.value) || null, prev: parseFloat(obs[1]?.value) || null };
  });
};

// Fetches a longer history from FRED (for momentum and vol calculations).
// Returns same shape as fetchYahooChart: { current, prev (≈22 days back), allCloses }.
const fetchFredHistory = (seriesId, limit = 30) => {
  if (!FRED_API_KEY) return Promise.resolve(null);
  return withRetry(async () => {
    const res = await fetch(`${API_BASE}/api/fred/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&limit=${limit}&sort_order=desc&file_type=json`);
    if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
    const obs = (await res.json())?.observations?.filter(o => o.value !== '.') || [];
    const allCloses = obs.map(o => parseFloat(o.value)).filter(v => !isNaN(v)).reverse();
    if (allCloses.length < 2) throw new Error(`Insufficient FRED data: ${seriesId}`);
    return {
      current: allCloses[allCloses.length - 1],
      prev: allCloses[Math.max(0, allCloses.length - 22)],
      allCloses,
    };
  });
};

const fetchLiveMacroData = async () => {
  const [
    brentRes, usdJpyRes, goldRes, silverRes, vixRes, sp500Res, landRes, suiRes,
    corePCERes, unemploymentRes, mortgageRes, us10yRes, jp10yRes, bojRes, tedRes,
    us2yRes, yieldCurveRes, breakevenRes, joblessRes, fedFundsRes, dxyRes,
    joltsRes, payemsRes, aheRes, michRes, ppiRes,
    igSpreadRes, bbbSpreadRes, fsiRes,
  ] = await Promise.allSettled([
    fetchFredHistory('DCOILBRENTEU', 30),
    fetchFredHistory('DEXJPUS', 30),
    fetchYahooChart('GC=F'),
    fetchYahooChart('SI=F'),
    fetchFredObs('VIXCLS'),
    fetchYahooChart('^GSPC'),
    fetchYahooChart('LAND'),
    fetchYahooChart('SUI'),
    fetchFredObs('PCEPILFE', 'pc1'),
    fetchFredObs('UNRATE'),
    fetchFredObs('MORTGAGE30US'),
    fetchFredObs('DGS10'),
    fetchFredObs('IRLTLT01JPM156N'),
    fetchFredObs('IRSTCI01JPM156N'),
    fetchFredObs('BAMLH0A0HYM2'),
    fetchFredObs('DGS2'),
    fetchFredObs('T10Y2Y'),
    fetchFredObs('T10YIE'),
    fetchFredHistory('ICSA', 10),
    fetchFredObs('DFEDTARU'),
    fetchYahooChart('DX=F'),
    fetchFredObs('JTSJOL'),
    fetchFredHistory('PAYEMS', 3),
    fetchFredObs('AHETPI', 'pc1'),
    fetchFredObs('MICH'),
    fetchFredObs('PPIACO', 'pc1'),
    fetchFredObs('BAMLC0A0CM'),
    fetchFredObs('BAMLC0A4CBBB'),
    fetchFredObs('STLFSI3'),
  ]);

  const ok = (r) => r.status === 'fulfilled' ? r.value : null;
  const out = {};
  const failures = [];

  const setPair = (r, key, prevKey, label) => {
    const d = ok(r);
    if (d?.current != null) {
      out[key] = round(d.current);
      if (d.prev != null) out[prevKey] = round(d.prev);
    } else {
      failures.push(label);
    }
  };

  setPair(brentRes,        'brentCrude',          'brentCrudePrev',         'Brent Crude (FRED)');
  setPair(goldRes,         'goldSpot',             'goldSpotPrev',            'Gold (Yahoo)');
  setPair(silverRes,       'silverSpot',           'silverSpotPrev',          'Silver (Yahoo)');
  setPair(landRes,         'gladstonePrice',       'gladstonePricePrev',      'Gladstone/LAND (Yahoo)');
  setPair(suiRes,          'sunCommunitiesPrice',  'sunCommunitiesPricePrev', 'Sun Communities/SUI (Yahoo)');
  setPair(corePCERes,      'corePCE',              'corePCEPrev',             'Core PCE (FRED)');
  setPair(unemploymentRes, 'unemployment',         'unemploymentPrev',        'Unemployment (FRED)');
  setPair(mortgageRes,     'mortgage30Y',          'mortgage30YPrev',         'Mortgage 30Y (FRED)');

  const vixD = ok(vixRes);   if (vixD?.current  != null) out.vixIndex  = round(vixD.current);  else failures.push('VIX (FRED)');
  const spD  = ok(sp500Res); if (spD?.current   != null) out.sp500     = round(spD.current);   else failures.push('S&P 500 (Yahoo)');
  const bojD = ok(bojRes);   if (bojD?.current  != null) out.bojRate   = bojD.current;          else failures.push('BoJ Rate (FRED)');
  const tedD = ok(tedRes);   if (tedD?.current  != null) out.tedSpread = round(tedD.current);   else failures.push('HY Credit Spread (FRED)');

  const usdJpyD = ok(usdJpyRes);
  if (usdJpyD?.current != null) {
    out.usdJpy = round(usdJpyD.current);
    if (usdJpyD.prev != null)
      out.usdJpy1MChange = round((usdJpyD.current - usdJpyD.prev) / usdJpyD.prev * 100);
    const vol = calcRealizedVol(usdJpyD.allCloses);
    if (vol != null) out.jpyRealizedVol = vol;
  } else {
    failures.push('USD/JPY (FRED)');
  }

  const us10y = ok(us10yRes)?.current;
  const jp10y = ok(jp10yRes)?.current;
  if (us10y != null && jp10y != null) out.usJapanSpread = round(us10y - jp10y);
  else failures.push('US-Japan Rate Spread (FRED)');

  const us2yD = ok(us2yRes);
  if (us2yD?.current != null) { out.us2y = round(us2yD.current); if (us2yD.prev != null) out.us2yPrev = round(us2yD.prev); } else failures.push('US 2Y Yield (FRED)');
  const ycD = ok(yieldCurveRes);
  if (ycD?.current != null) { out.yieldCurve = round(ycD.current); if (ycD.prev != null) out.yieldCurvePrev = round(ycD.prev); } else failures.push('Yield Curve T10Y2Y (FRED)');
  const bkD = ok(breakevenRes);
  if (bkD?.current != null) { out.breakeven10Y = round(bkD.current); if (bkD.prev != null) out.breakeven10YPrev = round(bkD.prev); } else failures.push('10Y Breakeven Inflation (FRED)');
  const ffD = ok(fedFundsRes);
  if (ffD?.current != null) { out.fedFundsRate = round(ffD.current); if (ffD.prev != null) out.fedFundsRatePrev = round(ffD.prev); } else failures.push('Fed Funds Rate (FRED)');
  // Jobless claims: 4-week moving average reduces weekly noise. Score uses avg; prev shows prior 4wk avg.
  const jcD = ok(joblessRes);
  if (jcD?.allCloses?.length >= 4) {
    const avg4 = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length / 1000);
    out.joblessClaims = avg4(jcD.allCloses.slice(-4));
    if (jcD.allCloses.length >= 8) out.joblessClaimsPrev = avg4(jcD.allCloses.slice(-8, -4));
  } else {
    failures.push('Jobless Claims (FRED)');
  }
  const dxyD = ok(dxyRes);
  if (dxyD?.current != null) { out.dxy = round(dxyD.current, 1); if (dxyD.prev != null) out.dxyPrev = round(dxyD.prev, 1); } else failures.push('DXY Dollar Index (Yahoo)');

  // JOLTS Job Openings: level in thousands → store as millions for display/formula.
  const joltsD = ok(joltsRes);
  if (joltsD?.current != null) {
    out.jolts = round(joltsD.current / 1000, 1);
    if (joltsD.prev != null) out.joltsPrev = round(joltsD.prev / 1000, 1);
  } else {
    failures.push('JOLTS Job Openings (FRED)');
  }

  // Nonfarm Payrolls: level series → compute MoM change in thousands (e.g. 175 = 175k jobs).
  const payemsD = ok(payemsRes);
  if (payemsD?.allCloses?.length >= 2) {
    const c = payemsD.allCloses;
    out.nfp = Math.round(c[c.length - 1] - c[c.length - 2]);
    if (c.length >= 3) out.nfpPrev = Math.round(c[c.length - 2] - c[c.length - 3]);
  } else {
    failures.push('Nonfarm Payrolls (FRED)');
  }

  // Average Hourly Earnings YoY %: pc1 transformation applied by FRED.
  const aheD = ok(aheRes);
  if (aheD?.current != null) { out.wageGrowth = round(aheD.current); if (aheD.prev != null) out.wageGrowthPrev = round(aheD.prev); } else failures.push('Wage Growth AHE (FRED)');

  // U of Michigan 1-year consumer inflation expectations.
  const michD = ok(michRes);
  if (michD?.current != null) { out.consumerInflExp = round(michD.current); if (michD.prev != null) out.consumerInflExpPrev = round(michD.prev); } else failures.push('Consumer Inflation Expectations (FRED)');

  // PPI All Commodities YoY %: pc1 transformation applied by FRED.
  const ppiD = ok(ppiRes);
  if (ppiD?.current != null) { out.ppiYoy = round(ppiD.current); if (ppiD.prev != null) out.ppiYoyPrev = round(ppiD.prev); } else failures.push('PPI YoY (FRED)');

  // Credit market stress proxies — best available public signals for private credit health.
  const igD = ok(igSpreadRes);
  if (igD?.current != null) { out.igSpread = round(igD.current); if (igD.prev != null) out.igSpreadPrev = round(igD.prev); } else failures.push('IG Credit Spread (FRED)');
  const bbbD = ok(bbbSpreadRes);
  if (bbbD?.current != null) { out.bbbSpread = round(bbbD.current); if (bbbD.prev != null) out.bbbSpreadPrev = round(bbbD.prev); } else failures.push('BBB Credit Spread (FRED)');
  const fsiD = ok(fsiRes);
  if (fsiD?.current != null) { out.financialStressIdx = round(fsiD.current); if (fsiD.prev != null) out.financialStressIdxPrev = round(fsiD.prev); } else failures.push('Financial Stress Index (FRED)');

  return { data: out, failures };
};

const callClaudeAnalysis = async (prompt, systemInstruction = "") => {
  let delay = 1000;
  for (let i = 0; i < 5; i++) {
    try {
      const body = {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      };
      if (systemInstruction) body.system = systemInstruction;

      const response = await fetch(`${API_BASE}/api/anthropic/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error('Analysis API Error');
      const result = await response.json();
      return String(result.content?.[0]?.text || "No analysis returned.");
    } catch (error) {
      if (i === 4) throw error;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
};

// --- UI Sub-Components ---

const SourceButton = ({ url }) => (
  <a href={url} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-500 hover:text-blue-400" title="View Source">
    <ExternalLink size={12} />
  </a>
);

const NO_DOLLAR_KEYWORDS = ['RATE', 'PCE', 'PROB', '30Y', 'BREAKEVEN', 'YIELD', 'CURVE', 'CLAIM', 'TREASURY', 'INDEX', 'DXY', '2Y', '10Y', 'VIX', 'SPREAD', 'PAYROLL', 'JOLTS', 'EARNING', 'OPENING', 'EXPECT', 'PPI'];

const MetricCard = ({ title, value, previous, unit, icon: Icon, description, sourceUrl, inverseLogic = false, threshold = null, thresholdLabel = 'Fed Target' }) => {
  const val = Number(value) || 0;
  const hasPrev = previous != null;
  const prev = hasPrev ? Number(previous) || 0 : val;
  const isUp = hasPrev && val > prev;
  const isDown = hasPrev && val < prev;
  const isNeutral = !hasPrev || val === prev;
  let colorClass = isUp ? "text-emerald-400" : "text-rose-400";
  let bgClass = isUp ? "bg-emerald-400/10" : "bg-rose-400/10";
  if (inverseLogic) {
    colorClass = isUp ? "text-rose-400" : "text-emerald-400";
    bgClass = isUp ? "bg-rose-400/10" : "bg-emerald-400/10";
  }
  if (isNeutral) {
    colorClass = "text-slate-400";
    bgClass = "bg-slate-400/10";
  }
  const showDollar = !NO_DOLLAR_KEYWORDS.some(k => title.toUpperCase().includes(k));

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg flex flex-col group transition-all hover:border-slate-600">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center space-x-2 text-slate-300">
            <Icon size={18} className="text-slate-400" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">{String(title)}</h3>
            <SourceButton url={sourceUrl} />
          </div>
          {hasPrev && (
            <div className={`px-2 py-1 rounded text-xs font-bold flex items-center ${bgClass} ${colorClass}`}>
              {isUp ? <TrendingUp size={14} className="mr-1" /> : (isNeutral ? null : <TrendingDown size={14} className="mr-1" />)}
              {parseFloat(Math.abs(val - prev).toFixed(2))}
            </div>
          )}
        </div>
        <div className="text-3xl font-bold text-white mb-1">
          {showDollar ? '$' : ''}{val.toLocaleString()}{String(unit)}
        </div>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed line-clamp-3">{String(description)}</p>
      </div>
      {threshold != null && (
        <div className="mt-4 pt-3 border-t border-slate-700 flex justify-between items-center text-[10px]">
          <span className="text-slate-500 uppercase font-bold tracking-tighter">{thresholdLabel}:</span>
          <span className="text-slate-300 font-mono">{String(threshold)}{String(unit)}</span>
        </div>
      )}
    </div>
  );
};

const SubMetric = ({ label, value, unit, severity, description, sourceUrl }) => {
  const s = Number(severity) || 0;
  return (
    <div className="bg-[#1a1c24] border border-slate-800 rounded-lg p-5">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="text-slate-300 text-xs font-bold uppercase tracking-widest">{String(label)}</span>
          <SourceButton url={sourceUrl} />
        </div>
        {s > 50 ? <AlertTriangle size={14} className="text-rose-500" /> : <TrendingUp size={14} className="text-emerald-500" />}
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <div className="text-2xl font-black text-white">{String(value)}</div>
        {unit && <div className="text-xs text-slate-500 uppercase">{String(unit)}</div>}
      </div>
      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full ${s > 75 ? 'bg-red-500' : s > 40 ? 'bg-orange-500' : 'bg-emerald-500'}`}
          style={{ width: `${s}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600 font-mono">
        <span>INTENSITY</span>
        <span>{s}/100</span>
      </div>
      <p className="text-[10px] text-slate-500 italic leading-tight mt-2">{String(description)}</p>
    </div>
  );
};

const ModalWrapper = ({ title, icon: Icon, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-[#111318] w-full max-w-6xl max-h-[95vh] overflow-y-auto rounded-2xl border border-slate-800 shadow-2xl relative">
      <div className="sticky top-0 bg-[#111318] p-6 border-b border-slate-800 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <Icon size={24} className="text-blue-400" />
          <h2 className="text-xl font-bold text-white uppercase tracking-widest">{String(title)}</h2>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={28} />
        </button>
      </div>
      <div className="p-8">{children}</div>
    </div>
  </div>
);

// --- Main Application ---

const STORAGE_KEY = 'feddashboard_market_data';

export default function App() {
  const [marketData, setMarketData] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      return cached ? { ...MARKET_DATA_DEFAULTS, ...JSON.parse(cached) } : MARKET_DATA_DEFAULTS;
    } catch {
      return MARKET_DATA_DEFAULTS;
    }
  });

  const carrySeverities = useMemo(() => computeCarrySeverities(marketData), [marketData]);

  const carryTradeScore = useMemo(() => computeCarryTradeScore(carrySeverities), [carrySeverities]);

  const prediction = useMemo(
    () => computePrediction(marketData, carryTradeScore),
    [marketData, carryTradeScore]
  );

  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(() => { try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; } });
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  const [activeModal, setActiveModal] = useState(null);
  const [showFormula, setShowFormula] = useState(false);
  const [showCarryFormula, setShowCarryFormula] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [syncFailures, setSyncFailures] = useState([]);
  const [trumpCutBias, setTrumpCutBias] = useState(15);

  const syncLiveData = async () => {
    setDataLoading(true);
    setErrorMsg("");
    setSyncFailures([]);
    try {
      const { data: live, failures } = await fetchLiveMacroData();
      if (Object.keys(live).length > 0) {
        setMarketData(prev => {
          const next = { ...prev, ...live };
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
        setDataLoaded(true);
        setLastUpdated(new Date().toLocaleTimeString());
        if (failures.length > 0) setSyncFailures(failures);
      } else {
        setErrorMsg("No data returned. Add VITE_FRED_API_KEY to .env for macro data.");
      }
    } catch (e) {
      setErrorMsg(`Sync failed: ${e.message}`);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => { syncLiveData(); }, []);

  const generateAIAnalysis = async () => {
    if (!apiKey) {
      setErrorMsg("VITE_ANTHROPIC_API_KEY is not set. Add it to your .env file.");
      return;
    }
    setLoading(true); setAnalysis("");
    try {
      const prompt = `State: Oil $${marketData.brentCrude}, Unemployment ${marketData.unemployment}%, Carry Score ${carryTradeScore}. Strategy for $2k/month land savings?`;
      const result = await callClaudeAnalysis(prompt, "Macro advisor.");
      setAnalysis(String(result));
    } catch (err) {
      setErrorMsg("Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const carryStatus = getCarryStatus(carryTradeScore);
  const reStatus = getREStatus(marketData.mortgage30Y);

  const adjCutPressure = Math.min(100, prediction.cutPressure + trumpCutBias);
  const adjNetScore = prediction.inflationPressure - adjCutPressure;
  const adjConfidence = Math.min(100, Math.abs(adjNetScore));
  const adjScenarioKey = (() => {
    if (prediction.inflationPressure >= 55 && adjCutPressure >= 55) return 'stagflation';
    if (adjNetScore > 25) return 'hold';
    if (adjNetScore >= 0) return 'wait';
    if (adjNetScore >= -25) return 'cut_lean';
    return 'cut';
  })();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-6 font-sans">
      <div className="max-w-6xl mx-auto">

        {/* Modals */}
        {activeModal === 'carry' && (
          <ModalWrapper title="Carry Trade Technicals" icon={Gauge} onClose={() => setActiveModal(null)}>
             <div className="p-2">
               <div className="flex flex-col lg:flex-row gap-10 items-start mb-12">
                  <div className="relative w-56 h-56 flex-shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="112" cy="112" r="100" stroke="currentColor" strokeWidth="16" fill="transparent" className="text-slate-800" />
                      <circle cx="112" cy="112" r="100" stroke="currentColor" strokeWidth="16" fill="transparent" strokeDasharray={628} strokeDashoffset={628 - (628 * carryTradeScore) / 100} className={carryStatus.color.replace('text', 'stroke')} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-6xl font-black text-white">{String(carryTradeScore)}</span>
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">/ 100</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <AlertTriangle size={32} className={carryStatus.color} />
                        <div>
                          <h3 className={`text-4xl font-black uppercase ${carryStatus.color}`}>{carryStatus.label} Risk</h3>
                          <div className="text-sm text-slate-400 mt-0.5">{carryStatus.sublabel}</div>
                        </div>
                      </div>
                      <button onClick={() => setShowCarryFormula(!showCarryFormula)} className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center bg-slate-800/50 px-3 py-1 rounded border border-slate-700 transition-colors flex-shrink-0"><Calculator size={14} className="mr-2" />{showCarryFormula ? 'HIDE MATH' : 'SCRUTINIZE FORMULA'}</button>
                    </div>
                    <p className="text-slate-400 text-lg leading-relaxed mb-8">Systematic monitoring of funding stress. Risk intensity is calculated based on deviations from market baselines. Stronger Yen momentum and US volatility spike the unwind probability.</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                       <div className="bg-slate-900 p-4 rounded-xl border border-slate-800"><div className="flex justify-center items-center gap-1 mb-1 font-bold uppercase text-[10px] text-slate-500">USD/JPY <SourceButton url={DATA_SOURCES.usdJpy} /></div><div className="text-white font-mono font-bold text-lg">{String(marketData.usdJpy)}¥</div></div>
                       <div className="bg-slate-900 p-4 rounded-xl border border-slate-800"><div className="flex justify-center items-center gap-1 mb-1 font-bold uppercase text-[10px] text-slate-500">VIX <SourceButton url={DATA_SOURCES.vix} /></div><div className="text-white font-mono font-bold text-lg">{String(marketData.vixIndex)}</div></div>
                       <div className="bg-slate-900 p-4 rounded-xl border border-slate-800"><div className="flex justify-center items-center gap-1 mb-1 font-bold uppercase text-[10px] text-slate-500">Spread <SourceButton url={DATA_SOURCES.usJapanSpread} /></div><div className="text-white font-mono font-bold text-lg">{String(marketData.usJapanSpread)}%</div></div>
                       <div className="bg-slate-900 p-4 rounded-xl border border-slate-800"><div className="flex justify-center items-center gap-1 mb-1 font-bold uppercase text-[10px] text-slate-500">S&P 500 <SourceButton url={DATA_SOURCES.sp500} /></div><div className="text-white font-mono font-bold text-lg">{(marketData.sp500 || 0).toLocaleString()}</div></div>
                    </div>
                  </div>
               </div>
               {showCarryFormula && (
                 <div className="mb-10 p-5 bg-slate-950 rounded-lg border border-slate-800 animate-in slide-in-from-top-4 duration-300">
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-[11px] font-mono">
                     <div className="space-y-1">
                       <div className="text-blue-400 uppercase font-bold mb-2">US-Japan Rate Spread <span className="text-slate-600 normal-case font-normal">wt 20%</span></div>
                       <div className="text-slate-500">Formula: (4.0 − spread) / 3.5 × 100</div>
                       <div className="text-slate-600">Range: 4.0% = 0 · 2.25% = 50 · 0.5% = 100</div>
                       <div className="flex justify-between"><span>Input:</span><span className="text-white">{marketData.usJapanSpread}%</span></div>
                       <div className="flex justify-between"><span>Score:</span><span className="text-orange-400">{carrySeverities.spread.toFixed(1)} / 100</span></div>
                     </div>
                     <div className="space-y-1">
                       <div className="text-blue-400 uppercase font-bold mb-2">JPY Strengthen Momentum <span className="text-slate-600 normal-case font-normal">wt 25%</span></div>
                       <div className="text-slate-500">Formula: −(1M USD/JPY change) / 3 × 100</div>
                       <div className="text-slate-600">Directional: JPY strengthening only. 0 if USD/JPY rising.</div>
                       <div className="flex justify-between"><span>Input:</span><span className="text-white">{marketData.usdJpy1MChange}%</span></div>
                       <div className="flex justify-between"><span>Score:</span><span className="text-orange-400">{carrySeverities.change.toFixed(1)} / 100</span></div>
                     </div>
                     <div className="space-y-1">
                       <div className="text-blue-400 uppercase font-bold mb-2">JPY Realized Vol <span className="text-slate-600 normal-case font-normal">wt 20%</span></div>
                       <div className="text-slate-500">Formula: (vol − 6) / 19 × 100</div>
                       <div className="text-slate-600">Range: 6% = 0 · 15.5% = 50 · 25% = 100</div>
                       <div className="flex justify-between"><span>Input:</span><span className="text-white">{marketData.jpyRealizedVol}%</span></div>
                       <div className="flex justify-between"><span>Score:</span><span className="text-orange-400">{carrySeverities.vol.toFixed(1)} / 100</span></div>
                     </div>
                     <div className="space-y-1">
                       <div className="text-blue-400 uppercase font-bold mb-2">VIX Index <span className="text-slate-600 normal-case font-normal">wt 20%</span></div>
                       <div className="text-slate-500">Formula: (VIX − 12) / 28 × 100</div>
                       <div className="text-slate-600">Range: 12 = 0 · 26 = 50 · 40 = 100</div>
                       <div className="flex justify-between"><span>Input:</span><span className="text-white">{marketData.vixIndex}</span></div>
                       <div className="flex justify-between"><span>Score:</span><span className="text-orange-400">{carrySeverities.vix.toFixed(1)} / 100</span></div>
                     </div>
                     <div className="space-y-1">
                       <div className="text-blue-400 uppercase font-bold mb-2">HY Credit Spread <span className="text-slate-600 normal-case font-normal">wt 10%</span></div>
                       <div className="text-slate-500">Formula: (OAS − 2) / 8 × 100</div>
                       <div className="text-slate-600">Range: 2% = 0 · 6% = 50 · 10% = 100</div>
                       <div className="flex justify-between"><span>Input:</span><span className="text-white">{marketData.tedSpread}%</span></div>
                       <div className="flex justify-between"><span>Score:</span><span className="text-orange-400">{carrySeverities.ted.toFixed(1)} / 100</span></div>
                     </div>
                     <div className="space-y-1">
                       <div className="text-blue-400 uppercase font-bold mb-2">BoJ Policy Rate <span className="text-slate-600 normal-case font-normal">wt 5%</span></div>
                       <div className="text-slate-500">Formula: rate / 2.0 × 100</div>
                       <div className="text-slate-600">Range: 0% = 0 · 1.0% = 50 · 2.0% = 100</div>
                       <div className="flex justify-between"><span>Input:</span><span className="text-white">{marketData.bojRate}%</span></div>
                       <div className="flex justify-between"><span>Score:</span><span className="text-orange-400">{carrySeverities.boj.toFixed(1)} / 100</span></div>
                     </div>
                   </div>
                   <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center text-[11px] font-mono">
                     <span className="text-slate-500">COMPOSITE = change×25% + vol×20% + vix×20% + spread×20% + oas×10% + boj×5%</span>
                     <span className="text-white font-bold">{carryTradeScore} / 100</span>
                   </div>
                 </div>
               )}
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                 <SubMetric label="US-Japan Rate Spread" value={String(marketData.usJapanSpread) + "%"} severity={carrySeverities.spread.toFixed(0)} description="US 10Y minus Japan 10Y yield. As the gap narrows (Fed cuts / BoJ hikes), carry trade profitability collapses and forced closures follow." sourceUrl={DATA_SOURCES.usJapanSpread} />
                 <SubMetric label="JPY Strengthen Momentum" value={String(marketData.usdJpy1MChange) + "%"} severity={carrySeverities.change.toFixed(0)} description="1-month USD/JPY % change. Only JPY strengthening (negative) scores — that's the actual unwind trigger as leveraged positions are force-closed." sourceUrl={DATA_SOURCES.usdJpy} />
                 <SubMetric label="JPY Realized Vol" value={String(marketData.jpyRealizedVol) + "%"} severity={carrySeverities.vol.toFixed(0)} description="20-day annualized volatility of USD/JPY. Spiking vol reflects panic liquidation of leveraged Yen positions. Peaked ~25% in the Aug 2024 unwind." sourceUrl={DATA_SOURCES.jpyVol} />
                 <SubMetric label="VIX Index" value={String(marketData.vixIndex)} severity={carrySeverities.vix.toFixed(0)} description="CBOE implied volatility index. Carry trades unwind aggressively when VIX spikes — broad fear drives simultaneous deleveraging across all risk assets." sourceUrl={DATA_SOURCES.vix} />
                 <SubMetric label="HY Credit Spread" value={String(marketData.tedSpread) + "%"} severity={carrySeverities.ted.toFixed(0)} description="ICE BofA US High Yield OAS. Widening credit spreads signal tightening funding conditions, forcing leveraged carry traders to deleverage to meet margin calls." sourceUrl={DATA_SOURCES.tedSpread} />
                 <SubMetric label="BoJ Policy Rate" value={String(marketData.bojRate) + "%"} severity={carrySeverities.boj.toFixed(0)} description="Bank of Japan overnight call rate. Each BoJ hike raises JPY borrowing costs, shrinking the carry trade interest differential and triggering long-term position unwinding." sourceUrl={DATA_SOURCES.bojRate} />
               </div>
             </div>
          </ModalWrapper>
        )}

        {activeModal === 're' && (
          <ModalWrapper title="Real Estate Intel" icon={Home} onClose={() => setActiveModal(null)}>
             <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
                <MetricCard title="30Y Mortgage" value={marketData.mortgage30Y} previous={marketData.mortgage30YPrev} sourceUrl={DATA_SOURCES.mortgage30Y} icon={Activity} inverseLogic={true} unit="%" description="Primary buyer demand driver." />
                <MetricCard title="AZ Land Price" value={marketData.landPriceAZ} previous={marketData.landPriceAZPrev} sourceUrl={DATA_SOURCES.landAZ} icon={Map} inverseLogic={true} unit="" description="Avg cost for 40ac well-ready parcel." />
                <MetricCard title="Gladstone (LAND)" value={marketData.gladstonePrice} previous={marketData.gladstonePricePrev} sourceUrl={DATA_SOURCES.gladstone} icon={Shovel} unit="" description="Farmland REIT tracking food inflation." />
                <MetricCard title="Sun Comm (SUI)" value={marketData.sunCommunitiesPrice} previous={marketData.sunCommunitiesPricePrev} sourceUrl={DATA_SOURCES.sunCommunities} icon={Home} unit="" description="RV/Mobile living demand gauge." />
             </div>
             <div className="bg-blue-900/10 border border-blue-500/20 p-6 rounded-xl">
                <h4 className="text-blue-400 font-bold mb-2 uppercase text-xs flex items-center tracking-widest"><Info size={14} className="mr-2"/> Market Outlook</h4>
                <p className="text-sm text-slate-400 leading-relaxed">Current rates at {String(marketData.mortgage30Y)}% are keeping land markets {reStatus.label.toLowerCase()}. For a $150k acquisition, a 20% down payment requires $30k liquid.</p>
             </div>
          </ModalWrapper>
        )}

        {activeModal === 'metals' && (
          <ModalWrapper title="Metals Anchor" icon={Coins} onClose={() => setActiveModal(null)}>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                   <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 flex justify-between items-center text-yellow-500">
                      <div><div className="text-xs uppercase font-bold text-slate-500 mb-1 tracking-widest">Gold Spot</div><div className="text-3xl font-black">${(marketData.goldSpot || 0).toLocaleString()}</div></div>
                      <SourceButton url={DATA_SOURCES.gold} />
                   </div>
                   <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 flex justify-between items-center text-slate-200">
                      <div><div className="text-xs uppercase font-bold text-slate-500 mb-1 tracking-widest">Silver Spot</div><div className="text-3xl font-black">${(marketData.silverSpot || 0).toLocaleString()}</div></div>
                      <SourceButton url={DATA_SOURCES.silver} />
                   </div>
                </div>
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                   <h4 className="text-blue-400 font-bold mb-4 uppercase text-xs tracking-widest flex items-center"><ArrowRightLeft size={16} className="mr-2"/> Ratio Analysis</h4>
                   <div className="text-5xl font-black text-white mb-2">{(marketData.goldSpot / (marketData.silverSpot || 1)).toFixed(1)}:1</div>
                </div>
             </div>
          </ModalWrapper>
        )}

        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end border-b border-slate-700 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center">
              <Landmark className="mr-3 text-blue-400" size={32} /> Macro Command Center
            </h1>
            <div className="flex items-center text-slate-400 mt-2 space-x-4">
              <span className="flex items-center text-xs tracking-wider uppercase font-bold text-slate-500"><Clock size={14} className="mr-1 text-slate-600"/> Updated: {String(lastUpdated)}</span>
              <button onClick={syncLiveData} disabled={dataLoading} className="flex items-center text-[10px] uppercase font-bold tracking-widest bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded border border-slate-600 transition-colors disabled:opacity-50 text-slate-300">
                {dataLoading ? <Loader2 size={12} className="animate-spin mr-2"/> : <RefreshCw size={12} className="mr-2"/>} Sync Live Data
              </button>
            </div>
            {errorMsg && <div className="text-rose-500 text-xs mt-2 font-bold flex items-center"><AlertTriangle size={12} className="mr-1"/> {String(errorMsg)}</div>}
            {!dataLoaded && !dataLoading && <div className="text-amber-400 text-xs mt-2 font-bold flex items-center"><AlertTriangle size={12} className="mr-1"/> PLACEHOLDER DATA — values below are estimates, not live market data</div>}
            {syncFailures.length > 0 && (
              <div className="mt-3 p-3 bg-rose-950/60 border border-rose-600/60 rounded-lg">
                <div className="text-rose-400 text-xs font-black uppercase tracking-widest mb-2 flex items-center">
                  <AlertTriangle size={13} className="mr-1.5"/> {syncFailures.length} source{syncFailures.length > 1 ? 's' : ''} failed — showing last known values:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {syncFailures.map(f => (
                    <span key={f} className="bg-rose-900/70 border border-rose-700/50 text-rose-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded">{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 md:mt-0 text-right">
            <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Fed Funds Target</div>
            <div className="text-2xl font-mono text-blue-400 font-bold">{Number(marketData.fedFundsRate).toFixed(2)}%</div>
          </div>
        </header>

        {/* Prediction Engine */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {(() => { const scen = SCENARIOS[adjScenarioKey]; return (
          <div className={`lg:col-span-2 p-6 rounded-xl border flex flex-col justify-between relative overflow-hidden ${scen.bg} ${scen.border}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2"><Activity className={scen.color} size={20} /><h2 className="font-bold text-lg text-white uppercase tracking-widest">Fed Prediction Engine</h2></div>
              <button onClick={() => setShowFormula(!showFormula)} className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center bg-slate-800/50 px-3 py-1 rounded border border-slate-700 transition-colors"><Calculator size={14} className="mr-2" /> {showFormula ? 'HIDE MATH' : 'SCRUTINIZE FORMULA'}</button>
            </div>
            <div className="flex items-start justify-between mt-4 gap-4">
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Current Forecast</p>
                <div className={`text-2xl font-black tracking-tight ${scen.color}`}>{scen.label}</div>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">{scen.desc}</p>
                <div className={`mt-3 text-xs px-3 py-2 rounded-lg inline-flex items-start gap-2 border ${scen.implColor}`}>
                  <span className="font-bold uppercase tracking-wider flex-shrink-0">Investor implication:</span>
                  <span className="font-normal">{scen.implication}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold mb-1"><span>Inflation Pressure</span><span className="text-rose-400">{prediction.inflationPressure}/100</span></div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-rose-500 rounded-full transition-all" style={{width: `${prediction.inflationPressure}%`}} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold mb-1"><span>Cut Pressure</span><span className="text-emerald-400">{adjCutPressure}/100{trumpCutBias > 0 && <span className="text-amber-400 ml-1">(+{trumpCutBias} override)</span>}</span></div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{width: `${adjCutPressure}%`}} /></div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 bg-amber-950/30 border border-amber-500/20 rounded-lg px-3 py-2">
                  <span className="text-amber-400" style={{fontSize:'16px'}}>🦅</span>
                  <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider flex-shrink-0">Trump Cut Override</span>
                  <input
                    type="number" min="0" max="50"
                    value={trumpCutBias}
                    onChange={e => setTrumpCutBias(Math.min(50, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-14 bg-slate-900 border border-amber-500/50 text-amber-300 text-center font-mono text-sm rounded px-2 py-0.5 focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-[10px] text-slate-500">pts added to cut pressure (0–50)</span>
                </div>
              </div>
              <div className="text-center bg-slate-900/50 p-4 rounded-lg border border-slate-700 hidden sm:block flex-shrink-0 min-w-[130px]">
                <div className={`text-3xl font-mono font-bold leading-none ${scen.color}`}>{adjConfidence}%</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Signal Strength</div>
                <div className="text-[9px] text-slate-600 mt-1 leading-tight">0% = toss-up<br/>100% = decisive</div>
                <div className="text-[9px] text-slate-500 mt-3 font-mono border-t border-slate-800 pt-2">
                  Net: {adjNetScore > 0 ? '+' : ''}{adjNetScore}
                </div>
              </div>
            </div>
            {showFormula && (
              <div className="mt-6 p-5 bg-slate-950 rounded-lg border border-slate-800 animate-in slide-in-from-top-4 duration-300">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-4">How the forecast is built — two normalized 0–100 pressure scores</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] font-mono">
                  <div className="space-y-2 border border-rose-900/40 bg-rose-950/20 rounded-lg p-3">
                    <div className="text-rose-400 uppercase font-bold mb-2">Inflation Pressure <span className="text-[9px] text-rose-700 font-normal normal-case">→ hold / hike</span></div>
                    <div className="flex justify-between text-slate-400"><span>Core PCE (×momentum {prediction.sub.pceMomentum.toFixed(2)}):</span><span className="text-rose-400">{prediction.sub.pceScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">2.0% = 0 · 3.5% = 100 · wt 25%</span></div>
                    <div className="flex justify-between text-slate-400"><span>10Y Breakeven inflation:</span><span className="text-rose-400">{prediction.sub.breakevenScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">2.0% = 0 · 3.5% = 100 · wt 15%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Consumer infl. expectations:</span><span className="text-rose-400">{prediction.sub.michScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">2.5% = 0 · 4.5% = 100 · wt 12%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Avg Hourly Earnings YoY:</span><span className="text-rose-400">{prediction.sub.wageScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">3.5% = 0 · 5.0% = 100 · wt 12%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Nonfarm Payrolls (hot):</span><span className="text-rose-400">{prediction.sub.nfpInflScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">150k = 0 · 350k = 100 · wt 10%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Oil supply shock:</span><span className="text-rose-400">{prediction.sub.oilScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">$90 = 0 · $120 = 100 · wt 8%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Tight labor (below 4.5% NAIRU):</span><span className="text-rose-400">{prediction.sub.tightLaborScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">4.5% = 0 · 3.5% = 100 · wt 8%</span></div>
                    <div className="flex justify-between text-slate-400"><span>PPI YoY (pipeline inflation):</span><span className="text-rose-400">{prediction.sub.ppiScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">2% = 0 · 10% = 100 · wt 6%</span></div>
                    <div className="flex justify-between text-slate-400"><span>JOLTS openings elevated:</span><span className="text-rose-400">{prediction.sub.joltsInflScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">8M = 0 · 12M = 100 · wt 4%</span></div>
                    <div className="flex justify-between border-t border-slate-800 pt-1 text-rose-300 font-bold"><span>Weighted Total:</span><span>{prediction.inflationPressure} / 100</span></div>
                  </div>
                  <div className="space-y-2 border border-emerald-900/40 bg-emerald-950/20 rounded-lg p-3">
                    <div className="text-emerald-400 uppercase font-bold mb-2">Cut Pressure <span className="text-[9px] text-emerald-700 font-normal normal-case">→ cut rates</span></div>
                    <div className="flex justify-between text-slate-400"><span>Rising unemployment:</span><span className="text-emerald-400">{prediction.sub.unempScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">4.1% = 0 · 5.5% = 100 · wt 17%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Yield curve (10Y − 2Y):</span><span className="text-emerald-400">{prediction.sub.yieldCurveScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">+0.5% = 0 · flat = 25 · −1.5% = 100 · wt 16%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Initial jobless claims:</span><span className="text-emerald-400">{prediction.sub.joblessScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">220k = 0 · 500k = 100 · wt 15%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Nonfarm Payrolls (weak):</span><span className="text-emerald-400">{prediction.sub.nfpCutScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">150k = 0 · −50k = 100 · wt 16%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Rate cut premium (FFR − 2Y):</span><span className="text-emerald-400">{prediction.sub.rateCutPremiumScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">0% gap = 0 · 1.5% gap = 100 · wt 12%</span></div>
                    <div className="flex justify-between text-slate-400"><span>JOLTS openings declining:</span><span className="text-emerald-400">{prediction.sub.joltsCutScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">8M = 0 · 5M = 100 · wt 9%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Credit stress (IG + BBB OAS):</span><span className="text-emerald-400">{prediction.sub.creditStressScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">IG: 80bps=0 · 250bps=100 · BBB: 100bps=0 · 300bps=100 · wt 5% (indirect proxy)</span></div>
                    <div className="flex justify-between text-slate-400"><span>Financial stress index (FSI):</span><span className="text-emerald-400">{prediction.sub.fsiScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">0 = avg · +2 = 100 · wt 3% (indirect proxy)</span></div>
                    <div className="flex justify-between text-slate-400"><span>Disinflation (PCE below 2.5%):</span><span className="text-emerald-400">{prediction.sub.disinfScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">2.5% = 0 · 1.5% = 100 · wt 5%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Financial stress (carry score):</span><span className="text-emerald-400">{prediction.sub.financialScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">0 = calm · 100 = crisis · wt 2%</span></div>
                    <div className="flex justify-between text-slate-400"><span>Restrictive mortgage rate:</span><span className="text-emerald-400">{prediction.sub.mortgageScore} / 100</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-slate-600 pl-2">6% = 0 · 8% = 100 · wt 1%</span></div>
                    <div className="flex justify-between border-t border-slate-800 pt-1 text-emerald-300 font-bold"><span>Weighted Total:</span><span>{prediction.cutPressure} / 100</span></div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                  <div>Net = Inflation ({prediction.inflationPressure}) − Cut ({prediction.cutPressure}{trumpCutBias > 0 ? `+${trumpCutBias}` : ''}) = <span className="text-white font-bold">{adjNetScore > 0 ? '+' : ''}{adjNetScore}</span></div>
                  <div className="text-slate-600">Stagflation if both ≥ 55 · Hold if net &gt; 25 · Wait if 0–25 · Cut Watch if −25–0 · Cut if &lt; −25</div>
                  <div>→ <span className={`font-bold ${scen.color}`}>{scen.label}</span> <span className="text-slate-600">· Signal Strength: {adjConfidence}%</span></div>
                </div>
              </div>
            )}
          </div>
          ); })()}
          <div className="lg:col-span-1 bg-gradient-to-br from-indigo-900/40 to-slate-800 p-6 rounded-xl border border-indigo-500/30 shadow-xl flex flex-col justify-between">
            <button onClick={generateAIAnalysis} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center shadow-lg">{loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <MessageSquare size={18} className="mr-2" />}{loading ? "Analyzing..." : "Generate AI Strategy ✨"}</button>
            <div className="mt-4 space-y-3">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">What this does</p>
              <p className="text-xs text-slate-400 leading-relaxed">Sends the current macro snapshot — oil price, unemployment, carry trade risk score, and the active scenario — to Claude for analysis.</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-xs text-slate-400"><ChevronRight size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" /><span>Interprets what the current data means for your $2k/month land savings goal</span></li>
                <li className="flex items-start gap-2 text-xs text-slate-400"><ChevronRight size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" /><span>Identifies the biggest macro risks to watch right now</span></li>
                <li className="flex items-start gap-2 text-xs text-slate-400"><ChevronRight size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" /><span>Suggests tactical positioning given the active forecast scenario</span></li>
              </ul>
              <p className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter pt-1 border-t border-slate-700/50">Powered by Claude Sonnet 4.6 · Requires API credits</p>
            </div>
          </div>
        </div>

        {analysis && (<div className="mb-8 bg-slate-800/80 border border-indigo-500/20 rounded-xl p-6 shadow-2xl animate-in slide-in-from-top duration-500 text-sm text-slate-300 leading-relaxed whitespace-pre-line prose prose-invert max-w-none">{String(analysis)}</div>)}

        {/* Hubs */}
        <h2 className="text-xs font-bold mb-4 text-slate-500 uppercase tracking-[0.2em]">Intelligence Hubs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-white">
          <div onClick={() => setActiveModal('carry')} className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg cursor-pointer hover:border-orange-500/50 transition-all">
             <div className="flex justify-between font-bold uppercase text-[10px] text-slate-400 tracking-widest">Liquidity Risk <BarChart3 size={16}/></div>
             <div className="text-4xl font-black mt-2">{String(carryTradeScore)}</div>
             <div className={`mt-2 text-[10px] font-bold uppercase ${carryStatus.color}`}>{carryStatus.label} Risk</div>
             <div className="text-[10px] text-slate-500 mt-0.5">{carryStatus.sublabel}</div>
          </div>
          <div onClick={() => setActiveModal('re')} className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg cursor-pointer hover:border-emerald-500/50 transition-all">
             <div className="flex justify-between font-bold uppercase text-[10px] text-slate-400 tracking-widest">Real Estate Intel <Home size={16}/></div>
             <div className="text-4xl font-black mt-2 text-emerald-400">{String(marketData.mortgage30Y)}%</div>
             <div className={`mt-2 text-[10px] font-bold uppercase ${reStatus.color}`}>{reStatus.label} Outlook</div>
          </div>
          <div onClick={() => setActiveModal('metals')} className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg cursor-pointer hover:border-yellow-500/50 transition-all">
             <div className="flex justify-between font-bold uppercase text-[10px] text-slate-400 tracking-widest">Metal Ratio <Coins size={16}/></div>
             <div className="text-4xl font-black mt-2 text-yellow-500">{(marketData.goldSpot / (marketData.silverSpot || 1)).toFixed(1)}</div>
             <div className="mt-2 text-[10px] font-bold uppercase text-slate-500">Gold/Silver Ratio</div>
          </div>
        </div>

        {/* Policy Grid */}
        <h2 className="text-xs font-bold mb-4 text-slate-500 uppercase tracking-[0.2em]">Fed Policy Triggers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
          <MetricCard title="Core PCE Inflation" value={marketData.corePCE} previous={marketData.corePCEPrev} sourceUrl={DATA_SOURCES.corePCE} icon={Percent} inverseLogic={true} unit="%" description="Fed's preferred inflation target. Above 2% keeps rates elevated." threshold={2.0} />
          <MetricCard title="10Y Breakeven Inflation" value={marketData.breakeven10Y} previous={marketData.breakeven10YPrev} sourceUrl={DATA_SOURCES.breakeven10Y} icon={TrendingUp} inverseLogic={true} unit="%" description="Market-implied 10Y inflation expectation. Above 2.5% signals unanchored expectations." threshold={2.5} thresholdLabel="Alert Level" />
          <MetricCard title="Unemployment Rate" value={marketData.unemployment} previous={marketData.unemploymentPrev} sourceUrl={DATA_SOURCES.unemployment} icon={Scale} inverseLogic={true} unit="%" description="Rising above 4.1% signals labor market weakening and cut pressure." threshold={4.1} />
          <MetricCard title="Nonfarm Payrolls" value={marketData.nfp} previous={null} sourceUrl={DATA_SOURCES.nfp} icon={Users} inverseLogic={false} unit="k" description="Monthly job creation (MoM change derived from FRED PAYEMS level series). Below 100k = labor cooling; above 250k = tight market risk." threshold={150} thresholdLabel="Trend Rate" />
          <MetricCard title="Avg Hourly Earnings" value={marketData.wageGrowth} previous={marketData.wageGrowthPrev} sourceUrl={DATA_SOURCES.wageGrowth} icon={TrendingUp} inverseLogic={true} unit="%" description="YoY wage growth. Above 4% risks a wage-price spiral — costs embed into services inflation before PCE reacts." threshold={3.5} thresholdLabel="Neutral Rate" />
          <MetricCard title="JOLTS Job Openings" value={marketData.jolts} previous={marketData.joltsPrev} sourceUrl={DATA_SOURCES.jolts} icon={BarChart3} inverseLogic={false} unit="M" description="Labor demand leading indicator, leads unemployment by ~6 months. Above 8M = tight; below 7M = cooling fast." threshold={8.0} thresholdLabel="Neutral Level" />
          <MetricCard title="Initial Jobless Claims" value={marketData.joblessClaims} previous={marketData.joblessClaimsPrev} sourceUrl={DATA_SOURCES.joblessClaims} icon={Users} inverseLogic={true} unit="k" description="4-week average smooths weekly noise. Rising trend precedes unemployment by 3–4 weeks." threshold={250} thresholdLabel="Alert Level" />
          <MetricCard title="Fed Funds Rate" value={marketData.fedFundsRate} previous={marketData.fedFundsRatePrev} sourceUrl={DATA_SOURCES.fedFundsRate} icon={Landmark} inverseLogic={true} unit="%" description="Current Fed target rate. Gap vs neutral rate (~2.5%) measures policy restrictiveness." threshold={2.5} thresholdLabel="Neutral Rate" />
          <MetricCard title="Brent Crude Oil" value={marketData.brentCrude} previous={marketData.brentCrudePrev} sourceUrl={DATA_SOURCES.brentCrude} icon={Droplet} inverseLogic={true} unit=" per bbl" description="Supply-side inflation shock above $90 adds hold pressure." threshold={90} />
          <MetricCard title="Consumer Infl. Expectations" value={marketData.consumerInflExp} previous={marketData.consumerInflExpPrev} sourceUrl={DATA_SOURCES.consumerInflExp} icon={TrendingUp} inverseLogic={true} unit="%" description="U of Michigan 1-year ahead survey. The Fed's key anchor check — above 3.5% risks a self-fulfilling wage-price spiral." threshold={3.5} thresholdLabel="Alert Level" />
          <MetricCard title="PPI YoY" value={marketData.ppiYoy} previous={marketData.ppiYoyPrev} sourceUrl={DATA_SOURCES.ppiYoy} icon={Activity} inverseLogic={true} unit="%" description="Producer price inflation leads PCE by 3–6 months. Hot PPI signals consumer inflation is coming before it arrives." threshold={4.0} thresholdLabel="Alert Level" />
        </div>
        <h2 className="text-xs font-bold mb-4 text-slate-500 uppercase tracking-[0.2em]">Market Signals</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <MetricCard title="Yield Curve (10Y−2Y)" value={marketData.yieldCurve} previous={marketData.yieldCurvePrev} sourceUrl={DATA_SOURCES.yieldCurve} icon={Waves} inverseLogic={false} unit="%" description="Inversion (negative) has preceded every US recession since 1955. Flat/inverted = cut watch." threshold={0} thresholdLabel="Inversion At" />
          <MetricCard title="US 2Y Treasury" value={marketData.us2y} previous={marketData.us2yPrev} sourceUrl={DATA_SOURCES.us2y} icon={BarChart3} inverseLogic={true} unit="%" description="Market pricing of Fed path. Gap vs Fed Funds (FFR − 2Y) feeds the Rate Cut Premium signal in the prediction engine." threshold={null} />
          <MetricCard title="Dollar Index (DXY)" value={marketData.dxy} previous={marketData.dxyPrev} sourceUrl={DATA_SOURCES.dxy} icon={Globe} inverseLogic={false} unit="" description="Strong dollar tightens global conditions and suppresses commodity inflation." threshold={100} thresholdLabel="Neutral Level" />
        </div>
        <h2 className="text-xs font-bold mb-4 text-slate-500 uppercase tracking-[0.2em]">Credit Markets</h2>
        <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest mb-4">Best available public proxies — true private credit data (direct lending NAVs, CLO spreads) is proprietary and not publicly accessible</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <MetricCard title="IG Corporate Spread" value={marketData.igSpread} previous={marketData.igSpreadPrev} sourceUrl={DATA_SOURCES.igSpread} icon={Activity} inverseLogic={true} unit="%" description="Investment grade OAS. Widening signals stress in the companies private credit funds lend to. Below 1% = calm; above 1.5% = tightening." threshold={1.5} thresholdLabel="Alert Level" />
          <MetricCard title="BBB Spread" value={marketData.bbbSpread} previous={marketData.bbbSpreadPrev} sourceUrl={DATA_SOURCES.bbbSpread} icon={AlertTriangle} inverseLogic={true} unit="%" description="Lowest investment-grade tranche — the private credit bellwether. BBB widening faster than IG signals fallen-angel risk in leveraged portfolios." threshold={2.0} thresholdLabel="Alert Level" />
          <MetricCard title="Financial Stress Index" value={marketData.financialStressIdx} previous={marketData.financialStressIdxPrev} sourceUrl={DATA_SOURCES.financialStressIdx} icon={Gauge} inverseLogic={true} unit="" description="St. Louis Fed composite of 18 weekly financial variables. Zero = historical average. Above 1 = significant stress across funding, credit, and volatility markets." threshold={1.0} thresholdLabel="Elevated At" />
        </div>

      </div>
    </div>
  );
}
