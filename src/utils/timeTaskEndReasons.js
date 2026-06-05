/** 시간기록 모달 — 생산적 작업 별점 선택 시 «작업 종료 이유» */

export const TIME_TASK_END_REASON_OPTIONS = [
  { id: "hunger", label: "배고픔" },
  { id: "sleepy", label: "졸림" },
  { id: "physiological", label: "생리현상" },
  { id: "youtube", label: "유튜브" },
  { id: "reels", label: "릴스/쇼츠" },
  { id: "threads", label: "스레드" },
  { id: "game", label: "게임" },
  { id: "focus", label: "집중력 저하" },
  { id: "call", label: "통화" },
  { id: "errand", label: "용무" },
];

const BY_ID = new Map(TIME_TASK_END_REASON_OPTIONS.map((o) => [o.id, o]));
const BY_LABEL = new Map(
  TIME_TASK_END_REASON_OPTIONS.map((o) => [o.label, o]),
);

/** @returns {string} 허용 id 또는 "" */
export function normalizeTimeEndReasonForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (BY_ID.has(s)) return s;
  const byLabel = BY_LABEL.get(s);
  return byLabel ? byLabel.id : "";
}

export function timeEndReasonLabelForId(id) {
  const key = normalizeTimeEndReasonForRow(id);
  return BY_ID.get(key)?.label || "";
}
