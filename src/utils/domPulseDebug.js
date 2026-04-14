/**
 * 아무 조작 없이도 DOM이 자주 바뀌는지 확인용 (개발자 도구 깜빡임 원인 후보).
 *
 * 켜기: localStorage.setItem("debug_dom_pulse", "1"); 후 로그인·앱 로드(또는 새로고침)
 * 끄기: localStorage.removeItem("debug_dom_pulse"); 후 새로고침
 *
 * 주의: subtree 관찰은 비용이 있으니 원인 확인 후 반드시 끕니다.
 */

let _attached = false;

function targetSummary(node) {
  if (!node || node.nodeType !== 1) return String(node?.nodeName || node);
  const el = /** @type {Element} */ (node);
  if (el === document.body) return "body";
  const id = el.id ? `#${el.id}` : "";
  const cls = el.className && typeof el.className === "string"
    ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
    : "";
  return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 96);
}

export function initDomPulseDebug() {
  if (_attached) return;
  let enabled = false;
  try {
    enabled = typeof localStorage !== "undefined" && localStorage.getItem("debug_dom_pulse") === "1";
  } catch (_) {
    return;
  }
  if (!enabled) return;
  _attached = true;

  let debounceTimer = null;
  /** @type {{ type: string, target: string, attr?: string|null }[]} */
  let batch = [];

  const flush = () => {
    debounceTimer = null;
    const copy = batch;
    batch = [];
    if (copy.length === 0) return;
    const byType = { childList: 0, attributes: 0, characterData: 0 };
    for (const x of copy) {
      if (x.type in byType) byType[x.type]++;
    }
    console.warn("[dom-pulse] body subtree 변화 (600ms 묶음)", {
      total: copy.length,
      byType,
      sample: copy.slice(0, 40),
    });
  };

  const obs = new MutationObserver((records) => {
    for (const r of records) {
      batch.push({
        type: r.type,
        target: targetSummary(/** @type {Node} */ (r.target)),
        attr: r.type === "attributes" ? r.attributeName || null : null,
      });
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, 600);
  });

  obs.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "aria-hidden", "style", "data-date-str"],
  });

  console.info(
    "[dom-pulse] 관찰 시작 — 끄기: localStorage.removeItem(\"debug_dom_pulse\") 후 새로고침",
  );
}
