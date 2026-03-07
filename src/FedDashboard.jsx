import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Droplet,
  Percent,
  AlertTriangle,
  Scale,
  DollarSign,
  Landmark,
  Sparkles,
  Loader2,
  ChevronRight,
  MessageSquare,
  Home,
  Map,
  Shovel,
  X,
  Gauge,
  Info,
  Zap,
  BarChart3,
  Calculator,
  Plus,
  Minus,
  Coins,
  Warehouse,
  ArrowRightLeft,
  ExternalLink,
  RefreshCw,
  Clock
} from 'lucide-react';

// --- Configuration & Sources ---
const DATA_SOURCES = {
  brentCrude: "https://tradingeconomics.com/commodity/brent-crude",
  corePCE: "https://fred.stlouisfed.org/series/PCEPILFE",
  unemployment: "https://tradingeconomics.com/united-states/unemployment-rate",
  usdJpy: "https://www.google.com/finance/quote/USD-JPY",
  gold: "https://www.kitco.com/charts/gold",
  silver: "https://www.kitco.com/charts/silver",
  fedWatch: "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html",
  mortgage30Y: "https://fred.stlouisfed.org/series/MORTGAGE30US",
  landAZ: "https://www.landwatch.com/arizona-land-for-sale",
  gladstone: "https://www.google.com/finance/quote/LAND:NASDAQ",
  sunCommunities: "https://www.google.com/finance/quote/SUI:NYSE",
  vix: "https://www.google.com/finance/quote/VIX:INDEXCBOE",
  sp500: "https://www.google.com/finance/quote/.INX:INDEXSP",
  tedSpread: "https://fred.stlouisfed.org/series/TEDRATE",
  bojRate: "https://www.bankofjapan.or.jp/en/mopo/mpmsche_minu/index.htm",
  usJapanSpread: "https://www.worldgovernmentbonds.com/spread/japan-10-years-vs-united-states-10-years/",
  jpyVol: "https://www.investing.com/currencies/usd-jpy-volatility"
};

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

// --- Status Helpers (Defined here to fix ReferenceError) ---

const getCarryStatus = (score) => {
  const s = Number(score) || 0;
  if (s <= 30) return { label: 'Low', color: 'text-emerald-500' };
  if (s <= 55) return { label: 'Elevated', color: 'text-orange-500' };
  if (s <= 85) return { label: 'High', color: 'text-rose-500' };
  return { label: 'Critical', color: 'text-red-600' };
};

const getREStatus = (rate) => {
  const r = Number(rate) || 0;
  if (r < 5) return { label: 'BULLISH', color: 'text-emerald-400' };
  if (r < 6.5) return { label: 'NEUTRAL', color: 'text-orange-400' };
  return { label: 'BEARISH', color: 'text-rose-500' };
};

// --- Claude API Utilities ---

