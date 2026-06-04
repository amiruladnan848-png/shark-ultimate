import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { Crosshair, Radar, Target } from "lucide-react";

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

      {/* Professional laser deep-scanner overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        {/* Soft grid wash that "breathes" with the scan */}
        <motion.div
          aria-hidden
          animate={{ opacity: [0.18, 0.36, 0.18] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(oklch(0.82 0.2 190 / 0.06) 1px, transparent 1px), linear-gradient(90deg, oklch(0.82 0.2 190 / 0.06) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            mixBlendMode: "screen",
          }}
        />

        {/* Primary horizontal scan line */}
        <motion.div
          initial={{ y: "-6%" }}
          animate={{ y: ["-6%", "106%"] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-x-0 h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, oklch(0.82 0.2 190 / 0.95), oklch(0.78 0.26 320 / 0.95), transparent)",
            boxShadow:
              "0 0 22px oklch(0.82 0.2 190 / 0.85), 0 0 60px oklch(0.78 0.26 320 / 0.55)",
          }}
        />
        {/* Trailing soft band behind the primary line for "scanning glow" */}
        <motion.div
          initial={{ y: "-15%" }}
          animate={{ y: ["-15%", "115%"] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-x-0 h-24 opacity-60"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, oklch(0.82 0.2 190 / 0.18) 55%, transparent 100%)",
            filter: "blur(6px)",
          }}
        />

        {/* Secondary vertical scan line */}
        <motion.div
          initial={{ x: "-6%" }}
          animate={{ x: ["-6%", "106%"] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-y-0 w-[2px]"
          style={{
            background:
              "linear-gradient(180deg, transparent, oklch(0.86 0.24 150 / 0.9), oklch(0.82 0.2 190 / 0.9), transparent)",
            boxShadow: "0 0 18px oklch(0.86 0.24 150 / 0.65)",
          }}
        />

        {/* Best-entry locator — drifts across slowly */}
        <motion.div
          initial={{ x: "5%", y: "30%" }}
          animate={{
            x: ["5%", "75%", "35%", "85%", "20%", "5%"],
            y: ["30%", "60%", "45%", "25%", "70%", "30%"],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute"
        >
          <motion.div
            animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="relative text-laser drop-shadow-[0_0_10px_oklch(0.78_0.26_320/0.7)]"
          >
            <Target className="w-8 h-8" strokeWidth={1.1} />
            <span className="absolute inset-0 -m-3 rounded-full border border-laser/40 animate-scanner-ring" />
          </motion.div>
        </motion.div>

        {/* Centered crosshair pulse */}
        <motion.div
          animate={{ scale: [0.9, 1.06, 0.9], opacity: [0.35, 0.8, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-laser/60"
        >
          <Crosshair className="w-12 h-12" strokeWidth={1.1} />
        </motion.div>

        {/* Corner brackets */}
        <span className="absolute top-2 right-2 w-5 h-5 border-t border-r border-laser/60 rounded-tr" />
        <span className="absolute bottom-2 left-2 w-5 h-5 border-b border-l border-laser/60 rounded-bl" />
        <span className="absolute top-2 left-2 w-5 h-5 border-t border-l border-primary/60 rounded-tl" />
        <span className="absolute bottom-2 right-2 w-5 h-5 border-b border-r border-primary/60 rounded-br" />

        {/* Live deep-analysis HUD — top-right */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-2 right-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-background/55 backdrop-blur-md border border-laser/30 text-[10px] font-mono text-laser/90 uppercase tracking-widest"
        >
          <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-laser shadow-laser" />
          Live Deep-Analysis
        </motion.div>

        {/* Rolling indicator readout — bottom-left */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-2 left-10 flex items-center gap-2 px-2 py-1 rounded-md bg-background/55 backdrop-blur-md border border-primary/25 text-[10px] font-mono text-primary/90 uppercase tracking-widest"
        >
          <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.8, repeat: Infinity }}>EMA</motion.span>
          <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.8, repeat: Infinity, delay: 0.3 }}>·</motion.span>
          <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.8, repeat: Infinity, delay: 0.6 }}>RSI</motion.span>
          <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.8, repeat: Infinity, delay: 0.9 }}>·</motion.span>
          <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.8, repeat: Infinity, delay: 1.2 }}>VWAP</motion.span>
        </motion.div>

        {/* Scan status badge */}
        <div className="absolute bottom-2 right-12 flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-laser/85 font-mono">
          <motion.span animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>
            <Radar className="w-3 h-3" />
          </motion.span>
          <span>Laser Deep-Scan · Locating Best Entry</span>
        </div>
      </div>
    </div>
  );
}

export const TradingViewChart = memo(TradingViewChartInner);
