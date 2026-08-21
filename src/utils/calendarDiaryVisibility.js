/**
 * 캘린더일기 — 「일기 보기」 토글
 * - 휴대폰: 기본 숨김
 * - 홈 3분할 캘린더: 기본 숨김
 * - 전체 화면 캘린더(데스크탑·아이패드): 기본 표시 (원하면 토글로 가림)
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

/** 홈 3분할에 붙은 플래너 캘린더가 문서에 있을 때 (전체 탭으로 나가면 DOM에서 떨어짐) */
export function isCalendarPlannerDashboardEmbed() {
  try {
    return !!document.querySelector(
      ".lp-desktop-dashboard-col--planner .calendar-view",
    );
  } catch (_) {
    return false;
  }
}

/** 세션 값 없으면: 폰·3분할은 숨김, 그 외(전체 캘린더)는 표시 */
export function readCalendarShowDiary() {
  try {
    const v = sessionStorage.getItem(LP_CALENDAR_SHOW_DIARY_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch (_) {}
  if (isCalendarPhoneViewport()) return false;
  if (isCalendarPlannerDashboardEmbed()) return false;
  return true;
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

function calendarDiaryToggleLabel(showing) {
  return showing ? "일기 숨기기" : "일기 보기";
}

export function calendarDiaryToggleMarkup() {
  const on = readCalendarShowDiary();
  const label = calendarDiaryToggleLabel(on);
  return `<button type="button" class="calendar-nav-diary-toggle${on ? " is-active" : ""}" data-calendar-diary-toggle title="${label}" aria-pressed="${on ? "true" : "false"}">${label}</button>`;
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
      const label = calendarDiaryToggleLabel(on);
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("title", label);
      btn.textContent = label;
      try {
        onToggle?.();
      } catch (_) {}
    });
  });
}
