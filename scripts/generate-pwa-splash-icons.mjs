/**
 * PWA 아이콘·Android/iOS 네이티브 스플래시
 * — icon-* / apple-touch: app-icon-source.png (홈·검색용 수달 로고)
 * — pwa-splash-512: 물결 패턴 + splash-mascot (Chrome Android 설치 후 첫 화면)
 * — pwa-splash-portrait-*: iOS apple-touch-startup-image (전체 화면)
 * — in-app #app-splash: 동일 에셋을 HTML/CSS로 표시
 */
import sharp from "sharp";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const SOURCE = join(publicDir, "app-icon-source.png");
const WAVE = join(publicDir, "toolbaricons/splash/splash-pattern-wave.png");
const MASCOT = join(publicDir, "toolbaricons/splash/splash-mascot.png");

const WAVE_TILE_PX = 48;
const WAVE_OPACITY = 0.38;

/** @type {{ filename: string, width: number, height: number }[]} */
const PORTRAIT_SPLASHES = [
  { filename: "pwa-splash-portrait-1179.png", width: 1179, height: 2556 },
  { filename: "pwa-splash-portrait-1284.png", width: 1284, height: 2778 },
  { filename: "pwa-splash-portrait-1170.png", width: 1170, height: 2532 },
  { filename: "pwa-splash-portrait-1080.png", width: 1080, height: 1920 },
];

async function buildAnyIcon(size) {
  return sharp(SOURCE)
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();
}

async function buildMaskableIcon(size) {
  const inner = Math.round(size * 0.72);
  const logo = await sharp(SOURCE)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: logo,
        left: Math.round((size - inner) / 2),
        top: Math.round((size - inner) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/** 물결 타일 + 중앙 마스코트 — 임의 크기 전체 화면 스플래시 */
async function buildSplashCanvas(width, height) {
  const tile = await sharp(WAVE)
    .resize(WAVE_TILE_PX, WAVE_TILE_PX, { fit: "cover" })
    .ensureAlpha()
    .png()
    .toBuffer();

  const waveComposites = [];
  for (let y = 0; y < height; y += WAVE_TILE_PX) {
    for (let x = 0; x < width; x += WAVE_TILE_PX) {
      waveComposites.push({
        input: tile,
        left: x,
        top: y,
        blend: "over",
        opacity: WAVE_OPACITY,
      });
    }
  }

  const shortSide = Math.min(width, height);
  const mascotHeight = Math.round(shortSide * (height > width ? 0.22 : 0.36));
  const mascot = await sharp(MASCOT)
    .resize({
      height: mascotHeight,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const mascotMeta = await sharp(mascot).metadata();
  const mascotW = mascotMeta.width || mascotHeight;
  const mascotH = mascotMeta.height || mascotHeight;

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      ...waveComposites,
      {
        input: mascot,
        left: Math.round((width - mascotW) / 2),
        top: Math.round((height - mascotH) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function buildPwaSplash512(size = 512) {
  return buildSplashCanvas(size, size);
}

async function writeIcon(filename, buffer) {
  const outPath = join(publicDir, filename);
  await sharp(buffer).png().toFile(outPath);
  console.log("wrote", outPath);
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error("app icon source missing:", SOURCE);
    process.exit(1);
  }
  if (!existsSync(WAVE) || !existsSync(MASCOT)) {
    console.error("splash assets missing:", WAVE, MASCOT);
    process.exit(1);
  }

  await writeIcon("icon-512.png", await buildAnyIcon(512));
  await writeIcon("icon-192.png", await buildAnyIcon(192));
  await writeIcon("apple-touch-icon.png", await buildAnyIcon(180));
  await writeIcon("icon-maskable-512.png", await buildMaskableIcon(512));
  await writeIcon("icon-maskable-192.png", await buildMaskableIcon(192));
  await writeIcon("pwa-splash-512.png", await buildPwaSplash512(512));

  for (const { filename, width, height } of PORTRAIT_SPLASHES) {
    await writeIcon(filename, await buildSplashCanvas(width, height));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
