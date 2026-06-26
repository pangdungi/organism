/** 시간가계부 과제 고정 목록 (Time.js UI와 동일 소스) */

/** 내장 낮잠 과제: 기록 시간 30분 초과 시 쾌락/비생산으로 분류 */
export const NAP_TASK_NAME = "낮잠(30분 이내)";

const NAP_TASK_NAMES_FOR_RULE = new Set([
  NAP_TASK_NAME,
  "낮잠 (30분 이상은 수면으로 기록)",
  "낮잠",
]);

/** 시간·오딧에서 30분 규칙 적용 대상(과거 표기·마이그레이션 전 데이터 포함) */
export function isNapBuiltinTaskName(name) {
  return NAP_TASK_NAMES_FOR_RULE.has(String(name || "").trim());
}

export const SLEEP_BUILTIN_TASK_NAME = "수면하기";

export function isSleepBuiltinTaskName(name) {
  return String(name || "").trim() === SLEEP_BUILTIN_TASK_NAME;
}

export const WORK_BUILTIN_TASK_NAME = "근무하기";

export function isWorkBuiltinTaskName(name) {
  return String(name || "").trim() === WORK_BUILTIN_TASK_NAME;
}

export const EMOTIONAL_BUILTIN_TASK_NAME = "감정적이기";

export function isEmotionalBuiltinTaskName(name) {
  return String(name || "").trim() === EMOTIONAL_BUILTIN_TASK_NAME;
}

export const FIXED_OTHER_TASKS = [
  { name: "수면하기", category: "sleep", productivity: "other" },
  { name: "근무하기", category: "work", productivity: "other" },
];

/** 기본 과제 목록에서 제거됨 — 기존 로컬·서버 행 정리용 */
export const RETIRED_BUILTIN_TASK_TEMPLATES = [
  { name: "구매 고민", category: "moneylosing", productivity: "nonproductive" },
  { name: "술 마시기", category: "unhealthy", productivity: "nonproductive" },
  { name: "논쟁하기", category: "unhappiness", productivity: "nonproductive" },
  {
    name: "중요하지 않은 통화",
    category: "unhappiness",
    productivity: "nonproductive",
  },
  {
    name: "의미 있는 모임 참석",
    category: "happiness",
    productivity: "productive",
  },
  {
    name: "무의식적 검색",
    category: "dreamblocking",
    productivity: "nonproductive",
  },
  {
    name: "무의식적 폰 사용",
    category: "dreamblocking",
    productivity: "nonproductive",
  },
  {
    name: "쾌락성 모임 참석",
    category: "pleasure",
    productivity: "nonproductive",
  },
  {
    name: "의식적 검색",
    category: "happiness",
    productivity: "productive",
  },
  {
    name: "의미 있는 영상 시청",
    category: "happiness",
    productivity: "productive",
  },
  {
    name: "쇼츠/릴스 피드 보기",
    category: "media_watch",
    productivity: "nonproductive",
  },
  { name: "마사지", category: "health", productivity: "productive" },
  { name: "스킨케어", category: "health", productivity: "productive" },
  { name: "구강케어", category: "health", productivity: "productive" },
  { name: "샤워 및 씻기", category: "health", productivity: "productive" },
  { name: "바디케어", category: "health", productivity: "productive" },
  { name: "병원 방문", category: "health", productivity: "productive" },
  { name: "집안일 및 청소", category: "happiness", productivity: "productive" },
  { name: "빨래 및 옷 정리", category: "happiness", productivity: "productive" },
  { name: "화장 및 헤어", category: "happiness", productivity: "productive" },
  { name: "커피 마시기", category: "happiness", productivity: "productive" },
  { name: "잡동사니 일 해결하기", category: "happiness", productivity: "productive" },
  { name: "감정 기록하기", category: "happiness", productivity: "productive" },
  { name: "음악 듣기", category: "happiness", productivity: "productive" },
  { name: "다이어리 쓰기", category: "happiness", productivity: "productive" },
  { name: "아이디어 작업하기", category: "sideincome", productivity: "productive" },
  { name: "시간기록", category: "sideincome", productivity: "productive" },
  { name: "독서노트 작성", category: "sideincome", productivity: "productive" },
  { name: "돈 관리", category: "sideincome", productivity: "productive" },
  { name: "경제 공부", category: "sideincome", productivity: "productive" },
  { name: "경력 개발", category: "sideincome", productivity: "productive" },
  { name: "영상편집", category: "sideincome", productivity: "productive" },
];

