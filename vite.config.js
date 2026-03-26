import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  /** Vercel 등 CI는 process.env에 넣고, 로컬은 .env — 둘 다 빌드 시 번들에 고정 */
  const vapidPublic = (
    process.env.VITE_VAPID_PUBLIC_KEY ||
    fileEnv.VITE_VAPID_PUBLIC_KEY ||
    ""
  ).trim();

  return {
    root: ".",
    define: {
      __LP_VAPID_PUBLIC_KEY__: JSON.stringify(vapidPublic),
    },
    server: {
      host: "0.0.0.0", // 데스크탑: localhost:5173 / 모바일: 같은 Wi-Fi에서 http://(맥IP):5173
      port: 5173,
      strictPort: false,
    },
  };
});
