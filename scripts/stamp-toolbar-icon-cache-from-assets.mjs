/**
 * 배포 빌드 전용 — 피커 PNG/SVG 내용으로 목록 주소·저장 칸을 맞춘다.
 * 같은 이름 그림을 바꿔 푸시하면 예전 캐시가 새 그림을 가리지 않게 한다.
 * 로컬 gen:icons 에서는 실행하지 않음.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PICKER_DIR = path.join(
  ROOT,
  "public",
  "toolbaricons",
  "time-task-picker",
);
const URL_JS = path.join(ROOT, "src", "utils", "toolbarIconUrl.js");
const SW_JS = path.join(ROOT, "public", "sw.js");

function hashPickerIcons() {
  const names = fs
    .readdirSync(PICKER_DIR)
    .filter((n) => /\.(png|svg)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, "en"));
  if (!names.length) {
    throw new Error("no picker icons to hash");
  }
  const h = crypto.createHash("sha256");
  for (const name of names) {
    h.update(name);
    h.update("\0");
    h.update(fs.readFileSync(path.join(PICKER_DIR, name)));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 10);
}

const stamp = hashPickerIcons();

let urlSrc = fs.readFileSync(URL_JS, "utf8");
if (!/export const TOOLBAR_ICON_CACHE_VERSION = "[^"]+";/.test(urlSrc)) {
  throw new Error("TOOLBAR_ICON_CACHE_VERSION not found");
}
if (!/export const SW_ASSET_CACHE = "tip-assets-[^"]+";/.test(urlSrc)) {
  throw new Error("SW_ASSET_CACHE not found");
}
urlSrc = urlSrc
  .replace(
    /export const TOOLBAR_ICON_CACHE_VERSION = "[^"]+";/,
    `export const TOOLBAR_ICON_CACHE_VERSION = "${stamp}";`,
  )
  .replace(
    /export const SW_ASSET_CACHE = "tip-assets-[^"]+";/,
    `export const SW_ASSET_CACHE = "tip-assets-${stamp}";`,
  );
fs.writeFileSync(URL_JS, urlSrc);

let swSrc = fs.readFileSync(SW_JS, "utf8");
if (!/const ASSET_CACHE = "tip-assets-[^"]+";/.test(swSrc)) {
  throw new Error("sw.js ASSET_CACHE not found");
}
swSrc = swSrc.replace(
  /const ASSET_CACHE = "tip-assets-[^"]+";/,
  `const ASSET_CACHE = "tip-assets-${stamp}";`,
);
fs.writeFileSync(SW_JS, swSrc);

console.log(`stamp-toolbar-icon-cache-from-assets: ${stamp}`);
