import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, TrendingDown, Zap, Target, Shield, Activity, ScanLine, LockKeyhole } from "lucide-react";
import { generateSignal, formatPrice, isBangladeshWeekend, type Signal, type ScanPhase } from "@/lib/signals";
import { fetchYahooKlines } from "@/lib/market.functions";

export function SignalPanel({ symbol, label, digits }: { symbol: string; label: string; digits: number }) {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [locked, setLocked] = useState(() => isBangladeshWeekend());
  const fetchK = useServerFn(fetchYahooKlines);

  useEffect(() => {
    setSignal(null);
    setError(null);
    setPhase(isBangladeshWeekend() ? "locked" : "idle");
  }, [symbol]);

  useEffect(() => {
    const tick = () => setCountdown(60 - new Date().getSeconds());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const syncLock = () => {
      const next = isBangladeshWeekend();
      setLocked(next);
      if (next) {
        setSignal(null);
        setPhase("locked");
      } else if (phase === "locked") {
        setPhase("idle");
      }
    };
    syncLock();
    const id = setInterval(syncLock, 30000);
    return () => clearInterval(id);
  }, [phase]);

  const scan = async () => {
    if (locked || isBangladeshWeekend()) {
      setSignal(null);
      setError(null);
      setPhase("locked");
      return;
    }
    setPhase("scanning");
    setError(null);
    try {
      const k = await fetchK({ data: { symbol } });
      if (!k.length) throw new Error("Live market feed unavailable");
      setSignal(generateSignal(k));
      setPhase("ready");
    } catch (e) {
      setSignal(null);
      setError((e as Error).message || "Signal scan failed");
      setPhase("error");
    }
  };

  const dirColor =
    signal?.direction === "BUY" ? "text-bull" :
    signal?.direction === "SELL" ? "text-bear" : "text-laser";
  const DirIcon =
    signal?.direction === "BUY" ? TrendingUp :
    signal?.direction === "SELL" ? TrendingDown : ScanLine;

  return (
    <div className="glass rounded-3xl p-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px shark-grad opacity-60" />
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-laser to-transparent animate-scan" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-bull animate-pulse" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Manual Signal Scanner</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Activity className="w-3 h-3" />
          Next bar in <span className="text-foreground font-mono w-5 text-right">{countdown}s</span>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={scan}
        disabled={phase === "scanning" || locked}
        className="w-full mb-4 rounded-2xl shark-grad px-4 py-3 text-sm font-black uppercase tracking-[0.24em] text-primary-foreground shadow-laser disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {locked ? <LockKeyhole className="w-4 h-4" /> : <ScanLine className="w-4 h-4" />}
          {locked ? "Weekend Locked" : phase === "scanning" ? "Laser Scanning" : "Signal Scan"}
        </span>
      </motion.button>

      {phase === "scanning" && !signal && (
        <div className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
          <Zap className="w-6 h-6 animate-pulse text-laser" />
          <span className="text-sm">Laser-scanning {label} live 1m market...</span>
        </div>
      )}

      {phase === "locked" && (
        <div className="py-8 text-center">
          <LockKeyhole className="w-7 h-7 text-laser mx-auto mb-3" />
          <div className="text-sm font-semibold text-foreground">Weekend Time Signal Engine Locked</div>
          <div className="text-xs text-muted-foreground mt-1">Forex market scanning reopens with live weekday trading.</div>
        </div>
      )}

      {phase === "idle" && !signal && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <ScanLine className="w-7 h-7 text-laser mx-auto mb-3 animate-pulse" />
          Manual laser scanner standing by for {label}.
        </div>
      )}

      {error && phase === "error" && (
        <div className="py-6 text-center text-sm text-destructive">{error}</div>
      )}

      <AnimatePresence mode="wait">
        {signal && (
          <motion.div
            key={signal.direction + Math.floor(signal.ts / 8000)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <motion.div
                  key={signal.price}
                  initial={{ scale: 1.05, color: "var(--laser)" }}
                  animate={{ scale: 1, color: "var(--foreground)" }}
                  className="text-2xl font-bold font-mono"
                >{formatPrice(signal.price, digits)}</motion.div>
              </div>
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl glass ${dirColor}`}
              >
                <DirIcon className="w-5 h-5" />
                <span className="font-bold tracking-wide">{signal.direction}</span>
              </motion.div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Accuracy Confidence</span>
                <span className={`font-mono font-semibold ${dirColor}`}>{signal.confidence}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${signal.confidence}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full shark-grad"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="glass rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  <Target className="w-3 h-3 text-bull" /> Target
                </div>
                <div className="font-mono text-sm text-bull">{formatPrice(signal.target, digits)}</div>
              </div>
              <div className="glass rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  <Shield className="w-3 h-3 text-bear" /> Stop
                </div>
                <div className="font-mono text-sm text-bear">{formatPrice(signal.stop, digits)}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <Metric label="RSI" value={signal.rsi.toFixed(1)} tone={signal.rsi > 70 ? "bear" : signal.rsi < 30 ? "bull" : "neutral"} />
              <Metric label="EMA9" value={formatPrice(signal.ema9, digits)} />
              <Metric label="MOM%" value={signal.momentum.toFixed(3)} tone={signal.momentum > 0 ? "bull" : "bear"} />
            </div>

            <div className="text-xs text-muted-foreground leading-relaxed border-l-2 border-laser/60 pl-3">
              {signal.reason}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "neutral" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "neutral" ? "text-neutral" : "text-foreground";
  return (
    <div className="glass rounded-xl py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm ${c}`}>{value}</div>
    </div>
  );
}