/** 제거된 과제 세부 카테고리 — 기존 과제·기록 마이그레이션 */
export const RETIRED_TIME_TASK_CATEGORY_REMAP = {
  dreamblocking: "pleasure",
  dream: "sideincome",
};

/** @param {string} category */
export function canonicalTimeTaskCategory(category) {
  const c = String(category || "").trim();
  return RETIRED_TIME_TASK_CATEGORY_REMAP[c] || c;
}

export const RETIRED_BUILTIN_TASK_NAMES = new Set(
  RETIRED_BUILTIN_TASK_TEMPLATES.map((t) => t.name),
);

/** @param {string} name */
export function isRetiredBuiltinTaskName(name) {
  return RETIRED_BUILTIN_TASK_NAMES.has(String(name || "").trim());
}

export const FIXED_PRODUCTIVE_TASKS = [
  {
    name: "생산적 소비",
    category: "sideincome",
    productivity: "productive",
  },
  { name: "독서 및 독서노트 작성", category: "sideincome", productivity: "productive" },
  { name: "시간 관리 관련 행동", category: "sideincome", productivity: "productive" },
  { name: "개인 위생", category: "health", productivity: "productive" },
  {
    name: NAP_TASK_NAME,
    category: "health",
    productivity: "productive",
  },
  { name: "건강한 섭취", category: "health", productivity: "productive" },
  { name: "건강한 섭취 준비", category: "health", productivity: "productive" },
  {
    name: "생산적 대화",
    category: "happiness",
    productivity: "productive",
  },
  {
    name: "생산적 외출",
    category: "happiness",
    productivity: "productive",
  },
  {
    name: "의식적 콘텐츠 소비",
    category: "happiness",
    productivity: "productive",
  },
  { name: "기록하기", category: "happiness", productivity: "productive" },
  { name: "외모관리", category: "happiness", productivity: "productive" },
];

export const FIXED_NONPRODUCTIVE_TASKS = [
  {
    name: "비생산적 소비",
    category: "moneylosing",
    productivity: "nonproductive",
  },
  {
    name: "건강하지 않은 섭취",
    category: "unhealthy",
    productivity: "nonproductive",
  },
  {
    name: "건강하지 않은 섭취 준비",
    category: "unhealthy",
    productivity: "nonproductive",
  },
  {
    name: "비생산적 대화",
    category: "unhappiness",
    productivity: "nonproductive",
  },
  {
    name: "감정적이기",
    category: "unhappiness",
    productivity: "nonproductive",
  },
  {
    name: "비생산적 외출",
    category: "pleasure",
    productivity: "nonproductive",
  },
  { name: "물건 찾기", category: "unhappiness", productivity: "nonproductive" },
  { name: "잡생각하기", category: "unhappiness", productivity: "nonproductive" },
  { name: "단순 이동", category: "pleasure", productivity: "nonproductive" },
  { name: "게임", category: "pleasure", productivity: "nonproductive" },
  {
    name: "무의식적 콘텐츠 소비",
    category: "media_watch",
    productivity: "nonproductive",
  },
];

/** 구버전 기본 과제명(식사 → 섭취) — 기존 기록·서버 과제 목록 호환 */
export const MEAL_TASK_NAME_RENAMES = [
  { from: "건강한 식사", to: "건강한 섭취" },
  { from: "건강한 식사 준비", to: "건강한 섭취 준비" },
  { from: "건강하지 않은 식사", to: "건강하지 않은 섭취" },
  { from: "건강하지 않은 식사 준비", to: "건강하지 않은 섭취 준비" },
  { from: "생산적 대화 또는 모임", to: "생산적 대화" },
  { from: "의미 있는 대화 및 모임", to: "생산적 대화" },
  { from: "비생산적 대화 또는 모임", to: "비생산적 대화" },
  { from: "의미 없는 대화 또는 모임", to: "비생산적 대화" },
  { from: "단순 쾌락형 영상 시청", to: "무의식적 콘텐츠 소비" },
  { from: "무의식적 영상 시청", to: "무의식적 콘텐츠 소비" },
  { from: "독서하기", to: "독서 및 독서노트 작성" },
  { from: "독서노트 작성", to: "독서 및 독서노트 작성" },
  { from: "시간기록 점검", to: "시간 관리 관련 행동" },
  { from: "시간기록 및 점검", to: "시간 관리 관련 행동" },
  { from: "메모하기", to: "기록하기" },
  { from: "감정적이기(긍정적)", to: "감정적이기" },
  { from: "감정적이기(부정적)", to: "감정적이기" },
];

