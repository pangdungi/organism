#!/usr/bin/env node
/** public/toolbaricons/time-task-picker/*.png(우선)·*.svg → time-task-picker-icons.json */
import { readdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public", "toolbaricons", "time-task-picker");
const OUT = join(ROOT, "public", "time-task-picker-icons.json");

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
  names.add(base);
}
const list = [...names].sort((a, b) => a.localeCompare(b, "en"));

writeFileSync(OUT, `${JSON.stringify(list, null, 2)}\n`);
console.log(`time-task-picker-icons.json: ${list.length} icons`);
