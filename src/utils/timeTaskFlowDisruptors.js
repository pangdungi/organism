/** 시간기록 모달 — 생산적 작업 1~3점 시 «아쉬웠던 이유» */

export const TIME_TASK_FLOW_DISRUPTOR_CATEGORIES = [
  { id: "task", label: "작업" },
  { id: "body", label: "신체" },
  { id: "mind", label: "심리" },
  { id: "digital", label: "디지털" },
  { id: "environment", label: "환경" },
  { id: "external", label: "외부" },
];

export const TIME_TASK_FLOW_DISRUPTOR_OPTIONS = [
  { id: "took_too_long", label: "시간 초과", category: "task" },
  { id: "task_difficulty", label: "고난이도", category: "task" },
  { id: "supplies_unready", label: "준비물 미비", category: "task" },
  { id: "sleepiness", label: "졸림", category: "body" },
  { id: "hunger", label: "배고픔", category: "body" },
  { id: "physiological", label: "생리현상", category: "body" },
  { id: "attention_scatter", label: "주의산만", category: "mind" },
  { id: "low_motivation", label: "의욕저하", category: "mind" },
  { id: "media_digital", label: "디지털 기기", category: "digital" },
  { id: "multitasking", label: "멀티태스킹", category: "mind" },
];

const BY_ID = new Map(TIME_TASK_FLOW_DISRUPTOR_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(
  TIME_TASK_FLOW_DISRUPTOR_OPTIONS.map((o) => [o.label, o]),
);
/** 예전 UI 문구 → 현재 id (저장·불러오기 호환) */
const LEGACY_DISRUPTOR_LABEL_TO_ID = new Map([
  ["생각보다 오래 걸림", "took_too_long"],
  ["생각보다 오래걸림", "took_too_long"],
  ["생각보다 오래걸렸어", "took_too_long"],
  ["난이도가 높음", "task_difficulty"],
  ["작업 난이도", "task_difficulty"],
  ["준비물 부족", "supplies_unready"],
  ["준비물 미비", "supplies_unready"],
  ["생리 현상", "physiological"],
  ["생리현상", "physiological"],
  ["주의가 흩어짐", "attention_scatter"],
  ["주의 분산", "attention_scatter"],
  ["의욕 저하", "low_motivation"],
  ["미디어·디지털", "media_digital"],
  ["미디어/디지털", "media_digital"],
  ["디지털 기기", "media_digital"],
  ["디지털 기기 정리상태", "media_digital"],
  ["정리상태", "media_digital"],
  ["공간 미정리", "media_digital"],
  ["공간 정돈 상태", "media_digital"],
  ["정돈되지 않은 공간", "media_digital"],
  ["기기 문제", "media_digital"],
  ["기기 오작동", "media_digital"],
  ["딴 생각", "attention_scatter"],
  ["컨디션 나쁨", "sleepiness"],
  ["컨디션 미비", "sleepiness"],
  ["지루함", "sleepiness"],
  ["boredom", "sleepiness"],
  ["작업이 불명확함", "task_difficulty"],
  ["불명확한 작업", "task_difficulty"],
  ["잦은 작업중단", "multitasking"],
  ["잦은 작업 중단", "multitasking"],
  ["자주 끊김", "multitasking"],
  ["다른 용무", "multitasking"],
  ["소음", "attention_scatter"],
]);
/** 예전 옵션 id → 현재 id */
const LEGACY_DISRUPTOR_ID_TO_ID = new Map([
  ["unclear_task", "task_difficulty"],
  ["poor_condition", "sleepiness"],
  ["mind_wandering", "attention_scatter"],
  ["messy_space", "media_digital"],
  ["device_malfunction", "media_digital"],
  ["noise", "attention_scatter"],
  ["frequent_interruption", "multitasking"],
  ["other_errands", "multitasking"],
]);
const CATEGORY_BY_ID = new Map(
  TIME_TASK_FLOW_DISRUPTOR_CATEGORIES.map((c) => [c.id, c]),
);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeFlowDisruptorForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
  const aliased = LEGACY_DISRUPTOR_ID_TO_ID.get(s);
  if (aliased && BY_ID.has(aliased)) return aliased;
  const byLabel = BY_LABEL.get(s);
  if (byLabel) return byLabel.id;
  return LEGACY_DISRUPTOR_LABEL_TO_ID.get(s) || "";
}

/** @returns {string[]} 중복 제거·옵션 순서 유지 */
export function normalizeTimeFlowDisruptorsForRow(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw == null || raw === ""
      ? []
      : [raw];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const id = normalizeTimeFlowDisruptorForRow(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const order = new Map(
    TIME_TASK_FLOW_DISRUPTOR_OPTIONS.map((o, i) => [o.id, i]),
  );
  out.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  return out;
}

export function timeFlowDisruptorLabelForId(id) {
  const key = normalizeTimeFlowDisruptorForRow(id);
  return BY_ID.get(key)?.label || "";
}

export function timeFlowDisruptorLabelsForIds(ids) {
  return normalizeTimeFlowDisruptorsForRow(ids)
    .map((id) => timeFlowDisruptorLabelForId(id))
    .filter(Boolean);
}

export function timeFlowDisruptorCategoryForId(id) {
  const key = normalizeTimeFlowDisruptorForRow(id);
  const cat = BY_ID.get(key)?.category || "";
  return CATEGORY_BY_ID.get(cat) || null;
}

export function timeFlowDisruptorCategoryLabelForId(id) {
  return timeFlowDisruptorCategoryForId(id)?.label || "";
}

/** @returns {string} */
export function flowDisruptorCategoryColor(categoryId) {
  switch (categoryId) {
    case "environment":
      return "#64748B";
    case "body":
      return "#8B5C3A";
    case "mind":
      return "#1E4D7B";
    case "digital":
      return "#1D40BA";
    case "task":
      return "#475569";
    case "external":
      return "#94A3B8";
    default:
      return "#4D4D4D";
  }
}

/** 생산적 작업 1~3점일 때 아쉬웠던 이유 입력 대상 */
export function shouldCollectTimeFlowDisruptors(rating) {
  const n = Number(rating);
  return n === 1 || n === 2 || n === 3;
}
