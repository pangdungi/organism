/**
 * 시간가계부 과제 아이콘(URL 고정 경로).
 * 1) 과제명 정확 매칭 → 전용 아이콘
 * 2) 없음 + 생산 버킷(dream/sideincome/happiness/health) → 해당 카테고리 아이콘
 * 3) 2에서 없음 + 비생산 버킷(쾌락/미디어/꿈방해/불행/비건강/돈손실) → 해당 카테고리 아이콘
 */

import pickerSvgNames from "../../public/time-task-picker-icons.json";

const BASE = "/toolbaricons/time-task";
const PICKER_SVG_BASE = "/toolbaricons/time-task-picker";

/** 아이콘 선택 모달 — 추가 PNG(사용자 제공) */
const PICKER_PNG_EXTRAS = [
  ["팔 올린 사람", "person-raisedarms"],
  ["팔 벌린 사람", "person-spread"],
  ["사람", "person-green"],
  ["팀", "team"],
  ["사용자 추가", "user-add"],
  ["사용자 취소", "user-cancel"],
];

/** @type {readonly [string, string][]} [표시용 과제명(공백 포함), 파일 베이스명(.png)] */
const ORDERED_PAIRS = [
  ["근무하기", "work"],
  ["수면하기", "sleep-bed"],
  ["감정적이기(긍정적)", "emotion-positive"],
  ["생산적 소비", "productive-consumption"],
  ["돈 관리", "money-manage"],
  ["경제 공부", "econ-study"],
  ["경력 개발", "career"],
  ["아이디어 작업하기", "idea"],
  ["독서하기", "reading"],
  ["독서노트 작성", "reading-notes"],
  ["시간기록", "time-log"],
  ["시간기록 점검", "time-log-review"],
  ["병원 방문", "hospital"],
  ["마사지", "massage"],
  ["스킨케어", "skincare"],
  /* 건강·행복 계열 (순서: 사용자 제공 이미지와 대응) */
  ["낮잠(30분 이내)", "nap"],
  ["낮잠", "nap"],
  ["낮잠 (30분 이상은 수면으로 기록)", "nap"],
  ["구강케어", "oral-care"],
  ["샤워 및 씻기", "shower"],
  ["샤워 씻기", "shower"],
  ["바디케어", "body-care"],
  ["건강한 섭취", "meal-healthy"],
  ["건강한 섭취 준비", "meal-prep"],
  ["건강한 식사", "meal-healthy"],
  ["건강한 식사 준비", "meal-prep"],
  ["감정 기록하기", "emotion-log"],
  ["의미 있는 영상 시청", "meaningful-video"],
  ["생산적 대화", "productive-talk"],
  ["의미 있는 모임 참석", "meaningful-meeting"],
  ["의식적 콘텐츠 소비", "conscious-content"],
  /* 일상·비생산 과제 (사용자 제공 이미지 순서) */
  ["의식적 검색", "conscious-search"],
  ["음악 듣기", "music-listen"],
  ["음악듣기", "music-listen"],
  ["잡동사니 일 해결하기", "junk-chores"],
  ["커피 마시기", "coffee"],
  ["커피마시기", "coffee"],
  ["다이어리 쓰기", "diary"],
  ["다이어리쓰기", "diary"],
  ["메모하기", "memo"],
  ["집안일 및 청소", "housework"],
  ["빨래 및 옷 정리", "laundry"],
  ["화장 및 헤어", "makeup-hair"],
  ["화장및 헤어", "makeup-hair"],
  ["감정적이기(부정적)", "emotion-negative"],
  ["감정적이기(붇정적)", "emotion-negative"],
  ["비생산적 소비", "nonproductive-consumption"],
  ["구매 고민", "shopping-dither"],
  ["구매고민", "shopping-dither"],
  ["뭐 살지 고민하기", "shopping-dither"],
  ["건강하지 않은 섭취", "unhealthy-meal"],
  ["건강하지 않은 식사", "unhealthy-meal"],
  /* 추가 비생산·방해 과제 */
  ["건강하지 않은 섭취 준비", "unhealthy-meal-prep"],
  ["건강하지 않은 식사 준비", "unhealthy-meal-prep"],
  ["술 마시기", "alcohol"],
  ["술마시기", "alcohol"],
  ["비생산적 대화", "unproductive-conversation"],
  ["논쟁하기", "argue"],
  ["중요하지 않은 통화", "call-unimportant"],
  ["물건 찾기", "find-things"],
  ["무의식적 폰 사용", "mindless-phone"],
  ["무의식적 검색", "mindless-search"],
  ["단순 이동", "simple-travel"],
  ["단순이동", "simple-travel"],
  ["쇼츠/릴스 피드 보기", "shorts-reels-feed"],
  ["쇼츠 릴스 피드 보기", "shorts-reels-feed"],
  ["쾌락성 모임 참석", "pleasure-gathering"],
  ["게임", "game"],
  ["단순 쾌락형 영상 시청", "pleasure-video"],
];

