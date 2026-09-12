/**
 * 성찰 일기 쓰기 — 질문 템플릿
 * time_ledger_entries.meal_detail 에 성찰v1:JSON 으로 저장
 */

export const REFLECTION_JOURNAL_TASK_NAME = "성찰 일기 쓰기";
export const REFLECTION_JOURNAL_PREFIX = "성찰v1:";

/** @type {{ id: string, label: string, bridge: string }[]} */
export const REFLECTION_JOURNAL_QUESTIONS = [
  {
    id: "q1",
    label: "Q1 오늘 내가 못한 것 또는 자제하지 못한 나쁜 습관은 무엇인가?",
    bridge: "못한 것",
  },
  {
    id: "q2",
    label: "Q2 어떻게 해야 더 나아질 수 있는가?",
    bridge: "더 나아지려면",
  },
  {
    id: "q3",
    label: "Q3 지금 내 행동은 좋은 것인가?",
    bridge: "내가 한 반응은",
  },
  {
    id: "q4",
    label: "Q4 어떻게 스스로를 향상시킬 것인가?",
    bridge: "이제 스스로를 향상시키기 위해",
  },
  {
    id: "q5",
    label: "Q5 지금 이 순간에 대한 명확한 판단력",
    bridge: "지금 이 순간 명확한 판단은",
  },
  {
    id: "q6",
    label: "Q6 지금 이 순간에 맞는 상식적 행동",
    bridge: "지금 이 순간에 맞는 상식적 행동은",
  },
  {
    id: "q7",
    label: "Q7 그래도 감사한 것",
    bridge: "그래도 감사한 건",
  },
  {
    id: "q8",
    label: "Q8 통제할 수 없는 것",
    bridge: "내가 통제할 수 없는 것은",
  },
  {
    id: "q9",
    label: "Q9 통제할 수 있는 것",
    bridge: "내가 통제할 수 있는 것은",
  },
];

/** @param {string} name */
export function isReflectionJournalTaskName(name) {
  const n = String(name || "").trim();
  return n === REFLECTION_JOURNAL_TASK_NAME || n === "성찰 일기쓰기";
}

/** @returns {Record<string, string>} */
export function emptyReflectionJournalAnswers() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const q of REFLECTION_JOURNAL_QUESTIONS) out[q.id] = "";
  return out;
}

/**
 * @param {Record<string, string> | null | undefined} answers
 * @returns {string}
 */
export function packReflectionJournal(answers) {
  /** @type {Record<string, string>} */
  const out = {};
  let any = false;
  for (const q of REFLECTION_JOURNAL_QUESTIONS) {
    const v = String(answers?.[q.id] ?? "").trim();
    if (!v) continue;
    out[q.id] = v;
    any = true;
  }
  if (!any) return "";
  return REFLECTION_JOURNAL_PREFIX + JSON.stringify(out);
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function parseReflectionJournal(raw) {
  const empty = emptyReflectionJournalAnswers();
  const s = String(raw ?? "").trim();
  if (!s.startsWith(REFLECTION_JOURNAL_PREFIX)) return empty;
  try {
    const obj = JSON.parse(s.slice(REFLECTION_JOURNAL_PREFIX.length));
    if (!obj || typeof obj !== "object") return empty;
    for (const q of REFLECTION_JOURNAL_QUESTIONS) {
      empty[q.id] = String(obj[q.id] ?? "").trim();
    }
  } catch (_) {}
  return empty;
}

/**
 * @returns {{ kind: "bridge" | "answer", text: string }[]}
 */
export function reflectionJournalDisplaySegments(raw) {
  const answers = parseReflectionJournal(raw);
  /** @type {{ kind: "bridge" | "answer", text: string }[]} */
  const segs = [];
  for (const q of REFLECTION_JOURNAL_QUESTIONS) {
    const body = answers[q.id];
    if (!body) continue;
    if (q.bridge) segs.push({ kind: "bridge", text: q.bridge });
    segs.push({ kind: "answer", text: body });
  }
  return segs;
}

/** 카드·검색용 — 질문 사이 말로 이은 한 줄 */
export function formatReflectionJournalDisplay(raw) {
  return reflectionJournalDisplaySegments(raw)
    .map((s) => s.text)
    .join(" / ");
}

/**
 * 카드 표시용 — 질문마다 라벨 칩 + 답
 * @returns {{ label: string, body: string }[]}
 */
export function reflectionJournalCardParts(raw) {
  const answers = parseReflectionJournal(raw);
  /** @type {{ label: string, body: string }[]} */
  const parts = [];
  for (const q of REFLECTION_JOURNAL_QUESTIONS) {
    const body = String(answers[q.id] || "").trim();
    if (!body) continue;
    const label = String(q.bridge || "").trim();
    if (label) parts.push({ label, body });
    else parts.push({ body });
  }
  return parts;
}
