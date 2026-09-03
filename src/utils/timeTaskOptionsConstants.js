/** 시간가계부 과제 고정 목록 (Time.js UI와 동일 소스) */

/**
 * 내장 낮잠 기본 과제(선택 목록·결정적 id 기준).
 * 기록 저장 시에만 소요시간에 따라 이내/이상 라벨로 적힌다.
 */
export const NAP_TASK_NAME = "낮잠(30분 이내)";
/** @deprecated NAP_TASK_NAME 과 동일 — 기록 라벨 */
export const NAP_TASK_NAME_WITHIN_30 = "낮잠(30분 이내)";
/** 사용시간 30분 초과로 저장된 기록명 */
export const NAP_TASK_NAME_OVER_30 = "낮잠(30분이상)";

const NAP_TASK_NAMES_FOR_RULE = new Set([
  NAP_TASK_NAME,
  NAP_TASK_NAME_WITHIN_30,
  NAP_TASK_NAME_OVER_30,
  "낮잠",
  "낮잠 (30분 이상은 수면으로 기록)",
]);

/** 시간·오딧에서 30분 규칙 적용 대상(과거 표기·마이그레이션 전 데이터 포함) */
export function isNapBuiltinTaskName(name) {
  return NAP_TASK_NAMES_FOR_RULE.has(String(name || "").trim());
}

/** 과제 선택 UI용 — 기록 라벨이 있어도 선택값은 기본 낮잠 과제명 */
export function canonicalNapPickerTaskName(name) {
  const n = String(name || "").trim();
  return isNapBuiltinTaskName(n) ? NAP_TASK_NAME : n;
}

export const SLEEP_BUILTIN_TASK_NAME = "수면하기";

export function isSleepBuiltinTaskName(name) {
  return String(name || "").trim() === SLEEP_BUILTIN_TASK_NAME;
}

export const WORK_BUILTIN_TASK_NAME = "근무하기";

export function isWorkBuiltinTaskName(name) {
  return String(name || "").trim() === WORK_BUILTIN_TASK_NAME;
}

/** 표시·저장 기준 — 부정(기존 감정적이기) */
export const EMOTIONAL_NEGATIVE_TASK_NAME = "감정적이기 (부정적)";
/** 긍정 감정 과제 */
export const EMOTIONAL_POSITIVE_TASK_NAME = "감정적이기 (긍정적)";
/** @deprecated 구이름 별칭 — 값은 부정 과제명 */
export const EMOTIONAL_BUILTIN_TASK_NAME = EMOTIONAL_NEGATIVE_TASK_NAME;

function normalizeEmotionalTaskNameRaw(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  if (n === "감정적이기" || n === "감정적이기(부정적)" || n === EMOTIONAL_NEGATIVE_TASK_NAME) {
    return EMOTIONAL_NEGATIVE_TASK_NAME;
  }
  if (n === "감정적이기(긍정적)" || n === EMOTIONAL_POSITIVE_TASK_NAME) {
    return EMOTIONAL_POSITIVE_TASK_NAME;
  }
  return n;
}

export function isNegativeEmotionalTaskName(name) {
  return normalizeEmotionalTaskNameRaw(name) === EMOTIONAL_NEGATIVE_TASK_NAME;
}

export function isPositiveEmotionalTaskName(name) {
  return normalizeEmotionalTaskNameRaw(name) === EMOTIONAL_POSITIVE_TASK_NAME;
}

/** 부정·긍정 감정 과제 공통 */
export function isEmotionalBuiltinTaskName(name) {
  return isNegativeEmotionalTaskName(name) || isPositiveEmotionalTaskName(name);
}

/** @returns {"negative"|"positive"|null} */
export function emotionTaskPolarity(name) {
  if (isPositiveEmotionalTaskName(name)) return "positive";
  if (isNegativeEmotionalTaskName(name)) return "negative";
  return null;
}

/** 감정적이기(부정)만 트리거 UI */
export function emotionTaskUsesTriggers(name) {
  return isNegativeEmotionalTaskName(name);
}

export const FIXED_OTHER_TASKS = [
  { name: "수면하기", category: "sleep", productivity: "other" },
  { name: "근무하기", category: "work", productivity: "other" },
];

