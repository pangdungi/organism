import { defineConfig, loadEnv } from "vite";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function readVapidFromBuildJson(cwd) {
  const p = resolve(cwd, "src", "vapid-public.build.json");
  if (!existsSync(p)) return "";
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return String(j.publicKey || "").trim();
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => {
  const cwd = process.cwd();
  const fileEnv = loadEnv(mode, cwd, "");
  /** Vercel 등 CI는 process.env에 넣고, 로컬은 .env — 둘 다 빌드 시 번들에 고정 */
  const vapidPublic = (
    process.env.VITE_VAPID_PUBLIC_KEY ||
    fileEnv.VITE_VAPID_PUBLIC_KEY ||
    ""
  ).trim();
  const vapidForHtml = vapidPublic || readVapidFromBuildJson(cwd);

  return {
    root: ".",
    plugins: [
      {
        name: "inject-vapid-html",
        transformIndexHtml(html) {
          if (!vapidForHtml) return html;
          const esc = vapidForHtml.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
          const scriptTag = `<script>window.__LP_VAPID_HTML__=${JSON.stringify(vapidForHtml)};<\/script>`;
          const metaTag = `<meta name="lp-vapid-public-key" content="${esc}" />`;
          return html.replace("<head>", `<head>\n    ${scriptTag}\n    ${metaTag}`);
        },
      },
    ],
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
