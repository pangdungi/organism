import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    host: "0.0.0.0", // localhost:5173 + 같은 Wi‑Fi에서 http://(맥IP):5173
    port: 5173,
    strictPort: false,
    open: "http://localhost:5173/",
  },
});
