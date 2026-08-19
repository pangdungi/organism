/**
 * 캘린더일기 — 「일기 보기」 토글
 * - 휴대폰: 기본 숨김
 * - 데스크탑·아이패드: 기본 표시 (원하면 토글로 가림)
 */

const LP_CALENDAR_SHOW_DIARY_KEY = "lp_calendar_show_diary";

/** 폰 너비(아이패드는 보통 더 큼) */
export function isCalendarPhoneViewport() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 46rem)").matches
    );
  } catch (_) {
    return false;
  }
}

/** 세션에 값이 없으면 뷰포트 기본: 폰=숨김, 그 외=표시 */
export function readCalendarShowDiary() {
  try {
    const v = sessionStorage.getItem(LP_CALENDAR_SHOW_DIARY_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch (_) {}
  return !isCalendarPhoneViewport();
}

export function setCalendarShowDiary(on) {
  try {
    sessionStorage.setItem(LP_CALENDAR_SHOW_DIARY_KEY, on ? "1" : "0");
  } catch (_) {}
}

export function toggleCalendarShowDiary() {
  const next = !readCalendarShowDiary();
  setCalendarShowDiary(next);
  return next;
}

export function taskIsCalendarDiary(t) {
  return !!(t && (t.isCalendarDiary === true || t.is_calendar_diary === true));
}

/** 일기 보기 끔 → 캘린더일기 제외 (모든 화면) */
export function filterCalendarTasksForDisplay(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (readCalendarShowDiary()) return list;
  return list.filter((t) => !taskIsCalendarDiary(t));
}

export function calendarDiaryToggleMarkup() {
  const on = readCalendarShowDiary();
  return `<button type="button" class="calendar-nav-diary-toggle${on ? " is-active" : ""}" data-calendar-diary-toggle title="캘린더일기 보기/가리기" aria-pressed="${on ? "true" : "false"}">일기 보기</button>`;
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {() => void} onToggle
 */
export function wireCalendarDiaryToggle(root, onToggle) {
  if (!root) return;
  root.querySelectorAll("[data-calendar-diary-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const on = toggleCalendarShowDiary();
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      try {
        onToggle?.();
      } catch (_) {}
    });
  });
}
