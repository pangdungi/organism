/** 시간가계부 과제 고정 목록 (Time.js UI와 동일 소스) */

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
  { name: "독서 노트", category: "dream", productivity: "productive" },
  { name: "시간기록", category: "dream", productivity: "productive" },
  { name: "시간기록 점검", category: "dream", productivity: "productive" },
  { name: "건강 검진", category: "health", productivity: "productive" },
  { name: "병원 방문", category: "health", productivity: "productive" },
  { name: "마사지", category: "health", productivity: "productive" },
  { name: "스킨케어", category: "health", productivity: "productive" },
  {
    name: "낮잠 (30분 이상은 수면으로 기록)",
    category: "health",
    productivity: "productive",
  },
  { name: "구강케어", category: "health", productivity: "productive" },
  { name: "샤워 및 씻기", category: "health", productivity: "productive" },
  { name: "바디케어", category: "health", productivity: "productive" },
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
  { name: "덕질하기", category: "happiness", productivity: "productive" },
  { name: "다이어리 쓰기", category: "happiness", productivity: "productive" },
  { name: "메모하기", category: "happiness", productivity: "productive" },
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
    name: "의미 없는 대화 (험담, 불평, 단순 대화)",
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
    name: "알람 끄고 침대에 누워 있기",
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

export const TASKS_LOCKED_FOR_EDIT = ["낮잠"];

export const DEFAULT_TASK_OPTIONS = [
  ...FIXED_OTHER_TASKS,
  ...FIXED_PRODUCTIVE_TASKS,
  ...FIXED_NONPRODUCTIVE_TASKS,
  { name: "전화통화", category: "dream", productivity: "productive" },
  { name: "영상편집", category: "sideincome", productivity: "productive" },
  { name: "러닝하기", category: "health", productivity: "productive" },
];

/** 내장 과제(앱 코드) 목록 — 서버 병합·결정적 id용 */
export function getBuiltinTaskTemplates() {
  return DEFAULT_TASK_OPTIONS.map((t) => ({ ...t }));
}
