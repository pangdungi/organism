/**
 * PWA 아이콘·Android/iOS 네이티브 스플래시
 * — icon-* / apple-touch: app-icon-source.png (앱 로고 DOODLE — 스플래시와 별도)
 * — pwa-splash-*: splash-screen.svg 래스터 (iOS·Android 네이티브·in-app 스플래시)
 */
import sharp from "sharp";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const SOURCE = join(publicDir, "app-icon-source.png");
const SPLASH_SCREEN = join(publicDir, "toolbaricons/splash/splash-screen.svg");

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

/** splash-screen.svg — 흰 배경 위 contain */
async function buildSplashCanvas(width, height) {
  return sharp(SPLASH_SCREEN)
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
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
  if (!existsSync(SPLASH_SCREEN)) {
    console.error("splash screen missing:", SPLASH_SCREEN);
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
