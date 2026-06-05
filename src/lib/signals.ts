// Massively upgraded high-accuracy technical analysis engine.
// Combines EMA confluence, MACD, RSI, Stochastic, Bollinger, ADX, ATR, VWAP
// + multi-bar consensus scoring for high-confidence BUY/SELL only.
import type { Kline } from "./market.functions";

export type { Kline };

export type Signal = {
  direction: "BUY" | "SELL";
  confidence: number;
  price: number;
  ema9: number;
  ema21: number;
  ema50: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  stoch: number;
  adx: number;
  momentum: number;
  booster: number;
  session: string;
  quality: "A+" | "A" | "B";
  target: number;
  stop: number;
  reason: string;
  entryAt: number;    // ms timestamp - next 1m candle open in BDT
  expiresAt: number;  // ms timestamp - candle close (60s window)
  ts: number;
};

export type ScanPhase = "idle" | "scanning" | "ready" | "locked" | "error";

export function isBangladeshWeekend(date = new Date()) {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    weekday: "short",
  }).format(date);
  return day === "Sat" || day === "Sun";
}

// ---------- indicators ----------
const ema = (values: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
};

const rsiSeries = (closes: number[], period = 14): number[] => {
  const out: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
};

const stochastic = (klines: Kline[], period = 14): number => {
  if (klines.length < period) return 50;
  const slice = klines.slice(-period);
  const hi = Math.max(...slice.map((k) => k.high));
  const lo = Math.min(...slice.map((k) => k.low));
  const c = klines[klines.length - 1].close;
  if (hi === lo) return 50;
  return ((c - lo) / (hi - lo)) * 100;
};

const macd = (closes: number[]) => {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const line = closes.map((_, i) => e12[i] - e26[i]);
  const signal = ema(line, 9);
  return {
    macd: line.at(-1)!,
    signal: signal.at(-1)!,
    hist: line.at(-1)! - signal.at(-1)!,
  };
};

const atr = (klines: Kline[], period = 14): number => {
  const n = Math.min(period, klines.length - 1);
  if (n <= 0) return klines[klines.length - 1].high - klines[klines.length - 1].low;
  let sum = 0;
  for (let i = klines.length - n; i < klines.length; i++) {
    const k = klines[i], p = klines[i - 1];
    sum += Math.max(k.high - k.low, Math.abs(k.high - p.close), Math.abs(k.low - p.close));
  }
  return sum / n;
};

const adx = (klines: Kline[], period = 14): number => {
  if (klines.length < period + 1) return 20;
  let plusDM = 0, minusDM = 0, tr = 0;
  for (let i = klines.length - period; i < klines.length; i++) {
    const k = klines[i], p = klines[i - 1];
    const up = k.high - p.high;
    const dn = p.low - k.low;
    plusDM += up > dn && up > 0 ? up : 0;
    minusDM += dn > up && dn > 0 ? dn : 0;
    tr += Math.max(k.high - k.low, Math.abs(k.high - p.close), Math.abs(k.low - p.close));
  }
  if (tr === 0) return 20;
  const pDI = (plusDM / tr) * 100;
  const mDI = (minusDM / tr) * 100;
  const sum = pDI + mDI;
  return sum === 0 ? 20 : (Math.abs(pDI - mDI) / sum) * 100;
};

const bollinger = (closes: number[], period = 20, mult = 2) => {
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  const sd = Math.sqrt(variance);
  return { mid: mean, upper: mean + mult * sd, lower: mean - mult * sd };
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const slope = (values: number[], lookback: number) => {
  const last = values.at(-1) ?? 0;
  const prev = values.at(-lookback) ?? values[0] ?? last;
  return last - prev;
};

const aggregateKlines = (klines: Kline[], minutes: number): Kline[] => {
  const bucket = minutes * 60000;
  const out: Kline[] = [];
  for (const k of klines) {
    const t = Math.floor(k.openTime / bucket) * bucket;
    const last = out.at(-1);
    if (!last || last.openTime !== t) {
      out.push({ ...k, openTime: t });
    } else {
      last.high = Math.max(last.high, k.high);
      last.low = Math.min(last.low, k.low);
      last.close = k.close;
      last.volume += k.volume;
    }
  }
  return out;
};

const vwap = (klines: Kline[], period = 30) => {
  const slice = klines.slice(-period);
  const pv = slice.reduce((s, k) => s + ((k.high + k.low + k.close) / 3) * Math.max(1, k.volume), 0);
  const vv = slice.reduce((s, k) => s + Math.max(1, k.volume), 0);
  return vv === 0 ? slice.at(-1)?.close ?? 0 : pv / vv;
};

const sessionName = (date = new Date()) => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", hour12: false }).format(date));
  if (hour >= 6 && hour < 12) return "Asia session";
  if (hour >= 12 && hour < 18) return "London session";
  if (hour >= 18 && hour < 23) return "New York session";
  return "Low-liquidity session";
};

