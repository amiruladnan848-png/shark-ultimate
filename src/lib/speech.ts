// Professional Bangla TTS — uses browser SpeechSynthesis (bn-BD / bn-IN).
// Falls back to English voice with Bangla text if no Bangla voice exists.

let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesReady = false;

function pickBanglaVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const bn =
    voices.find((v) => /bn[-_]?BD/i.test(v.lang)) ||
    voices.find((v) => /bn[-_]?IN/i.test(v.lang)) ||
    voices.find((v) => /^bn/i.test(v.lang)) ||
    voices.find((v) => /bangla|bengali/i.test(v.name));
  return bn ?? voices[0] ?? null;
}

export function primeBanglaVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (voicesReady) return;
  const tryLoad = () => {
    const v = pickBanglaVoice();
    if (v) {
      cachedVoice = v;
      voicesReady = true;
    }
  };
  tryLoad();
  window.speechSynthesis.onvoiceschanged = () => tryLoad();
}

export function speakBangla(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    // Chunk long text — long single utterances get cut off by some browsers.
    const chunks = text.match(/[^।.!?]+[।.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
    const v = cachedVoice ?? pickBanglaVoice();
    for (const chunk of chunks) {
      const utter = new SpeechSynthesisUtterance(chunk);
      if (v) { utter.voice = v; utter.lang = v.lang; }
      else { utter.lang = "bn-BD"; }
      utter.rate = 0.96;
      utter.pitch = 1.06;
      utter.volume = 1;
      window.speechSynthesis.speak(utter);
    }
  } catch {}
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); } catch {}
}

const PAIR_BN: Record<string, string> = {
  "EUR / USD": "ইউরো ডলার",
  "GBP / USD": "পাউন্ড ডলার",
  "USD / JPY": "ডলার ইয়েন",
  "USD / CHF": "ডলার সুইস ফ্রাঁ",
  "AUD / USD": "অস্ট্রেলিয়ান ডলার",
  "USD / CAD": "ডলার ক্যানাডিয়ান",
  "NZD / USD": "নিউজিল্যান্ড ডলার",
  "EUR / JPY": "ইউরো ইয়েন",
  "GBP / JPY": "পাউন্ড ইয়েন",
  "BTC / USDT": "বিটকয়েন ইউ এস ডি টি",
  "ETH / USDT": "ইথেরিয়াম ইউ এস ডি টি",
  "BNB / USDT": "বি এন বি ইউ এস ডি টি",
  "SOL / USDT": "সোলানা ইউ এস ডি টি",
  "XRP / USDT": "এক্স আর পি ইউ এস ডি টি",
  "ADA / USDT": "এ ডি এ ইউ এস ডি টি",
  "DOGE / USDT": "ডজ কয়েন ইউ এস ডি টি",
  "AVAX / USDT": "অ্যাভ্যাক্স ইউ এস ডি টি",
};

function pairBn(label: string) {
  return PAIR_BN[label] ?? label.replace(" / ", " ");
}

export function buildBanglaSignalScript(opts: {
  pairLabel: string;
  direction: "BUY" | "SELL";
  confidence: number;
  quality: string;
  session?: string;
  isMtg?: boolean;
}) {
  const dir = opts.direction === "BUY" ? "বাই" : "সেল";
  const pair = pairBn(opts.pairLabel);
  const mtg = opts.isMtg ? "এম টি জি প্রথম ধাপ। " : "প্রফেশনাল মার্কেট স্ক্যান সম্পন্ন। ";
  const quality = opts.quality === "A+" ? "এ প্লাস" : opts.quality === "A" ? "এ" : "বি";
  const session = opts.session ? ` ${opts.session.replace(" session", "")} মার্কেট ডিটেক্টেড।` : "";
  return `${mtg}${pair} এর জন্য ${dir} সিগন্যাল।${session} কনফিডেন্স ${opts.confidence} শতাংশ। গ্রেড ${quality}। এক মিনিট এন্ট্রির জন্য প্রস্তুত হন।`;
}

export function buildBanglaResultScript(win: boolean, isMtg: boolean) {
  if (win) return isMtg ? "এম টি জি জয়। অভিনন্দন।" : "সিগন্যাল জয়। চমৎকার।";
  return isMtg ? "এম টি জি লস। সতর্ক থাকুন।" : "সিগন্যাল লস। এম টি জি প্রস্তুত হচ্ছে।";
}
