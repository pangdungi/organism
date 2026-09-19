/**
 * KPT회고하기 — KEEP / Problem / Try
 * time_ledger_entries.meal_detail 에 KPTv1:JSON 으로 저장 (성찰일기와 동일 칸)
 */

export const KPT_RETROSPECTIVE_TASK_NAME = "KPT회고하기";
export const KPT_RETROSPECTIVE_PREFIX = "KPTv1:";

/** @type {{ id: string, label: string, placeholder: string, bridge: string }[]} */
export const KPT_RETROSPECTIVE_QUESTIONS = [
  {
    id: "keep",
    label: "KEEP",
    placeholder: "잘한 것, 유지할 것",
    bridge: "KEEP",
  },
  {
    id: "problem",
    label: "Problem",
    placeholder: "아쉬운것, 문제점",
    bridge: "Problem",
  },
  {
    id: "try",
    label: "Try",
    placeholder: "시도해볼것",
    bridge: "Try",
  },
];

/** @param {string} name */
export function isKptRetrospectiveTaskName(name) {
  const n = String(name || "").trim();
  return n === KPT_RETROSPECTIVE_TASK_NAME || n === "KPT회고";
}

/** @returns {Record<string, string>} */
export function emptyKptRetrospectiveAnswers() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const q of KPT_RETROSPECTIVE_QUESTIONS) out[q.id] = "";
  return out;
}

/**
 * @param {Record<string, string> | null | undefined} answers
 * @returns {string}
 */
export function packKptRetrospective(answers) {
  /** @type {Record<string, string>} */
  const out = {};
  let any = false;
  for (const q of KPT_RETROSPECTIVE_QUESTIONS) {
    const v = String(answers?.[q.id] ?? "").trim();
    if (!v) continue;
    out[q.id] = v;
    any = true;
  }
  if (!any) return "";
  return KPT_RETROSPECTIVE_PREFIX + JSON.stringify(out);
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function parseKptRetrospective(raw) {
  const empty = emptyKptRetrospectiveAnswers();
  const s = String(raw ?? "").trim();
  if (!s.startsWith(KPT_RETROSPECTIVE_PREFIX)) return empty;
  try {
    const obj = JSON.parse(s.slice(KPT_RETROSPECTIVE_PREFIX.length));
    if (!obj || typeof obj !== "object") return empty;
    for (const q of KPT_RETROSPECTIVE_QUESTIONS) {
      empty[q.id] = String(obj[q.id] ?? "").trim();
    }
  } catch (_) {}
  return empty;
}

/** 카드·검색용 — 질문 사이 말로 이은 한 줄 */
export function formatKptRetrospectiveDisplay(raw) {
  const answers = parseKptRetrospective(raw);
  const bits = [];
  for (const q of KPT_RETROSPECTIVE_QUESTIONS) {
    const body = answers[q.id];
    if (!body) continue;
    bits.push(`${q.bridge} ${body}`);
  }
  return bits.join(" / ");
}

/**
 * 카드 표시용 — 질문마다 라벨 칩 + 답
 * @returns {{ label: string, body: string }[]}
 */
export function kptRetrospectiveCardParts(raw) {
  const answers = parseKptRetrospective(raw);
  /** @type {{ label: string, body: string }[]} */
  const parts = [];
  for (const q of KPT_RETROSPECTIVE_QUESTIONS) {
    const body = String(answers[q.id] || "").trim();
    if (!body) continue;
    parts.push({ label: q.bridge, body });
  }
  return parts;
}
