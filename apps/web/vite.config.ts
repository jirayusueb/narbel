import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  // the linked ndraw dist would otherwise share bare-id optimized deps with web (its clsx 1 shadowed clsx 2)
  optimizeDeps: {
    include: ["@narbel/ndraw"],
  },
  plugins: [
    varlockVitePlugin({ ssrInjectMode: "auto-load" }),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "bun",
      compressPublicAssets: { gzip: true, brotli: true },
    }),
    viteReact(),
  ],
});
