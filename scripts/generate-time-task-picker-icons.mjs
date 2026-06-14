#!/usr/bin/env node
/** public/toolbaricons/time-task-picker/*.png(우선)·*.svg → icons.json + icon-files.json */
import { readdirSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public", "toolbaricons", "time-task-picker");
const OUT_ICONS = join(ROOT, "public", "time-task-picker-icons.json");
const OUT_FILES = join(ROOT, "public", "time-task-picker-icon-files.json");

const files = readdirSync(DIR);
const names = new Set();
for (const n of files) {
  const m = n.match(/^(.+)\.(png|svg)$/i);
  if (!m) continue;
  const base = m[1];
  const ext = m[2].toLowerCase();
  if (ext === "png") names.add(base);
}
const namesLower = new Set([...names].map((x) => x.toLowerCase()));
for (const n of files) {
  const m = n.match(/^(.+)\.svg$/i);
  if (!m) continue;
  const base = m[1];
  if (names.has(base) || namesLower.has(base.toLowerCase())) continue;
  try {
    if (statSync(join(DIR, n)).size < 8) continue;
  } catch (_) {
    continue;
  }
  names.add(base);
}
const list = [...names].sort((a, b) => a.localeCompare(b, "en"));

/** slug 조회용 — canonical 파일명 + 소문자 별칭 */
const fileMap = {};
for (const base of list) {
  fileMap[base] = base;
  const lower = base.toLowerCase();
  if (lower !== base) fileMap[lower] = base;
}

writeFileSync(OUT_ICONS, `${JSON.stringify(list, null, 2)}\n`);
writeFileSync(OUT_FILES, `${JSON.stringify(fileMap, null, 2)}\n`);
console.log(`time-task-picker-icons.json: ${list.length} icons`);
console.log(`time-task-picker-icon-files.json: ${Object.keys(fileMap).length} keys`);
