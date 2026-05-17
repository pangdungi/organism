/**
 * Time.js: class → data-legacy (정적 스타일은 src/styles/time-ledger.css 등에서 [data-legacy~="…"] 로 맞춤),
 * todoSettings 인라인 색 규칙용 클래스는 class 유지.
 */
import fs from "fs";

const path = "src/views/Time.js";
let s = fs.readFileSync(path, "utf8");

const KEEP_CLASS_SUBSTR = [
  "time-tag-pill",
  "prod-pink",
  "prod-blue",
  "prod-green",
  "prod-empty",
  "cat-empty",
  "cat-dream",
  "cat-sideincome",
  "cat-happiness",
  "cat-health",
  "cat-pleasure",
  "cat-dreamblocking",
  "cat-media-watch",
  "cat-unhappiness",
  "cat-unhealthy",
  "cat-moneylosing",
  "cat-work",
  "cat-sleep",
  "time-task-prod-bar",
  "time-dash-donut-seg",
  "time-dash-bar-fill",
  "time-audit-available-value-plus",
  "time-audit-available-value-minus",
  "is-negative",
  "is-positive",
  "has-value",
  "is-selected",
  "is-highlighted",
  "is-empty",
  "is-visible",
  "is-active",
];

function shouldKeepClassValue(val) {
  const v = String(val || "");
  return KEEP_CLASS_SUBSTR.some((k) => v.includes(k));
}

// 1) innerHTML / HTML strings: class="..." → data-legacy="..." if not color-critical
s = s.replace(/\sclass="([^"]*)"/g, (m, val) => {
  if (shouldKeepClassValue(val)) return m;
  return ` data-legacy="${val}"`;
});

// 2) class='...'
s = s.replace(/\sclass='([^']*)'/g, (m, val) => {
  if (shouldKeepClassValue(val)) return m;
  return ` data-legacy='${val}'`;
});

// 3) querySelector(All) / closest: simple .token → [data-legacy~="token"] (multi-pass for chains)
function upgradeSelector(sel) {
  let out = sel;
  out = out.replace(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g, (m, tok) => {
    if (KEEP_CLASS_SUBSTR.some((k) => k === tok || tok.startsWith(k)))
      return `.${tok}`;
    return `[data-legacy~="${tok}"]`;
  });
  return out;
}

s = s.replace(
  /(querySelector(?:All)?|closest|matches)\(\s*(`|"|')([^`"']+)(`|"|')\s*\)/g,
  (full, fn, q1, inner, q2) => {
    if (inner.includes("${") || inner.includes("[data-")) return full;
    if (!inner.includes(".")) return full;
    const upgraded = upgradeSelector(inner);
    if (upgraded === inner) return full;
    return `${fn}(${q1}${upgraded}${q2})`;
  },
);

fs.writeFileSync(path, s);
console.log("Wrote", path);