/** 표시·저장 기준 이름(구이름이면 새 이름으로 치환) */
export function canonicalMealTaskDisplayName(name) {
  const n = String(name || "").trim();
  if (!n) return n;
  for (const { from, to } of MEAL_TASK_NAME_RENAMES) {
    if (n === from) return to;
  }
  return n;
}

/** 건강한·건강하지 않은 「섭취」 과제만 — 「준비」 과제는 식단명 미표시 */
export const MEAL_DETAIL_TASK_NAMES = new Set([
  "건강한 섭취",
  "건강하지 않은 섭취",
]);

/** 생산적·비생산적 대화 — 과제 기록 시 대화명 입력 */
export const CONVERSATION_DETAIL_TASK_NAMES = new Set([
  "생산적 대화",
  "비생산적 대화",
]);

/** 생산적·비생산적 외출 — 과제 기록 시 외출명 입력 */
export const OUTING_DETAIL_TASK_NAMES = new Set([
  "생산적 외출",
  "비생산적 외출",
]);

/** 의식적·무의식적 콘텐츠 소비 — 과제 기록 시 소비 내용 입력 */
export const CONTENT_DETAIL_TASK_NAMES = new Set([
  "의식적 콘텐츠 소비",
  "무의식적 콘텐츠 소비",
]);

/** 개인 위생 — 과제 기록 시 항목 선택 */
export const PERSONAL_HYGIENE_DETAIL_TASK_NAMES = new Set([
  "개인 위생",
  "개인위생",
]);

/** 외모관리 — 과제 기록 시 항목 선택 */
export const APPEARANCE_DETAIL_TASK_NAMES = new Set(["외모관리"]);

/** 감정적이기 — 과제 기록 시 트리거(감정을 일으킨 상황) 선택 */
export const EMOTIONAL_DETAIL_TASK_NAMES = new Set([EMOTIONAL_BUILTIN_TASK_NAME]);

/** 감정적이기 트리거 — time_ledger_entries.meal_detail 에 저장 */
export const EMOTION_TRIGGER_OPTIONS = [
  "사람·관계",
  "업무·성취",
  "신체 상태",
  "환경·외부 자극",
  "디지털·정보",
  "돈·미래",
];

/** 콘텐츠 소비 — time_ledger_entries.meal_detail 에 저장 (복수 선택 가능) */
export const CONTENT_TYPE_OPTIONS = [
  "인스타 릴스/피드",
  "쇼츠",
  "ebook",
  "스레드",
  "유튜브 영상(예능)",
  "유튜브 영상(지식)",
  "OTT",
  "영화",
  "뉴스",
  "팟캐스트",
  "음악 스트리밍",
  "블로그",
  "커뮤니티",
  "틱톡",
  "라이브스트리밍",
  "웹툰",
  "웹소설",
  "온라인 강좌",
];

/** 개인 위생 — time_ledger_entries.meal_detail 에 저장 */
export const PERSONAL_HYGIENE_TYPE_OPTIONS = [
  "구강케어",
  "체모관리",
  "샤워",
  "목욕",
  "손발톱 정리",
];

/** 외모관리 — time_ledger_entries.meal_detail 에 저장 */
export const APPEARANCE_TYPE_OPTIONS = [
  "네일 시술",
  "미용시술",
  "스킨케어",
  "패션/코디",
  "헤어 스타일링",
  "화장",
];

/** @param {string} value @returns {{ label: string, known: boolean }} */
export function resolveContentTypeLabel(value) {
  const v = String(value || "").trim();
  if (!v) return { label: "", known: false };
  const found = CONTENT_TYPE_OPTIONS.find(
    (opt) => opt === v || opt.toLowerCase() === v.toLowerCase(),
  );
  return found ? { label: found, known: true } : { label: v, known: false };
}

/** @param {string} value */
export function isKnownContentType(value) {
  return resolveContentTypeLabel(value).known;
}

/** @param {string} value @returns {{ label: string, known: boolean }} */
export function resolveEmotionTriggerLabel(value) {
  const v = String(value || "").trim();
  if (!v) return { label: "", known: false };
  const found = EMOTION_TRIGGER_OPTIONS.find((opt) => opt === v);
  return found ? { label: found, known: true } : { label: v, known: false };
}

