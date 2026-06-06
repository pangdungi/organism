#!/usr/bin/env node
/** 외부 PNG/SVG → time-task-picker 128×128 PNG (+ SVG 원본 있으면 복사) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "toolbaricons", "time-task-picker");
const SIZE = 128;

/** @type {{ slug: string, fileBase: string, src: string }[]} */
const IMPORTS = [
  {
    slug: "art",
    fileBase: "art",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/art-ef848ada-5e61-4674-b8f2-d5c7f1b2538c.png",
  },
  {
    slug: "cloud",
    fileBase: "cloud",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/cloud-fa77b918-8694-4da4-a97f-80edd400e34e.png",
  },
  {
    slug: "bts",
    fileBase: "bts",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/bts-42a911ba-8c25-4ca5-9df8-03b35b15706c.png",
  },
  {
    slug: "happycloud",
    fileBase: "happycloud",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/happycloud-a1a513fa-098a-4135-a592-dce3c69ed8b7.png",
  },
  {
    slug: "hotcake",
    fileBase: "hotcake",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/hotcake-b2e8d20f-fd60-4eef-831f-8c525d9819b2.png",
  },
  {
    slug: "flower-smile",
    fileBase: "flower-smile",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/flower_smile-66e10519-36f7-4870-b4f5-23214f0527fb.png",
  },
  {
    slug: "earth",
    fileBase: "earth",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/earth-84b60076-ddb4-4f1c-99ec-fcc2ae128b67.png",
  },
  {
    slug: "space",
    fileBase: "space",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/space-2db8deb4-bfa0-49d3-8bd7-ff0bf9ee43cb.png",
  },
  {
    slug: "panda",
    fileBase: "panda",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/panda-8e5f9048-3d24-47d6-b950-6063f45d65a6.png",
  },
  {
    slug: "rainbow",
    fileBase: "rainbow",
    src: "/Users/yoonhhyejin/.cursor/projects/Users-yoonhhyejin-2/assets/rainbow-7073a6da-1ebd-4998-a89d-f13117fe59c6.png",
  },
];

async function toPickerPng(src, outPng) {
  await sharp(src)
    .resize(SIZE, SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outPng);
}

for (const { slug, fileBase, src } of IMPORTS) {
  if (!fs.existsSync(src)) {
    console.error("missing", src);
    process.exitCode = 1;
    continue;
  }
  const pngPath = path.join(OUT_DIR, `${fileBase}.png`);
  await toPickerPng(src, pngPath);
  console.log("imported", slug, "→", path.relative(ROOT, pngPath));
}
