/** 도서명 칸 · 읽을 예정 체크를 같은 책으로 묶을 때 */

export function readingBookTitleKey(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function splitReadingBookTitles(raw) {
  return String(raw || "")
    .split(/\s*·\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function uniqueReadingBookTitles(titles) {
  const seen = new Set();
  const out = [];
  for (const raw of titles || []) {
    const text = String(raw || "").trim();
    const key = readingBookTitleKey(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function omitReadingBookTitle(raw, dropText) {
  const dropKey = readingBookTitleKey(dropText);
  if (!dropKey) return String(raw || "").trim();
  return uniqueReadingBookTitles(
    splitReadingBookTitles(raw).filter(
      (t) => readingBookTitleKey(t) !== dropKey,
    ),
  ).join(" · ");
}