/** 아이콘 선택 모달 — 카테고리 기본 아이콘(fallback) */
const PICKER_CATEGORY_EXTRAS = [
  ["꿈", "prod-cat-dream"],
  ["부수입", "prod-cat-sideincome"],
  ["행복", "prod-cat-happiness"],
  ["건강", "prod-cat-health"],
  ["쾌락", "nonprod-cat-pleasure"],
  ["미디어", "nonprod-cat-media"],
  ["꿈 방해", "nonprod-cat-dreamblock"],
  ["불행", "nonprod-cat-unhappiness"],
  ["비건강", "nonprod-cat-unhealthy"],
  ["돈 손실", "nonprod-cat-moneylosing"],
];

function compactTaskName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "");
}

const ICON_BY_COMPACT = new Map();
for (const [label, slug] of ORDERED_PAIRS) {
  ICON_BY_COMPACT.set(compactTaskName(label), `${BASE}/${slug}.png`);
}

const PRODUCTIVE_LEDGER_BUCKETS = new Set([
  "dream",
  "sideincome",
  "happiness",
  "health",
]);

/**
 * 생산 과제 중 카테고리만 KPI/사용자 정의인 경우 — 꿈·부수입·행복·건강 아이콘.
 * productivity가 비어 있어도 category가 위 넷이면 생산 버킷으로 간주(행 데이터 등).
 */
function productiveCategoryFallbackIcon(category, productivity) {
  const cat = String(category || "")
    .trim()
    .toLowerCase();
  if (!PRODUCTIVE_LEDGER_BUCKETS.has(cat)) return "";
  const p = String(productivity || "")
    .trim()
    .toLowerCase();
  if (p === "nonproductive" || p === "other") return "";
  const slug =
    cat === "dream"
      ? "prod-cat-dream"
      : cat === "sideincome"
        ? "prod-cat-sideincome"
        : cat === "happiness"
          ? "prod-cat-happiness"
          : "prod-cat-health";
  return `${BASE}/${slug}.png`;
}

const NONPRODUCTIVE_LEDGER_BUCKETS = new Map([
  ["pleasure", "nonprod-cat-pleasure"],
  ["media_watch", "nonprod-cat-media"],
  ["dreamblocking", "nonprod-cat-dreamblock"],
  ["unhappiness", "nonprod-cat-unhappiness"],
  ["unhealthy", "nonprod-cat-unhealthy"],
  ["moneylosing", "nonprod-cat-moneylosing"],
]);

/**
 * 비생산 카테고리 사용자 추가·KPI 과제 — 쾌락·미디어·꿈 방해·불행·비건강·돈 손실.
 */
function nonproductiveCategoryFallbackIcon(category, productivity) {
  const cat = String(category || "")
    .trim()
    .toLowerCase();
  const slug = NONPRODUCTIVE_LEDGER_BUCKETS.get(cat);
  if (!slug) return "";
  const p = String(productivity || "")
    .trim()
    .toLowerCase();
  if (p === "productive" || p === "other") return "";
  return `${BASE}/${slug}.png`;
}

/**
 * @param {string} taskName
 * @param {{ category?: string, productivity?: string }} [opts]
 * @returns {string} URL 또는 빈 문자열
 */
