/**
 * 감정일기 데이터 - Diary.js와 Time.js에서 공유
 * 탭3: 날짜별 q1~q4 (같은 날짜 여러 항목 가능)
 */

const DIARY_ENTRIES_KEY = "diary_entries";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDiaryEntryUuid(id) {
  return UUID_RE.test(String(id || "").trim());
}

/** Supabase 동기화용: 항목 id가 없거나 레거시(e_…)면 UUID 부여 */
export function ensureDiaryEntryUuid(e) {
  if (!e || typeof e !== "object") return;
  if (isDiaryEntryUuid(e.id)) return;
  e.id = newDiaryEntryId();
}

export function newDiaryEntryId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "e_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
}

/** 탭 3 감정관리 템플릿 질문 */
export const TAB3_EMOTION_TEMPLATE = [
  "1. 있는 그대로의 상황(사실만 적기)",
  "2. 그 상황에 대한 내 생각",
  "3. 그 판단이 사실이라는 증거가 있나요?",
  "4. 이 생각이 내가 원하는 기분이나 행동을 만드는가?",
];

/** 탭 3 감정관리 템플릿 입력란 placeholder (과제 기록·감정관리 페이지 공통) */
export const TAB3_EMOTION_PLACEHOLDERS = [
  "상황을 최대한 객관적으로 감정과 생각 없이 적어주세요",
  "그 상황에 대한 내 판단, 그 판단으로부터 나오는 감정만 적어보세요",
  "증거가 없다면 다음 중 어떤 판단 오류였나요? (속단, 흑백논리, 과잉일반화, 재앙화, 개인화, 부정적 초점, 완벽주의)",
  "아니라면 지금부터 내가 할 행동은?",
];

function stripUpdatedAtFromDiaryEntries(data) {
  if (!data || typeof data !== "object") return;
  for (const tid of ["1", "2", "3"]) {
    const tab = data[tid];
    const list = tab?.entries;
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (e && Object.prototype.hasOwnProperty.call(e, "updatedAt")) delete e.updatedAt;
    }
  }
}

/** 구버전 탭3: emotionList / emotions 필드 제거 */
function stripLegacyTab3EmotionCatalog(data) {
  const tab = data?.["3"];
  if (!tab || typeof tab !== "object") return;
  if (Object.prototype.hasOwnProperty.call(tab, "emotionList")) delete tab.emotionList;
  if (Object.prototype.hasOwnProperty.call(tab, "emotions")) delete tab.emotions;
}

export function loadDiaryEntries() {
  try {
    const raw = localStorage.getItem(DIARY_ENTRIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        stripUpdatedAtFromDiaryEntries(parsed);
        stripLegacyTab3EmotionCatalog(parsed);
        return parsed;
      }
    }
  } catch (_) {}
  return {};
}

export function saveDiaryEntries(data) {
  try {
    localStorage.setItem(DIARY_ENTRIES_KEY, JSON.stringify(data));
  } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent("diary-entries-saved", { detail: { data } }));
  } catch (_) {}
}

/** 탭3 감정일기: 항상 새 항목 추가 (같은 날짜 여러 개 가능, Time.js 과제 모달 등) */
export function appendTab3Entry(entries, dateStr, q1, q2, q3, q4) {
  const normalizedDate = (dateStr || "").replace(/\//g, "-").slice(0, 10);
  if (!normalizedDate) return entries;
  ensureTab3Entries(entries);
  const list = entries["3"].entries;
  list.push({
    id: newDiaryEntryId(),
    date: normalizedDate,
    title: "제목없음",
    q1: (q1 || "").trim(),
    q2: (q2 || "").trim(),
    q3: (q3 || "").trim(),
    q4: (q4 || "").trim(),
  });
  return entries;
}

/** 탭3 데이터를 날짜별 entries 구조로 보장 */
export function ensureTab3Entries(entries) {
  if (!entries["3"]) entries["3"] = {};
  const tab = entries["3"];
  if (!Array.isArray(tab.entries)) {
    tab.entries = [];
  }
  stripLegacyTab3EmotionCatalog(entries);
  return tab;
}
