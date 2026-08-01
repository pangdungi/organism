/** 시간기록 모달 — 비생산적 작업 1~3점 시 «별로였던 이유» */

export const TIME_TASK_BAD_FEELING_REASON_OPTIONS = [
  { id: "regret", label: "후회" },
  { id: "time_waste", label: "시간낭비" },
  { id: "low_self_control", label: "자제력부족" },
  { id: "self_disappointment", label: "자기실망" },
  { id: "emptiness", label: "공허함" },
  { id: "fatigue", label: "피로" },
  { id: "problem_neglect", label: "문제방치" },
  { id: "meaningless", label: "무의미" },
  { id: "avoidance", label: "회피" },
];

const BY_ID = new Map(TIME_TASK_BAD_FEELING_REASON_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(
  TIME_TASK_BAD_FEELING_REASON_OPTIONS.map((o) => [o.label, o]),
);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeBadFeelingReasonForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
  return BY_LABEL.get(s)?.id || "";
}

/** @returns {string[]} 중복 제거·옵션 순서 유지 */
export function normalizeTimeBadFeelingReasonsForRow(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw == null || raw === ""
      ? []
      : [raw];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const id = normalizeTimeBadFeelingReasonForRow(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const order = new Map(
    TIME_TASK_BAD_FEELING_REASON_OPTIONS.map((o, i) => [o.id, i]),
  );
  out.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  return out;
}

export function timeBadFeelingReasonLabelForId(id) {
  const key = normalizeTimeBadFeelingReasonForRow(id);
  return BY_ID.get(key)?.label || "";
}

export function timeBadFeelingReasonLabelsForIds(ids) {
  return normalizeTimeBadFeelingReasonsForRow(ids)
    .map((id) => timeBadFeelingReasonLabelForId(id))
    .filter(Boolean);
}

/** 비생산적 작업 1~3점일 때 별로였던 이유 입력 대상 */
export function shouldCollectTimeBadFeelingReasons(rating) {
  const n = Number(rating);
  return n === 1 || n === 2 || n === 3;
}
