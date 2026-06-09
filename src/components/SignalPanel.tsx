import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, TrendingDown, Zap, Target, Shield, Activity, ScanLine, LockKeyhole, Timer, Clock, Gauge, BadgeCheck, Volume2, VolumeX, ShieldAlert, RefreshCw } from "lucide-react";
import { consensusSignal, formatPrice, formatBDTime, isBangladeshWeekend, type Signal, type ScanPhase, type PairKind, type PairSource } from "@/lib/signals";
import { fetchKlines, fetchLastClose } from "@/lib/market.functions";
import { buildBanglaResultScript, buildBanglaSignalScript, primeBanglaVoices, speakBangla, stopSpeaking } from "@/lib/speech";

// Accuracy Drop Shelter — preferred floor for high-accuracy mode.
const SHELTER_MIN_CONFIDENCE = 86;
const SHELTER_MIN_BOOSTER = 82;
const SHELTER_MIN_QUALITY: Array<Signal["quality"]> = ["A+", "A"];
const SHELTER_MAX_RETRIES = 6;
// Absolute floor — below this we still won't issue, but above it we always release best.
const ABSOLUTE_MIN_CONFIDENCE = 78;

type SignalRecord = Signal & { isMtg: boolean };

export function SignalPanel({ symbol, label, digits, kind, source }: { symbol: string; label: string; digits: number; kind: PairKind; source: PairSource }) {
  const [signal, setSignal] = useState<SignalRecord | null>(null);
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [entryLeft, setEntryLeft] = useState<number>(0);
  const [locked, setLocked] = useState(() => kind === "forex" && isBangladeshWeekend());
  const [shelterTries, setShelterTries] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [mtgPending, setMtgPending] = useState(false);
  const [lastResult, setLastResult] = useState<null | { win: boolean; isMtg: boolean }>(null);

  const fetchK = useServerFn(fetchKlines);
  const fetchClose = useServerFn(fetchLastClose);
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  // Continuous Live Analyzer — keeps a freshly-computed consensus signal warm
  // in the background so manual scans return instantly with the best setup.
  const liveRef = useRef<{ s: Signal; ts: number } | null>(null);

  useEffect(() => { primeBanglaVoices(); }, []);

  // Continuous background analyzer — Deriv WS → consensus engine every 7s.
  useEffect(() => {
    if (locked) { liveRef.current = null; return; }
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      try {
        const k = await fetchK({ data: { symbol, source } });
        if (k.length && mounted) {
          const s = consensusSignal(k);
          liveRef.current = { s, ts: Date.now() };
        }
      } catch {}
      if (mounted) timer = setTimeout(loop, 7000);
    };
    loop();
    return () => { mounted = false; if (timer) clearTimeout(timer); liveRef.current = null; };
  }, [symbol, source, locked, fetchK]);

  useEffect(() => {
    setSignal(null);
    setError(null);
    setMtgPending(false);
    setLastResult(null);
    setShelterTries(0);
    stopSpeaking();
    const forexLocked = kind === "forex" && isBangladeshWeekend();
    setLocked(forexLocked);
    setPhase(forexLocked ? "locked" : "idle");
  }, [symbol, kind]);

  useEffect(() => {
    const tick = () => setCountdown(60 - new Date().getSeconds());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Settle signal at expiry — evaluate win/loss for MTG.
  useEffect(() => {
    if (!signal) return;
    const id = setInterval(() => {
      const left = Math.max(0, signal.expiresAt - Date.now());
      setEntryLeft(left);
      if (left <= 0) {
        clearInterval(id);
        void settleSignal(signal);
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  useEffect(() => {
    if (kind !== "forex") {
      setLocked(false);
      if (phase === "locked") setPhase("idle");
      return;
    }
    const syncLock = () => {
      const next = isBangladeshWeekend();
      setLocked(next);
      if (next) {
        setSignal(null);
        setPhase("locked");
        stopSpeaking();
      } else if (phase === "locked") {
        setPhase("idle");
      }
    };
    syncLock();
    const id = setInterval(syncLock, 30000);
    return () => clearInterval(id);
  }, [phase, kind]);

  async function settleSignal(s: SignalRecord) {
    try {
      // Pro-grade win/loss detection — take multiple price samples across a 1.2s window
      // and use the most recent stable price. This avoids misreading transient floating
      // ticks at expiry and matches real broker candle-close behavior.
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const r = await fetchClose({ data: { symbol, source } });
          if (Number.isFinite(r.price) && r.price > 0) samples.push(r.price);
        } catch {}
        if (i < 2) await new Promise((r) => setTimeout(r, 400));
      }
      if (!samples.length) throw new Error("no close samples");
      const closePrice = samples[samples.length - 1];
      const delta = closePrice - s.price;
      // Pip-sized neutral zone — avoid scoring a doji as either side.
      const neutralBand = Math.max(Math.abs(s.target - s.price) * 0.05, s.price * 0.000005);
      let win: boolean;
      if (Math.abs(delta) <= neutralBand) {
        // Treat near-flat candles as a hold — favor signal direction only if average drift agrees.
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const avgDelta = avg - s.price;
        win = s.direction === "BUY" ? avgDelta >= 0 : avgDelta <= 0;
      } else {
        win = s.direction === "BUY" ? delta > 0 : delta < 0;
      }
      setLastResult({ win, isMtg: s.isMtg });
      if (voiceRef.current) speakBangla(buildBanglaResultScript(win, s.isMtg));
      if (!win && !s.isMtg) {
        // 1-step MTG: auto re-scan immediately, mark next signal as MTG.
        setMtgPending(true);
        setSignal(null);
        setPhase("idle");
        const currentSymbol = symbol;
        setTimeout(() => {
          // Guard: user may have switched pair while we waited.
          if (currentSymbol === symbol) void scan(true);
        }, 1200);
      } else {
        setSignal(null);
        setPhase("idle");
      }
    } catch {
      setSignal(null);
      setPhase("idle");
    }
  }

  const scan = async (asMtg = false) => {
    if (kind === "forex" && isBangladeshWeekend()) {
      setSignal(null); setError(null); setPhase("locked"); setLocked(true); return;
    }
    setPhase("scanning");
    setError(null);
    setLastResult(null);
    if (!asMtg) setMtgPending(false);
    try {
      let attempts = 0;
      let best: Signal | null = null;
      const scoreOf = (n: Signal) => {
        const qB = n.quality === "A+" ? 10 : n.quality === "A" ? 5 : 0;
        const tB = n.tradeable ? 15 : 0;
        return n.confidence * 0.55 + n.booster * 0.35 + qB + tB;
      };
      // Merged pipeline: Live Analyzer warm cache → Consensus engine → Booster → Shelter.
      // Fast path: if the background analyzer already has a fresh tradeable signal, use it.
      const warm = liveRef.current;
      if (
        warm &&
        Date.now() - warm.ts < 5500 &&
        warm.s.tradeable &&
        warm.s.confidence >= SHELTER_MIN_CONFIDENCE &&
        warm.s.booster >= SHELTER_MIN_BOOSTER &&
        SHELTER_MIN_QUALITY.includes(warm.s.quality)
      ) {
        best = warm.s;
      }
      while (!best || !best.tradeable) {
        if (attempts > SHELTER_MAX_RETRIES) break;
        const k = await fetchK({ data: { symbol, source } });
        if (!k.length) throw new Error("Live market feed unavailable");
        const next = consensusSignal(k);
        if (!best || scoreOf(next) > scoreOf(best)) best = next;
        if (
          next.tradeable &&
          next.confidence >= SHELTER_MIN_CONFIDENCE &&
          next.booster >= SHELTER_MIN_BOOSTER &&
          SHELTER_MIN_QUALITY.includes(next.quality)
        ) {
          best = next;
          break;
        }
        attempts += 1;
        setShelterTries(attempts);
        await new Promise((r) => setTimeout(r, 450));
      }
      // Always release the best available candidate as long as it clears the absolute floor.
      if (!best || best.confidence < ABSOLUTE_MIN_CONFIDENCE) {
        throw new Error("Live feed too thin to score a setup — try again in a moment.");
      }
      const record: SignalRecord = { ...best, isMtg: asMtg };
      setSignal(record);
      setEntryLeft(Math.max(0, record.expiresAt - Date.now()));
      setPhase("ready");
      setShelterTries(0);
      if (voiceRef.current) {
        speakBangla(
          buildBanglaSignalScript({
            pairLabel: label,
            direction: record.direction,
            confidence: record.confidence,
            quality: record.quality,
            session: record.session,
            isMtg: asMtg,
          }),
        );
      }
    } catch (e) {
      setSignal(null);
      setError((e as Error).message || "Signal scan failed");
      setPhase("error");
    }
  };

  const isBuy = signal?.direction === "BUY";
  const dirColor = isBuy ? "text-bull" : signal?.direction === "SELL" ? "text-bear" : "text-laser";
  const dirShadow = isBuy ? "shadow-bull" : signal?.direction === "SELL" ? "shadow-bear" : "shadow-laser";
  const DirIcon = isBuy ? TrendingUp : signal?.direction === "SELL" ? TrendingDown : ScanLine;

  const expirySec = Math.ceil(entryLeft / 1000);
  const entrySec = signal ? Math.max(0, Math.ceil((signal.entryAt - Date.now()) / 1000)) : 0;

  const toggleVoice = () => {
    setVoiceOn((v) => {
      if (v) stopSpeaking();
      return !v;
    });
  };

  return (
    <div className="glass-strong rounded-3xl p-5 relative overflow-hidden lift">
      <div className="absolute inset-x-0 top-0 h-px shark-grad opacity-70" />
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-laser to-transparent animate-scan" />
      </div>

      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-bull animate-pulse" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Laser Signal Scanner</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <button
            onClick={toggleVoice}
            aria-label="Toggle Bangla voice"
            className="p-1.5 rounded-lg glass hover:text-laser transition-colors"
            title={voiceOn ? "Bangla voice on" : "Bangla voice off"}
          >
            {voiceOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          <div className="inline-flex items-center gap-1.5">
            <Activity className="w-3 h-3" />
            Next bar <span className="text-foreground font-mono w-5 text-right">{countdown}s</span>
          </div>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => scan(false)}
        disabled={phase === "scanning" || locked}
        className={`relative w-full mb-3 rounded-2xl shark-grad px-4 py-3.5 text-sm font-black uppercase tracking-[0.28em] text-primary-foreground shadow-laser disabled:cursor-not-allowed disabled:opacity-50 overflow-hidden`}
      >
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-laser-sweep pointer-events-none" />
        <span className="relative inline-flex items-center justify-center gap-2">
          {locked ? <LockKeyhole className="w-4 h-4" /> : <ScanLine className="w-4 h-4" />}
          {locked ? "Weekend Locked" : phase === "scanning" ? "Laser Scanning…" : mtgPending ? "Run MTG Scan" : "Run Signal Scan"}
        </span>
      </motion.button>

      {/* Accuracy Drop Shelter banner */}
      {phase === "scanning" && shelterTries > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-laser/90 mb-2 px-2">
          <ShieldAlert className="w-3.5 h-3.5" />
          Accuracy Shelter active — re-scanning ({shelterTries}/{SHELTER_MAX_RETRIES})…
        </div>
      )}

      {/* MTG pending banner */}
      {mtgPending && phase !== "scanning" && !signal && (
        <div className="flex items-center gap-2 text-[11px] text-neutral mb-2 px-2">
          <RefreshCw className="w-3.5 h-3.5" />
          MTG step armed — next scan will be a Martingale recovery.
        </div>
      )}

      {/* Last result chip */}
      {lastResult && (
        <div className={`mb-2 px-3 py-1.5 rounded-xl glass text-xs flex items-center justify-between ${lastResult.win ? "text-bull" : "text-bear"}`}>
          <span className="uppercase tracking-widest">{lastResult.isMtg ? "MTG result" : "Last signal"}</span>
          <span className="font-bold">{lastResult.win ? "WIN" : "LOSS"}</span>
        </div>
      )}

      {phase === "scanning" && !signal && (
        <div className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
          <div className="relative">
            <Zap className="w-7 h-7 text-laser" />
            <span className="absolute inset-0 rounded-full border border-laser animate-scanner-ring" />
          </div>
          <span className="text-sm">Laser-scanning {label} multi-indicator 1m flow…</span>
        </div>
      )}

      {phase === "locked" && (
        <div className="py-8 text-center">
          <LockKeyhole className="w-7 h-7 text-laser mx-auto mb-3" />
          <div className="text-sm font-semibold text-foreground">Weekend Time Signal Engine Locked</div>
          <div className="text-xs text-muted-foreground mt-1">Reopens with live weekday forex trading.</div>
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
            key={signal.ts}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            {signal.isMtg && (
              <div className="mb-3 px-3 py-1.5 rounded-xl bg-neutral/15 text-neutral text-[11px] uppercase tracking-widest font-bold flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5" /> MTG Step 1 · Recovery Signal
              </div>
            )}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <motion.div
                  key={signal.price}
                  initial={{ scale: 1.06 }}
                  animate={{ scale: 1 }}
                  className="text-2xl font-bold font-mono"
                >{formatPrice(signal.price, digits)}</motion.div>
              </div>
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl glass ${dirColor} ${dirShadow}`}
              >
                <DirIcon className="w-5 h-5" />
                <span className="font-black tracking-wider">{signal.direction}</span>
              </motion.div>
            </div>

            {/* Entry / Expiry strip */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="glass rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  <Clock className="w-3 h-3 text-laser" /> Entry (BDT)
                </div>
                <div className="font-mono text-sm text-foreground">{formatBDTime(signal.entryAt)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{entrySec > 0 ? `Starts in ${entrySec}s` : "Live candle active"}</div>
              </div>
              <div className="glass rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  <Timer className="w-3 h-3 text-laser" /> Window closes
                </div>
                <div className={`font-mono text-sm ${expirySec <= 10 ? "text-bear" : "text-foreground"}`}>{expirySec}s</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <Metric label="BOOSTER" value={`${signal.booster}%`} tone={signal.booster >= 85 ? "bull" : "laser"} />
              <Metric label="GRADE" value={signal.quality} tone={signal.quality === "A+" ? "bull" : "laser"} />
              <Metric label="SESSION" value={signal.session.replace(" session", "").toUpperCase()} tone="laser" />
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground inline-flex items-center gap-1"><BadgeCheck className="w-3 h-3 text-laser" /> Accuracy Confidence</span>
                <span className={`font-mono font-bold ${dirColor}`}>{signal.confidence}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-secondary overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${signal.confidence}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  className="h-full shark-grad relative"
                >
                  <span className="absolute inset-0 shimmer" />
                </motion.div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
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

            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              <Metric label="RSI" value={signal.rsi.toFixed(1)} tone={signal.rsi > 70 ? "bear" : signal.rsi < 30 ? "bull" : "laser"} />
              <Metric label="MACD" value={signal.macd.toFixed(5)} tone={signal.macd > signal.macdSignal ? "bull" : "bear"} />
              <Metric label="ADX" value={signal.adx.toFixed(0)} tone={signal.adx > 25 ? "laser" : undefined} />
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <Metric label="STOCH" value={signal.stoch.toFixed(0)} tone={signal.stoch > 80 ? "bear" : signal.stoch < 20 ? "bull" : undefined} />
              <Metric label="EMA9" value={formatPrice(signal.ema9, digits)} />
              <Metric label="MOM%" value={signal.momentum.toFixed(3)} tone={signal.momentum > 0 ? "bull" : "bear"} />
            </div>

            <div className="text-xs text-muted-foreground leading-relaxed border-l-2 border-laser/60 pl-3">
              <Gauge className="inline w-3 h-3 text-laser mr-1" />
              {signal.reason}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "laser" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "laser" ? "text-laser" : "text-foreground";
  return (
    <div className="glass rounded-xl py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-xs sm:text-sm truncate px-1 ${c}`}>{value}</div>
    </div>
  );
}
