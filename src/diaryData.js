/**
 * 감정관리 데이터 - Diary.js와 Time.js에서 공유
 */

const DIARY_ENTRIES_KEY = "diary_entries";

/** 탭 3 감정관리 기본 감정 목록 */
export const TAB3_DEFAULT_EMOTIONS = [
  "공포", "불안", "걱정", "기쁨", "행복", "즐거움", "고마움",
  "기특함", "감동", "사랑", "신뢰감", "자부심", "자신감", "자존심", "자격지심", "열등감",
  "슬픔", "우울", "분노", "억울함", "괘씸함", "서운함", "미움", "부러움", "혐오", "괴로움", "부담감",
  "편안감", "후련함", "부끄러움", "죄책감", "아쉬움", "수치심", "짜증", "원망",
];

/** 탭 3 감정관리 템플릿 질문 */
export const TAB3_EMOTION_TEMPLATE = [
  "1. 있는 그대로의 상황(사실만 적기)",
  "2. 그 상황에 대한 내 생각",
  "3. 그 판단이 사실이라는 증거가 있나요?",
  "4. 이 생각이 내가 원하는 기분이나 행동을 만드는가? 아니라면 내가 지금부터 할 행동은?",
];

/** 탭 3 감정관리 템플릿 입력란 placeholder (과제 기록·감정관리 페이지 공통) */
export const TAB3_EMOTION_PLACEHOLDERS = [
  "상황을 최대한 객관적으로 감정, 생각 없이 적어주세요",
  "그 상황에 대한 내 판단, 그 판단으로부터 나오는 감정만 적어보세요",
  "증거가 없다면 다음 중 어떤 판단오류였나요? (속단, 흑백논리, 과잉일반화, 재앙화, 개인화, 부정적 초점, 완벽주의)",
  "이 생각이 내가 원하는 기분이나 행동을 만드는가? 아니라면 내가 지금부터 할 행동은?",
];

export function loadDiaryEntries() {
  try {
    const raw = localStorage.getItem(DIARY_ENTRIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (_) {}
  return {};
}

export function saveDiaryEntries(data) {
  try {
    localStorage.setItem(DIARY_ENTRIES_KEY, JSON.stringify(data));
  } catch (_) {}
}

/** 탭 3 감정관리: 감정 목록 반환 */
export function getEmotionList(all) {
  const tab = all["3"];
  if (!tab || !tab.emotionList || !Array.isArray(tab.emotionList)) {
    return [...TAB3_DEFAULT_EMOTIONS];
  }
  return tab.emotionList;
}

/** 제거된 감정 (기본 목록에서 삭제됨) - 기존 데이터에서도 제거 */
const REMOVED_EMOTIONS = [
  "근심", "황홀감", "따분함", "시샘", "얄미움", "섭섭함",
  "외로움", "난처함", "지겨움", "안도감", "그리움",
];

/** 탭 3 감정관리: 데이터 구조 초기화 */
export function ensureEmotionTabData(all) {
  if (!all["3"]) all["3"] = {};
  const tab = all["3"];
  if (!tab.emotions || typeof tab.emotions !== "object") {
    tab.emotions = Object.fromEntries(TAB3_DEFAULT_EMOTIONS.map((e) => [e, []]));
  }
  if (!tab.emotionList || !Array.isArray(tab.emotionList)) {
    tab.emotionList = [...TAB3_DEFAULT_EMOTIONS];
  } else {
    tab.emotionList = tab.emotionList.filter((e) => !REMOVED_EMOTIONS.includes(e));
    REMOVED_EMOTIONS.forEach((e) => delete tab.emotions[e]);
    TAB3_DEFAULT_EMOTIONS.forEach((emotion) => {
      if (!tab.emotionList.includes(emotion)) {
        const insertIdx = TAB3_DEFAULT_EMOTIONS.indexOf(emotion);
        const before = TAB3_DEFAULT_EMOTIONS[insertIdx - 1];
        const beforeIdx = tab.emotionList.indexOf(before);
        tab.emotionList.splice(beforeIdx >= 0 ? beforeIdx + 1 : 0, 0, emotion);
        if (!tab.emotions[emotion]) tab.emotions[emotion] = [];
      }
    });
  }
  return tab;
}

/** (구) 감정별 추가 - 하위 호환용, 더 이상 사용 권장 안 함 */
export function addEmotionEntry(entries, emotion, dateStr, q1, q2, q3) {
  return addOrUpdateTab3EntryByDate(entries, (dateStr || "").replace(/\//g, "-").slice(0, 10), q1, q2, q3, "");
}

/** 탭3 감정관리: 날짜별 1개 항목 추가 또는 해당 날짜 항목 업데이트 (Time.js에서 호출 가능) */
export function addOrUpdateTab3EntryByDate(entries, dateStr, q1, q2, q3, q4) {
  const normalizedDate = (dateStr || "").replace(/\//g, "-").slice(0, 10);
  if (!normalizedDate) return entries;
  ensureTab3Entries(entries);
  const tab = entries["3"];
  const list = tab.entries || [];
  const existing = list.find((e) => (e.date || "").slice(0, 10) === normalizedDate);
  const now = new Date().toISOString();
  if (existing) {
    existing.q1 = (q1 !== undefined && q1 !== null ? q1 : existing.q1 || "").trim();
    existing.q2 = (q2 !== undefined && q2 !== null ? q2 : existing.q2 || "").trim();
    existing.q3 = (q3 !== undefined && q3 !== null ? q3 : existing.q3 || "").trim();
    existing.q4 = (q4 !== undefined && q4 !== null ? q4 : existing.q4 || "").trim();
    existing.updatedAt = now;
  } else {
    list.push({
      id: "e_" + Date.now(),
      date: normalizedDate,
      title: "제목없음",
      q1: (q1 || "").trim(),
      q2: (q2 || "").trim(),
      q3: (q3 || "").trim(),
      q4: (q4 || "").trim(),
      updatedAt: now,
    });
  }
  return entries;
}

/** 탭3 데이터를 날짜별 entries 구조로 보장 (기존 감정별 데이터가 있으면 entries만 비움) */
export function ensureTab3Entries(entries) {
  if (!entries["3"]) entries["3"] = {};
  const tab = entries["3"];
  if (!Array.isArray(tab.entries)) {
    tab.entries = [];
  }
  return tab;
}
