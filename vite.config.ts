// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Auto-detect the deploy target so the same repo works on Lovable (Cloudflare),
// Vercel, Netlify, and Node hosts without manual config swaps.
const isVercel = !!process.env.VERCEL;
const isNetlify = !!process.env.NETLIFY;
const isNode = process.env.NITRO_PRESET === "node-server" || process.env.BUILD_TARGET === "node";

const nitroPreset = isVercel
  ? "vercel"
  : isNetlify
    ? "netlify"
    : isNode
      ? "node-server"
      : undefined; // undefined => Lovable auto/cloudflare default

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  ...(nitroPreset
    ? { nitro: { preset: nitroPreset } }
    : {}),
});
