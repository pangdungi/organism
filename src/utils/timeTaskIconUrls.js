/**
 * 시간가계부 과제 아이콘 — public/toolbaricons/time-task-picker 폴더만 사용.
 * iconKey(`svg:파일이름`) 우선, 없거나 구 세트면 과제·KPI 기본 fallback.
 */

import pickerSvgNames from "../../public/time-task-picker-icons.json";
import pickerIconFiles from "../../public/time-task-picker-icon-files.json";
import {
  canonicalMealTaskDisplayName,
  NAP_TASK_NAME,
  NAP_TASK_NAME_OVER_30,
  NAP_TASK_NAME_WITHIN_30,
} from "./timeTaskOptionsConstants.js";
import { DEFAULT_KPI_ICON_SLUG, DEFAULT_KPI_NAME_ICON_SLUG } from "./defaultKpiIconIds.js";
import { matchFlexibleSearch } from "./flexibleSearchMatch.js";
import { toolbarIconPng, withToolbarIconCacheVersion } from "./toolbarIconUrl.js";

const PICKER_ICON_BASE = "/toolbaricons/time-task-picker";
/** 과제 아이콘 전부 128×128 PNG (SVG 폴백만) */
const PICKER_ICON_EXT = "png";

/** KPI 탭 헤더 — 메인 메뉴 손그림 (picker 세트와 별도) */
export const KPI_CATEGORY_ICON_SRC = {
  dream: toolbarIconPng("menu-home/dream-new"),
  sideincome: toolbarIconPng("menu-home/sideincome-new"),
  happiness: toolbarIconPng("menu-home/hapiness-new"),
  health: toolbarIconPng("menu-home/health-new"),
  habittracker: withToolbarIconCacheVersion(
    `${PICKER_ICON_BASE}/meditation.png`,
  ),
};

const PICKER_SVG_SET = new Set(pickerSvgNames);

/** 삭제된 picker 파일명 → 대체 슬러그 (잘못 저장된 iconKey 호환) */
const REMOVED_PICKER_SLUG_ALIAS = {
  "train-1": "burger",
};

/** 기본 내장 과제명 → picker 슬러그 */
export const BUILTIN_TASK_ICON_SLUG = {
  "수면하기": "sleeping",
  "근무하기": "work",
  "생산적 소비": "money",
  "독서 노트 쓰기": "writting",
  "독서노트 쓰기": "writting",
  "시간 관리 관련 행동": "study",
  "시간기록 및 점검": "study",
  "개인 위생": "shower",
  [NAP_TASK_NAME]: "nap",
  [NAP_TASK_NAME_WITHIN_30]: "nap",
  [NAP_TASK_NAME_OVER_30]: "nap",
  "건강한 섭취": "healthy food",
  "건강한 섭취 준비": "cooking",
  "생산적 대화": "happy",
  "생산적 외출": "travel",
  "의식적 콘텐츠 소비": "phone",
  "기록하기": "writting",
  "성찰 일기 쓰기": "writting",
  "성찰 일기쓰기": "writting",
  "외모 관리": "skin care",
  "외모관리": "skin care",
  "비생산적 소비": "shopping bag",
  "건강하지 않은 섭취": "burger",
  "건강하지 않은 섭취 준비": "blender",
  "비생산적 대화": "sad",
  "감정적이기": "angry",
  "감정적이기 (부정적)": "angry",
  "감정적이기(부정적)": "angry",
  "감정적이기 (긍정적)": "happy",
  "감정적이기(긍정적)": "happy",
  "비생산적 외출": "beer",
  "물건 찾기": "packing",
  "잡생각하기": "잡생각",
  "단순 이동": "train",
  "게임": "headset",
  "무의식적 콘텐츠 소비": "youtube",
  "보충제 섭취": "medicine",
};