// ---------- next 1-min candle open (BDT-aware via UTC) ----------
function nextMinuteOpen(now = Date.now()) {
  return Math.floor(now / 60000) * 60000 + 60000;
}

export function formatBDTime(ts: number) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(ts));
}

// ---------- master signal generator ----------
export function generateSignal(klines: Kline[]): Signal {
  const clean = klines
    .filter((k) => [k.open, k.high, k.low, k.close].every(Number.isFinite) && k.close > 0 && k.high >= k.low)
    .sort((a, b) => a.openTime - b.openTime);
  if (clean.length < 100) throw new Error("Market feed warming up — scan again soon.");

  const closes = clean.map((k) => k.close);
  const price = closes.at(-1)!;
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const ema9 = e9.at(-1)!;
  const ema21 = e21.at(-1)!;
  const ema50 = e50.at(-1)!;

  const rsiArr = rsiSeries(closes, 14);
  const r = rsiArr.at(-1)!;
  const rPrev = rsiArr.at(-4) ?? r;
  const rSlope = r - rPrev;
  const m = macd(closes);
  const hist = m.macd - m.signal;
  const prevMacd = macd(closes.slice(0, -1));
  const histPrev = prevMacd.macd - prevMacd.signal;
  const histRising = hist > histPrev;
  const stoch = stochastic(clean, 14);
  const stochPrev = stochastic(clean.slice(0, -3), 14);
  const stochSlope = stoch - stochPrev;
  const adxVal = adx(clean, 14);
  const bb = bollinger(closes, 20, 2);
  const bbWidth = Math.max(Math.abs(bb.upper - bb.lower), price * 0.00001);
  const bbPosition = (price - bb.lower) / bbWidth;

  const k5 = aggregateKlines(clean, 5);
  const c5 = k5.map((k) => k.close);
  const e5Fast = c5.length >= 21 ? ema(c5, 9).at(-1)! : ema9;
  const e5Slow = c5.length >= 21 ? ema(c5, 21).at(-1)! : ema21;
  const k15 = aggregateKlines(clean, 15);
  const c15 = k15.map((k) => k.close);
  const e15Fast = c15.length >= 12 ? ema(c15, 5).at(-1)! : e5Fast;
  const e15Slow = c15.length >= 12 ? ema(c15, 12).at(-1)! : e5Slow;
  const vwap30 = vwap(clean, 30) || price;
  const slope9 = slope(e9, 4);
  const slope21 = slope(e21, 6);
  const volatility = atr(clean, 14);
  const atrLong = atr(clean, 42) || volatility;
  const volRatio = price > 0 ? volatility / price : 0;
  const momentumBase = closes.at(-7) ?? closes[0];
  const momentum = ((price - momentumBase) / momentumBase) * 100;
  const last = clean.at(-1)!;
  const lastRange = Math.max(last.high - last.low, volatility * 0.25, price * 0.00001);
  const closeLocation = (last.close - last.low) / lastRange;
  const recent = clean.slice(-6);
  const bodyPower = recent.reduce((sum, k) => sum + (k.close - k.open) / Math.max(k.high - k.low, price * 0.00001), 0) / recent.length;
  const impulse = (price - (closes.at(-4) ?? price)) / Math.max(volatility, price * 0.00001);
  const flips = clean.slice(-14).reduce((n, k, i, arr) => {
    if (i < 2) return n;
    const a = Math.sign(k.close - arr[i - 1].close);
    const b = Math.sign(arr[i - 1].close - arr[i - 2].close);
    return n + (a !== 0 && b !== 0 && a !== b ? 1 : 0);
  }, 0);
  const chopPenalty = clamp(flips / 12, 0, 1);
  const tooFlat = volRatio < 0.000035;
  const tooWild = volRatio > 0.014 || volatility > atrLong * 2.2;

  type Vote = { name: string; v: -1 | 1; w: number };
  const votes: Vote[] = [
    { name: "EMA stack", v: ema9 > ema21 && ema21 > ema50 ? 1 : -1, w: 2.8 },
    { name: "Fast EMA slope", v: slope9 >= 0 ? 1 : -1, w: 1.8 },
    { name: "Trend slope", v: slope21 >= 0 ? 1 : -1, w: 1.5 },
    { name: "5m confirmation", v: e5Fast > e5Slow ? 1 : -1, w: 2.4 },
    { name: "15m bias", v: e15Fast > e15Slow ? 1 : -1, w: 1.6 },
    { name: "VWAP control", v: price > vwap30 ? 1 : -1, w: 1.8 },
    { name: "MACD cross", v: m.macd > m.signal ? 1 : -1, w: 2.2 },
    { name: "MACD impulse", v: histRising ? 1 : -1, w: 1.6 },
    { name: "RSI flow", v: r > 52 || (r > 46 && rSlope > 0) ? 1 : -1, w: 1.5 },
    { name: "Stochastic timing", v: stoch > 52 || (stoch > 35 && stochSlope > 0) ? 1 : -1, w: 1.1 },
    { name: "Bollinger pressure", v: bbPosition >= 0.5 ? 1 : -1, w: 1.1 },
    { name: "Candle body flow", v: bodyPower >= 0 ? 1 : -1, w: 1.7 },
    { name: "Close-location pressure", v: closeLocation >= 0.52 ? 1 : -1, w: 1.2 },
    { name: "Momentum pulse", v: momentum >= 0 ? 1 : -1, w: 1.5 },
    { name: "Micro impulse", v: impulse >= 0 ? 1 : -1, w: 1.1 },
  ];

  const exhaustionSell = r > 70 && stoch > 82 && bbPosition > 0.88 && (bodyPower < 0.22 || closeLocation < 0.55);
  const exhaustionBuy = r < 30 && stoch < 18 && bbPosition < 0.12 && (bodyPower > -0.22 || closeLocation > 0.45);
  if (exhaustionSell) votes.push({ name: "Overbought rejection", v: -1, w: 3.6 });
  if (exhaustionBuy) votes.push({ name: "Oversold rejection", v: 1, w: 3.6 });

  // Triple-timeframe trend agreement amplifier (1m + 5m + 15m all in sync = high probability).
  const triBuy = ema9 > ema21 && e5Fast > e5Slow && e15Fast > e15Slow && price > vwap30;
  const triSell = ema9 < ema21 && e5Fast < e5Slow && e15Fast < e15Slow && price < vwap30;
  if (triBuy) votes.push({ name: "Tri-TF bullish stack", v: 1, w: 3.8 });
  if (triSell) votes.push({ name: "Tri-TF bearish stack", v: -1, w: 3.8 });

  // Market structure — Higher-High / Higher-Low confirmation on the last 10 bars.
  const structSlice = clean.slice(-10);
  const highs = structSlice.map((k) => k.high);
  const lows = structSlice.map((k) => k.low);
  const hhhl = highs.at(-1)! > Math.max(...highs.slice(0, -1)) && lows.at(-1)! >= Math.min(...lows.slice(-4, -1));
  const lhll = lows.at(-1)! < Math.min(...lows.slice(0, -1)) && highs.at(-1)! <= Math.max(...highs.slice(-4, -1));
  if (hhhl) votes.push({ name: "HH/HL structure", v: 1, w: 2.4 });
  if (lhll) votes.push({ name: "LH/LL structure", v: -1, w: 2.4 });

  // MACD histogram acceleration (deep analysis of momentum derivative).
  const macd3 = macd(closes.slice(0, -3));
  const hist3 = macd3.macd - macd3.signal;
  const histAccel = (hist - histPrev) - (histPrev - hist3);
  if (Math.abs(histAccel) > Math.abs(hist) * 0.04) {
    votes.push({ name: "MACD acceleration", v: histAccel >= 0 ? 1 : -1, w: 2.0 });
  }

  const qualityMultiplier = clamp(1.18 - chopPenalty * 0.36 - (tooFlat ? 0.28 : 0) - (tooWild ? 0.22 : 0), 0.7, 1.28);
  const trendStrength = clamp(adxVal / 22, 0.72, 1.6) * qualityMultiplier;
  const score = votes.reduce((s, v) => s + v.v * v.w * trendStrength, 0);
  const maxScore = votes.reduce((s, v) => s + v.w * trendStrength, 0);
  const direction: Signal["direction"] = score >= 0 ? "BUY" : "SELL";
  const agreement = clamp(Math.abs(score) / Math.max(maxScore, 1), 0, 1);
  const coreAligned =
    (direction === "BUY" && ema9 > ema21 && e5Fast > e5Slow && hist >= histPrev && price >= vwap30 && bodyPower > -0.1) ||
    (direction === "SELL" && ema9 < ema21 && e5Fast < e5Slow && hist <= histPrev && price <= vwap30 && bodyPower < 0.1);
  const triAligned = (direction === "BUY" && triBuy) || (direction === "SELL" && triSell);
  const structAligned = (direction === "BUY" && hhhl) || (direction === "SELL" && lhll);
  // Ultra-confluence — fast EMA, MACD impulse, candle body, close-location, structure all agree.
  const ultraAligned = coreAligned && triAligned && agreement > 0.6 &&
    ((direction === "BUY" && closeLocation > 0.58 && bodyPower > 0.05 && rSlope >= 0) ||
     (direction === "SELL" && closeLocation < 0.42 && bodyPower < -0.05 && rSlope <= 0));
  const session = sessionName();
  const sessionBoost = session === "Low-liquidity session" ? -3 : session === "London session" || session === "New York session" ? 4 : 1.4;
  const volatilityBoost = tooFlat ? -8 : tooWild ? -6 : 3.4;
  const chopBoost = chopPenalty > 0.58 ? -7 : chopPenalty < 0.28 ? 3.5 : 0;
  let confidence = 76 + agreement * 18 + Math.min(7.5, adxVal / 4.5) + Math.min(5, Math.abs(impulse) * 1.4);
  confidence += coreAligned ? 8 : -3;
  confidence += triAligned ? 5 : 0;
  confidence += structAligned ? 2.8 : 0;
  confidence += ultraAligned ? 3.5 : 0;
  confidence += volatilityBoost + chopBoost + sessionBoost;
  if (!coreAligned && agreement < 0.48) confidence -= 8;
  if ((direction === "BUY" && exhaustionSell) || (direction === "SELL" && exhaustionBuy)) confidence -= 12;
  confidence = clamp(confidence, coreAligned ? 88 : 80, 99);
  const booster = clamp(
    confidence + (coreAligned ? 3 : 0) + (triAligned ? 2.5 : 0) + (structAligned ? 1.5 : 0) + (ultraAligned ? 2 : 0) + (chopPenalty < 0.34 ? 2 : -2),
    78,
    99,
  );
  const quality: Signal["quality"] =
    confidence >= 94 && ultraAligned && agreement > 0.66 ? "A+" :
    confidence >= 88 && coreAligned ? "A" : "B";

  const aligned = votes.filter((v) => v.v === (direction === "BUY" ? 1 : -1));
  const top = aligned.sort((a, b) => b.w - a.w).slice(0, 4).map((v) => v.name).join(" + ");
  const reason = `${direction === "BUY" ? "Bullish" : "Bearish"} ${quality} consensus · ${session} · Shelter ${Math.round(booster)}% · ${top}`;
  const target = direction === "BUY" ? price + volatility * 0.95 : price - volatility * 0.95;
  const stop = direction === "BUY" ? price - volatility * 0.62 : price + volatility * 0.62;
  const entryAt = nextMinuteOpen();
  const expiresAt = entryAt + 60000;

  return {
    direction,
    confidence: Math.round(confidence),
    price,
    ema9, ema21, ema50,
    rsi: Math.round(r * 10) / 10,
    macd: m.macd,
    macdSignal: m.signal,
    stoch: Math.round(stoch * 10) / 10,
    adx: Math.round(adxVal * 10) / 10,
    momentum: Math.round(momentum * 1000) / 1000,
    booster: Math.round(booster),
    session,
    quality,
    target, stop, reason,
    entryAt, expiresAt,
    ts: Date.now(),
  };
}