/** 기본 과제 목록에서 제거됨 — 기존 로컬·서버 행 정리용 */
export const RETIRED_BUILTIN_TASK_TEMPLATES = [
  /* 잘못 추가됐던 선택용 「낮잠」— 기본은 「낮잠(30분 이내)」만 */
  { name: "낮잠", category: "health", productivity: "productive" },
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
  { name: "독서노트 쓰기", category: "sideincome", productivity: "productive" },
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
  { name: "성찰 일기쓰기", category: "happiness", productivity: "productive" },
  { name: "외모관리", category: "happiness", productivity: "productive" },
  {
    name: EMOTIONAL_POSITIVE_TASK_NAME,
    category: "happiness",
    /* 생산적 > 행복 (몰입/종료 UI는 감정 과제라 별도 제외) */
    productivity: "productive",
  },
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
    name: EMOTIONAL_NEGATIVE_TASK_NAME,
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
  { from: "독서 및 독서노트 작성", to: "독서노트 쓰기" },
  { from: "독서노트 작성", to: "독서노트 쓰기" },
  { from: "시간기록 점검", to: "시간 관리 관련 행동" },
  { from: "시간기록 및 점검", to: "시간 관리 관련 행동" },
  { from: "메모하기", to: "기록하기" },
  { from: "감정적이기", to: EMOTIONAL_NEGATIVE_TASK_NAME },
  { from: "감정적이기(부정적)", to: EMOTIONAL_NEGATIVE_TASK_NAME },
  { from: "감정적이기(긍정적)", to: EMOTIONAL_POSITIVE_TASK_NAME },
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

/** 비생산적 대화 — 종류 칩 (meal_detail 앞부분) */
export const UNPRODUCTIVE_CONVERSATION_TASK_NAME = "비생산적 대화";
export const PRODUCTIVE_CONVERSATION_TASK_NAME = "생산적 대화";
/** 생산·비생산 대화 공통 — 대화 종류 */
export const CONVERSATION_TYPE_OPTIONS = [
  "논쟁",
  "훈수",
  "불평",
  "자랑",
  "변명",
  "비교",
  "험담",
  "억측",
  "허언",
  "기타",
];
/** @deprecated CONVERSATION_TYPE_OPTIONS 사용 */
export const UNPRODUCTIVE_CONVERSATION_TYPE_OPTIONS = CONVERSATION_TYPE_OPTIONS;
/** 말 점검 표 (생산·비생산 대화 공통) */
export const CONVERSATION_SPEECH_CHECK_OPTIONS = [
  "말 끊지 않기",
  "나 중심 대화 하지 않기",
  "말하는 동안 다음 할 말 준비하지 않기",
  "묻지 않은 조언 금지",
  "자리에 없는 사람 이야기 하지 않기",
  "휴대폰 보지 않기",
];

/** 말 점검 — 구 문구 → 현재 문구 (저장된 meal_detail 호환) */
const CONVERSATION_SPEECH_CHECK_LEGACY_LABEL = {
  "말 끊음": "말 끊지 않기",
  "나에게 쏠린 대화 중심": "나 중심 대화 하지 않기",
  "나에게 쏠린 대화중심": "나 중심 대화 하지 않기",
  "말하는 동안 다음 할 말 준비": "말하는 동안 다음 할 말 준비하지 않기",
  "말하는 동안 다음할말 준비": "말하는 동안 다음 할 말 준비하지 않기",
  "묻지 않은 조언": "묻지 않은 조언 금지",
  "자리에 없는 사람 이야기": "자리에 없는 사람 이야기 하지 않기",
  "휴대폰 보기": "휴대폰 보지 않기",
};
/** 종류 칩과 대화명 사이 구분자 */
export const CONVERSATION_TYPE_NAME_SEP = "｜";
/** 대화명(·종류)과 말 점검 사이 구분자 */
export const CONVERSATION_SPEECH_CHECK_SEP = "‖";

/** 생산적·비생산적 외출 — 과제 기록 시 외출명 입력 */
export const OUTING_DETAIL_TASK_NAMES = new Set([
  "생산적 외출",
  "비생산적 외출",
]);

/** 독서하기 — 과제 기록 시 도서명 입력 (meal_detail 저장) */
export const READING_DETAIL_TASK_NAMES = new Set(["독서하기"]);

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

/** 감정적이기(부정·긍정) — meal_detail 은 부정만 트리거로 사용 */
export const EMOTIONAL_DETAIL_TASK_NAMES = new Set([
  EMOTIONAL_NEGATIVE_TASK_NAME,
  EMOTIONAL_POSITIVE_TASK_NAME,
  "감정적이기",
  "감정적이기(부정적)",
  "감정적이기(긍정적)",
]);

/** 감정적이기 트리거 — time_ledger_entries.meal_detail 에 저장 (대분류·세부) */
export {
  EMOTION_TRIGGER_CATEGORIES,
  EMOTION_TRIGGER_OPTIONS,
  formatEmotionTrigger,
  parseEmotionTrigger,
  resolveEmotionTriggerLabel,
  emotionTriggerValueForSave,
  isEmotionTriggerCategoryLabel,
  emotionTriggerCategoryLabels,
  emotionTriggerSubsForCategory,
  emotionTriggerCategoryHint,
  emotionTriggerReportKey,
  emotionTriggerCategoryKey,
  emotionTriggerSituationPhrase,
  buildEmotionTriggerPatternSentence,
} from "./timeEmotionTriggers.js";

/** 콘텐츠 소비 — time_ledger_entries.meal_detail 에 저장 (복수 선택 가능) */
export const CONTENT_TYPE_OPTIONS = [
  "인스타 릴스/피드",
  "쇼츠",
  "ebook",
  "스레드",
  "유튜브(예능)",
  "유튜브(지식)",
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
  "AI",
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
  "마사지하기",
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

/**
 * 카드 제목 — 종류를 고른 경우 「무의식적 인스타 릴스/피드 콘텐츠 소비」
 * @param {string} taskName
 * @param {string} detailRaw
 */
export function formatContentConsumptionDisplayName(taskName, detailRaw) {
  const tn = String(taskName || "").trim();
  if (!isContentDetailTaskName(tn)) return "";
  const types = formatChipDetailDisplayText(tn, detailRaw).trim();
  if (!types) return tn;
  const tone = tn.includes("무의식적")
    ? "무의식적"
    : tn.includes("의식적")
      ? "의식적"
      : "";
  return tone ? `${tone} ${types} 콘텐츠 소비` : `${types} 콘텐츠 소비`;
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

/** @param {string} name */
export function isUnproductiveConversationTaskName(name) {
  const n = canonicalMealTaskDisplayName(name);
  if (n === UNPRODUCTIVE_CONVERSATION_TASK_NAME) return true;
  const raw = String(name || "").trim();
  return (
    raw === "비생산적 대화 또는 모임" || raw === "의미 없는 대화 또는 모임"
  );
}

/** 콘텐츠·위생·외모·생산·비생산 대화 종류 — 칩 UI */
export function taskUsesLedgerChipDetail(name) {
  return isChipDetailTaskName(name) || isConversationDetailTaskName(name);
}

/** @param {string} taskName */
export function ledgerChipDetailOptionsForTask(taskName) {
  if (isConversationDetailTaskName(taskName)) {
    return CONVERSATION_TYPE_OPTIONS;
  }
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
  if (isConversationDetailTaskName(taskName)) return "대화 종류";
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
 * @param {Iterable<string>} values
 * @returns {string[]}
 */
export function normalizeConversationSpeechChecks(values) {
  const order = new Map(
    CONVERSATION_SPEECH_CHECK_OPTIONS.map((o, i) => [o, i]),
  );
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const v of values || []) {
    let label = String(v || "").trim();
    if (!label) continue;
    label = CONVERSATION_SPEECH_CHECK_LEGACY_LABEL[label] || label;
    if (!order.has(label) || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  out.sort((a, b) => (order.get(a) || 0) - (order.get(b) || 0));
  return out;
}

/**
 * @param {string} raw
 * @returns {{ types: string[], name: string, speechChecks: string[] }}
 */
export function parseConversationDetail(raw) {
  let s = String(raw ?? "").trim();
  /** @type {string[]} */
  let speechChecks = [];
  if (s.includes(CONVERSATION_SPEECH_CHECK_SEP)) {
    const idx = s.indexOf(CONVERSATION_SPEECH_CHECK_SEP);
    const checkPart = s.slice(idx + CONVERSATION_SPEECH_CHECK_SEP.length).trim();
    s = s.slice(0, idx).trim();
    speechChecks = normalizeConversationSpeechChecks(
      parseChipDetailStoredValue("", checkPart),
    );
  }
  const tn = UNPRODUCTIVE_CONVERSATION_TASK_NAME;
  if (!s) return { types: [], name: "", speechChecks };
  if (s.includes(CONVERSATION_TYPE_NAME_SEP)) {
    const idx = s.indexOf(CONVERSATION_TYPE_NAME_SEP);
    const left = s.slice(0, idx).trim();
    const name = s.slice(idx + CONVERSATION_TYPE_NAME_SEP.length).trim();
    return {
      types: normalizeChipDetailSelection(
        tn,
        parseChipDetailStoredValue(tn, left),
      ),
      name,
      speechChecks,
    };
  }
  const parts = parseChipDetailStoredValue(tn, s);
  const known = normalizeChipDetailSelection(tn, parts);
  if (
    known.length > 0 &&
    known.length === parts.length &&
    known.every((label) => resolveChipDetailLabel(tn, label).known)
  ) {
    return { types: known, name: "", speechChecks };
  }
  return { types: [], name: s, speechChecks };
}

/**
 * @param {Iterable<string>} types
 * @param {string} name
 * @param {Iterable<string>} [speechChecks]
 */
export function serializeConversationDetail(types, name, speechChecks = []) {
  const tn = UNPRODUCTIVE_CONVERSATION_TASK_NAME;
  const typeStr = serializeChipDetailSelection(tn, types);
  const nameStr = String(name || "").trim();
  let main = "";
  if (typeStr && nameStr) {
    main = `${typeStr}${CONVERSATION_TYPE_NAME_SEP}${nameStr}`;
  } else {
    main = typeStr || nameStr;
  }
  const checkStr = normalizeConversationSpeechChecks(speechChecks).join(
    CHIP_DETAIL_STORE_SEPARATOR,
  );
  if (main && checkStr) {
    return `${main}${CONVERSATION_SPEECH_CHECK_SEP}${checkStr}`;
  }
  if (checkStr) return `${CONVERSATION_SPEECH_CHECK_SEP}${checkStr}`;
  return main;
}

/** @deprecated parseConversationDetail */
export function parseUnproductiveConversationDetail(raw) {
  const p = parseConversationDetail(raw);
  return { types: p.types, name: p.name, speechChecks: p.speechChecks };
}

/** @deprecated serializeConversationDetail */
export function serializeUnproductiveConversationDetail(
  types,
  name,
  speechChecks = [],
) {
  return serializeConversationDetail(types, name, speechChecks);
}

/** 화면용 — 대화명이 있으면 대화명, 없으면 종류 */
export function formatConversationDisplayText(raw) {
  const { types, name } = parseConversationDetail(raw);
  if (name) return name;
  if (types.length) return types.join(CHIP_DETAIL_STORE_SEPARATOR);
  return "";
}

/** @deprecated formatConversationDisplayText */
export function formatUnproductiveConversationDisplayText(raw) {
  return formatConversationDisplayText(raw);
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
export function isReadingDetailTaskName(name) {
  const n = String(name || "").trim();
  return READING_DETAIL_TASK_NAMES.has(n);
}

/** @param {string} name */
export function isEmotionalDetailTaskName(name) {
  return isEmotionalBuiltinTaskName(name);
}

/** 자유 텍스트 상세명 — time_ledger_entries.meal_detail 에 저장 */
export function isLedgerFreeTextDetailTaskName(name) {
  return (
    isMealDetailTaskName(name) ||
    isConversationDetailTaskName(name) ||
    isOutingDetailTaskName(name) ||
    isReadingDetailTaskName(name)
  );
}

/** 성찰 일기쓰기 — time_ledger_entries.meal_detail 에 질문 답 저장 */
export function isReflectionJournalTaskName(name) {
  return String(name || "").trim() === "성찰 일기쓰기";
}

/** 섭취·대화·외출·독서·콘텐츠·위생·외모·감정·성찰 — time_ledger_entries.meal_detail 에 저장 */
export function isLedgerDetailTaskName(name) {
  return (
    isLedgerFreeTextDetailTaskName(name) ||
    isContentDetailTaskName(name) ||
    isHygieneDetailTaskName(name) ||
    isAppearanceDetailTaskName(name) ||
    isEmotionalDetailTaskName(name) ||
    isReflectionJournalTaskName(name)
  );
}

/** @returns {"meal" | "conversation" | "outing" | "reading" | "content" | "hygiene" | "appearance" | "emotion" | "reflection" | null} */
export function ledgerDetailTaskKind(name) {
  if (isMealDetailTaskName(name)) return "meal";
  if (isConversationDetailTaskName(name)) return "conversation";
  if (isOutingDetailTaskName(name)) return "outing";
  if (isReadingDetailTaskName(name)) return "reading";
  if (isContentDetailTaskName(name)) return "content";
  if (isHygieneDetailTaskName(name)) return "hygiene";
  if (isAppearanceDetailTaskName(name)) return "appearance";
  if (isEmotionalDetailTaskName(name)) return "emotion";
  if (isReflectionJournalTaskName(name)) return "reflection";
  return null;
}

/** 기록 모달 입력 라벨 */
export function ledgerDetailInputLabel(kind) {
  if (kind === "meal") return "식단명";
  if (kind === "conversation") return "대화명";
  if (kind === "outing") return "외출명";
  if (kind === "reading") return "도서명";
  if (kind === "emotion") return "트리거";
  return "";
}

/** 기록 모달 placeholder */
export function ledgerDetailInputPlaceholder(kind) {
  if (kind === "meal") return "무엇을 드셨는지 한 줄로 적어 주세요";
  if (kind === "conversation") return "누구와 무엇에 대해 대화했는지 한 줄로 적어 주세요";
  if (kind === "outing") return "어디에 외출했는지 한 줄로 적어 주세요";
  if (kind === "reading") return "무슨 책을 읽었는지 한 줄로 적어 주세요";
  if (kind === "emotion") return "";
  return "";
}

/** 예상 일정 모달 placeholder (예정 문구) */
export function ledgerDetailInputPlaceholderExpected(kind) {
  if (kind === "meal") return "예정 식단을 한 줄로 적어 주세요";
  if (kind === "conversation") return "누구와 무엇에 대해 대화할지 한 줄로 적어 주세요";
  if (kind === "outing") return "어디에 외출할지 한 줄로 적어 주세요";
  if (kind === "reading") return "무슨 책을 읽을지 한 줄로 적어 주세요";
  if (kind === "emotion") return "";
  return "";
}

/** 카드·레포트 요약 접두 */
export function ledgerDetailLinePrefix(kind) {
  if (kind === "meal") return "식단";
  if (kind === "conversation") return "대화";
  if (kind === "outing") return "외출";
  if (kind === "reading") return "도서";
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

/** 건강한·건강하지 않은 「섭취」 — 맛 평가·섭취 레포트 전용(준비 과제 제외) */
export function isMealIntakeTasteRatingTaskName(name) {
  return (
    isHealthyMealDetailTaskName(name) || isUnhealthyMealDetailTaskName(name)
  );
}

/** 시간기록 모달에서 «이 시간 평가»를 받지 않는 내장 행동 */
const TIME_RATING_REMOVED_TASK_NAMES = new Set([]);

/** 별점만 — 몰입·아쉬움·좋았던/별로였던 칩 없음 */
const TIME_RATING_STARS_ONLY_TASK_NAMES = new Set([
  "생산적 소비",
  "비생산적 소비",
  "비생산적 대화",
  "시간 관리 관련 행동",
  "기록하기",
  "생산적 대화",
  "생산적 외출",
  "비생산적 외출",
  "외모관리",
  "잡무 처리하기",
  "개인 위생",
  "건강한 섭취 준비",
  "건강하지 않은 섭취 준비",
  WORK_BUILTIN_TASK_NAME,
  "잡생각하기",
  "단순 이동",
  "게임",
  "물건 찾기",
  "성찰 일기쓰기",
]);

export function isTimeRatingStarsOnlyBuiltinTaskName(name) {
  const n = canonicalMealTaskDisplayName(name);
  if (!n) return false;
  if (isNapBuiltinTaskName(n)) return true;
  return TIME_RATING_STARS_ONLY_TASK_NAMES.has(n);
}

export function isTimeRatingRemovedBuiltinTaskName(name) {
  const n = canonicalMealTaskDisplayName(name);
  if (!n) return false;
  if (isTimeRatingStarsOnlyBuiltinTaskName(n)) return false;
  return TIME_RATING_REMOVED_TASK_NAMES.has(n);
}

export const TASKS_LOCKED_FOR_EDIT = [
  NAP_TASK_NAME,
  NAP_TASK_NAME_WITHIN_30,
  NAP_TASK_NAME_OVER_30,
];

export const DEFAULT_TASK_OPTIONS = [
  ...FIXED_OTHER_TASKS,
  ...FIXED_PRODUCTIVE_TASKS,
  ...FIXED_NONPRODUCTIVE_TASKS,
];

/** 내장 과제(앱 코드) 목록 — 서버 병합·결정적 id용 */
export function getBuiltinTaskTemplates() {
  return DEFAULT_TASK_OPTIONS.map((t) => ({ ...t }));
}
