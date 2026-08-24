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
  writting: "글쓰기 쓰기",
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
  finish: "완주 결승 도착 피니시 끝",
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
  학교: "학교",
  힘내: "힘내 파이팅",
  신정: "신정 공휴일",
  삼일절: "삼일절 공휴일",
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
  return pickerIconSrc(n, PICKER_ICON_EXT);
}

/**
 * @param {string} key
 * @returns {string}
 */
export function getTimeTaskIconSrcByKey(key) {
  const k = String(key || "").trim();
  if (!k) return "";
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
 * 캘린더·목록 등 크게 보이는 곳 — SVG 원본 우선(선명), 없으면 PNG
 * @param {string} key
 * @returns {string}
 */
export function getTimeTaskIconDisplaySrcByKey(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  const slugRaw = k.startsWith("svg:") || k.startsWith("png:") ? k.slice(4).trim() : k;
  const fileName = resolvePickerSvgFileName(slugRaw);
  if (!fileName) return "";
  const svgSrc = pickerIconSrc(fileName, "svg");
  if (svgSrc) return svgSrc;
  return pickerIconSrc(fileName, PICKER_ICON_EXT);
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
    "day off",
    "day off1",
    "day",
    "evening",
    "night",
    "신정",
    "삼일절",
    "어린이날",
    "부처님오신날",
    "현충일",
    "광복절",
    "개천절",
    "한글날",
    "설날",
    "추석",
    "장례식",
    "병가",
    "졸업식",
    "스승의날",
    "어버이날",
  ].map((s) => s.normalize("NFC")),
);

/** @param {string} name picker JSON 슬러그 */
function isCalendarStampOnlyPickerIcon(name) {
  return CALENDAR_STAMP_ONLY_PICKER_SLUGS.has(
    String(name || "").trim().normalize("NFC"),
  );
}

/** @param {string} searchText @param {string} query */
export function matchTimeTaskPickerIconSearch(searchText, query) {
  return matchFlexibleSearch(searchText, query);
}

/**
 * @param {{ includeCalendarStampOnly?: boolean }} [opts]
 *   includeCalendarStampOnly — true면 스탬프·공휴일 전용 아이콘 포함
 * @returns {{ key: string, label: string, src: string, searchText: string }[]}
 */
export function getTimeTaskPickableIcons(opts = {}) {
  const includeStampOnly = opts.includeCalendarStampOnly === true;
  /** @type {{ key: string, label: string, src: string, searchText: string }[]} */
  const out = [];
  for (const name of pickerSvgNames) {
    if (!includeStampOnly && isCalendarStampOnlyPickerIcon(name)) continue;
    const src = pickerListedIconSrc(name);
    if (!src) continue;
    out.push({
      key: `svg:${name}`,
      label: pickerIconLabelFromFilename(name),
      src,
      searchText: buildPickerIconSearchText(name),
    });
  }
  return out;
}
