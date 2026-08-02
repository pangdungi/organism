/** 시간기록 모달 — 비생산적 작업 4~5점 시 «좋았던 점» */

export const TIME_TASK_GOOD_FEELING_REASON_OPTIONS = [
  { id: "stress_relief", label: "스트레스 해소" },
  { id: "mood_boost", label: "기분전환" },
  { id: "clear_mind", label: "머리를 비움" },
  { id: "recharge", label: "재충전" },
  { id: "relationship_help", label: "관계에 도움" },
  { id: "kept_schedule", label: "예정시간 지킴" },
  { id: "controllable", label: "통제가능" },
];

const BY_ID = new Map(TIME_TASK_GOOD_FEELING_REASON_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(
  TIME_TASK_GOOD_FEELING_REASON_OPTIONS.map((o) => [o.label, o]),
);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeGoodFeelingReasonForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
  return BY_LABEL.get(s)?.id || "";
}

/** @returns {string[]} 중복 제거·옵션 순서 유지 */
export function normalizeTimeGoodFeelingReasonsForRow(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw == null || raw === ""
      ? []
      : [raw];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const id = normalizeTimeGoodFeelingReasonForRow(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const order = new Map(
    TIME_TASK_GOOD_FEELING_REASON_OPTIONS.map((o, i) => [o.id, i]),
  );
  out.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  return out;
}

export function timeGoodFeelingReasonLabelForId(id) {
  const key = normalizeTimeGoodFeelingReasonForRow(id);
  return BY_ID.get(key)?.label || "";
}

export function timeGoodFeelingReasonLabelsForIds(ids) {
  return normalizeTimeGoodFeelingReasonsForRow(ids)
    .map((id) => timeGoodFeelingReasonLabelForId(id))
    .filter(Boolean);
}

/** 비생산적 작업 4~5점일 때 좋았던 점 입력 대상 */
export function shouldCollectTimeGoodFeelingReasons(rating) {
  const n = Number(rating);
  return n === 4 || n === 5;
}
