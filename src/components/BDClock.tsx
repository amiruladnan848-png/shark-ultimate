import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export function BDClock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const s = d.toLocaleTimeString("en-GB", {
        timeZone: "Asia/Dhaka",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      setNow(s);
    };
    fmt();
    const id = setInterval(fmt, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-1.5 text-xs font-mono glass px-3 py-1.5 rounded-full">
      <Clock className="w-3 h-3 text-laser" />
      <span className="text-foreground">{now}</span>
      <span className="text-muted-foreground">BDT</span>
    </div>
  );
}
