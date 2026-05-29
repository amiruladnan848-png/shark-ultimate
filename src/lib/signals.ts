// Technical analysis signal engine — runs on real Binance 1m klines.
// Outputs a directional bias for the NEXT minute with a confidence score
// derived from EMA cross strength, RSI position, and short-term momentum.

export type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Signal = {
  direction: "BUY" | "SELL" | "HOLD";
  confidence: number; // 0-100
  price: number;
  ema9: number;
  ema21: number;
  rsi: number;
  momentum: number; // % change last 5 candles
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
  const momentum = ((price - closes[closes.length - 6]) / closes[closes.length - 6]) * 100;

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
    confidence = Math.min(98, 60 + Math.abs(spread) * 40 + (r - 50) * 0.5 + Math.abs(momentum) * 8);
    reason = crossing
      ? "Fresh bullish EMA cross + RSI strength + positive momentum."
      : "EMA9 above EMA21, RSI > 50, momentum positive — uptrend continuation.";
  } else if (bearish) {
    direction = "SELL";
    confidence = Math.min(98, 60 + Math.abs(spread) * 40 + (50 - r) * 0.5 + Math.abs(momentum) * 8);
    reason = crossing
      ? "Fresh bearish EMA cross + RSI weakness + negative momentum."
      : "EMA9 below EMA21, RSI < 50, momentum negative — downtrend continuation.";
  } else {
    confidence = 45 + Math.random() * 8;
  }

  const atr = klines.slice(-14).reduce((s, k) => s + (k.high - k.low), 0) / 14;
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

export const PAIRS = [
  { symbol: "BTCUSDT", label: "BTC / USDT", tv: "BINANCE:BTCUSDT" },
  { symbol: "ETHUSDT", label: "ETH / USDT", tv: "BINANCE:ETHUSDT" },
  { symbol: "BNBUSDT", label: "BNB / USDT", tv: "BINANCE:BNBUSDT" },
  { symbol: "SOLUSDT", label: "SOL / USDT", tv: "BINANCE:SOLUSDT" },
  { symbol: "XRPUSDT", label: "XRP / USDT", tv: "BINANCE:XRPUSDT" },
  { symbol: "ADAUSDT", label: "ADA / USDT", tv: "BINANCE:ADAUSDT" },
  { symbol: "DOGEUSDT", label: "DOGE / USDT", tv: "BINANCE:DOGEUSDT" },
  { symbol: "AVAXUSDT", label: "AVAX / USDT", tv: "BINANCE:AVAXUSDT" },
  { symbol: "LINKUSDT", label: "LINK / USDT", tv: "BINANCE:LINKUSDT" },
  { symbol: "MATICUSDT", label: "MATIC / USDT", tv: "BINANCE:MATICUSDT" },
] as const;

export type PairSymbol = (typeof PAIRS)[number]["symbol"];

export async function fetchKlines(symbol: string): Promise<Kline[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch market data");
  const raw = (await res.json()) as unknown[][];
  return raw.map((r) => ({
    openTime: r[0] as number,
    open: parseFloat(r[1] as string),
    high: parseFloat(r[2] as string),
    low: parseFloat(r[3] as string),
    close: parseFloat(r[4] as string),
    volume: parseFloat(r[5] as string),
  }));
}
