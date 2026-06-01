import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Gauge, LockKeyhole, Radar, ScanLine, ShieldCheck, Zap } from "lucide-react";
import { PinLock } from "@/components/PinLock";
import { TradingViewChart } from "@/components/TradingViewChart";
import { SignalPanel } from "@/components/SignalPanel";
import { PairSelector } from "@/components/PairSelector";
import { BDClock } from "@/components/BDClock";
import { PriceTicker } from "@/components/PriceTicker";
import { PAIRS } from "@/lib/signals";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shark-Ultimate — Live 1-Min Signal Bot" },
      { name: "description", content: "High-accuracy 1-minute trading signals with live TradingView chart, laser-scan analysis and Bangladesh timezone." },
      { property: "og:title", content: "Shark-Ultimate — Live 1-Min Signal Bot" },
      { property: "og:description", content: "High-accuracy 1-minute trading signals with live TradingView chart." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <PinLock>
      <Dashboard />
    </PinLock>
  );
}

function Dashboard() {
  const [symbol, setSymbol] = useState<string>(PAIRS[0].symbol);
  const active = PAIRS.find((p) => p.symbol === symbol)!;

  return (
    <div className="min-h-screen px-4 sm:px-6 py-4 max-w-7xl mx-auto relative">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3 mb-5"
      >
        <div className="flex items-center gap-2.5">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="w-10 h-10 rounded-xl shark-grad flex items-center justify-center shadow-laser"
          >
            <Radar className="w-5 h-5 text-background" />
          </motion.div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black shark-text leading-none">Shark-Ultimate</h1>
            <p className="text-[10px] text-muted-foreground tracking-[0.22em] uppercase">Professional Manual Laser Signal System</p>
          </div>
        </div>
        <BDClock />
      </motion.header>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4"
      >
        <PriceTicker />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-3"
      >
        <PairSelector value={symbol} onChange={setSymbol} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"
      >
        <StatusTile icon={<BadgeCheck className="w-4 h-4" />} label="Accuracy Booster" value="Adaptive" />
        <StatusTile icon={<Gauge className="w-4 h-4" />} label="Signal Grade" value="A+ / A" />
        <StatusTile icon={<Zap className="w-4 h-4" />} label="Live Source" value={active.kind === "crypto" ? "Binance 24/7" : "Yahoo FX"} />
        <StatusTile icon={<ShieldCheck className="w-4 h-4" />} label="Session Filter" value={active.kind === "crypto" ? "Always open" : "BDT locked"} />
      </motion.div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-4">
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-3xl p-1.5 h-[500px] lg:h-[660px] relative overflow-hidden professional-frame"
        >
          <div className="absolute top-3 left-4 z-10 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground pointer-events-none">
            <Zap className="w-3 h-3 text-laser" />
            TradingView · 1m · {active.label}
          </div>
          <TradingViewChart symbol={active.tv} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <SignalPanel symbol={active.symbol} label={active.label} digits={active.digits} kind={active.kind} source={active.source} />

          <div className="glass rounded-3xl p-4 mt-4 professional-frame">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Engine</div>
            <ul className="text-xs space-y-1.5 text-muted-foreground">
              <li className="flex justify-between gap-3"><span>Data feed</span><span className="text-foreground text-right">Yahoo FX · Binance crypto</span></li>
              <li className="flex justify-between"><span>Signal mode</span><span className="text-foreground inline-flex items-center gap-1"><ScanLine className="w-3 h-3 text-laser" /> Manual</span></li>
              <li className="flex justify-between"><span>Interval</span><span className="text-foreground">1 minute</span></li>
              <li className="flex justify-between gap-3"><span>Indicators</span><span className="text-foreground text-right">MTF EMA · MACD · RSI · ADX · VWAP · ATR</span></li>
              <li className="flex justify-between"><span>Accuracy</span><span className="text-foreground">Adaptive booster</span></li>
              <li className="flex justify-between"><span>Forex weekend</span><span className="text-foreground inline-flex items-center gap-1"><LockKeyhole className="w-3 h-3 text-laser" /> Locked</span></li>
              <li className="flex justify-between"><span>Timezone</span><span className="text-foreground">Asia/Dhaka (BDT)</span></li>
            </ul>
          </div>
        </motion.div>
      </div>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-center text-[10px] text-muted-foreground mt-6 leading-relaxed"
      >
        Shark-Ultimate · Signals are algorithmic technical analysis · No trading outcome is guaranteed
      </motion.footer>
    </div>
  );
}

function StatusTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-2xl px-3 py-3 professional-frame">
      <div className="flex items-center gap-2 text-laser mb-1">{icon}<span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span></div>
      <div className="text-sm font-bold text-foreground truncate">{value}</div>
    </div>
  );
}