/** 레포트 집계용 — 목록 외(구 자유텍스트)는 「기타」 */
export function contentTypeReportLabel(value) {
  const { label, known } = resolveContentTypeLabel(value);
  if (!label) return "(미선택)";
  return known ? label : "기타";
}

/** @param {string} name */
export function isMealDetailTaskName(name) {
  const n = canonicalMealTaskDisplayName(name);
  if (MEAL_DETAIL_TASK_NAMES.has(n)) return true;
  const raw = String(name || "").trim();
  return raw === "건강한 식사" || raw === "건강하지 않은 식사";
}

/** @param {string} name */
export function isContentDetailTaskName(name) {
  const n = String(name || "").trim();
  return CONTENT_DETAIL_TASK_NAMES.has(n);
}

/** @param {string} name */
export function isHygieneDetailTaskName(name) {
  const n = String(name || "").trim();
  return PERSONAL_HYGIENE_DETAIL_TASK_NAMES.has(n);
}

/** @param {string} name */
export function isAppearanceDetailTaskName(name) {
  const n = String(name || "").trim();
  return APPEARANCE_DETAIL_TASK_NAMES.has(n);
}

/** @param {string} kind */
export function isChipDetailTaskKind(kind) {
  return kind === "content" || kind === "hygiene" || kind === "appearance";
}

/** @param {string} name */
export function isChipDetailTaskName(name) {
  return isChipDetailTaskKind(ledgerDetailTaskKind(name));
}

/** @param {string} taskName */
export function ledgerChipDetailOptionsForTask(taskName) {
  const kind = ledgerDetailTaskKind(taskName);
  if (kind === "content") return CONTENT_TYPE_OPTIONS;
  if (kind === "hygiene") return PERSONAL_HYGIENE_TYPE_OPTIONS;
  if (kind === "appearance") return APPEARANCE_TYPE_OPTIONS;
  return [];
}

/**
 * @param {string} taskName
 * @param {string} value
 * @returns {{ label: string, known: boolean }}
 */
export function resolveChipDetailLabel(taskName, value) {
  const v = String(value || "").trim();
  if (!v) return { label: "", known: false };
  const options = ledgerChipDetailOptionsForTask(taskName);
  const found = options.find(
    (opt) => opt === v || opt.toLowerCase() === v.toLowerCase(),
  );
  return found ? { label: found, known: true } : { label: v, known: false };
}

/** @param {string} taskName */
export function ledgerChipDetailSectionLabel(taskName) {
  const kind = ledgerDetailTaskKind(taskName);
  if (kind === "content") return "콘텐츠 종류";
  if (kind === "hygiene") return "개인위생";
  if (kind === "appearance") return "외모관리";
  return "";
}

/** 칩 상세 복수 선택 — meal_detail 저장·표시 구분자 */
export const CHIP_DETAIL_STORE_SEPARATOR = " · ";

/**
 * @param {string} _taskName
 * @param {string} raw
 * @returns {string[]}
 */
export function parseChipDetailStoredValue(_taskName, raw) {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  if (s.includes(CHIP_DETAIL_STORE_SEPARATOR)) {
    return s
      .split(CHIP_DETAIL_STORE_SEPARATOR)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [s];
}

/**
 * @param {string} taskName
 * @param {Iterable<string>} values
 * @returns {string[]}
 */
export function normalizeChipDetailSelection(taskName, values) {
  const tn = String(taskName || "").trim();
  const options = ledgerChipDetailOptionsForTask(tn);
  const optionOrder = new Map(options.map((o, i) => [o, i]));
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const v of values || []) {
    const resolved = resolveChipDetailLabel(tn, v);
    const label = resolved.label;
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  out.sort((a, b) => {
    const ia = optionOrder.has(a) ? optionOrder.get(a) : 999;
    const ib = optionOrder.has(b) ? optionOrder.get(b) : 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, "ko");
  });
  return out;
}

/**
 * @param {string} taskName
 * @param {Iterable<string>} values
 */
export function serializeChipDetailSelection(taskName, values) {
  return normalizeChipDetailSelection(taskName, values).join(
    CHIP_DETAIL_STORE_SEPARATOR,
  );
}

/**
 * @param {string} taskName
 * @param {string} raw
 */
export function formatChipDetailDisplayText(taskName, raw) {
  return serializeChipDetailSelection(
    taskName,
    parseChipDetailStoredValue(taskName, raw),
  );
}

/**
 * @param {string} taskName
 * @param {string} raw
 * @returns {string[]}
 */
