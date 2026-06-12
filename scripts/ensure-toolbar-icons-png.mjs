// public/toolbaricons 아래 .svg → 같은 이름 .png (PNG가 없거나 SVG가 더 최신일 때 생성, sharp)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ICONS_DIR = path.join(ROOT, "public", "toolbaricons");

const FORCE = process.argv.includes("--force");

/** @type {Record<string, number>} */
const SIZE_BY_DIR = {
  /** 선택 그리드 썸네일 — 2x(레티나) */
  "time-task-picker": 128,
  "menu-home": 112,
  splash: 512,
  default: 128,
};

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (ent.isFile() && ent.name.toLowerCase().endsWith(".svg")) acc.push(full);
  }
  return acc;
}

function targetSize(svgPath) {
  const rel = path.relative(ICONS_DIR, svgPath);
  const top = rel.split(path.sep)[0] || "";
  return SIZE_BY_DIR[top] ?? SIZE_BY_DIR.default;
}

/** PNG가 있어도 SVG가 더 최신이면 다시 변환 — 아이콘은 SVG 파일 교체만으로 갱신 */
function pngIsUpToDate(svgPath, pngPath) {
  if (!fs.existsSync(pngPath)) return false;
  try {
    return fs.statSync(pngPath).mtimeMs >= fs.statSync(svgPath).mtimeMs;
  } catch (_) {
    return false;
  }
}

async function svgToPng(svgPath) {
  const pngPath = svgPath.replace(/\.svg$/i, ".png");
  if (pngIsUpToDate(svgPath, pngPath) && !FORCE) return { svgPath, pngPath, skipped: true };
  const size = targetSize(svgPath);
  await sharp(svgPath, { density: 288 })
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(pngPath);
  return { svgPath, pngPath, skipped: false };
}

const svgs = walk(ICONS_DIR);
let created = 0;
let skipped = 0;
for (const svgPath of svgs) {
  const r = await svgToPng(svgPath);
  if (r.skipped) skipped += 1;
  else {
    created += 1;
    console.log("created", path.relative(ROOT, r.pngPath));
  }
}
console.log(`ensure-toolbar-icons-png: ${created} created, ${skipped} already had png`);
