import { createServerFn } from "@tanstack/react-start";

export type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const fetchYahooKlines = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string }) => {
    if (!/^[A-Z]{3,6}=X$/.test(d.symbol)) throw new Error("Invalid symbol");
    return d;
  })
  .handler(async ({ data }): Promise<Kline[]> => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${data.symbol}?interval=1m&range=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
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
    if (!r) throw new Error(json.chart.error?.description ?? "No data");
    const q = r.indicators.quote[0];
    const out: Kline[] = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      const c = q.close[i];
      if (c == null) continue;
      out.push({
        openTime: r.timestamp[i] * 1000,
        open: q.open[i] ?? c,
        high: q.high[i] ?? c,
        low: q.low[i] ?? c,
        close: c,
        volume: q.volume[i] ?? 0,
      });
    }
    return out.slice(-120);
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
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d`;
          const res = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            },
          });
          if (!res.ok) return null;
          const j = (await res.json()) as {
            chart: {
              result?: Array<{
                meta: { regularMarketPrice: number; chartPreviousClose: number };
              }>;
            };
          };
          const m = j.chart.result?.[0]?.meta;
          if (!m) return null;
          const change = ((m.regularMarketPrice - m.chartPreviousClose) / m.chartPreviousClose) * 100;
          return { symbol: sym, price: m.regularMarketPrice, change };
        } catch {
          return null;
        }
      }),
    );
    return results.filter((r): r is { symbol: string; price: number; change: number } => r !== null);
  });
