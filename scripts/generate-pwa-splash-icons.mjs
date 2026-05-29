/**
 * PWA manifest 아이콘 — 통일 스플래시(물결 패턴 + 마스코트)와 동일 톤
 * Android/iOS 홈 화면 실행 시 OS 네이티브 스플래시에도 반영됨
 */
import sharp from "sharp";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");

const PATTERN = join(publicDir, "toolbaricons/splash/splash-pattern-wave.png");
const MASCOT = join(publicDir, "toolbaricons/splash/splash-mascot.png");

const SIZES = [512, 192];

async function buildTiledPattern(size, tilePx) {
  const tile = await sharp(PATTERN).resize(tilePx, tilePx).ensureAlpha().toBuffer();
  const composites = [];
  for (let y = 0; y < size; y += tilePx) {
    for (let x = 0; x < size; x += tilePx) {
      composites.push({ input: tile, left: x, top: y });
    }
  }
  const tiled = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return sharp(tiled).ensureAlpha().linear([1, 1, 1, 0.38], [0, 0, 0, 0]).png().toBuffer();
}

async function buildSplashIcon(size) {
  const tilePx = Math.max(12, Math.round((48 * size) / 512));
  const patternLayer = await buildTiledPattern(size, tilePx);
  const mascotPx = Math.round(size * 0.52);

  const mascot = await sharp(MASCOT)
    .resize(mascotPx, mascotPx, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const outPath = join(publicDir, `icon-${size}.png`);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: patternLayer, left: 0, top: 0 },
      {
        input: mascot,
        left: Math.round((size - mascotPx) / 2),
        top: Math.round((size - mascotPx) / 2),
      },
    ])
    .png()
    .toFile(outPath);

  console.log("wrote", outPath);
}

async function main() {
  if (!existsSync(PATTERN) || !existsSync(MASCOT)) {
    console.error("splash assets missing:", PATTERN, MASCOT);
    process.exit(1);
  }
  for (const size of SIZES) {
    await buildSplashIcon(size);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
