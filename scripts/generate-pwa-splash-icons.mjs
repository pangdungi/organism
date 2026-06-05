/**
 * PWA 아이콘·Android/iOS 네이티브 스플래시
 * — icon-* / apple-touch: app-icon-source.png (앱 로고 DOODLE — 스플래시와 별도)
 * — pwa-splash-*: splash-screen.svg 래스터 (iOS·Android 네이티브·in-app 스플래시)
 */
import sharp from "sharp";
import { existsSync, writeFileSync } from "fs";
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

/** 탭·검색용 favicon.ico (PNG-in-ICO, 16·32·48) */
function buildIcoFromPngs(entries) {
  const count = entries.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const dirs = [];
  const images = [];
  for (const { size, buffer } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0);
    dir.writeUInt8(size >= 256 ? 0 : size, 1);
    dir.writeUInt8(0, 2);
    dir.writeUInt8(0, 3);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(buffer.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += buffer.length;
    dirs.push(dir);
    images.push(buffer);
  }
  return Buffer.concat([header, ...dirs, ...images]);
}

async function writeFaviconBundle() {
  const sizes = [16, 32, 48];
  const entries = [];
  for (const size of sizes) {
    entries.push({ size, buffer: await buildAnyIcon(size) });
  }
  const icoPath = join(publicDir, "favicon.ico");
  writeFileSync(icoPath, buildIcoFromPngs(entries));
  console.log("wrote", icoPath);
  for (const size of sizes) {
    await writeIcon(`icon-${size}.png`, entries.find((e) => e.size === size).buffer);
  }
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

  await writeFaviconBundle();
  const icon512 = await buildAnyIcon(512);
  await writeIcon("icon-512.png", icon512);
  await writeIcon("og-app-icon.png", icon512);
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