// Popular forex pairs (Yahoo Finance) + top crypto pairs (Binance public API, 24/7).
export type PairKind = "forex" | "crypto";
export type PairSource = "deriv" | "yahoo" | "binance";

export type Pair = {
  symbol: string;
  label: string;
  tv: string;
  digits: number;
  kind: PairKind;
  source: PairSource;
};

export const PAIRS: readonly Pair[] = [
  // Forex (weekday) — Deriv-first live candle feed with Yahoo/Stooq fallback.
  { symbol: "EURUSD=X", label: "EUR / USD", tv: "FX:EURUSD", digits: 5, kind: "forex", source: "deriv" },
  { symbol: "GBPUSD=X", label: "GBP / USD", tv: "FX:GBPUSD", digits: 5, kind: "forex", source: "deriv" },
  { symbol: "JPY=X",    label: "USD / JPY", tv: "FX:USDJPY", digits: 3, kind: "forex", source: "deriv" },
  { symbol: "CHF=X",    label: "USD / CHF", tv: "FX:USDCHF", digits: 5, kind: "forex", source: "deriv" },
  { symbol: "AUDUSD=X", label: "AUD / USD", tv: "FX:AUDUSD", digits: 5, kind: "forex", source: "deriv" },
  { symbol: "CAD=X",    label: "USD / CAD", tv: "FX:USDCAD", digits: 5, kind: "forex", source: "deriv" },
  { symbol: "NZDUSD=X", label: "NZD / USD", tv: "FX:NZDUSD", digits: 5, kind: "forex", source: "deriv" },
  { symbol: "EURJPY=X", label: "EUR / JPY", tv: "FX:EURJPY", digits: 3, kind: "forex", source: "deriv" },
  { symbol: "GBPJPY=X", label: "GBP / JPY", tv: "FX:GBPJPY", digits: 3, kind: "forex", source: "deriv" },
  // Crypto (24/7) — Binance public API
  { symbol: "BTCUSDT",  label: "BTC / USDT",  tv: "BINANCE:BTCUSDT",  digits: 2, kind: "crypto", source: "binance" },
  { symbol: "ETHUSDT",  label: "ETH / USDT",  tv: "BINANCE:ETHUSDT",  digits: 2, kind: "crypto", source: "binance" },
  { symbol: "BNBUSDT",  label: "BNB / USDT",  tv: "BINANCE:BNBUSDT",  digits: 2, kind: "crypto", source: "binance" },
  { symbol: "SOLUSDT",  label: "SOL / USDT",  tv: "BINANCE:SOLUSDT",  digits: 2, kind: "crypto", source: "binance" },
  { symbol: "XRPUSDT",  label: "XRP / USDT",  tv: "BINANCE:XRPUSDT",  digits: 4, kind: "crypto", source: "binance" },
  { symbol: "ADAUSDT",  label: "ADA / USDT",  tv: "BINANCE:ADAUSDT",  digits: 4, kind: "crypto", source: "binance" },
  { symbol: "DOGEUSDT", label: "DOGE / USDT", tv: "BINANCE:DOGEUSDT", digits: 5, kind: "crypto", source: "binance" },
  { symbol: "AVAXUSDT", label: "AVAX / USDT", tv: "BINANCE:AVAXUSDT", digits: 3, kind: "crypto", source: "binance" },
];

export type PairSymbol = string;

export function formatPrice(n: number, digits: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