/** 아이콘 picker 검색용 한글·별칭 (영문 파일명 + 한글 키워드) */
const PICKER_SEARCH_EXTRA_RAW = {
  airplane: "비행기 여행",
  airplane1: "비행기 여행",
  sleeping: "수면 잠자기 침대 잠",
  moving_basic: "이동 자동차",
  Coffee: "커피 아메리카노",
  "to do list": "러닝 열심 달리기",
  sunset: "산 등산 해오름 해",
  sun: "해 태양 아침",
  rain: "비 구름",
  christmas: "크리스마스",
  reading: "독서 책 책읽기",
  packing: "가방",
  flower: "꽃 기념일",
  gift: "선물",
  "skin care": "외모 피부 스킨",
  "dental appointment": "치과",
  "drip coffee": "드립커피 커피",
  tea: "차 녹차",
  "healthy food": "건강식 야채",
  sad: "슬픔",
  travel: "여행",
  salary: "월급",
  birthday: "생일",
  "hair cut": "이발 미용실",
  cinema: "영화",
  clean: "청소",
  cloth: "옷",
  shower: "샤워",
  brush: "칫솔",
  dryer: "드라이기",
  work: "노트북",
  english: "영어",
  youtube: "유튜브",
  headset: "헤드셋",
  blender: "믹서기",
  rice: "밥 쌀",
  happy: "행복",
  angry: "화남",
  잡생각: "잡생각 머릿속",
  money: "돈",
  bedtime: "취침",
  mic: "마이크",
  stretching: "스트레칭 요가",
  running: "달리기",
  meditation: "명상",
  study: "공부",
  "shopping bag": "쇼핑",
  nap: "낮잠",
  "public holiday": "공휴일",
  phone: "스마트폰 폰 핸드폰 휴대폰",
  writting: "글쓰기 쓰기 일기 성찰",
  train: "지하철",
  burger: "햄버거",
  beer: "맥주",
  cooking: "요리",
  cocktail: "칵테일",
  puppy: "강아지",
  medicine: "약",
  "it's okay not to be okay": "괜찮아",
  "done is better than pefect": "하는게 낫다",
  "you can do this": "할수있다",
  "energy saving mode": "충전",
  그날: "그날 생리",
  baseball: "야구",
  rainsuit: "비옷 우비",
  puppywalk: "개산책",
  test: "시험",
  subway1: "기차 지하철",
  subway2: "기차 지하철",
  subway3: "기차 지하철",
  우울: "우울",
  "아무생각없음": "아무 생각",
  "난 완벽행": "완벽",
  "행복해짐": "행복",
  "해야지....": "해야지",
  sowhat: "소왓 어쩌라고",
  fighting: "파이팅",
  "it's okay": "괜찮아",
  /* 2026-08 스탬프 추가분 — 영문 파일명 한글 검색 */
  "10of10": "만점 10점 완벽 최고",
  bicycle: "자전거",
  bookstore: "서점 책방",
  charging: "충전 배터리 충전기",
  darksky: "밤하늘 달 별 야경 밤",
  finish: "완주 결승 도착 피니시 끝 마감",
  paitent: "환자 병원 병가 아픈",
  ramen: "라면 면 식사",
  readingbooks: "책읽기 독서 책 서적",
  sad2: "슬픔 울음 우울 눈물",
  sidedown: "옆으로 누움 옆으로눕기",
  snowmanwithsnow: "눈사람 눈 겨울 눈오는날",
  stone: "돌 바위 스톤",
  umbrellawithrain: "우산 비 장마 우천",
  notgoing: "안감 불참 결석 쉬기",
  happymomment: "행복한순간 행복 기쁨 추억",
  경찰서: "경찰서 경찰",
  문제없어: "문제없어 괜찮아",
  미움: "미움 싫어",
  은행: "은행",
  응원: "응원",
  이상무: "이상무",
  잊어: "잊어",
  잘났어: "잘났어",
  잘했어: "잘했어",
  케이크: "케이크 생일",
  발렌타인: "발렌타인 초콜릿 발렌타인데이",
  학교: "학교",
  힘내: "힘내 파이팅",
  신정: "신정 공휴일 새해 new year",
  삼일절: "삼일절 공휴일 3",
  어린이날: "어린이 공휴일",
  "부처님오신날": "부처님 공휴일",
  현충일: "현충일 휴일 공휴일",
  광복절: "광복절 휴일 공휴일",
  개천절: "개천절 휴일 공휴일",
  한글날: "한글 공휴일 휴일",
  추석: "추석 명절 공휴일",
  설날: "설날 명절 구정 공휴일",
  연휴: "연휴 휴일 공휴일",
  신나: "신나 기쁨 신남 행복",
  "오늘의 계획": "오늘 계획 플랜 할일 일정",
  "결혼 기념일": "결혼 기념 wedding anniversary",
  회복중: "회복 휴식 쉬는 recovering",
  배부름: "배부름 배부르 포만 식사 먹음",
  "우울해하지말자": "우울해하지말자 우울 위로 힘내",
  장례식: "장례 funeral",
  병가: "병가 아픔 병원",
  졸업식: "졸업 graduation",
  스승의날: "스승의날 스승 선생님 감사",
  어버이날: "어버이날 부모님 효",
  "day off1": "연차 쉬는날",
  day: "데이",
  evening: "이브닝",
  night: "나이트",
  "day off": "오프 쉬는날",
  egg: "달걀 계란",
  workerday: "노동절 근로자의날",
  alternativeholiday: "대체휴일",
  "no drink": "술 금주 안마심",
  sickalcohol: "술 술병",
  election: "선거",
  newyear: "새해 new year",
  church: "교회 church",
  buda: "절 부처님",
  camera: "카메라 촬영",
  candy: "캔디 사탕",
  출근: "출근",
  쉴거야: "쉴거야 핸드폰 폰",
  치킨: "치킨",
  떡볶이: "떡볶이",
  운동: "운동",
  헬스장: "헬스장 헬스",
  게임기: "게임기",
  칼퇴: "칼퇴",
  미친: "미친",
  청첩장: "청첩장",
  사회성소진: "사회성소진 사회성 소진",
  놀이공원: "놀이공원",
  사직서: "사직서",
  피자: "피자",
  삼겹살: "삼겹살",
  종강: "종강",
  캠핑: "캠핑",
  수영장: "수영장",
  soccer: "축구 축구장 경기 운동장",
  공강: "공강",
  인터넷요금: "인터넷요금",
  공과금: "공과금",
  가스비: "가스비",
  휴대폰요금: "휴대폰요금",
  파티: "파티",
  "what the fuck": "what the fuck",
  "what the fuck-1": "what the fuck",
  다이어트: "다이어트",
  단식: "단식",
  네가뭔데: "네가뭔데",
  살려줘: "살려줘",
  지쳤나요: "지쳤나요",
  도망가자: "도망가자",
  "이러시는 이유": "이러시는 이유",
  다울엇니: "다울엇니",
  킹받네: "킹받네",
  "어덯게든 되겠지": "어덯게든 되겠지",
  야호: "야호",
  야르: "야르",
  금연: "금연",
  금일체력소진: "금일체력소진",
  불타: "불타",
  걱정은쓰레기: "걱정은쓰레기",
  월급2: "월급",
  일기: "일기",
  책들: "책들",
  이케아: "이케아",
  바다: "바다",
  "혼잣말 어쩌고": "혼잣말 어쩌고",
  "혼잣말 비웃": "혼잣말 비웃",
  "명언 불행": "명언 불행",
  "명언 해피": "명언 해피",
  명언화해: "명언화해",
  "명언 자책": "명언 자책",
  "시작하면 된다": "시작하면 된다",
  좋아해: "좋아해",
  사랑해: "사랑해",
  징징: "징징",
  특별해: "특별해",
  고독: "고독",
  시시: "시시",
};

