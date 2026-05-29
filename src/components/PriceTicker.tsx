import { useEffect, useState } from "react";
import { PAIRS } from "@/lib/signals";

type Tick = { symbol: string; price: number; change: number };

export function PriceTicker() {
  const [ticks, setTicks] = useState<Tick[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const symbols = PAIRS.map((p) => p.symbol);
        const res = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
        );
        const data = (await res.json()) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
        if (!alive) return;
        setTicks(
          data.map((d) => ({
            symbol: d.symbol,
            price: parseFloat(d.lastPrice),
            change: parseFloat(d.priceChangePercent),
          })),
        );
      } catch {}
    };
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!ticks.length) return null;
  const doubled = [...ticks, ...ticks];

  return (
    <div className="overflow-hidden glass rounded-full py-2 relative">
      <div className="flex gap-6 animate-ticker whitespace-nowrap">
        {doubled.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-xs px-2">
            <span className="text-muted-foreground font-semibold">{t.symbol.replace("USDT", "")}</span>
            <span className="font-mono">${t.price >= 1000 ? t.price.toFixed(2) : t.price.toFixed(4)}</span>
            <span className={`font-mono ${t.change >= 0 ? "text-bull" : "text-bear"}`}>
              {t.change >= 0 ? "+" : ""}{t.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
