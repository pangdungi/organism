/**
 * Calendar.js: main.css에 없고 src 아래 js 에서 querySelector·closest 등으로
 * 참조되지 않는 class 토큰만 제거(표시 전용, 기능 훅 유지).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const calendarPath = path.join(root, "src/views/Calendar.js");
const mainCssPath = path.join(root, "src/main.css");

function walkJs(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJs(p, acc);
    else if (e.name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

function classesFromCss(css) {
  const set = new Set();
  for (const m of css.matchAll(/\.([a-zA-Z_-][\w-]*)/g)) set.add(m[1]);
  return set;
}

function tokensFromSelectorStr(sel) {
  const out = new Set();
  if (!sel || sel.includes("${")) return out;
  for (const m of sel.matchAll(/\.([a-zA-Z_-][\w-]*)/g)) out.add(m[1]);
  return out;
}

function collectJsRequired(sources) {
  const required = new Set();

  function eatStringArgs(argsChunk) {
    const parts = argsChunk.split(",");
    for (const p of parts) {
      const t = p.trim();
      const sm = t.match(/^([`"'])([\s\S]*?)\1$/s);
      if (sm && !sm[2].includes("${")) {
        for (const tok of sm[2].trim().split(/\s+/).filter(Boolean)) {
          required.add(tok);
        }
      }
    }
  }

  for (const file of sources) {
    const s = fs.readFileSync(file, "utf8");

    for (const m of s.matchAll(
      /\?\.\s*(?:querySelector(?:All)?|closest|matches)\s*\(\s*([`"'])([\s\S]*?)\1/g,
    )) {
      const inner = m[2];
      if (inner.includes("${")) continue;
      for (const part of inner.split(",")) {
        for (const c of tokensFromSelectorStr(part.trim())) required.add(c);
      }
    }

    for (const m of s.matchAll(
      /lpCalendarNavQ\(\s*[^,]+,\s*[^,]+,\s*([`"'])([\s\S]*?)\1\s*\)/g,
    )) {
      const inner = m[2];
      if (inner.includes("${")) continue;
      for (const c of tokensFromSelectorStr(inner.trim())) required.add(c);
    }

    for (const m of s.matchAll(
      /\.(?:querySelector(?:All)?|closest|matches)\?\.\s*\(\s*([`"'])([\s\S]*?)\1/g,
    )) {
      const inner = m[2];
      if (inner.includes("${")) continue;
      for (const part of inner.split(",")) {
        for (const c of tokensFromSelectorStr(part.trim())) required.add(c);
      }
    }

    for (const m of s.matchAll(
      /(?:querySelector(?:All)?|closest|matches)\(\s*([`"'])([\s\S]*?)\1/g,
    )) {
      const inner = m[2];
      if (inner.includes("${")) continue;
      for (const part of inner.split(",")) {
        for (const c of tokensFromSelectorStr(part.trim())) required.add(c);
      }
    }

    for (const m of s.matchAll(/getElementsByClassName\(\s*([`"'])([\s\S]*?)\1/g)) {
      const inner = m[2].trim();
      if (!inner.includes("${")) required.add(inner);
    }

    for (const m of s.matchAll(
      /classList\.contains\(\s*([`"'])([\s\S]*?)\1/g,
    )) {
      const inner = m[2].trim();
      if (!inner.includes("${")) required.add(inner);
    }

    for (const m of s.matchAll(
      /classList\.toggle\(\s*([`"'])([\s\S]*?)\1/g,
    )) {
      const inner = m[2].trim();
      if (!inner.includes("${")) required.add(inner);
    }

    for (const m of s.matchAll(/classList\.(?:add|remove)\(\s*([^)]+)\)/g)) {
      eatStringArgs(m[1]);
    }
  }

  return required;
}

function pruneClassString(str, keep) {
  const tokens = str
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => keep.has(t));
  return tokens.join(" ");
}

function pruneHtmlClassDoubleQuoted(html, keep) {
  return html.replace(/\bclass\s*=\s*"([^"]*)"/g, (_, cls) => {
    const next = pruneClassString(cls, keep);
    if (!next) return `class="${cls}"`;
    return `class="${next}"`;
  });
}

const cssText = fs.readFileSync(mainCssPath, "utf8");
const cssClasses = classesFromCss(cssText);
const jsFiles = walkJs(path.join(root, "src"));
const jsRequired = collectJsRequired(jsFiles);
const keep = new Set([...cssClasses, ...jsRequired]);

let cal = fs.readFileSync(calendarPath, "utf8");
const original = cal;

cal = cal.replace(
  /\.className\s*=\s*"([^"]*)";/g,
  (full, cls) => {
    const next = pruneClassString(cls, keep);
    if (!next) return full;
    return `.className = "${next}";`;
  },
);

cal = cal.replace(
  /\.className\s*=\s*'([^']*)';/g,
  (full, cls) => {
    const next = pruneClassString(cls, keep);
    if (!next) return full;
    return `.className = '${next}';`;
  },
);

cal = cal.replace(
  /\.className\s*=\s*`([^`${}]*)`;/g,
  (full, cls) => {
    const next = pruneClassString(cls, keep);
    if (!next) return full;
    return `.className = \`${next}\`;`;
  },
);

cal = cal.replace(/innerHTML\s*=\s*`([^`]*?)`/gs, (full, tpl) => {
  if (tpl.includes("${")) return full;
  if (!tpl.includes('class="')) return full;
  const next = pruneHtmlClassDoubleQuoted(tpl, keep);
  return `innerHTML = \`${next}\``;
});

if (cal === original) {
  console.log("prune-calendar-js-classes: no changes");
  process.exit(0);
}

fs.writeFileSync(calendarPath, cal, "utf8");
console.log("prune-calendar-js-classes: updated Calendar.js");
