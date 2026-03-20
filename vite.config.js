import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    host: true, // 폰에서 http://맥IP:5173 으로 접속 가능
    port: 5173,
  },
});
