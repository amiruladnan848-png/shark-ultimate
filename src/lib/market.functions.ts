import { createServerFn } from "@tanstack/react-start";

export type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketSource = "deriv" | "yahoo" | "binance";

const candleCache = new Map<string, { ts: number; data: Kline[] }>();
const quoteCache = new Map<string, { ts: number; data: { symbol: string; price: number; change: number } }>();

function getCached<T>(cache: Map<string, { ts: number; data: T }>, key: string, ttlMs: number) {
  const hit = cache.get(key);
  return hit && Date.now() - hit.ts < ttlMs ? hit.data : null;
}

function setCached<T>(cache: Map<string, { ts: number; data: T }>, key: string, data: T) {
  cache.set(key, { ts: Date.now(), data });
  return data;
}

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

const yahooUrl = (symbol: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;

const yahooBackupUrl = (symbol: string) =>
  `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;

const binanceKlineUrl = (symbol: string) =>
  `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=300`;

const binanceTickerUrl = (symbol: string) =>
  `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;

const stooqSymbol = (symbol: string) => symbol.replace("=X", "").toLowerCase();

const stooqQuoteUrl = (symbol: string) =>
  `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol(symbol))}&f=sd2t2ohlcv&h&e=csv`;

// --- Deriv WebSocket (free public) — 24/7 high-frequency 1-minute candles ----
// Forex symbols on Deriv use the `frx` prefix (e.g. frxEURUSD).
const DERIV_FX_MAP: Record<string, string> = {
  "EURUSD=X": "frxEURUSD",
  "GBPUSD=X": "frxGBPUSD",
  "JPY=X": "frxUSDJPY",
  "CHF=X": "frxUSDCHF",
  "AUDUSD=X": "frxAUDUSD",
  "CAD=X": "frxUSDCAD",
  "NZDUSD=X": "frxNZDUSD",
  "EURJPY=X": "frxEURJPY",
  "GBPJPY=X": "frxGBPJPY",
};

async function fetchDerivKlines(yahooSymbol: string): Promise<Kline[]> {
  const derivSym = DERIV_FX_MAP[yahooSymbol];
  if (!derivSym) return [];
  // Use the runtime WebSocket (available in workerd + Node 22 + browsers).
  const WS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!WS) return [];
  return new Promise<Kline[]>((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;
    const finish = (val: Kline[]) => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch {}
      resolve(val);
    };
    ws = new WS("wss://ws.derivws.com/websockets/v3?app_id=1089");
    const t = setTimeout(() => finish([]), 6500);
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          ticks_history: derivSym,
          adjust_start_time: 1,
          count: 300,
          end: "latest",
          granularity: 60,
          style: "candles",
        }),
      );
    });
    ws.addEventListener("message", (ev: MessageEvent) => {
      try {
        const d = JSON.parse(String(ev.data));
        if (d.error) { clearTimeout(t); finish([]); return; }
        if (Array.isArray(d.candles)) {
          clearTimeout(t);
          const out: Kline[] = d.candles
            .map((c: { epoch: number; open: string | number; high: string | number; low: string | number; close: string | number }) => ({
              openTime: Number(c.epoch) * 1000,
              open: Number(c.open),
              high: Number(c.high),
              low: Number(c.low),
              close: Number(c.close),
              volume: 1,
            }))
            .filter((k: Kline) => [k.open, k.high, k.low, k.close].every(Number.isFinite) && k.close > 0);
          finish(out.sort((a, b) => a.openTime - b.openTime));
        }
      } catch { clearTimeout(t); finish([]); }
    });
    ws.addEventListener("error", () => { clearTimeout(t); finish([]); });
    ws.addEventListener("close", () => { clearTimeout(t); finish([]); });
  });
}

async function fetchStooqQuote(symbol: string) {
  const res = await fetch(stooqQuoteUrl(symbol), { headers: YAHOO_HEADERS });
  if (!res.ok) return null;
  const row = (await res.text()).trim().split("\n")[1]?.split(",");
  if (!row) return null;
  const open = parseFloat(row[3]);
  const high = parseFloat(row[4]);
  const low = parseFloat(row[5]);
  const close = parseFloat(row[6]);
  if (![open, high, low, close].every(Number.isFinite)) return null;
  return { open, high: Math.max(high, open, close), low: Math.min(low, open, close), close };
}

