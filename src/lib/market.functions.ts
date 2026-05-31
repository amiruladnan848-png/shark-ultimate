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

const binanceKlineUrl = (symbol: string) =>
  `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=200`;

const binanceTickerUrl = (symbol: string) =>
  `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;

const isYahoo = (s: string) => /^[A-Z]{3,6}=X$/.test(s);
const isBinance = (s: string) => /^[A-Z0-9]{5,20}$/.test(s);

async function fetchYahooKlinesRaw(symbol: string): Promise<Kline[]> {
  const res = await fetch(yahooUrl(symbol), { headers: YAHOO_HEADERS });
  if (!res.ok) throw new Error(`Forex feed error (${res.status})`);
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
    out.push({
      openTime: r.timestamp[i] * 1000,
      open: q.open[i] ?? c,
      high: q.high[i] ?? c,
      low: q.low[i] ?? c,
      close: c,
      volume: q.volume[i] ?? 0,
    });
  }
  return out.slice(-180);
}

async function fetchBinanceKlinesRaw(symbol: string): Promise<Kline[]> {
  const res = await fetch(binanceKlineUrl(symbol));
  if (!res.ok) throw new Error(`Crypto feed error (${res.status})`);
  const arr = (await res.json()) as Array<
    [number, string, string, string, string, string, number, string, number, string, string, string]
  >;
  return arr.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export const fetchKlines = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string; source: MarketSource }) => {
    if (d.source === "yahoo" && !isYahoo(d.symbol)) throw new Error("Invalid forex symbol");
    if (d.source === "binance" && !isBinance(d.symbol)) throw new Error("Invalid crypto symbol");
    return d;
  })
  .handler(async ({ data }): Promise<Kline[]> => {
    const out = data.source === "binance"
      ? await fetchBinanceKlinesRaw(data.symbol)
      : await fetchYahooKlinesRaw(data.symbol);
    if (out.length < 30) throw new Error("Live market feed warming up");
    return out;
  });

type QuoteInput = { symbol: string; source: MarketSource };

async function fetchYahooQuoteRaw(symbol: string) {
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
    for (const p of d.pairs) {
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
