import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["fonts/NotoSans-Regular.ttf", "fonts/NotoSans-Bold.ttf", "icon.svg"],
      manifest: {
        name: "PDF Çevirmen",
        short_name: "PDFÇevir",
        description:
          "Ücretsiz, sınırsız, kurulumsuz PDF çevirisi — dosyanız bilgisayarınızdan çıkmaz.",
        lang: "tr",
        display: "standalone",
        theme_color: "#2563eb",
        background_color: "#f7f7fb",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ttf,svg,png,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "tesseract-cdn", expiration: { maxEntries: 40 } },
          },
          {
            urlPattern: /^https:\/\/tessdata\.projectnaptha\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "tessdata", expiration: { maxEntries: 12 } },
          },
          {
            urlPattern:
              /^https:\/\/(translate\.googleapis\.com|generativelanguage\.googleapis\.com|lingva\.ml|translate\.plausibility\.cloud)\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
});