/** JSON 파일명(NFD)·별칭 — picker 검색용 */
const PICKER_SEARCH_EXTRA_NFC = (() => {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const [k, v] of Object.entries(PICKER_SEARCH_EXTRA_RAW)) {
    const nf = k.normalize("NFC");
    map.set(nf, v);
    map.set(nf.toLowerCase(), v);
  }
  for (const fileName of pickerSvgNames) {
    const nf = String(fileName || "").normalize("NFC");
    if (!nf || map.has(nf)) continue;
    for (const [k, v] of Object.entries(PICKER_SEARCH_EXTRA_RAW)) {
      if (k.normalize("NFC") === nf) {
        map.set(nf, v);
        break;
      }
    }
    if (!map.has(nf) && /[\u3131-\uD79D]/.test(nf)) {
      map.set(nf, nf);
    }
  }
  const holidayTag = "공휴일 휴일";
  const holidayNfc = new Set(
    [
      "public holiday",
      "신정",
      "삼일절",
      "어린이날",
      "부처님오신날",
      "현충일",
      "광복절",
      "개천절",
      "한글날",
      "추석",
      "설날",
      "연휴",
    ].map((s) => s.normalize("NFC")),
  );
  for (const fileName of pickerSvgNames) {
    const nf = String(fileName || "").normalize("NFC");
    if (!holidayNfc.has(nf)) continue;
    const prev = map.get(nf) || nf;
    map.set(nf, `${prev} ${holidayTag}`.trim());
  }
  return map;
})();

/** 과제 설정 모달 — 캘린더 스탬프·공휴일 전용 아이콘 제외 */
export const TIME_TASK_ICON_PICKER_LIST_OPTS = {
  includeCalendarStampOnly: false,
};

/** 캘린더 날짜 스탬프 picker — 공휴일·스탬프 전용 아이콘 포함 */
export const CALENDAR_STAMP_ICON_PICKER_LIST_OPTS = {
  includeCalendarStampOnly: true,
};

