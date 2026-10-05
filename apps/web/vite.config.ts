import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: { maximumFileSizeToCacheInBytes: 12 * 1024 * 1024 },
      manifest: {
        name: "OpenRiskSim",
        short_name: "OpenRiskSim",
        description: "Monte Carlo risk simulation, forecasting and optimization for spreadsheets",
        theme_color: "#1f3864",
        background_color: "#ffffff",
        display: "standalone",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    }),
  ],
  worker: { format: "es" },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // keep big third-party libraries in their own long-term-cacheable chunks
        manualChunks(id) {
          if (id.includes("node_modules/echarts") || id.includes("node_modules/zrender")) return "echarts";
          if (id.includes("node_modules/hyperformula")) return "hyperformula";
          if (id.includes("node_modules/exceljs")) return "exceljs";
          return undefined;
        },
      },
    },
  },
});
