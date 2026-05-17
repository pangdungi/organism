/**
 * Time.js: main.css에 없는 class 토큰은 data-legacy 로 이주(lpSetClasses 등).
 * lp-modals.css · time-ledger.css: .선택자에 [data-legacy~=] 병기.
 */
import fs from "fs";
import path from "path";

const root = path.join(import.meta.dirname, "..");

function readMainAllowArr() {
  let raw = fs.readFileSync(path.join(root, "src/main.css"), "utf8");
  raw = raw.replace(/\/\*[\s\S]*?\*\//g, " ");
  const allow = new Set();
  for (const m of raw.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)) {
    if (m[1] === "html" || m[1] === "js") continue;
    allow.add(m[1]);
  }
  return [...allow].sort();
}

const LP_MAIN_ARR = readMainAllowArr();

function legacySelectorList(selectorList) {
  return selectorList
    .split(/\s*,\s*/)
    .map((part) =>
      part.replace(
        /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g,
        '[data-legacy~="$1"]',
      ),
    )
    .join(", ");
}

function expandCss(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  const n = stripped.length;
  while (i < n) {
    while (i < n && /\s/.test(stripped[i])) i++;
    if (i >= n) break;
    const open = stripped.indexOf("{", i);
    if (open === -1) {
      out += stripped.slice(i);
      break;
    }
    const head = stripped.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < n && depth > 0) {
      if (stripped[j] === "{") depth++;
      else if (stripped[j] === "}") depth--;
      j++;
    }
    const body = stripped.slice(open + 1, j - 1);
    if (
      head.startsWith("@media") ||
      head.startsWith("@supports") ||
      head.startsWith("@keyframes")
    ) {
      out += head + "{" + expandCss(body) + "}";
    } else if (head.startsWith("@")) {
      out += head + "{" + body + "}";
    } else {
      const leg = legacySelectorList(head);
      const combined = leg.trim() === head.trim() ? head : head + ", " + leg;
      out += combined + "{" + expandCss(body) + "}";
    }
    i = j;
  }
  return out;
}

const MAIN_SET = new Set(LP_MAIN_ARR);

function upgradeSelector(sel) {
  return sel.replace(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g, (m, tok) => {
    if (MAIN_SET.has(tok)) return `.${tok}`;
    return `[data-legacy~="${tok}"]`;
  });
}

function wrapQS(fn, q, inner) {
  const upgraded = upgradeSelector(inner);
  if (upgraded === inner) return null;
  if (upgraded.includes("`")) return `${fn}(\`${upgraded.replace(/`/g, "\\`")}\`)`;
  if (q === '"' && upgraded.includes('"')) return `${fn}('${upgraded.replace(/'/g, "\\'")}')`;
  if (q === "'" && upgraded.includes("'")) return `${fn}(\`${upgraded.replace(/`/g, "\\`")}\`)`;
  return `${fn}(${q}${upgraded}${q})`;
}