const fetchLiveMacroData = async () => {
  const prompt = `Find the absolute latest financial data as of today.
  Provide the current value and the previous month/week value for: Brent Crude, Core PCE, Unemployment Rate, USD/JPY, Gold Spot, Silver Spot, CME Fed Watch Cut Prob, 30Y Mortgage Rate, AZ Rural Land Price (40ac parcel), Gladstone Land (LAND) stock price, Sun Communities (SUI) stock price, VIX Index, TED Spread, JPY Realized Vol, US-Japan 10Y Yield Spread, and Bank of Japan Policy Rate.
  Use web search to find the most current data, then call the record_macro_data tool with all values you find.`;

  const macroDataTool = {
    name: "record_macro_data",
    description: "Records the latest macro financial data found via web search. All values must be numbers.",
    input_schema: {
      type: "object",
      properties: {
        brentCrude: { type: "number" },
        brentCrudePrev: { type: "number" },
        corePCE: { type: "number" },
        corePCEPrev: { type: "number" },
        unemploymentRate: { type: "number" },
        unemploymentRatePrev: { type: "number" },
        usdJpy: { type: "number" },
        usdJpyPrev: { type: "number" },
        goldSpot: { type: "number" },
        goldSpotPrev: { type: "number" },
        silverSpot: { type: "number" },
        silverSpotPrev: { type: "number" },
        fedWatchCutProb: { type: "number" },
        fedWatchCutProbPrev: { type: "number" },
        mortgage30Y: { type: "number" },
        mortgage30YPrev: { type: "number" },
        landPriceAZ: { type: "number" },
        landPriceAZPrev: { type: "number" },
        gladstonePrice: { type: "number" },
        gladstonePricePrev: { type: "number" },
        sunCommunitiesPrice: { type: "number" },
        sunCommunitiesPricePrev: { type: "number" },
        vixIndex: { type: "number" },
        tedSpread: { type: "number" },
        jpyRealizedVol: { type: "number" },
        usJapanSpread: { type: "number" },
        bojRate: { type: "number" },
        sp500: { type: "number" },
        usdJpy1MChange: { type: "number" }
      },
      required: []
    }
  };

  let delay = 1000;
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: "You are a financial data analyst. Use web search to find the most current market data, then call record_macro_data with all values you find. Numeric values must be numbers, not strings.",
          tools: [
            { type: "web_search_20250305", name: "web_search" },
            macroDataTool
          ],
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API ${response.status}: ${errText}`);
      }

      const result = await response.json();
      const toolUse = result.content?.find(block => block.type === 'tool_use' && block.name === 'record_macro_data');
      if (toolUse?.input) return toolUse.input;
      throw new Error("No structured data returned from Claude");
    } catch (error) {
      if (i === 4) throw error;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
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

      const response = await fetch('https://api.anthropic.com/v1/messages', {
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

const MetricCard = ({ title, value, previous, unit, icon: Icon, description, sourceUrl, inverseLogic = false, threshold = null }) => {
  const val = Number(value) || 0;
  const prev = Number(previous) || 0;
  const isUp = val > prev;
  const isNeutral = val === prev;
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

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg flex flex-col justify-between group transition-all hover:border-slate-600">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-2 text-slate-300">
          <Icon size={18} className="text-slate-400" />
          <h3 className="font-semibold text-sm uppercase tracking-wider">{String(title)}</h3>
          <SourceButton url={sourceUrl} />
        </div>
        <div className={`px-2 py-1 rounded text-xs font-bold flex items-center ${bgClass} ${colorClass}`}>
          {isUp ? <TrendingUp size={14} className="mr-1" /> : (isNeutral ? null : <TrendingDown size={14} className="mr-1" />)}
          {Math.abs(val - prev).toFixed(2)}
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold text-white mb-1">
          {title.includes('RATE') || title.includes('PCE') || title.includes('PROB') || title.includes('30Y') ? '' : '$'}
          {val.toLocaleString()}{String(unit)}
        </div>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed h-8 overflow-hidden">{String(description)}</p>
      </div>
      {threshold && (
        <div className="mt-4 pt-3 border-t border-slate-700 flex justify-between items-center text-[10px]">
          <span className="text-slate-500 uppercase font-bold tracking-tighter">Fed Target:</span>
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
        <div className="text-xs text-slate-500 uppercase">{String(unit)}</div>
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

export default function App() {
  const [marketData, setMarketData] = useState({
    brentCrude: 92.40, brentCrudePrev: 85.00,
    corePCE: 2.8, corePCEPrev: 2.7,
    unemployment: 4.4, unemploymentPrev: 4.3,
    usdJpy: 156.05, usdJpyPrev: 158.20,
    bojRate: 0.73, bojRatePrev: 0.50,
    fedFunds: 3.75,
    goldSpot: 5120, goldSpotPrev: 4950,
    silverSpot: 86.50, silverSpotPrev: 81.00,
    fedWatchCutProb: 68, fedWatchCutProbPrev: 12,
    mortgage30Y: 6.15, mortgage30YPrev: 5.98,
    landPriceAZ: 145000, landPriceAZPrev: 142000,
    gladstonePrice: 11.81, gladstonePricePrev: 12.03,
    sunCommunitiesPrice: 142.50, sunCommunitiesPricePrev: 138.20,
    usJapanSpread: 1.94,
    vixIndex: 23.75,
    tedSpread: 0.09,
    jpyRealizedVol: 8.77,
    sp500: 6830.71,
    usdJpy1MChange: -1.60
  });

  const carrySeverities = useMemo(() => ({
    spread: Math.min(100, Math.max(0, ((4.5 - (marketData.usJapanSpread || 0)) / 4) * 100)),
    change: (marketData.usdJpy1MChange || 0) < 0 ? Math.min(100, (Math.abs(marketData.usdJpy1MChange || 0) / 4) * 100) : 0,
    vol: Math.min(100, Math.max(0, (((marketData.jpyRealizedVol || 0) - 10) / 15) * 100)),
    vix: Math.min(100, Math.max(0, (((marketData.vixIndex || 0) - 15) / 30) * 100)),
    ted: Math.min(100, ((marketData.tedSpread || 0) / 1.0) * 100),
    boj: Math.min(100, ((marketData.bojRate || 0) / 1.5) * 100)
  }), [marketData]);

  const carryTradeScore = useMemo(() => {
    const vals = Object.values(carrySeverities).map(Number);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) || 0;
  }, [carrySeverities]);

  const prediction = useMemo(() => {
    const oilDiff = Math.max(0, (marketData.brentCrude || 0) - 85);
    const pceDiff = Math.max(0, (marketData.corePCE || 0) - 2.0);
    const oilWeight = -(oilDiff / 5);
    const pceWeight = -(pceDiff / 0.2) * 2;
    const pceMomentum = (marketData.corePCE || 0) > (marketData.corePCEPrev || 0) ? 1.2 : 1.0;
    const inflationScore = (oilWeight + pceWeight) * pceMomentum;

    const unempDiff = Math.max(0, (marketData.unemployment || 0) - 4.1);
    const unempWeight = (unempDiff / 0.1) * 1.5;
    const carryWeight = carryTradeScore / 20;
    const recessionScore = unempWeight + carryWeight + ((marketData.usdJpy || 0) < 140 ? 3 : 0);

    const totalScore = inflationScore + recessionScore;
    return {
      scenario: totalScore > 0 ? 2 : 1,
      confidence: Math.min(100, Math.round(Math.abs(totalScore) * 10)),
      score: totalScore.toFixed(2),
      weights: { inflation: inflationScore.toFixed(2), recession: recessionScore.toFixed(2) }
    };
  }, [marketData, carryTradeScore]);

  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  const [activeModal, setActiveModal] = useState(null);
  const [showFormula, setShowFormula] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const syncLiveData = async () => {
    if (!apiKey) {
      setErrorMsg("VITE_ANTHROPIC_API_KEY is not set. Add it to your .env file.");
      return;
    }
    setDataLoading(true);
    setErrorMsg("");
    try {
      const live = await fetchLiveMacroData();
      if (live && typeof live === 'object') {
        setMarketData(prev => ({
          ...prev,
          ...live,
          unemployment: live.unemploymentRate !== undefined ? live.unemploymentRate : prev.unemployment,
          unemploymentPrev: live.unemploymentRatePrev !== undefined ? live.unemploymentRatePrev : prev.unemploymentPrev,
          bojRate: live.bojRate !== undefined ? live.bojRate : prev.bojRate
        }));
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (e) {
      setErrorMsg(`Sync failed: ${String(e.message)}`);
    } finally {
      setDataLoading(false);
    }
  };

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
                    <div className="flex items-center gap-3 mb-4">
                      <AlertTriangle size={32} className={carryStatus.color} />
                      <h3 className={`text-4xl font-black uppercase ${carryStatus.color}`}>{carryStatus.label} Risk</h3>
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
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                 <SubMetric label="US-Japan Rate Spread" value={String(marketData.usJapanSpread) + "%"} severity={carrySeverities.spread.toFixed(0)} description="Yield gap US10Y vs JP10Y. Narrowing spread forces carry closures." sourceUrl={DATA_SOURCES.usJapanSpread} />
                 <SubMetric label="JPY Strengthen Momentum" value={String(marketData.usdJpy1MChange) + "%"} severity={carrySeverities.change.toFixed(0)} description="Monthly velocity. Rapid strengthening triggers margin calls." sourceUrl={DATA_SOURCES.usdJpy} />
                 <SubMetric label="JPY Realized Vol" value={String(marketData.jpyRealizedVol) + "%"} severity={carrySeverities.vol.toFixed(0)} description="20-day annualized volatility. Panic signal for Yen funding." sourceUrl={DATA_SOURCES.jpyVol} />
                 <SubMetric label="VIX Index" value={String(marketData.vixIndex)} severity={carrySeverities.vix.toFixed(0)} description="Fear gauge. Carry exits correlate with VIX spikes above 20." sourceUrl={DATA_SOURCES.vix} />
                 <SubMetric label="TED Spread" value={String(marketData.tedSpread) + "%"} severity={carrySeverities.ted.toFixed(0)} description="Interbank stress indicator. High spread blocks credit flows." sourceUrl={DATA_SOURCES.tedSpread} />
                 <SubMetric label="BoJ Policy Rate" value={String(marketData.bojRate) + "%"} severity={carrySeverities.boj.toFixed(0)} description="Core funding cost. Higher rates purge low-yield carry trades." sourceUrl={DATA_SOURCES.bojRate} />
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
          </div>
          <div className="mt-4 md:mt-0 text-right">
            <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Fed Funds Target</div>
            <div className="text-2xl font-mono text-blue-400 font-bold">{Number(marketData.fedFunds).toFixed(2)}%</div>
          </div>
        </header>

        {/* Prediction Engine */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className={`lg:col-span-2 p-6 rounded-xl border flex flex-col justify-between relative overflow-hidden ${prediction.scenario === 1 ? "bg-blue-900/20 border-blue-500/30" : "bg-amber-900/20 border-amber-500/30"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2"><Activity className={prediction.scenario === 1 ? "text-blue-400" : "text-amber-400"} size={20} /><h2 className="font-bold text-lg text-white uppercase tracking-widest">Fed Prediction Engine</h2></div>
              <button onClick={() => setShowFormula(!showFormula)} className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center bg-slate-800/50 px-3 py-1 rounded border border-slate-700 transition-colors"><Calculator size={14} className="mr-2" /> {showFormula ? 'HIDE MATH' : 'SCRUTINIZE FORMULA'}</button>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="flex-1"><p className="text-sm text-slate-300">Continuous Weighted Forecast:</p><div className={`text-2xl font-black mt-1 tracking-tight ${prediction.scenario === 1 ? "text-blue-400" : "text-amber-400"}`}>{prediction.scenario === 1 ? "SCENARIO 1: HIGHER FOR LONGER" : "SCENARIO 2: STAGFLATION PIVOT"}</div></div>
              <div className="text-center bg-slate-900/50 p-4 rounded-lg border border-slate-700 hidden sm:block ml-4 min-w-[140px]"><div className="text-3xl font-mono text-white leading-none">{String(prediction.confidence)}%</div><div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Confidence Score</div></div>
            </div>
            {showFormula && (
              <div className="mt-6 p-5 bg-slate-950 rounded-lg border border-slate-800 animate-in slide-in-from-top-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[11px] font-mono">
                  <div className="space-y-2"><div className="text-rose-500 uppercase font-bold mb-2">Inflation Pressure: {String(prediction.weights.inflation)}</div><div className="flex justify-between"><span>Oil Gap ($5/unit):</span><span className="text-rose-400">-{ (Math.max(0, marketData.brentCrude - 85) / 5).toFixed(2) }</span></div><div className="flex justify-between"><span>PCE Gap (0.2%/unit):</span><span className="text-rose-400">-{ (Math.max(0, marketData.corePCE - 2.0) / 0.2 * 2).toFixed(2) }</span></div></div>
                  <div className="space-y-2"><div className="text-emerald-500 uppercase font-bold mb-2">Recession Pressure: {String(prediction.weights.recession)}</div><div className="flex justify-between"><span>Unemp NAIRU Gap:</span><span className="text-emerald-400">+{ (Math.max(0, marketData.unemployment - 4.1) / 0.1 * 1.5).toFixed(2) }</span></div><div className="flex justify-between"><span>Carry/Liquidity:</span><span className="text-emerald-400">+{ String(prediction.weights.recession) }</span></div></div>
                </div>
              </div>
            )}
          </div>
          <div className="lg:col-span-1 bg-gradient-to-br from-indigo-900/40 to-slate-800 p-6 rounded-xl border border-indigo-500/30 shadow-xl flex flex-col justify-between">
            <button onClick={generateAIAnalysis} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center shadow-lg">{loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <MessageSquare size={18} className="mr-2" />}{loading ? "Analyzing..." : "Generate AI Strategy ✨"}</button>
            <p className="text-[10px] text-slate-500 text-center uppercase font-bold tracking-tighter mt-4">Powered by Claude Sonnet 4.6</p>
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
        <h2 className="text-xs font-bold mb-4 text-slate-500 uppercase tracking-[0.2em]">Policy Triggers (Macro Driver Grid)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <MetricCard title="Brent Crude Oil" value={marketData.brentCrude} previous={marketData.brentCrudePrev} sourceUrl={DATA_SOURCES.brentCrude} icon={Droplet} inverseLogic={true} unit=" per bbl" description="Energy lead indicator." threshold={85} />
          <MetricCard title="Core PCE Inflation" value={marketData.corePCE} previous={marketData.corePCEPrev} sourceUrl={DATA_SOURCES.corePCE} icon={Percent} inverseLogic={true} unit="%" description="Fed preferred measure." threshold={2.0} />
          <MetricCard title="Unemployment Rate" value={marketData.unemployment} previous={marketData.unemploymentPrev} sourceUrl={DATA_SOURCES.unemployment} icon={Scale} inverseLogic={true} unit="%" description="Pivot trigger at 4.1%." threshold={4.1} />
        </div>

      </div>
    </div>
  );
}
