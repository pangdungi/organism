/**
 * Vercel 빌드 시 process.env.VITE_VAPID_PUBLIC_KEY → JSON 파일로 쓴 뒤 Vite가 번들에 포함.
 * define만으로 비는 경우 대비.
 */
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const out = resolve(root, "src", "vapid-public.build.json");
const key = (process.env.VITE_VAPID_PUBLIC_KEY || "").trim().replace(/\s+/g, "");
writeFileSync(out, JSON.stringify({ publicKey: key }, null, 0) + "\n", "utf8");
console.log("[write-vapid-build-json] VITE_VAPID_PUBLIC_KEY length:", key.length);
