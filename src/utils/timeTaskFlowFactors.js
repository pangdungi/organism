/** 시간기록 모달 — 생산적 작업 5점 시 «몰입 요소» */

export const TIME_TASK_FLOW_FACTOR_OPTIONS = [
  { id: "empty_stomach", label: "공복" },
  { id: "caffeine", label: "카페인" },
  { id: "moderate_difficulty", label: "적당한 난이도" },
  { id: "planned_time", label: "계획된 시간" },
  { id: "clear_tasks", label: "명확한 할 일" },
  { id: "devices_removed", label: "전자 기기 제거" },
  { id: "app_lock", label: "앱 잠금" },
  { id: "preferred_task", label: "선호하는 과제" },
  { id: "clear_goal", label: "분명한 목표" },
  { id: "time_of_day", label: "시간대" },
  { id: "lighting", label: "조명" },
  { id: "temperature", label: "온도" },
  { id: "sound", label: "소리" },
  { id: "physical_activity", label: "신체 활동" },
  { id: "sleep_state", label: "수면 상태" },
  { id: "place", label: "장소" },
];

const BY_ID = new Map(TIME_TASK_FLOW_FACTOR_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(
  TIME_TASK_FLOW_FACTOR_OPTIONS.map((o) => [o.label, o]),
);
/** 예전 UI 문구 → id (저장·불러오기 호환) */
const LEGACY_FACTOR_LABEL_TO_ID = new Map([
  ["명확한 할일", "clear_tasks"],
  ["전자기기 제거", "devices_removed"],
  ["앱잠금", "app_lock"],
  ["신체활동", "physical_activity"],
  ["수면상태", "sleep_state"],
]);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeFlowFactorForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
  const byLabel = BY_LABEL.get(s);
  if (byLabel) return byLabel.id;
  return LEGACY_FACTOR_LABEL_TO_ID.get(s) || "";
}

/** @returns {string[]} 중복 제거·옵션 순서 유지 */
export function normalizeTimeFlowFactorsForRow(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw == null || raw === ""
      ? []
      : [raw];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const id = normalizeTimeFlowFactorForRow(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const order = new Map(
    TIME_TASK_FLOW_FACTOR_OPTIONS.map((o, i) => [o.id, i]),
  );
  out.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  return out;
}

export function timeFlowFactorLabelForId(id) {
  const key = normalizeTimeFlowFactorForRow(id);
  return BY_ID.get(key)?.label || "";
}

export function timeFlowFactorLabelsForIds(ids) {
  return normalizeTimeFlowFactorsForRow(ids)
    .map((id) => timeFlowFactorLabelForId(id))
    .filter(Boolean);
}
