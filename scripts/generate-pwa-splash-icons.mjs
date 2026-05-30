/**
 * PWA 홈 화면 / iOS apple-touch 아이콘
 * — 원본: public/app-icon-source.png (앱 로고, 사용자 제공)
 * — 스플래시(물범+물결)와 분리 — in-app 로딩만 splash-mascot 사용
 */
import sharp from "sharp";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const SOURCE = join(publicDir, "app-icon-source.png");

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

  await writeIcon("icon-512.png", await buildAnyIcon(512));
  await writeIcon("icon-192.png", await buildAnyIcon(192));
  await writeIcon("apple-touch-icon.png", await buildAnyIcon(180));
  await writeIcon("icon-maskable-512.png", await buildMaskableIcon(512));
  await writeIcon("icon-maskable-192.png", await buildMaskableIcon(192));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