export function chipDetailLabelsForReport(taskName, raw) {
  return normalizeChipDetailSelection(
    taskName,
    parseChipDetailStoredValue(taskName, raw),
  );
}

/** @param {string} name */
export function isConversationDetailTaskName(name) {
  const n = canonicalMealTaskDisplayName(name);
  if (CONVERSATION_DETAIL_TASK_NAMES.has(n)) return true;
  const raw = String(name || "").trim();
  return (
    raw === "생산적 대화 또는 모임" ||
    raw === "의미 있는 대화 및 모임" ||
    raw === "비생산적 대화 또는 모임" ||
    raw === "의미 없는 대화 또는 모임"
  );
}

/** @param {string} name */
export function isOutingDetailTaskName(name) {
  const n = String(name || "").trim();
  return OUTING_DETAIL_TASK_NAMES.has(n);
}

/** @param {string} name */
export function isEmotionalDetailTaskName(name) {
  return EMOTIONAL_DETAIL_TASK_NAMES.has(String(name || "").trim());
}

/** 자유 텍스트 상세명 — time_ledger_entries.meal_detail 에 저장 */
export function isLedgerFreeTextDetailTaskName(name) {
  return (
    isMealDetailTaskName(name) ||
    isConversationDetailTaskName(name) ||
    isOutingDetailTaskName(name)
  );
}

/** 섭취·대화·외출·콘텐츠·위생·외모·감정 — time_ledger_entries.meal_detail 에 저장 */
export function isLedgerDetailTaskName(name) {
  return (
    isLedgerFreeTextDetailTaskName(name) ||
    isContentDetailTaskName(name) ||
    isHygieneDetailTaskName(name) ||
    isAppearanceDetailTaskName(name) ||
    isEmotionalDetailTaskName(name)
  );
}

/** @returns {"meal" | "conversation" | "outing" | "content" | "hygiene" | "appearance" | "emotion" | null} */
export function ledgerDetailTaskKind(name) {
  if (isMealDetailTaskName(name)) return "meal";
  if (isConversationDetailTaskName(name)) return "conversation";
  if (isOutingDetailTaskName(name)) return "outing";
  if (isContentDetailTaskName(name)) return "content";
  if (isHygieneDetailTaskName(name)) return "hygiene";
  if (isAppearanceDetailTaskName(name)) return "appearance";
  if (isEmotionalDetailTaskName(name)) return "emotion";
  return null;
}

/** 기록 모달 입력 라벨 */
export function ledgerDetailInputLabel(kind) {
  if (kind === "meal") return "식단명";
  if (kind === "conversation") return "대화명";
  if (kind === "outing") return "외출명";
  if (kind === "emotion") return "트리거";
  return "";
}

/** 기록 모달 placeholder */
export function ledgerDetailInputPlaceholder(kind) {
  if (kind === "meal") return "무엇을 드셨는지 한 줄로 적어 주세요";
  if (kind === "conversation") return "누구와 무엇에 대해 대화했는지 한 줄로 적어 주세요";
  if (kind === "outing") return "어디에 외출했는지 한 줄로 적어 주세요";
  if (kind === "emotion") return "";
  return "";
}

/** 카드·레포트 요약 접두 */
export function ledgerDetailLinePrefix(kind) {
  if (kind === "meal") return "식단";
  if (kind === "conversation") return "대화";
  if (kind === "outing") return "외출";
  if (kind === "content") return "콘텐츠";
  if (kind === "hygiene") return "개인위생";
  if (kind === "appearance") return "외모";
  if (kind === "emotion") return "트리거";
  return "";
}

/** @param {string} name */
export function isUnhealthyMealDetailTaskName(name) {
  const n = canonicalMealTaskDisplayName(name);
  return n === "건강하지 않은 섭취";
}

/** @param {string} name */
export function isHealthyMealDetailTaskName(name) {
  const n = canonicalMealTaskDisplayName(name);
  return n === "건강한 섭취";
}

export const TASKS_LOCKED_FOR_EDIT = [NAP_TASK_NAME];

export const DEFAULT_TASK_OPTIONS = [
  ...FIXED_OTHER_TASKS,
  ...FIXED_PRODUCTIVE_TASKS,
  ...FIXED_NONPRODUCTIVE_TASKS,
];

/** 내장 과제(앱 코드) 목록 — 서버 병합·결정적 id용 */
export function getBuiltinTaskTemplates() {
  return DEFAULT_TASK_OPTIONS.map((t) => ({ ...t }));
}
