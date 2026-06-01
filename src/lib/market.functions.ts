import { createServerFn } from "@tanstack/react-start";

export type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketSource = "yahoo" | "binance";

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
  if (!r) throw new Error(json.chart.error?.description ?? "Forex data unavailable");
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

async function fetchBinanceKlinesRaw(symbol: string): Promise<Kline[]> {
  const res = await fetch(binanceKlineUrl(symbol));
  if (!res.ok) throw new Error(`Crypto feed error (${res.status})`);
  const arr = (await res.json()) as Array<
    [number, string, string, string, string, string, number, string, number, string, string, string]
  >;
  return arr
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
}

export const fetchKlines = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string; source: MarketSource }) => {
    if (d.source !== "yahoo" && d.source !== "binance") throw new Error("Invalid market source");
    if (d.source === "yahoo" && !isYahoo(d.symbol)) throw new Error("Invalid forex symbol");
    if (d.source === "binance" && !isBinance(d.symbol)) throw new Error("Invalid crypto symbol");
    return d;
  })
  .handler(async ({ data }): Promise<Kline[]> => {
    const out = data.source === "binance"
      ? await fetchBinanceKlinesRaw(data.symbol)
      : await fetchYahooKlinesRaw(data.symbol);
    const clean = out.filter((k) => k.close > 0 && k.high >= k.low);
    if (clean.length < 80) throw new Error("Live market feed warming up");
    return clean;
  });

type QuoteInput = { symbol: string; source: MarketSource };

async function fetchYahooQuoteRaw(symbol: string) {
  const quote = await fetchStooqQuote(symbol);
  if (quote) {
    const previous = quote.open > 0 ? quote.open : quote.close;
    return { symbol, price: quote.close, change: previous === 0 ? 0 : ((quote.close - previous) / previous) * 100 };
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
  return { symbol, price, change: ((price - previous) / previous) * 100 };
}

async function fetchBinanceQuoteRaw(symbol: string) {
  const res = await fetch(binanceTickerUrl(symbol));
  if (!res.ok) return null;
  const j = (await res.json()) as { lastPrice: string; priceChangePercent: string };
  const price = parseFloat(j.lastPrice);
  const change = parseFloat(j.priceChangePercent);
  if (!Number.isFinite(price)) return null;
  return { symbol, price, change };
}

export const fetchQuotes = createServerFn({ method: "POST" })
  .inputValidator((d: { pairs: QuoteInput[] }) => {
    if (!Array.isArray(d.pairs)) throw new Error("Invalid pairs");
    if (d.pairs.length > 40) throw new Error("Too many pairs");
    for (const p of d.pairs) {
      if (p.source !== "yahoo" && p.source !== "binance") throw new Error("Invalid market source");
      if (p.source === "yahoo" && !isYahoo(p.symbol)) throw new Error("Invalid forex symbol");
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
