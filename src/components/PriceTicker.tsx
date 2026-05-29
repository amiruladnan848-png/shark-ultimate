import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PAIRS } from "@/lib/signals";
import { fetchYahooQuotes } from "@/lib/market.functions";

type Tick = { symbol: string; price: number; change: number; label: string; digits: number };

export function PriceTicker() {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const fetchQ = useServerFn(fetchYahooQuotes);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await fetchQ({ data: { symbols: PAIRS.map((p) => p.symbol) } });
        if (!alive) return;
        const meta = new Map<string, (typeof PAIRS)[number]>(PAIRS.map((p) => [p.symbol, p]));
        setTicks(
          data.map((d) => {
            const m = meta.get(d.symbol)!;
            return { symbol: d.symbol, price: d.price, change: d.change, label: m.label, digits: m.digits };
          }),
        );
      } catch {}
    };
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [fetchQ]);

  if (!ticks.length) return null;
  const doubled = [...ticks, ...ticks];

  return (
    <div className="overflow-hidden glass rounded-full py-2 relative">
      <div className="flex gap-6 animate-ticker whitespace-nowrap">
        {doubled.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-xs px-2">
            <span className="text-muted-foreground font-semibold">{t.label}</span>
            <span className="font-mono">{t.price.toFixed(t.digits)}</span>
            <span className={`font-mono ${t.change >= 0 ? "text-bull" : "text-bear"}`}>
              {t.change >= 0 ? "+" : ""}{t.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
