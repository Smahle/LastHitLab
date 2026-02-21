import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: true,
    qrcode: false,
  },
  build: {
    outDir: "dist",
  },
});
