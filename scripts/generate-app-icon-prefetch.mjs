#!/usr/bin/env node
/** public/ 아래 PNG·SVG 아이콘 목록 → app-icon-prefetch.json (PWA·앱 기동 prefetch용) */
import { readdirSync, statSync, writeFileSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (/\.(png|svg)$/i.test(name)) {
      out.push("/" + relative(ROOT, full).split("\\").join("/"));
    }
  }
  return out;
}

const paths = walk(ROOT).sort();
writeFileSync(
  join(ROOT, "app-icon-prefetch.json"),
  `${JSON.stringify(paths, null, 2)}\n`,
);
console.log(`app-icon-prefetch.json: ${paths.length} paths`);
