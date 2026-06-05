import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "https://exam-quest-ai.pages.dev",
        changeOrigin: true,
        secure: true
      }
    }
  }
});
