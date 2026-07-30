/** 시간기록 모달 — 수면 평가 5점 시 «잘 잔 이유» */

export const TIME_TASK_SLEEP_GOOD_FACTOR_OPTIONS = [
  { id: "caffeine_limit", label: "카페인 제한" },
  { id: "sleep_length", label: "수면 길이" },
  { id: "meal_timing", label: "식사 제한" },
  { id: "eye_mask", label: "안대 착용" },
  { id: "earplugs", label: "귀마개 착용" },
  { id: "alcohol_limit", label: "알코올 제한" },
  { id: "phone_limit", label: "폰 사용 제한" },
  { id: "regular_bedtime", label: "일정 수면 시작시간" },
  { id: "reading", label: "독서" },
  { id: "music", label: "음악" },
  { id: "temperature", label: "온도" },
  { id: "physical_activity", label: "신체활동" },
];

const BY_ID = new Map(TIME_TASK_SLEEP_GOOD_FACTOR_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(
  TIME_TASK_SLEEP_GOOD_FACTOR_OPTIONS.map((o) => [o.label, o]),
);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeSleepGoodFactorForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
  return BY_LABEL.get(s)?.id || "";
}

/** @returns {string[]} 중복 제거·옵션 순서 유지 */
export function normalizeTimeSleepGoodFactorsForRow(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw == null || raw === ""
      ? []
      : [raw];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const id = normalizeTimeSleepGoodFactorForRow(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const order = new Map(
    TIME_TASK_SLEEP_GOOD_FACTOR_OPTIONS.map((o, i) => [o.id, i]),
  );
  out.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  return out;
}

export function timeSleepGoodFactorLabelForId(id) {
  const key = normalizeTimeSleepGoodFactorForRow(id);
  return BY_ID.get(key)?.label || "";
}

export function timeSleepGoodFactorLabelsForIds(ids) {
  return normalizeTimeSleepGoodFactorsForRow(ids)
    .map((id) => timeSleepGoodFactorLabelForId(id))
    .filter(Boolean);
}

/** 수면 평가 5점일 때 잘 잔 이유 입력 대상 */
export function shouldCollectTimeSleepGoodFactors(rating) {
  return Number(rating) === 5;
}
