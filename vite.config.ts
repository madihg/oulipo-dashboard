import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Hmart Kanban",
        short_name: "Hmart",
        description: "Personal task manager augmented by Claude.",
        theme_color: "#171717",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/today",
        scope: "/",
        icons: [
          { src: "/pwa-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/pwa-512.svg", sizes: "512x512", type: "image/svg+xml" },
          {
            src: "/pwa-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the app shell; runtime caching for API + assets.
        runtimeCaching: [
          {
            // BG-sync POSTs to /functions/v1/route_capture so offline captures
            // retry when the device comes back online. Workbox sends them via
            // the Background Sync API; durable for ~24h queue lifetime.
            urlPattern: /\/functions\/v1\/route_capture$/i,
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: {
                name: "route-capture-queue",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            // Same treatment for direct PostgREST captures inserts.
            urlPattern: /\/rest\/v1\/captures(\?.*)?$/i,
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: {
                name: "captures-insert-queue",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            urlPattern: /\.(?:js|css|woff2?|ttf|png|jpg|svg)$/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "asset-cache" },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
