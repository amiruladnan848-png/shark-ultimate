import { motion } from "framer-motion";
import { PAIRS } from "@/lib/signals";

export function PairSelector({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {PAIRS.map((p) => {
        const active = p.symbol === value;
        return (
          <motion.button
            key={p.symbol}
            whileTap={{ scale: 0.94 }}
            onClick={() => onChange(p.symbol)}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
              active
                ? "shark-grad text-background border-transparent shadow-[0_0_20px_oklch(0.78_0.18_190/0.4)]"
                : "glass border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </motion.button>
        );
      })}
    </div>
  );
}
