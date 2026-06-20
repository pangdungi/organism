import { defineConfig } from "vite";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 개발 중 public/toolbaricons 의 .svg 교체 감지 → PNG 재변환 + 브라우저 새로고침 */
function toolbarIconsSvgWatchPlugin() {
  let timer = null;
  return {
    name: "lp-toolbar-icons-svg-watch",
    apply: "serve",
    configureServer(server) {
      const iconsDir = path.resolve(__dirname, "public", "toolbaricons");
      const runConvert = (opts = {}) => {
        const { reloadOnCreate = true } = opts;
        const scripts = [
          path.resolve(__dirname, "scripts", "ensure-toolbar-icons-png.mjs"),
          path.resolve(__dirname, "scripts", "generate-time-task-picker-icons.mjs"),
        ];
        let pending = scripts.length;
        let anyCreated = false;
        for (const script of scripts) {
          execFile(process.execPath, [script], (err, stdout) => {
            pending -= 1;
            if (err) {
              server.config.logger.error(`toolbaricons 변환 실패: ${err.message}`);
              return;
            }
            const out = String(stdout || "").trim();
            if (out.includes("created")) anyCreated = true;
            if (pending === 0 && anyCreated && reloadOnCreate) {
              server.config.logger.info(out);
              server.ws.send({ type: "full-reload" });
            }
          });
        }
      };
      runConvert({ reloadOnCreate: false });
      server.watcher.add(iconsDir);
      server.watcher.on("all", (_event, file) => {
        if (!file || !file.startsWith(iconsDir)) return;
        if (!file.toLowerCase().endsWith(".svg")) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(runConvert, 400);
      });
    },
  };
}

export default defineConfig({
  root: ".",
  plugins: [toolbarIconsSvgWatchPlugin()],
  server: {
    host: "0.0.0.0", // localhost:5173 + 같은 Wi‑Fi에서 http://(맥IP):5173
    port: 5173,
    strictPort: true,
    open: "http://localhost:5173/",
  },
});