export const CALENDAR_STAMP_CATEGORY_ALL = "all";
export const CALENDAR_STAMP_CATEGORY_HOLIDAY = "holiday";
export const CALENDAR_STAMP_CATEGORY_TIME = "time";
export const CALENDAR_STAMP_CATEGORY_EVENT = "event";
export const CALENDAR_STAMP_CATEGORY_FOOD = "food";
export const CALENDAR_STAMP_CATEGORY_EMOTION = "emotion";
export const CALENDAR_STAMP_CATEGORY_WORK = "work";
export const CALENDAR_STAMP_CATEGORY_DAILY = "daily";
export const CALENDAR_STAMP_CATEGORY_WEATHER = "weather";
export const CALENDAR_STAMP_CATEGORY_CHEER = "cheer";
export const CALENDAR_STAMP_CATEGORY_MENT = "ment";
export const CALENDAR_STAMP_CATEGORY_QUOTE = "quote";

/** 날짜 스탬프 「공휴일」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_HOLIDAY_SLUGS = new Set(
  [
    "alternativeholiday",
    "christmas",
    "election",
    "newyear",
    "public holiday",
    "workerday",
    "개천절",
    "광복절",
    "부처님오신날",
    "삼일절",
    "설날",
    "스승의날",
    "신정",
    "어린이날",
    "어버이날",
    "연휴",
    "추석",
    "한글날",
    "현충일",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampHolidayIcon(name) {
  return CALENDAR_STAMP_HOLIDAY_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** `1am start` · `10pm start` 같은 시각 숫자 스탬프 */
export function isCalendarStampTimeIcon(name) {
  return /^\d{1,2}(am|pm)\s+start$/i.test(String(name || "").trim());
}

function calendarStampTimeSortKey(name) {
  const m = String(name || "").trim().match(/^(\d{1,2})(am|pm)\s+start$/i);
  if (!m) return 9999;
  let hour = Number(m[1]);
  const ap = m[2].toLowerCase();
  if (ap === "am") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return hour;
}

/** 날짜 스탬프 「이벤트」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_EVENT_SLUGS = new Set(
  [
    "airplane",
    "airplane1",
    "baseball",
    "beer",
    "birthday",
    "buda",
    "candy",
    "church",
    "cinema",
    "day",
    "day off",
    "day off1",
    "dental appointment",
    "hair cut",
    "night",
    "salary",
    "subway1",
    "subway2",
    "subway3",
    "test",
    "그날",
    "놀이공원",
    "발렌타인",
    "병가",
    "월세",
    "은행",
    "장례식",
    "졸업식",
    "종강",
    "청첩장",
    "카드값",
    "케이크",
    "moving_basic",
    "결혼 기념일",
    "병원",
    "학교",
    "evening",
    "flower",
    "gift",
    "경찰서",
    "플렉스",
    "travel",
    "soccer",
    "공강",
    "인터넷요금",
    "공과금",
    "가스비",
    "휴대폰요금",
    "파티",
    "what the fuck",
    "what the fuck-1",
    "다이어트",
    "단식",
    "다울엇니",
    "어덯게든 되겠지",
    "야호",
    "야르",
    "금연",
    "월급2",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampEventIcon(name) {
  return CALENDAR_STAMP_EVENT_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** 날짜 스탬프 「음식」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_FOOD_SLUGS = new Set(
  [
    "blender",
    "burger",
    "cocktail",
    "Coffee",
    "cooking",
    "drip coffee",
    "egg",
    "healthy food",
    "ramen",
    "rice",
    "sickalcohol",
    "tea",
    "떡볶이",
    "치킨",
    "피자",
    "삼겹살",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampFoodIcon(name) {
  return CALENDAR_STAMP_FOOD_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** 날짜 스탬프 「감정」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_EMOTION_SLUGS = new Set(
  [
    "angry",
    "happy",
    "happymomment",
    "it's okay",
    "it's okay not to be okay",
    "sad",
    "sad2",
    "sowhat",
    "미움",
    "신나",
    "아무생각없음",
    "우울",
    "행복해짐",
    "힘내",
    "우울해하지말자",
    "잊어",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampEmotionIcon(name) {
  return CALENDAR_STAMP_EMOTION_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** 날짜 스탬프 「직장인」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_WORK_SLUGS = new Set(
  [
    "출근",
    "fighting",
    "finish",
    "train",
    "work",
    "writting",
    "you can do this",
    "칼퇴",
    "미친",
    "사회성소진",
    "stone",
    "해야지...",
    "사직서",
    "도망가자",
    "이러시는 이유",
    "킹받네",
    "지쳤나요",
    "살려줘",
    "네가뭔데",
    "금일체력소진",
    "불타",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampWorkIcon(name) {
  return CALENDAR_STAMP_WORK_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** 날짜 스탬프 「일상」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_DAILY_SLUGS = new Set(
  [
    "bedtime",
    "bicycle",
    "bookstore",
    "brush",
    "camera",
    "energy saving mode",
    "clean",
    "cloth",
    "darksky",
    "dryer",
    "english",
    "headset",
    "medicine",
    "meditation",
    "mic",
    "money",
    "nap",
    "youtube",
    "게임기",
    "packing",
    "paitent",
    "phone",
    "puppy",
    "puppywalk",
    "reading",
    "readingbooks",
    "running",
    "shopping bag",
    "shower",
    "skin care",
    "sleeping",
    "stretching",
    "study",
    "to do list",
    "배부름",
    "수영장",
    "쉴거야",
    "운동",
    "이상무",
    "잡생각",
    "헬스장",
    "회복중",
    "charging",
    "done is better than pefect",
    "no drink",
    "sidedown",
    "오늘의 계획",
    "notgoing",
    "이케아",
    "바다",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampDailyIcon(name) {
  return CALENDAR_STAMP_DAILY_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** 날짜 스탬프 「날씨」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_WEATHER_SLUGS = new Set(
  [
    "rain",
    "rainsuit",
    "snowmanwithsnow",
    "sun",
    "sunset",
    "umbrellawithrain",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampWeatherIcon(name) {
  return CALENDAR_STAMP_WEATHER_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** 날짜 스탬프 「응원」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_CHEER_SLUGS = new Set(
  [
    "응원",
    "10of10",
    "난 완벽행",
    "문제없어",
    "잘났어",
    "잘했어",
    "걱정은쓰레기",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampCheerIcon(name) {
  return CALENDAR_STAMP_CHEER_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** 날짜 스탬프 「멘트」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_MENT_SLUGS = new Set(
  [
    "혼잣말 어쩌고",
    "혼잣말 비웃",
    "좋아해",
    "사랑해",
    "징징",
    "특별해",
    "고독",
    "시시",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampMentIcon(name) {
  return CALENDAR_STAMP_MENT_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** 날짜 스탬프 「명언」 탭 — 파일은 그대로, 분류만 */
