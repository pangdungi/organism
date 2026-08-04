/** 시간기록 모달 — 생산적 작업 4~5점 시 «종료 이유»(왜 잘하다 멈췄는지) */

export const TIME_TASK_END_REASON_OPTIONS = [
  { id: "next_schedule", label: "다음 스케줄" },
  { id: "urgent_errand", label: "급한 용무 생김" },
  { id: "media", label: "미디어" },
  { id: "fatigue", label: "피로" },
  { id: "hunger", label: "배고픔" },
  { id: "physiological", label: "생리적 현상" },
  { id: "goal_achieved", label: "목표 달성" },
  { id: "interruption", label: "방해" },
  { id: "focus_drop", label: "집중 저하" },
];

const BY_ID = new Map(TIME_TASK_END_REASON_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(
  TIME_TASK_END_REASON_OPTIONS.map((o) => [o.label, o]),
);

/** 예전 옵션 id/라벨 → 새 id */
const LEGACY_END_REASON_TO_ID = new Map([
  ["sleepy", "fatigue"],
  ["졸림", "fatigue"],
  ["youtube", "media"],
  ["reels", "media"],
  ["threads", "media"],
  ["game", "media"],
  ["유튜브", "media"],
  ["릴스/쇼츠", "media"],
  ["스레드", "media"],
  ["게임", "media"],
  ["focus", "focus_drop"],
  ["집중력 저하", "focus_drop"],
  ["call", "urgent_errand"],
  ["errand", "urgent_errand"],
  ["통화", "urgent_errand"],
  ["용무", "urgent_errand"],
  ["생리현상", "physiological"],
]);

/** 종료 이유별 — 다음에 더 오래 유지하려면 */
const END_REASON_LONGER_TIP = new Map([
  ["next_schedule", "다음 일정 전에 여유를 두거나, 집중 블록을 나눠 잡기"],
  ["urgent_errand", "급한 용무가 잦다면 짧은 마무리 루틴을 먼저 두기"],
  ["media", "미디어·앱 잠금으로 끊김을 줄이기"],
  ["fatigue", "피로가 오기 전에 휴식·수면 시간을 확보하기"],
  ["hunger", "식사·간식 타이밍을 집중 블록 앞에 두기"],
  ["physiological", "세션 시작 전에 생리 욕구를 처리하기"],
  ["goal_achieved", "목표 단위를 조금 키우거나 연속 블록을 이어 잡기"],
  ["interruption", "방해가 덜한 장소·시간대를 쓰기"],
  ["focus_drop", "난이도·휴식 간격을 조절해 집중이 떨어지기 전에 끊기"],
]);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeEndReasonForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
  const byLabel = BY_LABEL.get(s);
  if (byLabel) return byLabel.id;
  return LEGACY_END_REASON_TO_ID.get(s) || "";
}

/** @returns {string[]} 중복 제거·옵션 순서 유지 */
export function normalizeTimeEndReasonsForRow(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw == null || raw === ""
      ? []
      : [raw];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const id = normalizeTimeEndReasonForRow(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const order = new Map(
    TIME_TASK_END_REASON_OPTIONS.map((o, i) => [o.id, i]),
  );
  out.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  return out;
}

export function timeEndReasonLabelForId(id) {
  const key = normalizeTimeEndReasonForRow(id);
  return BY_ID.get(key)?.label || "";
}

export function timeEndReasonLabelsForIds(ids) {
  return normalizeTimeEndReasonsForRow(ids)
    .map((id) => timeEndReasonLabelForId(id))
    .filter(Boolean);
}

export function timeEndReasonLongerTipForId(id) {
  const key = normalizeTimeEndReasonForRow(id);
  return END_REASON_LONGER_TIP.get(key) || "";
}

/** 종료 이유 입력·수집 중단(UI·레포트에서 제거). 예전 저장분은 유지. */
export function shouldCollectTimeEndReasons(_rating) {
  return false;
}
