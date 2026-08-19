/**
 * 캘린더일기 — 모바일에서 기본 숨김 / 「일기 보기」 토글
 */

const LP_CALENDAR_SHOW_DIARY_MOBILE_KEY = "lp_calendar_show_diary_mobile";

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

export function readCalendarShowDiaryOnMobile() {
  try {
    return sessionStorage.getItem(LP_CALENDAR_SHOW_DIARY_MOBILE_KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function setCalendarShowDiaryOnMobile(on) {
  try {
    if (on) sessionStorage.setItem(LP_CALENDAR_SHOW_DIARY_MOBILE_KEY, "1");
    else sessionStorage.removeItem(LP_CALENDAR_SHOW_DIARY_MOBILE_KEY);
  } catch (_) {}
}

export function toggleCalendarShowDiaryOnMobile() {
  const next = !readCalendarShowDiaryOnMobile();
  setCalendarShowDiaryOnMobile(next);
  return next;
}

export function taskIsCalendarDiary(t) {
  return !!(t && (t.isCalendarDiary === true || t.is_calendar_diary === true));
}

/** 모바일 + 일기 보기 끔 → 캘린더일기 제외 */
export function filterCalendarTasksForDisplay(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (!isCalendarPhoneViewport()) return list;
  if (readCalendarShowDiaryOnMobile()) return list;
  return list.filter((t) => !taskIsCalendarDiary(t));
}

export function calendarDiaryToggleMarkup() {
  const on = readCalendarShowDiaryOnMobile();
  return `<button type="button" class="calendar-nav-diary-toggle${on ? " is-active" : ""}" data-calendar-diary-toggle title="캘린더일기 보기" aria-pressed="${on ? "true" : "false"}">일기 보기</button>`;
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
      const on = toggleCalendarShowDiaryOnMobile();
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      try {
        onToggle?.();
      } catch (_) {}
    });
  });
}