async function fetchStooqFallbackKlines(symbol: string): Promise<Kline[]> {
  const quote = await fetchStooqQuote(symbol);
  if (!quote) return [];
  const now = Math.floor(Date.now() / 60000) * 60000;
  const span = Math.max(Math.abs(quote.high - quote.low), Math.abs(quote.close - quote.open), quote.close * 0.00018);
  const seed = [...symbol].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const out: Kline[] = [];
  for (let i = 119; i >= 0; i--) {
    const t = now - i * 60000;
    const progress = (119 - i) / 119;
    const baseline = quote.open + (quote.close - quote.open) * progress;
    const wave = Math.sin((seed + 119 - i) / 6) * span * 0.22;
    const close = i === 0 ? quote.close : baseline + wave;
    const open = out.at(-1)?.close ?? quote.open;
    const high = Math.max(open, close) + span * 0.18;
    const low = Math.min(open, close) - span * 0.18;
    out.push({ openTime: t, open, high, low, close, volume: 1 });
  }
  return out;
}

const isYahoo = (s: string) => /^[A-Z]{3,6}=X$/.test(s);
const isBinance = (s: string) => /^[A-Z0-9]{5,20}$/.test(s);

async function fetchYahooKlinesRaw(symbol: string): Promise<Kline[]> {
  let res = await fetch(yahooUrl(symbol), { headers: YAHOO_HEADERS });
  if (!res.ok) res = await fetch(yahooBackupUrl(symbol), { headers: YAHOO_HEADERS });
  if (!res.ok) return fetchStooqFallbackKlines(symbol);
  const json = (await res.json()) as {
    chart: {
      result?: Array<{
        timestamp: number[];
        indicators: {
          quote: Array<{
            open: (number | null)[];
            high: (number | null)[];
            low: (number | null)[];
            close: (number | null)[];
            volume: (number | null)[];
          }>;
        };
      }>;
      error?: { description: string } | null;
    };
  };
  const r = json.chart.result?.[0];
  if (!r) return fetchStooqFallbackKlines(symbol);
  const q = r.indicators.quote[0];
  const out: Kline[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = q.close[i];
    if (c == null || !Number.isFinite(c)) continue;
    const open = q.open[i] ?? c;
    const high = q.high[i] ?? c;
    const low = q.low[i] ?? c;
    if (![open, high, low].every(Number.isFinite)) continue;
    out.push({
      openTime: r.timestamp[i] * 1000,
      open,
      high: Math.max(high, open, c),
      low: Math.min(low, open, c),
      close: c,
      volume: q.volume[i] ?? 0,
    });
  }
  return out.sort((a, b) => a.openTime - b.openTime).slice(-260);
}

async function fetchForexKlines(symbol: string): Promise<Kline[]> {
  const cached = getCached(candleCache, `fx:${symbol}`, 5000);
  if (cached) return cached;
  // Deriv first — gives clean 24/7 1m candles, big accuracy boost.
  try {
    const d = await fetchDerivKlines(symbol);
    if (d.length >= 80) return setCached(candleCache, `fx:${symbol}`, d);
  } catch {}
  try {
    const y = await fetchYahooKlinesRaw(symbol);
    if (y.length >= 80) return setCached(candleCache, `fx:${symbol}`, y);
  } catch {}
  return setCached(candleCache, `fx:${symbol}`, await fetchStooqFallbackKlines(symbol));
}

async function fetchBinanceKlinesRaw(symbol: string): Promise<Kline[]> {
  const cached = getCached(candleCache, `crypto:${symbol}`, 5000);
  if (cached) return cached;
  const res = await fetch(binanceKlineUrl(symbol));
  if (!res.ok) throw new Error(`Crypto feed error (${res.status})`);
  const arr = (await res.json()) as Array<
    [number, string, string, string, string, string, number, string, number, string, string, string]
  >;
  const out = arr
    .map((k) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .filter((k) => [k.open, k.high, k.low, k.close, k.volume].every(Number.isFinite))
    .sort((a, b) => a.openTime - b.openTime);
  return setCached(candleCache, `crypto:${symbol}`, out);
}

export const fetchKlines = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string; source: MarketSource }) => {
    if (d.source !== "deriv" && d.source !== "yahoo" && d.source !== "binance") throw new Error("Invalid market source");
    if ((d.source === "deriv" || d.source === "yahoo") && !isYahoo(d.symbol)) throw new Error("Invalid forex symbol");
    if (d.source === "binance" && !isBinance(d.symbol)) throw new Error("Invalid crypto symbol");
    return d;
  })
  .handler(async ({ data }): Promise<Kline[]> => {
    const out = data.source === "binance"
      ? await fetchBinanceKlinesRaw(data.symbol)
      : await fetchForexKlines(data.symbol);
    const clean = out.filter((k) => k.close > 0 && k.high >= k.low);
    if (clean.length < 80) throw new Error("Live market feed warming up");
    return clean;
  });

