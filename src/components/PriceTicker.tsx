import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PAIRS, type Pair } from "@/lib/signals";
import { fetchQuotes } from "@/lib/market.functions";

type Tick = { symbol: string; price: number; change: number; label: string; digits: number; kind: Pair["kind"] };

export function PriceTicker() {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const fetchQ = useServerFn(fetchQuotes);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await fetchQ({
          data: { pairs: PAIRS.map((p) => ({ symbol: p.symbol, source: p.source })) },
        });
        if (!alive) return;
        const meta = new Map<string, Pair>(PAIRS.map((p) => [p.symbol, p]));
        setTicks(
          data.map((d) => {
            const m = meta.get(d.symbol)!;
            return { symbol: d.symbol, price: d.price, change: d.change, label: m.label, digits: m.digits, kind: m.kind };
          }),
        );
      } catch {}
    };
    load();
    const id = setInterval(load, 12000);
    return () => { alive = false; clearInterval(id); };
  }, [fetchQ]);

  if (!ticks.length) return null;
  const doubled = [...ticks, ...ticks];

  return (
    <div className="overflow-hidden glass rounded-full py-2 relative">
      <div className="flex gap-6 animate-ticker whitespace-nowrap">
        {doubled.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-xs px-2">
            <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${t.kind === "crypto" ? "bg-laser/20 text-laser" : "bg-primary/20 text-primary"}`}>
              {t.kind === "crypto" ? "C" : "FX"}
            </span>
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
