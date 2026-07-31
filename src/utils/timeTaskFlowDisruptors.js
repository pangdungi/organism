/** 시간기록 모달 — 생산적 작업 1~2점 시 «몰입 방해요소» */

export const TIME_TASK_FLOW_DISRUPTOR_CATEGORIES = [
  { id: "environment", label: "환경" },
  { id: "body", label: "신체" },
  { id: "mind", label: "심리" },
  { id: "digital", label: "디지털" },
  { id: "task", label: "작업" },
  { id: "external", label: "외부" },
];

export const TIME_TASK_FLOW_DISRUPTOR_OPTIONS = [
  { id: "unclear_task", label: "불명확한 작업", category: "task" },
  { id: "supplies_unready", label: "준비물 미비", category: "task" },
  { id: "sleepiness", label: "졸림", category: "body" },
  { id: "task_difficulty", label: "작업 난이도", category: "task" },
  { id: "multitasking", label: "멀티태스킹", category: "mind" },
  { id: "device_malfunction", label: "기기 오작동", category: "environment" },
  { id: "attention_scatter", label: "주의 분산", category: "mind" },
  { id: "frequent_interruption", label: "잦은 작업 중단", category: "external" },
  { id: "mind_wandering", label: "딴 생각", category: "mind" },
  { id: "physiological", label: "생리 현상", category: "body" },
  { id: "hunger", label: "배고픔", category: "body" },
  { id: "poor_condition", label: "컨디션 미비", category: "body" },
  { id: "media_digital", label: "미디어·디지털", category: "digital" },
  { id: "other_errands", label: "다른 용무", category: "external" },
  { id: "noise", label: "소음", category: "environment" },
  { id: "low_motivation", label: "의욕 저하", category: "mind" },
  { id: "messy_space", label: "정돈되지 않은 공간", category: "environment" },
];

const BY_ID = new Map(TIME_TASK_FLOW_DISRUPTOR_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(
  TIME_TASK_FLOW_DISRUPTOR_OPTIONS.map((o) => [o.label, o]),
);
/** 예전 UI 문구·id → 현재 id (저장·불러오기 호환) */
const LEGACY_DISRUPTOR_LABEL_TO_ID = new Map([
  ["잦은 작업중단", "frequent_interruption"],
  ["생리현상", "physiological"],
  ["미디어/디지털", "media_digital"],
  ["공간 정돈 상태", "messy_space"],
  ["지루함", "sleepiness"],
  ["boredom", "sleepiness"],
]);
const CATEGORY_BY_ID = new Map(
  TIME_TASK_FLOW_DISRUPTOR_CATEGORIES.map((c) => [c.id, c]),
);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeFlowDisruptorForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
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

/** 생산적 작업 1~2점일 때 몰입 방해요소 입력 대상 */
export function shouldCollectTimeFlowDisruptors(rating) {
  const n = Number(rating);
  return n === 1 || n === 2;
}