function writePolicyJs() {
  const policyPath = path.join(root, "src/utils/timeLedgerClassPolicy.js");
  const body = `/**
 * Time.js 전용: DOM class 는 main.css 에 정의된 토큰만 유지, 나머지는 data-legacy.
 * 이 파일의 LP_MAIN_CLASS 는 scripts/time-js-main-only-classes.mjs 가 main.css 에서 동기화합니다.
 */
export const LP_MAIN_CLASS = new Set(${JSON.stringify(LP_MAIN_ARR, null, 2)});

export function lpSetClasses(el, classString) {
  if (!el) return;
  const tokens = String(classString ?? "")
    .trim()
    .split(/\\s+/)
    .filter(Boolean);
  const allowed = [];
  const legacy = [];
  for (const t of tokens) {
    (LP_MAIN_CLASS.has(t) ? allowed : legacy).push(t);
  }
  el.className = allowed.join(" ");
  if (legacy.length) el.setAttribute("data-legacy", legacy.join(" "));
  else el.removeAttribute("data-legacy");
}

export function lpTokenAdd(el, token) {
  if (!el || token == null || token === "") return;
  const t = String(token).trim();
  if (!t) return;
  if (LP_MAIN_CLASS.has(t)) el.classList.add(t);
  else {
    const cur = (el.getAttribute("data-legacy") || "").split(/\\s+/).filter(Boolean);
    if (!cur.includes(t)) {
      cur.push(t);
      el.setAttribute("data-legacy", cur.join(" "));
    }
  }
}

export function lpTokenRemove(el, token) {
  if (!el || token == null || token === "") return;
  const t = String(token).trim();
  if (!t) return;
  if (LP_MAIN_CLASS.has(t)) el.classList.remove(t);
  else {
    const cur = (el.getAttribute("data-legacy") || "").split(/\\s+/).filter(Boolean);
    const next = cur.filter((x) => x !== t);
    if (next.length) el.setAttribute("data-legacy", next.join(" "));
    else el.removeAttribute("data-legacy");
  }
}

export function lpTokenToggle(el, token, on) {
  if (!el || token == null || token === "") return;
  const t = String(token).trim();
  if (!t) return;
  if (LP_MAIN_CLASS.has(t)) el.classList.toggle(t, on);
  else {
    const cur = (el.getAttribute("data-legacy") || "").split(/\\s+/).filter(Boolean);
    const set = new Set(cur);
    if (on) set.add(t);
    else set.delete(t);
    const next = [...set];
    if (next.length) el.setAttribute("data-legacy", next.join(" "));
    else el.removeAttribute("data-legacy");
  }
}

export function lpTokenHas(el, token) {
  if (!el || token == null || token === "") return false;
  const t = String(token).trim();
  if (!t) return false;
  if (LP_MAIN_CLASS.has(t)) return el.classList.contains(t);
  return (el.getAttribute("data-legacy") || "")
    .split(/\\s+/)
    .filter(Boolean)
    .includes(t);
}
`;
  fs.writeFileSync(policyPath, body);
  console.log("OK src/utils/timeLedgerClassPolicy.js");
}

