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
});
