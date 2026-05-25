#!/usr/bin/env node
/** public/toolbaricons/time-task-picker/*.svg → time-task-picker-icons.json */
import { readdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public", "toolbaricons", "time-task-picker");
const OUT = join(ROOT, "public", "time-task-picker-icons.json");

const names = readdirSync(DIR)
  .filter((n) => n.toLowerCase().endsWith(".svg"))
  .map((n) => n.replace(/\.svg$/i, ""))
  .sort((a, b) => a.localeCompare(b, "en"));

writeFileSync(OUT, `${JSON.stringify(names, null, 2)}\n`);
console.log(`time-task-picker-icons.json: ${names.length} icons`);