function transformTimeJs(src) {
  const importLine =
    'import {\n  lpSetClasses,\n  lpTokenAdd,\n  lpTokenRemove,\n  lpTokenToggle,\n  lpTokenHas,\n} from "../utils/timeLedgerClassPolicy.js";\n';
  if (!src.includes("timeLedgerClassPolicy.js")) {
    const pos = src.indexOf("export { getTaskOptionByName };");
    if (pos === -1) throw new Error("export anchor not found");
    src = src.slice(0, pos) + importLine + src.slice(pos);
  }

  // class="…" (템플릿·일반 문자열·보간 없음)
  src = src.replace(/class="([^"]*)"/g, (m, val) => {
    if (val.includes("${")) return m;
    if (!/^[\w\s-]+$/.test(val)) return m;
    const a = [];
    const l = [];
    for (const t of val.trim().split(/\s+/).filter(Boolean)) {
      (MAIN_SET.has(t) ? a : l).push(t);
    }
    let o = "";
    if (a.length) o += `class="${a.join(" ")}" `;
    if (l.length) o += `data-legacy="${l.join(" ")}"`;
    return o.trim() || m;
  });

  // .className = 한 줄
  src = src.replace(
    /(\w+)\.className\s*=\s*([^;\n]+);\s*\n/g,
    (full, obj, rhs) => {
      const r = rhs.trim();
      if (r.startsWith("`")) return full;
      return `lpSetClasses(${obj}, ${r});\n`;
    },
  );
  src = src.replace(
    /(\w+)\.className\s*=\s*([^;\n]+);$/gm,
    (full, obj, rhs) => {
      const r = rhs.trim();
      if (r.startsWith("`")) return full;
      return `lpSetClasses(${obj}, ${r});`;
    },
  );

  // 멀티라인 .className =\n  "…";
  src = src.replace(
    /(\w+)\.className\s*=\s*\n\s*([^;]+);/g,
    (full, obj, rhs) => {
      const r = rhs.trim();
      if (r.startsWith("`")) return full;
      return `lpSetClasses(${obj}, ${r});`;
    },
  );

  src = src.replace(
    /(querySelector(?:All)?|closest)\(\s*(`|"|')([^`"']+)(\2)\s*\)/g,
    (full, fn, q, inner, q2) => {
      if (inner.includes("${") || inner.includes("[data-legacy")) return full;
      if (!inner.includes(".")) return full;
      const wrapped = wrapQS(fn, q, inner);
      return wrapped || full;
    },
  );

  src = src.replace(
    /(\w+)\.classList\.add\(\s*([^)]+)\s*\)/g,
    (full, obj, arg) => `lpTokenAdd(${obj}, ${arg})`,
  );
  src = src.replace(
    /(\w+)\.classList\.remove\(\s*([^)]+)\s*\)/g,
    (full, obj, arg) => `lpTokenRemove(${obj}, ${arg})`,
  );
  src = src.replace(
    /(\w+)\.classList\.toggle\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g,
    (full, obj, a, b) => `lpTokenToggle(${obj}, ${a}, ${b})`,
  );
  src = src.replace(
    /(\w+)\.classList\.toggle\(\s*([^)]+)\s*\)/g,
    (full, obj, arg) => {
      if (arg.includes(",")) return full;
      return `lpTokenToggle(${obj}, ${arg}, !lpTokenHas(${obj}, ${arg}))`;
    },
  );
  src = src.replace(
    /(\w+)\.classList\?\.contains\(\s*([^)]+)\s*\)/g,
    (full, obj, arg) => `lpTokenHas(${obj}, ${arg})`,
  );
  src = src.replace(
    /(\w+)\.classList\.contains\(\s*([^)]+)\s*\)/g,
    (full, obj, arg) => `lpTokenHas(${obj}, ${arg})`,
  );

  src = src.replace(
    /el\.className = "app-tab-panel-content time-ledger-view";/,
    `el.className = "";\n    el.setAttribute("data-legacy", "app-tab-panel-content time-ledger-view");`,
  );

  src = src.replace(
    /document\.querySelector\("\.app-tab-panel-content\.time-ledger-view"\)/,
    `document.querySelector(\`[data-legacy~="time-ledger-view"][data-legacy~="app-tab-panel-content"]\`)`,
  );

  return src;
}

// --- 실행 (CSS는 주석 제거됨 — 파일 상단 블록 주석은 보존) ---
for (const rel of ["src/styles/lp-modals.css", "src/styles/time-ledger.css"]) {
  const p = path.join(root, rel);
  const raw = fs.readFileSync(p, "utf8");
  if (raw.includes("[data-legacy~=") && raw.includes("/* [auto] data-legacy")) {
    console.log("skip (already expanded)", rel);
    continue;
  }
  const header = raw.match(/^\/\*\*[\s\S]*?\*\//)?.[0] || "";
  const expanded = expandCss(raw);
  fs.writeFileSync(
    p,
    (header ? header + "\n\n" : "") +
      "/* [auto] data-legacy 병기 선택자 — scripts/time-js-main-only-classes.mjs */\n" +
      expanded,
  );
  console.log("OK", rel);
}

writePolicyJs();

const timePath = path.join(root, "src/views/Time.js");
let timeSrc = fs.readFileSync(timePath, "utf8");
if (timeSrc.includes("lpSetClasses(") && timeSrc.includes("timeLedgerClassPolicy")) {
  console.log("skip Time.js (already transformed)");
} else {
  timeSrc = transformTimeJs(timeSrc);
  fs.writeFileSync(timePath, timeSrc);
  console.log("OK src/views/Time.js");
}