const CALENDAR_STAMP_QUOTE_SLUGS = new Set(
  ["시작하면 된다", "명언 불행", "명언 해피", "명언화해", "명언 자책"].map(
    (s) => s.normalize("NFC"),
  ),
);

/** @param {string} name picker JSON 슬러그 */
export function isCalendarStampQuoteIcon(name) {
  return CALENDAR_STAMP_QUOTE_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** @param {string} iconFileName */
export function buildPickerIconSearchText(iconFileName) {
  const name = String(iconFileName || "").trim();
  const nf = name.normalize("NFC");
  const extra = pickerSearchExtraForIconName(name);
  const baseLabel = name.replace(/-/g, " ");
  if (/[\u3131-\uD79D]/.test(nf)) {
    return `${baseLabel} ${nf} ${extra}`.trim().replace(/\s+/g, " ");
  }
  return `${baseLabel} ${extra}`.trim();
}

/** @param {string} name */
function pickerSearchExtraLookup(name) {
  const nf = String(name || "").trim().normalize("NFC");
  if (!nf) return "";
  const hit =
    PICKER_SEARCH_EXTRA_NFC.get(nf) ||
    PICKER_SEARCH_EXTRA_NFC.get(nf.toLowerCase());
  if (hit) return hit;
  if (/[\u3131-\uD79D]/.test(nf)) return nf;
  return "";
}

/** @param {string} name */
function pickerTimeStartSearchExtra(name) {
  const m = String(name || "").match(/^(\d{1,2})(am|pm)\s+start$/i);
  if (!m) return "";
  const hour = m[1];
  const ampm = m[2].toLowerCase();
  const ko = ampm === "am" ? "오전 아침" : "오후 저녁 밤";
  let special = "";
  if (hour === "0" && ampm === "am") special = "0 12 자정";
  if (hour === "12" && ampm === "pm") special = "12 정오";
  return `${hour} ${hour}시 ${ko} ${special}`.trim();
}

/** @param {string} name */
function pickerSearchExtraForIconName(name) {
  const base = pickerSearchExtraLookup(name);
  const timeExtra = pickerTimeStartSearchExtra(name);
  return [base, timeExtra].filter(Boolean).join(" ").trim();
}

const PRODUCTIVE_CATEGORIES = new Set([
  "sideincome",
  "happiness",
  "health",
]);

/** iconKey 없을 때 — 비생산 카테고리 기본 */
const NONPRODUCTIVE_CATEGORY_PICKER_ICON = {
  unhealthy: "burger",
  unhappiness: "sad",
  media_watch: "youtube",
  pleasure: "cinema",
  moneylosing: "shopping bag",
};

/** 기본 KPI·내장 과제·비생산 카테고리 기본 아이콘 키 (`svg:슬러그`) */
export function listDefaultPickerIconKeys() {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const addSlug = (slug) => {
    const s = normalizePickerSlug(slug);
    if (!s) return;
    const key = `svg:${s}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  for (const slug of Object.values(DEFAULT_KPI_ICON_SLUG)) addSlug(slug);
  for (const slug of Object.values(DEFAULT_KPI_NAME_ICON_SLUG)) addSlug(slug);
  for (const slug of Object.values(BUILTIN_TASK_ICON_SLUG)) addSlug(slug);
  for (const slug of Object.values(NONPRODUCTIVE_CATEGORY_PICKER_ICON)) {
    addSlug(slug);
  }
  return out;
}

/** @param {string} name */
function findPickerSlug(name) {
  let s = String(name || "").trim();
  if (!s) return "";
  const aliased =
    REMOVED_PICKER_SLUG_ALIAS[s] || REMOVED_PICKER_SLUG_ALIAS[s.toLowerCase()];
  if (aliased) s = aliased;
  if (PICKER_SVG_SET.has(s)) return s;
  const lower = s.toLowerCase();
  if (PICKER_SVG_SET.has(lower)) return lower;
  for (const n of pickerSvgNames) {
    if (n.toLowerCase() === lower) return n;
  }
  const mapped = pickerIconFiles[s] || pickerIconFiles[lower];
  if (mapped && PICKER_SVG_SET.has(mapped)) return mapped;
  return "";
}

/** @param {string} slug */
function normalizePickerSlug(slug) {
  return findPickerSlug(slug);
}

/**
 * picker 폴더에 실제 있는 아이콘인지 (구 svg:슬러그는 false)
 * @param {string} key
 */
export function isValidPickerIconKey(key) {
  return !!getTimeTaskIconSrcByKey(key);
}

/** @param {string} slug @param {string} [ext] */
function pickerIconSrc(slug, ext = PICKER_ICON_EXT) {
  const key = normalizePickerSlug(slug);
  if (!key) return "";
  const fileBase = pickerIconFiles[key];
  if (!fileBase) return "";
  return withToolbarIconCacheVersion(
    `${PICKER_ICON_BASE}/${encodeURIComponent(fileBase)}.${ext}`,
  );
}

/** @param {string} taskName */
export function getDefaultTaskIconKey(taskName) {
  const canon = canonicalMealTaskDisplayName(String(taskName || "").trim());
  const slug = BUILTIN_TASK_ICON_SLUG[canon];
  if (!slug || !normalizePickerSlug(slug)) return "";
  return `svg:${normalizePickerSlug(slug)}`;
}

/** @param {string} [kpiId] @param {string} [kpiName] */
export function getDefaultKpiIconKey(kpiId, kpiName) {
  const id = String(kpiId || "").trim();
  if (id && DEFAULT_KPI_ICON_SLUG[id]) {
    const slug = normalizePickerSlug(DEFAULT_KPI_ICON_SLUG[id]);
    if (slug) return `svg:${slug}`;
  }
  const name = String(kpiName || "").trim();
  if (name && DEFAULT_KPI_NAME_ICON_SLUG[name]) {
    const slug = normalizePickerSlug(DEFAULT_KPI_NAME_ICON_SLUG[name]);
    if (slug) return `svg:${slug}`;
  }
  return getDefaultTaskIconKey(kpiName);
}

/**
 * 저장 iconKey → KPI·과제 기본 순으로 유효 키 선택
 * @param {{ iconKey?: string, kpiId?: string, taskName?: string }} opts
 */
export function resolveEffectiveTaskIconKey(opts = {}) {
  const stored = String(opts.iconKey || "").trim();
  if (stored && getTimeTaskIconSrcByKey(stored)) {
    return normalizeStoredPickerIconKey(stored) || stored;
  }
  const kpiDefault = getDefaultKpiIconKey(opts.kpiId, opts.taskName);
  if (kpiDefault && getTimeTaskIconSrcByKey(kpiDefault)) return kpiDefault;
  const taskDefault = getDefaultTaskIconKey(opts.taskName);
  if (taskDefault && getTimeTaskIconSrcByKey(taskDefault)) return taskDefault;
  return "";
}

function resolvePickerSvgFileName(name) {
  return normalizePickerSlug(name);
}

/** @param {string} fileName picker JSON 슬러그 */
function pickerListedIconSrc(fileName) {
  const n = resolvePickerSvgFileName(fileName);
  if (!n) return "";
  /* SVG는 48px 그림이 들어 있어 흐림. 목록은 256 PNG */
  return pickerIconSrc(n, PICKER_ICON_EXT) || pickerIconSrc(n, "svg");
}

/**
 * @param {string} key
 * @returns {string}
 */
function isRemovedQuoteStartIconKey(iconKey) {
  const k = String(iconKey || "").trim().normalize("NFC");
  if (!k) return false;
  const bare = k.startsWith("svg:") || k.startsWith("png:") ? k.slice(4).trim() : k;
  return bare === "명언 시작".normalize("NFC");
}

export function getTimeTaskIconSrcByKey(key) {
  const k = String(key || "").trim();
  if (!k || isRemovedQuoteStartIconKey(k)) return "";
  if (k.startsWith("svg:")) {
    const fileName = resolvePickerSvgFileName(k.slice(4).trim());
    if (!fileName) return "";
    return pickerListedIconSrc(fileName);
  }
  if (k.startsWith("png:")) {
    const name = resolvePickerSvgFileName(k.slice(4).trim());
    if (!name) return "";
    return pickerListedIconSrc(name);
  }
  const bare = resolvePickerSvgFileName(k);
  if (bare) return pickerListedIconSrc(bare);
  return "";
}

/**
 * 캘린더·목록 — 256 PNG 우선. SVG는 48px 래스터라 크게 보면 깨짐.
 * @param {string} key
 * @returns {string}
 */
export function getTimeTaskIconDisplaySrcByKey(key) {
  const k = String(key || "").trim();
  if (!k || isRemovedQuoteStartIconKey(k)) return "";
  const slugRaw = k.startsWith("svg:") || k.startsWith("png:") ? k.slice(4).trim() : k;
  const fileName = resolvePickerSvgFileName(slugRaw);
  if (!fileName) return "";
  return pickerIconSrc(fileName, PICKER_ICON_EXT) || pickerIconSrc(fileName, "svg");
}

/**
 * @param {string} taskName
 * @param {{ iconKey?: string, category?: string, productivity?: string }} [opts]
 * @returns {string}
 */
export function getTimeTaskListIconSrc(taskName, opts = {}) {
  const effectiveKey = resolveEffectiveTaskIconKey({
    iconKey: opts.iconKey,
    kpiId: opts.kpiId,
    taskName,
  });
  if (effectiveKey) {
    const src = getTimeTaskIconSrcByKey(effectiveKey);
    if (src) return src;
  }
  return resolveCategoryFallbackIconSrc(opts.category, opts.productivity);
}

function normalizeStoredPickerIconKey(iconKey) {
  const k = String(iconKey || "").trim();
  if (!k) return "";
  if (k.startsWith("png:") || k.startsWith("svg:")) {
    const fileName = resolvePickerSvgFileName(k.slice(4).trim());
    return fileName ? `svg:${fileName}` : "";
  }
  const fileName = resolvePickerSvgFileName(k);
  return fileName ? `svg:${fileName}` : "";
}

/**
 * @param {string} taskName
 * @param {{ iconKey?: string, category?: string, productivity?: string }} [opts]
 * @returns {string}
 */
export function resolveTimeTaskIconKey(taskName, opts = {}) {
  const iconKey = String(opts.iconKey || "").trim();
  const normalized = normalizeStoredPickerIconKey(iconKey);
  if (normalized && getTimeTaskIconSrcByKey(normalized)) return normalized;
  if (iconKey && getTimeTaskIconSrcByKey(iconKey)) {
    return normalizeStoredPickerIconKey(iconKey) || iconKey;
  }
  const defaultKey = getDefaultTaskIconKey(taskName);
  if (defaultKey && getTimeTaskIconSrcByKey(defaultKey)) return defaultKey;
  return resolveCategoryFallbackIconKey(opts.category, opts.productivity);
}

/**
 * @param {string} taskName
 * @param {{ iconKey?: string, category?: string, productivity?: string, kpiId?: string }} [opts]
 * @returns {string}
 */
export function resolveTimeTaskDisplayIconSrc(taskName, opts = {}) {
  return getTimeTaskListIconSrc(taskName, opts);
}

function productiveCategoryFallbackSrc(category, productivity) {
  const cat = String(category || "")
    .trim()
    .toLowerCase();
  if (!PRODUCTIVE_CATEGORIES.has(cat)) return "";
  const p = String(productivity || "")
    .trim()
    .toLowerCase();
  if (p === "nonproductive" || p === "other") return "";
  return KPI_CATEGORY_ICON_SRC[cat] || "";
}

function nonproductiveCategoryFallbackKey(category, productivity) {
  const cat = String(category || "")
    .trim()
    .toLowerCase();
  const name = NONPRODUCTIVE_CATEGORY_PICKER_ICON[cat];
  if (!name || !PICKER_SVG_SET.has(name)) return "";
  const p = String(productivity || "")
    .trim()
    .toLowerCase();
  if (p === "productive" || p === "other") return "";
  return `svg:${name}`;
}

function resolveCategoryFallbackIconSrc(category, productivity) {
  const prod = productiveCategoryFallbackSrc(category, productivity);
  if (prod) return prod;
  const key = nonproductiveCategoryFallbackKey(category, productivity);
  return key ? getTimeTaskIconSrcByKey(key) : "";
}

function resolveCategoryFallbackIconKey(category, productivity) {
  if (productiveCategoryFallbackSrc(category, productivity)) return "";
  return nonproductiveCategoryFallbackKey(category, productivity);
}

function pickerIconLabelFromFilename(name) {
  return String(name || "")
    .trim()
    .replace(/-/g, " ");
}

/** 캘린더 날짜 스탬프 전용 — 과제 설정 아이콘 선택 그리드에서는 제외 */
const CALENDAR_STAMP_ONLY_PICKER_SLUGS = new Set(
  [
    "10of10",
    "alternativeholiday",
    "birthday",
    "election",
    "newyear",
    "no drink",
    "sickalcohol",
    "candy",
    "쉴거야",
    "workerday",
    "day off",
    "day off1",
    "day",
    "done is better than pefect",
    "evening",
    "it's okay",
    "it's okay not to be okay",
    "night",
    "sidedown",
    "sowhat",
    "notgoing",
    "paitent",
    "stone",
    "you can do this",
    "결혼 기념일",
    "개천절",
    "광복절",
    "그날",
    "난 완벽행",
    "문제없어",
    "발렌타인",
    "병가",
    "설날",
    "스승의날",
    "신정",
    "어린이날",
    "어버이날",
    "연휴",
    "오늘의 계획",
    "우울",
    "우울해하지말자",
    "응원",
    "월세",
    "이상무",
    "잊어",
    "잘났어",
    "잘했어",
    "장례식",
    "졸업식",
    "카드값",
    "추석",
    "힘내",
    "삼일절",
    "부처님오신날",
    "현충일",
    "한글날",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
function isCalendarStampOnlyPickerIcon(name) {
  return CALENDAR_STAMP_ONLY_PICKER_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** 피커 목록에서만 숨김 — 파일·이미 찍힌 스탬프는 유지 */
const PICKER_HIDDEN_SLUGS = new Set(
  ["책들", "캠핑", "일기", "명언 시작"].map((s) => s.normalize("NFC")),
);

function isPickerHiddenIcon(name) {
  return PICKER_HIDDEN_SLUGS.has(String(name || "").trim().normalize("NFC"));
}

/** @param {string} searchText @param {string} query */
export function matchTimeTaskPickerIconSearch(searchText, query) {
  return matchFlexibleSearch(searchText, query);
}

/**
 * @param {{ includeCalendarStampOnly?: boolean, stampCategory?: string }} [opts]
 *   includeCalendarStampOnly — true면 스탬프·공휴일 전용 아이콘 포함
 *   stampCategory — holiday / time / event
 * @returns {{ key: string, label: string, src: string, searchText: string }[]}
 */
export function getTimeTaskPickableIcons(opts = {}) {
  const includeStampOnly = opts.includeCalendarStampOnly === true;
  const stampCategory = String(opts.stampCategory || "").trim();
  /** @type {{ key: string, label: string, src: string, searchText: string, _name?: string }[]} */
  const out = [];
  for (const name of pickerSvgNames) {
    if (isPickerHiddenIcon(name)) continue;
    if (!includeStampOnly && isCalendarStampOnlyPickerIcon(name)) continue;
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_HOLIDAY &&
      !isCalendarStampHolidayIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_TIME &&
      !isCalendarStampTimeIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_EVENT &&
      !isCalendarStampEventIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_FOOD &&
      !isCalendarStampFoodIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_EMOTION &&
      !isCalendarStampEmotionIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_WORK &&
      !isCalendarStampWorkIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_DAILY &&
      !isCalendarStampDailyIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_WEATHER &&
      !isCalendarStampWeatherIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_CHEER &&
      !isCalendarStampCheerIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_MENT &&
      !isCalendarStampMentIcon(name)
    ) {
      continue;
    }
    if (
      stampCategory === CALENDAR_STAMP_CATEGORY_QUOTE &&
      !isCalendarStampQuoteIcon(name)
    ) {
      continue;
    }
    const src = pickerListedIconSrc(name);
    if (!src) continue;
    out.push({
      key: `svg:${name}`,
      label: pickerIconLabelFromFilename(name),
      src,
      searchText: buildPickerIconSearchText(name),
      _name: name,
    });
  }
  if (stampCategory === CALENDAR_STAMP_CATEGORY_TIME) {
    out.sort(
      (a, b) =>
        calendarStampTimeSortKey(a._name) - calendarStampTimeSortKey(b._name),
    );
  }
  for (const row of out) delete row._name;
  return out;
}