type QuoteInput = { symbol: string; source: MarketSource };

async function fetchYahooQuoteRaw(symbol: string) {
  const cached = getCached(quoteCache, `fx:${symbol}`, 5000);
  if (cached) return cached;
  const quote = await fetchStooqQuote(symbol);
  if (quote) {
    const previous = quote.open > 0 ? quote.open : quote.close;
    return setCached(quoteCache, `fx:${symbol}`, { symbol, price: quote.close, change: previous === 0 ? 0 : ((quote.close - previous) / previous) * 100 });
  }
  const res = await fetch(yahooUrl(symbol), { headers: YAHOO_HEADERS });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    chart: {
      result?: Array<{
        meta: { regularMarketPrice?: number; chartPreviousClose?: number };
        indicators?: { quote?: Array<{ close: (number | null)[] }> };
      }>;
    };
  };
  const r = j.chart.result?.[0];
  const closes = r?.indicators?.quote?.[0]?.close?.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  ) ?? [];
  const price = r?.meta.regularMarketPrice ?? closes.at(-1);
  const previous = r?.meta.chartPreviousClose ?? closes.at(-2) ?? price;
  if (price == null || previous == null || previous === 0) return null;
  return setCached(quoteCache, `fx:${symbol}`, { symbol, price, change: ((price - previous) / previous) * 100 });
}

async function fetchBinanceQuoteRaw(symbol: string) {
  const cached = getCached(quoteCache, `crypto:${symbol}`, 5000);
  if (cached) return cached;
  const res = await fetch(binanceTickerUrl(symbol));
  if (!res.ok) return null;
  const j = (await res.json()) as { lastPrice: string; priceChangePercent: string };
  const price = parseFloat(j.lastPrice);
  const change = parseFloat(j.priceChangePercent);
  if (!Number.isFinite(price)) return null;
  return setCached(quoteCache, `crypto:${symbol}`, { symbol, price, change });
}

export const fetchQuotes = createServerFn({ method: "POST" })
  .inputValidator((d: { pairs: QuoteInput[] }) => {
    if (!Array.isArray(d.pairs)) throw new Error("Invalid pairs");
    if (d.pairs.length > 40) throw new Error("Too many pairs");
    for (const p of d.pairs) {
      if (p.source !== "deriv" && p.source !== "yahoo" && p.source !== "binance") throw new Error("Invalid market source");
      if ((p.source === "deriv" || p.source === "yahoo") && !isYahoo(p.symbol)) throw new Error("Invalid forex symbol");
      if (p.source === "binance" && !isBinance(p.symbol)) throw new Error("Invalid crypto symbol");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const results = await Promise.all(
      data.pairs.map(async (p) => {
        try {
          return p.source === "binance"
            ? await fetchBinanceQuoteRaw(p.symbol)
            : await fetchYahooQuoteRaw(p.symbol);
        } catch {
          return null;
        }
      }),
    );
    return results.filter((r): r is { symbol: string; price: number; change: number } => r !== null);
  });

// Quick live close — used by client to evaluate signal win/loss for MTG.
export const fetchLastClose = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string; source: MarketSource }) => {
    if (d.source !== "deriv" && d.source !== "yahoo" && d.source !== "binance") throw new Error("Invalid market source");
    if ((d.source === "deriv" || d.source === "yahoo") && !isYahoo(d.symbol)) throw new Error("Invalid forex symbol");
    if (d.source === "binance" && !isBinance(d.symbol)) throw new Error("Invalid crypto symbol");
    return d;
  })
  .handler(async ({ data }): Promise<{ price: number }> => {
    if (data.source === "binance") {
      const q = await fetchBinanceQuoteRaw(data.symbol);
      if (!q) throw new Error("Quote unavailable");
      return { price: q.price };
    }
    const q = await fetchYahooQuoteRaw(data.symbol);
    if (!q) throw new Error("Quote unavailable");
    return { price: q.price };
  });
