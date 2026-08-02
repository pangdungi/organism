/** 시간기록 모달 — 의식적·무의식적 콘텐츠 소비 · 「콘텐츠 평가» 별점 후 세부 칩 */

/** 콘텐츠 평가 1~3점일 때 */
export const TIME_TASK_CONTENT_POOR_REASON_OPTIONS = [
  { id: "repeat_content", label: "반복 내용" },
  { id: "simple_pleasure", label: "단순 쾌락" },
  { id: "ad_like", label: "광고성" },
  { id: "clickbait", label: "낚시성" },
  { id: "no_substance", label: "알맹이 없음" },
  { id: "unfounded_claim", label: "근거 없는 주장" },
  { id: "gossip", label: "가십" },
];

/** 콘텐츠 평가 4~5점일 때 */
export const TIME_TASK_CONTENT_GOOD_REASON_OPTIONS = [
  { id: "new_info", label: "새로운 정보" },
  { id: "clear_evidence", label: "분명한 근거" },
  { id: "perspective_shift", label: "관점 변화" },
  { id: "expertise", label: "전문성" },
  { id: "high_finish", label: "완성도 높음" },
  { id: "motivation", label: "동기부여" },
  { id: "emotional_recovery", label: "정서적 회복" },
];

const ALL_OPTIONS = [
  ...TIME_TASK_CONTENT_POOR_REASON_OPTIONS,
  ...TIME_TASK_CONTENT_GOOD_REASON_OPTIONS,
];

const BY_ID = new Map(ALL_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(ALL_OPTIONS.map((o) => [o.label, o]));
const LEGACY_LABEL_TO_ID = new Map([
  ["근거없는주장", "unfounded_claim"],
  ["완성도높음", "high_finish"],
]);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeContentEvalReasonForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
  const byLabel = BY_LABEL.get(s);
  if (byLabel) return byLabel.id;
  return LEGACY_LABEL_TO_ID.get(s) || "";
}

/** @returns {string[]} 중복 제거·옵션 순서 유지 */
export function normalizeTimeContentEvalReasonsForRow(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw == null || raw === ""
      ? []
      : [raw];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const id = normalizeTimeContentEvalReasonForRow(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const order = new Map(ALL_OPTIONS.map((o, i) => [o.id, i]));
  out.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  return out;
}

export function timeContentEvalReasonLabelForId(id) {
  const key = normalizeTimeContentEvalReasonForRow(id);
  return BY_ID.get(key)?.label || "";
}

/** 콘텐츠 평가 1~3점 — 아쉬운 쪽 칩 */
export function shouldCollectTimeContentPoorReasons(rating) {
  const n = Number(rating);
  return n === 1 || n === 2 || n === 3;
}

/** 콘텐츠 평가 4~5점 — 좋은 쪽 칩 */
export function shouldCollectTimeContentGoodReasons(rating) {
  const n = Number(rating);
  return n === 4 || n === 5;
}

export function shouldCollectTimeContentEvalReasons(rating) {
  return (
    shouldCollectTimeContentPoorReasons(rating) ||
    shouldCollectTimeContentGoodReasons(rating)
  );
}

/** 현재 콘텐츠 평가 별점에 맞는 세부 칩 옵션 */
export function timeContentEvalOptionsForRating(rating) {
  if (shouldCollectTimeContentPoorReasons(rating)) {
    return TIME_TASK_CONTENT_POOR_REASON_OPTIONS;
  }
  if (shouldCollectTimeContentGoodReasons(rating)) {
    return TIME_TASK_CONTENT_GOOD_REASON_OPTIONS;
  }
  return [];
}
