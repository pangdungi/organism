/** 시간기록 모달 — 수면 평가 1~4점 시 «아쉬웠던 이유» */

export const TIME_TASK_SLEEP_POOR_REASON_OPTIONS = [
  { id: "caffeine", label: "카페인" },
  { id: "late_meal", label: "취침전 식사" },
  { id: "lighting", label: "조명" },
  { id: "noise", label: "소음" },
  { id: "alcohol", label: "알코올 섭취" },
  { id: "phone_before_bed", label: "자기전 폰 사용" },
  { id: "irregular_sleep", label: "불규칙한 수면" },
  { id: "temperature", label: "온도" },
  { id: "psychological", label: "심리적 요인" },
];

const BY_ID = new Map(TIME_TASK_SLEEP_POOR_REASON_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(
  TIME_TASK_SLEEP_POOR_REASON_OPTIONS.map((o) => [o.label, o]),
);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeSleepPoorReasonForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
  return BY_LABEL.get(s)?.id || "";
}

/** @returns {string[]} 중복 제거·옵션 순서 유지 */
export function normalizeTimeSleepPoorReasonsForRow(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw == null || raw === ""
      ? []
      : [raw];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const id = normalizeTimeSleepPoorReasonForRow(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const order = new Map(
    TIME_TASK_SLEEP_POOR_REASON_OPTIONS.map((o, i) => [o.id, i]),
  );
  out.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  return out;
}

export function timeSleepPoorReasonLabelForId(id) {
  const key = normalizeTimeSleepPoorReasonForRow(id);
  return BY_ID.get(key)?.label || "";
}

export function timeSleepPoorReasonLabelsForIds(ids) {
  return normalizeTimeSleepPoorReasonsForRow(ids)
    .map((id) => timeSleepPoorReasonLabelForId(id))
    .filter(Boolean);
}

/** 수면 평가 1~4점일 때 아쉬웠던 이유 입력 대상 */
export function shouldCollectTimeSleepPoorReasons(rating) {
  const n = Number(rating);
  return n === 1 || n === 2 || n === 3 || n === 4;
}
