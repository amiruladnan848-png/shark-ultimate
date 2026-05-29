import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Delete, ShieldCheck } from "lucide-react";

const PIN = "090909";
const KEY = "shark-ultimate-unlocked";

export function PinLock({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(KEY) === "1") setUnlocked(true);
  }, []);

  useEffect(() => {
    if (pin.length === 6) {
      if (pin === PIN) {
        sessionStorage.setItem(KEY, "1");
        setUnlocked(true);
      } else {
        setError(true);
        setTimeout(() => { setPin(""); setError(false); }, 600);
      }
    }
  }, [pin]);

  const press = (n: string) => pin.length < 6 && setPin(pin + n);
  const back = () => setPin(pin.slice(0, -1));

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="glass rounded-3xl p-8 w-full max-w-sm relative overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-0 h-px shark-grad animate-scan" />
        </div>
        <div className="flex flex-col items-center gap-3 mb-6">
          <motion.div
            animate={{ rotate: [0, -8, 8, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="w-16 h-16 rounded-2xl shark-grad flex items-center justify-center animate-pulse-glow"
          >
            <Lock className="w-8 h-8 text-background" />
          </motion.div>
          <h1 className="text-2xl font-bold shark-text">Shark-Ultimate</h1>
          <p className="text-xs text-muted-foreground">Enter 6-digit access PIN</p>
        </div>

        <motion.div
          animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
          className="flex justify-center gap-2 mb-6"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all ${
                error ? "bg-destructive" : pin.length > i ? "shark-grad scale-110" : "bg-secondary"
              }`}
            />
          ))}
        </motion.div>

        <div className="grid grid-cols-3 gap-3">
          {["1","2","3","4","5","6","7","8","9"].map((n) => (
            <motion.button
              key={n}
              whileTap={{ scale: 0.92 }}
              onClick={() => press(n)}
              className="aspect-square rounded-2xl glass text-2xl font-semibold hover:bg-accent/40 transition"
            >{n}</motion.button>
          ))}
          <div />
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => press("0")}
            className="aspect-square rounded-2xl glass text-2xl font-semibold hover:bg-accent/40 transition"
          >0</motion.button>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={back}
            className="aspect-square rounded-2xl glass flex items-center justify-center hover:bg-destructive/30 transition"
          ><Delete className="w-5 h-5" /></motion.button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-xs text-destructive mt-4"
            >Wrong PIN. Try again.</motion.p>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-center gap-1.5 mt-6 text-[10px] text-muted-foreground">
          <ShieldCheck className="w-3 h-3" /> Secured access
        </div>
      </motion.div>
    </div>
  );
}
