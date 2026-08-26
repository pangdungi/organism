/** 과제명 등 — 띄어쓰기·하이픈·언더스코어 차이를 무시한 검색 */

/** @param {string} text */
export function normalizeFlexibleSearchHaystack(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

/** @param {string} text */
export function flexibleSearchTextKey(text) {
  return normalizeFlexibleSearchHaystack(text).replace(/\s/g, "");
}

/**
 * 「의식적」검색이 「무의식적」에 글자만 들어 있어 같이 잡히지 않게.
 * 검색어에 무의식적이 있을 때는 그대로 둠.
 * @param {string} text
 * @param {string} queryFlat
 */
function maskMuUisikjeokUnlessQueried(text, queryFlat) {
  const q = String(queryFlat || "");
  if (!q.includes("의식적") || q.includes("무의식적")) return String(text || "");
  return String(text || "").replace(/무의식적/g, "····");
}

/**
 * @param {string} searchText
 * @param {string} query
 */
export function matchFlexibleSearch(searchText, query) {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const qFlat = flexibleSearchTextKey(q);
  const hayRaw = maskMuUisikjeokUnlessQueried(
    normalizeFlexibleSearchHaystack(searchText),
    qFlat,
  );
  const hay = hayRaw;
  const hayFlat = hayRaw.replace(/\s/g, "");
  if (qFlat && hayFlat.includes(qFlat)) return true;
  if (hay.includes(q)) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => {
    const tFlat = t.replace(/[\s_-]+/g, "");
    return hay.includes(t) || (tFlat && hayFlat.includes(tFlat));
  });
}

/**
 * @param {string} a
 * @param {string} b
 */
export function flexibleSearchLabelsEqual(a, b) {
  const ak = flexibleSearchTextKey(a);
  const bk = flexibleSearchTextKey(b);
  return Boolean(ak) && ak === bk;
}
