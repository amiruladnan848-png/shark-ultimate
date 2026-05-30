import { createServerFn } from "@tanstack/react-start";

export type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

const chartUrl = (symbol: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;

export const fetchYahooKlines = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string }) => {
    if (!/^[A-Z]{3,6}=X$/.test(d.symbol)) throw new Error("Invalid symbol");
    return d;
  })
  .handler(async ({ data }): Promise<Kline[]> => {
    const res = await fetch(chartUrl(data.symbol), { headers: YAHOO_HEADERS });
    if (!res.ok) throw new Error(`Live market feed error (${res.status})`);
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
    if (!r) throw new Error(json.chart.error?.description ?? "Live market data unavailable");
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
    if (out.length < 30) throw new Error("Live market feed warming up");
    return out.slice(-180);
  });

export const fetchYahooQuotes = createServerFn({ method: "GET" })
  .inputValidator((d: { symbols: string[] }) => {
    if (!Array.isArray(d.symbols) || d.symbols.some((s) => !/^[A-Z]{3,6}=X$/.test(s))) {
      throw new Error("Invalid symbols");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const results = await Promise.all(
      data.symbols.map(async (sym) => {
        try {
          const res = await fetch(chartUrl(sym), { headers: YAHOO_HEADERS });
          if (!res.ok) return null;
          const j = (await res.json()) as {
            chart: {
              result?: Array<{
                meta: { regularMarketPrice?: number; chartPreviousClose?: number };
                timestamp?: number[];
                indicators?: { quote?: Array<{ close: (number | null)[] }> };
              }>;
            };
          };
          const r = j.chart.result?.[0];
          const closes = r?.indicators?.quote?.[0]?.close?.filter((v): v is number => typeof v === "number" && Number.isFinite(v)) ?? [];
          const price = r?.meta.regularMarketPrice ?? closes.at(-1);
          const previous = r?.meta.chartPreviousClose ?? closes.at(-2) ?? price;
          if (price == null || previous == null || previous === 0) return null;
          const change = ((price - previous) / previous) * 100;
          return { symbol: sym, price, change };
        } catch {
          return null;
        }
      }),
    );
    return results.filter((r): r is { symbol: string; price: number; change: number } => r !== null);
  });