export function getTimeTaskListIconSrc(taskName, opts = {}) {
  const iconKey = String(opts.iconKey || "").trim();
  if (iconKey) {
    const byKey = getTimeTaskIconSrcByKey(iconKey);
    if (byKey) return byKey;
  }
  const key = compactTaskName(taskName);
  if (key) {
    const byName = ICON_BY_COMPACT.get(key);
    if (byName) return byName;
  }
  const prod = productiveCategoryFallbackIcon(opts.category, opts.productivity);
  if (prod) return prod;
  return nonproductiveCategoryFallbackIcon(opts.category, opts.productivity);
}

/** @param {string} slug 파일 베이스명(확장자 없음) */
export function getTimeTaskIconSrcBySlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return "";
  return `${BASE}/${s}.png`;
}

/**
 * 아이콘 선택·저장용 key → URL (기본 PNG slug · `png:` · `svg:`).
 * @param {string} key
 */
export function getTimeTaskIconSrcByKey(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  if (k.startsWith("svg:")) {
    const name = k.slice(4).trim();
    if (!name) return "";
    return `${PICKER_SVG_BASE}/${name}.svg`;
  }
  if (k.startsWith("png:")) {
    const name = k.slice(4).trim();
    if (!name) return "";
    return `${PICKER_SVG_BASE}/${name}.png`;
  }
  return getTimeTaskIconSrcBySlug(k);
}

function pickerIconLabelFromFilename(name) {
  return String(name || "")
    .trim()
    .replace(/-/g, " ");
}

/** @param {string} text */
function normalizePickerSearchHaystack(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

/**
 * 아이콘 선택 모달 검색 — 파일명·라벨 부분 일치(하이픈·공백 무시).
 * @param {string} searchText
 * @param {string} query
 */
export function matchTimeTaskPickerIconSearch(searchText, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const hay = normalizePickerSearchHaystack(searchText);
  const qFlat = q.replace(/[\s_-]+/g, "");
  if (qFlat && hay.replace(/\s/g, "").includes(qFlat)) return true;
  if (hay.includes(q)) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => {
    const tFlat = t.replace(/[\s_-]+/g, "");
    return (
      hay.includes(t) ||
      (tFlat && hay.replace(/\s/g, "").includes(tFlat))
    );
  });
}

/**
 * 아이콘 선택 모달용 — 기본 PNG + 추가 SVG(무제 폴더).
 * @returns {{ key: string, label: string, src: string, searchText: string }[]}
 */
export function getTimeTaskPickableIcons() {
  const seen = new Set();
  /** @type {{ key: string, label: string, src: string, searchText: string }[]} */
  const out = [];
  for (const pair of [...ORDERED_PAIRS, ...PICKER_CATEGORY_EXTRAS]) {
    const [label, slug] = pair;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      key: slug,
      label,
      src: getTimeTaskIconSrcBySlug(slug),
      searchText: `${label} ${slug}`.replace(/-/g, " "),
    });
  }
  for (const [label, slug] of PICKER_PNG_EXTRAS) {
    const key = `png:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label,
      src: `${PICKER_SVG_BASE}/${slug}.png`,
      searchText: `${label} ${slug}`.replace(/-/g, " "),
    });
  }
  for (const name of pickerSvgNames) {
    const key = `svg:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label: pickerIconLabelFromFilename(name),
      src: `${PICKER_SVG_BASE}/${name}.svg`,
      searchText: name.replace(/-/g, " "),
    });
  }
  return out;
}

/** 리스트·일간 일정 등 — 과제명 매칭 + category/productivity fallback + 수면 예외 */
export function resolveTimeTaskDisplayIconSrc(taskName, opts = {}) {
  const iconKey = String(opts.iconKey || "").trim();
  if (iconKey) {
    const byKey = getTimeTaskIconSrcByKey(iconKey);
    if (byKey) return byKey;
  }
  const t = String(taskName || "").trim();
  const listed = getTimeTaskListIconSrc(t, opts);
  if (listed) return listed;
  if (t === "수면하기" || /수면/.test(t)) return `${BASE}/sleep-bed.png`;
  return "";
}
