/**
 * 감정일기 데이터 - Diary.js와 Time.js에서 공유
 */

const DIARY_ENTRIES_KEY = "diary_entries";

/** 탭 3 감정일기 기본 감정 목록 */
export const TAB3_DEFAULT_EMOTIONS = [
  "공포", "불안", "근심", "걱정", "기쁨", "황홀감", "행복", "즐거움", "고마움", "그리움",
  "기특함", "감동", "사랑", "신뢰감", "자부심", "자신감", "자존심", "자격지심", "열등감",
  "슬픔", "우울", "분노", "억울함", "괘씸함", "서운함", "섭섭함", "미움", "얄미움", "시샘",
  "부러움", "혐오", "괴로움", "부담감", "따분함", "지겨움", "안도감", "편안감", "외로움",
  "난처함", "후련함", "부끄러움", "죄책감", "아쉬움", "수치심", "짜증", "원망",
];

/** 탭 3 감정일기 템플릿 질문 */
export const TAB3_EMOTION_TEMPLATE = [
  "1. 있는 그대로의 상황(사실만 적기)",
  "2. 그 상황에 대한 내 생각",
  "3. 메모",
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

/** 탭 3 감정일기: 감정 목록 반환 */
export function getEmotionList(all) {
  const tab = all["3"];
  if (!tab || !tab.emotionList || !Array.isArray(tab.emotionList)) {
    return [...TAB3_DEFAULT_EMOTIONS];
  }
  return tab.emotionList;
}

/** 탭 3 감정일기: 데이터 구조 초기화 */
export function ensureEmotionTabData(all) {
  if (!all["3"]) all["3"] = {};
  const tab = all["3"];
  if (!tab.emotions || typeof tab.emotions !== "object") {
    tab.emotions = Object.fromEntries(TAB3_DEFAULT_EMOTIONS.map((e) => [e, []]));
  }
  if (!tab.emotionList || !Array.isArray(tab.emotionList)) {
    tab.emotionList = [...TAB3_DEFAULT_EMOTIONS];
  } else {
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

/** 감정일기에 항목 추가 (Time.js 과제기록에서 호출) */
export function addEmotionEntry(entries, emotion, dateStr, q1, q2, q3) {
  const tab = ensureEmotionTabData(entries);
  if (!tab.emotions[emotion]) tab.emotions[emotion] = [];
  const id = "em_" + Date.now();
  const normalizedDate = (dateStr || "").replace(/\//g, "-").slice(0, 10);
  tab.emotions[emotion].unshift({
    id,
    date: normalizedDate,
    emotion,
    q1: (q1 || "").trim(),
    q2: (q2 || "").trim(),
    q3: (q3 || "").trim(),
    updatedAt: new Date().toISOString(),
  });
  return entries;
}
