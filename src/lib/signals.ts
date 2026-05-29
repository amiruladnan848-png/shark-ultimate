// Technical analysis signal engine — runs on real Yahoo Finance 1m klines.
import type { Kline } from "./market.functions";

export type { Kline };

export type Signal = {
  direction: "BUY" | "SELL" | "HOLD";
  confidence: number;
  price: number;
  ema9: number;
  ema21: number;
  rsi: number;
  momentum: number;
  target: number;
  stop: number;
  reason: string;
  ts: number;
};

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

const rsi = (closes: number[], period = 14): number => {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
};

export function generateSignal(klines: Kline[]): Signal {
  const closes = klines.map((k) => k.close);
  const price = closes[closes.length - 1];
  const e9arr = ema(closes, 9);
  const e21arr = ema(closes, 21);
  const ema9 = e9arr[e9arr.length - 1];
  const ema21 = e21arr[e21arr.length - 1];
  const prevE9 = e9arr[e9arr.length - 2];
  const prevE21 = e21arr[e21arr.length - 2];
  const r = rsi(closes);
  const base = closes[closes.length - 6] ?? closes[0];
  const momentum = ((price - base) / base) * 100;

  const spread = ((ema9 - ema21) / ema21) * 100;
  const prevSpread = ((prevE9 - prevE21) / prevE21) * 100;
  const crossing = Math.sign(spread) !== Math.sign(prevSpread);

  let direction: Signal["direction"] = "HOLD";
  let confidence = 50;
  let reason = "Market consolidating — waiting for clean setup.";

  const bullish = spread > 0 && r > 50 && momentum > 0;
  const bearish = spread < 0 && r < 50 && momentum < 0;

  if (bullish) {
    direction = "BUY";
    confidence = Math.min(98, 65 + Math.abs(spread) * 800 + (r - 50) * 0.6 + Math.abs(momentum) * 50);
    reason = crossing
      ? "Fresh bullish EMA cross + RSI strength + positive momentum."
      : "EMA9 above EMA21, RSI > 50, momentum positive — uptrend continuation.";
  } else if (bearish) {
    direction = "SELL";
    confidence = Math.min(98, 65 + Math.abs(spread) * 800 + (50 - r) * 0.6 + Math.abs(momentum) * 50);
    reason = crossing
      ? "Fresh bearish EMA cross + RSI weakness + negative momentum."
      : "EMA9 below EMA21, RSI < 50, momentum negative — downtrend continuation.";
  } else {
    confidence = 48 + Math.random() * 6;
  }

  const atr = klines.slice(-14).reduce((s, k) => s + (k.high - k.low), 0) / Math.max(1, Math.min(14, klines.length));
  const target = direction === "BUY" ? price + atr * 1.2 : direction === "SELL" ? price - atr * 1.2 : price;
  const stop = direction === "BUY" ? price - atr * 0.8 : direction === "SELL" ? price + atr * 0.8 : price;

  return {
    direction,
    confidence: Math.round(confidence),
    price,
    ema9,
    ema21,
    rsi: Math.round(r * 10) / 10,
    momentum: Math.round(momentum * 1000) / 1000,
    target,
    stop,
    reason,
    ts: Date.now(),
  };
}

// Real popular forex pairs — prices sourced from Yahoo Finance.
export const PAIRS = [
  { symbol: "EURUSD=X", label: "EUR / USD", tv: "FX:EURUSD", digits: 5 },
  { symbol: "GBPUSD=X", label: "GBP / USD", tv: "FX:GBPUSD", digits: 5 },
  { symbol: "JPY=X",    label: "USD / JPY", tv: "FX:USDJPY", digits: 3 },
  { symbol: "CHF=X",    label: "USD / CHF", tv: "FX:USDCHF", digits: 5 },
  { symbol: "AUDUSD=X", label: "AUD / USD", tv: "FX:AUDUSD", digits: 5 },
  { symbol: "CAD=X",    label: "USD / CAD", tv: "FX:USDCAD", digits: 5 },
  { symbol: "NZDUSD=X", label: "NZD / USD", tv: "FX:NZDUSD", digits: 5 },
  { symbol: "EURGBP=X", label: "EUR / GBP", tv: "FX:EURGBP", digits: 5 },
  { symbol: "EURJPY=X", label: "EUR / JPY", tv: "FX:EURJPY", digits: 3 },
  { symbol: "GBPJPY=X", label: "GBP / JPY", tv: "FX:GBPJPY", digits: 3 },
] as const;

export type PairSymbol = (typeof PAIRS)[number]["symbol"];

export function formatPrice(n: number, digits: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
