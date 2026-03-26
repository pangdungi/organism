/**
 * 빌드 시 env → vapid-public.build.json → Vite 번들.
 * env가 비면 저장소에 커밋된 JSON의 publicKey를 그대로 둠(Vercel에 변수가 안 넘을 때 대비).
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const out = resolve(root, "src", "vapid-public.build.json");

const fromEnv = (
  process.env.VITE_VAPID_PUBLIC_KEY ||
  process.env.VAPID_PUBLIC_KEY ||
  ""
)
  .trim()
  .replace(/\s+/g, "");

let fromFile = "";
if (existsSync(out)) {
  try {
    const j = JSON.parse(readFileSync(out, "utf8"));
    fromFile = String(j.publicKey || "")
      .trim()
      .replace(/\s+/g, "");
  } catch {
    /* ignore */
  }
}

const key = fromEnv || fromFile;
writeFileSync(out, JSON.stringify({ publicKey: key }, null, 0) + "\n", "utf8");
const src = fromEnv ? "env" : fromFile ? "vapid-public.build.json" : "none";
console.log("[write-vapid-build-json] publicKey length:", key.length, "source:", src);
