/**
 * DOM 변화 관찰 (콘솔 비활성, 플래그 시에만 observer 부착)
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
    void copy;
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
}
