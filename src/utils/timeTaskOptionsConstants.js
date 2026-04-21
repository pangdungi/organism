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

export const FIXED_OTHER_TASKS = [
  { name: "수면하기", category: "sleep", productivity: "other" },
  { name: "근무하기", category: "work", productivity: "other" },
];

export const FIXED_PRODUCTIVE_TASKS = [
  {
    name: "감정적이기(긍정적)",
    category: "happiness",
    productivity: "productive",
  },
  {
    name: "생산적 소비",
    category: "sideincome",
    productivity: "productive",
  },
  { name: "돈 관리", category: "sideincome", productivity: "productive" },
  { name: "경제 공부", category: "sideincome", productivity: "productive" },
  { name: "경력 개발", category: "sideincome", productivity: "productive" },
  { name: "아이디어 작업하기", category: "dream", productivity: "productive" },
  { name: "독서하기", category: "dream", productivity: "productive" },
  { name: "독서노트 작성", category: "dream", productivity: "productive" },
  { name: "시간기록", category: "dream", productivity: "productive" },
  { name: "시간기록 점검", category: "dream", productivity: "productive" },
  { name: "병원 방문", category: "health", productivity: "productive" },
  { name: "마사지", category: "health", productivity: "productive" },
  { name: "스킨케어", category: "health", productivity: "productive" },
  {
    name: NAP_TASK_NAME,
    category: "health",
    productivity: "productive",
  },
  { name: "구강케어", category: "health", productivity: "productive" },
  { name: "샤워 및 씻기", category: "health", productivity: "productive" },
  { name: "바디케어", category: "health", productivity: "productive" },
  { name: "건강한 식사", category: "health", productivity: "productive" },
  { name: "건강한 식사 준비", category: "health", productivity: "productive" },
  { name: "감정 기록하기", category: "happiness", productivity: "productive" },
  {
    name: "의미 있는 영상 시청",
    category: "happiness",
    productivity: "productive",
  },
  { name: "의미 있는 대화", category: "happiness", productivity: "productive" },
  {
    name: "의미 있는 모임 참석",
    category: "happiness",
    productivity: "productive",
  },
  {
    name: "의식적 콘텐츠 소비",
    category: "happiness",
    productivity: "productive",
  },
  { name: "음악 듣기", category: "happiness", productivity: "productive" },
  {
    name: "잡동사니 일 해결하기",
    category: "happiness",
    productivity: "productive",
  },
  { name: "커피 마시기", category: "happiness", productivity: "productive" },
  { name: "다이어리 쓰기", category: "happiness", productivity: "productive" },
  { name: "메모하기", category: "happiness", productivity: "productive" },
  { name: "집안일 및 청소", category: "happiness", productivity: "productive" },
  { name: "빨래 및 옷 정리", category: "happiness", productivity: "productive" },
  { name: "화장 및 헤어", category: "happiness", productivity: "productive" },
];

export const FIXED_NONPRODUCTIVE_TASKS = [
  {
    name: "감정적이기(부정적)",
    category: "unhappiness",
    productivity: "nonproductive",
  },
  {
    name: "비생산적 소비",
    category: "moneylosing",
    productivity: "nonproductive",
  },
  {
    name: "뭐 살지 고민하기",
    category: "moneylosing",
    productivity: "nonproductive",
  },
  {
    name: "배달 메뉴 고민하기",
    category: "moneylosing",
    productivity: "nonproductive",
  },
  {
    name: "건강하지 않은 식사",
    category: "unhealthy",
    productivity: "nonproductive",
  },
  {
    name: "건강하지 않은 식사 준비",
    category: "unhealthy",
    productivity: "nonproductive",
  },
  {
    name: "술 마시기",
    category: "unhealthy",
    productivity: "nonproductive",
  },
  {
    name: "의미 없는 대화",
    category: "unhappiness",
    productivity: "nonproductive",
  },
  { name: "논쟁하기", category: "unhappiness", productivity: "nonproductive" },
  {
    name: "중요하지 않은 통화",
    category: "unhappiness",
    productivity: "nonproductive",
  },
  { name: "물건 찾기", category: "unhappiness", productivity: "nonproductive" },
  {
    name: "무의식적 폰 사용",
    category: "dreamblocking",
    productivity: "nonproductive",
  },
  {
    name: "무의식적 검색",
    category: "dreamblocking",
    productivity: "nonproductive",
  },
  { name: "단순 이동", category: "pleasure", productivity: "nonproductive" },
  {
    name: "쇼츠/릴스 피드 보기",
    category: "pleasure",
    productivity: "nonproductive",
  },
  {
    name: "무의식적 SNS",
    category: "pleasure",
    productivity: "nonproductive",
  },
  {
    name: "쾌락성 모임 참석",
    category: "pleasure",
    productivity: "nonproductive",
  },
  {
    name: "단순 쾌락형 영상 시청",
    category: "pleasure",
    productivity: "nonproductive",
  },
];

export const REPLACED_TASK_NAMES = ["감정적이기"];

/** 내장 과제 표시명 변경 시 구 이름 → 로컬 목록·시간기록 이전 */
export const BUILTIN_NAME_MIGRATIONS = [
  {
    from: "나갈 준비",
    to: "외출 준비",
    productivity: "productive",
    category: "happiness",
  },
];

export const TASKS_LOCKED_FOR_EDIT = [NAP_TASK_NAME];

export const DEFAULT_TASK_OPTIONS = [
  ...FIXED_OTHER_TASKS,
  ...FIXED_PRODUCTIVE_TASKS,
  ...FIXED_NONPRODUCTIVE_TASKS,
  { name: "영상편집", category: "sideincome", productivity: "productive" },
];

/** 내장 과제(앱 코드) 목록 — 서버 병합·결정적 id용 */
export function getBuiltinTaskTemplates() {
  return DEFAULT_TASK_OPTIONS.map((t) => ({ ...t }));
}
