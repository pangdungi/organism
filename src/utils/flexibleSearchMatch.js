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
 * @param {string} searchText
 * @param {string} query
 */
export function matchFlexibleSearch(searchText, query) {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = normalizeFlexibleSearchHaystack(searchText);
  const hayFlat = flexibleSearchTextKey(searchText);
  const qFlat = flexibleSearchTextKey(q);
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
