import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { Crosshair, Radar } from "lucide-react";

function TradingViewChartInner({ symbol }: { symbol: string }) {
  const src = useMemo(() => {
    const params = new URLSearchParams({
      symbol,
      interval: "1",
      theme: "dark",
      style: "1",
      timezone: "Asia/Dhaka",
      hideideas: "1",
      saveimage: "0",
      toolbarbg: "0f172a",
      studies: "STD;EMA%1FSTD;RSI",
      locale: "en",
    });
    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }, [symbol]);

  return (
    <div className="relative h-full w-full rounded-2xl overflow-hidden">
      <iframe
        key={symbol}
        title={`${symbol} live 1 minute TradingView chart`}
        src={src}
        className="h-full w-full border-0 bg-background"
        loading="eager"
        allow="fullscreen"
      />

      {/* Laser scanner overlay — purely decorative, non-blocking */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        {/* Horizontal laser beam sweeping top to bottom */}
        <motion.div
          initial={{ y: "-10%" }}
          animate={{ y: ["-10%", "110%"] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-x-0 h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, oklch(0.82 0.2 190 / 0.9), oklch(0.78 0.26 320 / 0.9), transparent)",
            boxShadow: "0 0 18px oklch(0.82 0.2 190 / 0.7), 0 0 40px oklch(0.78 0.26 320 / 0.5)",
          }}
        />
        {/* Vertical laser beam sweeping left to right */}
        <motion.div
          initial={{ x: "-10%" }}
          animate={{ x: ["-10%", "110%"] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-y-0 w-[2px]"
          style={{
            background:
              "linear-gradient(180deg, transparent, oklch(0.86 0.24 150 / 0.8), oklch(0.82 0.2 190 / 0.8), transparent)",
            boxShadow: "0 0 18px oklch(0.86 0.24 150 / 0.6)",
          }}
        />
        {/* Targeting crosshair pulse */}
        <motion.div
          animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.4, 0.85, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-laser/60"
        >
          <Crosshair className="w-10 h-10" strokeWidth={1.1} />
        </motion.div>
        {/* Corner brackets */}
        <span className="absolute top-2 right-2 w-5 h-5 border-t border-r border-laser/60 rounded-tr" />
        <span className="absolute bottom-2 left-2 w-5 h-5 border-b border-l border-laser/60 rounded-bl" />
        <span className="absolute top-2 left-2 w-5 h-5 border-t border-l border-primary/60 rounded-tl" />
        <span className="absolute bottom-2 right-2 w-5 h-5 border-b border-r border-primary/60 rounded-br" />
        {/* Scan status badge */}
        <div className="absolute bottom-2 right-12 flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-laser/80 font-mono">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          >
            <Radar className="w-3 h-3" />
          </motion.span>
          <span>Laser Deep-Scan Active</span>
        </div>
      </div>
    </div>
  );
}

export const TradingViewChart = memo(TradingViewChartInner);
