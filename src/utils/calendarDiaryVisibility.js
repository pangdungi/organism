/**
 * 캘린더일기 — 「일기 보기 / 숨기기」 토글 (문구만, 활성 칠 없음)
 * - 휴대폰: 기본 숨김
 * - 홈 3분할 캘린더: 기본 숨김
 * - 전체 화면 캘린더(데스크탑·아이패드): 기본 표시 (원하면 토글로 가림)
 * - 토글 시 전체 재그리기 없이 CSS로 일기 막대만 숨김/표시
 */

const LP_CALENDAR_SHOW_DIARY_KEY = "lp_calendar_show_diary";

/** 루트에 붙이면 일기 막대·항목 숨김 */
export const CALENDAR_DIARY_HIDDEN_CLASS = "calendar-view--diary-hidden";

/** @param {object | null | undefined} t */
export function taskIsCalendarDiary(t) {
  return !!(t && (t.isCalendarDiary === true || t.is_calendar_diary === true));
}

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

/** 일기 보기 끔 → 캘린더일기 제외 (날짜 칸 목록 등) */
export function filterCalendarTasksForDisplay(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (readCalendarShowDiary()) return list;
  return list.filter((t) => !taskIsCalendarDiary(t));
}

function calendarDiaryToggleLabel(showing) {
  return showing ? "일기 숨기기" : "일기 보기";
}

/** 버튼 문구를 지금 숨김/표시 상태와 같게 */
function syncCalendarDiaryToggleButtons(scope, showing) {
  const label = calendarDiaryToggleLabel(showing);
  const root =
    scope instanceof Element
      ? scope
      : typeof document !== "undefined"
        ? document
        : null;
  if (!root?.querySelectorAll) return;
  root.querySelectorAll("[data-calendar-diary-toggle]").forEach((btn) => {
    btn.classList.remove("is-active");
    btn.setAttribute("aria-pressed", showing ? "true" : "false");
    btn.setAttribute("title", label);
    btn.textContent = label;
  });
}

export function calendarDiaryToggleMarkup() {
  const on = readCalendarShowDiary();
  const label = calendarDiaryToggleLabel(on);
  /* 문구만 상태 반영 — 활성 칠(is-active) 없음(오해 방지) */
  return `<button type="button" class="calendar-nav-diary-toggle" data-calendar-diary-toggle title="${label}" aria-pressed="${on ? "true" : "false"}">${label}</button>`;
}

/**
 * 캘린더 루트에 일기 숨김 클래스 맞추기
 * @param {Element | null | undefined} root
 */
export function applyCalendarDiaryVisibilityToRoot(root) {
  const showing = readCalendarShowDiary();
  if (root instanceof Element) {
    /** @type {Set<Element>} */
    const targets = new Set([root]);
    const layout = root.classList.contains("calendar-monthly-layout")
      ? root
      : root.closest?.(".calendar-monthly-layout");
    if (layout) targets.add(layout);
    const view = root.closest?.(".calendar-view") || root;
    if (view) targets.add(view);
    for (const el of targets) {
      el.classList.toggle(CALENDAR_DIARY_HIDDEN_CLASS, !showing);
    }
    syncCalendarDiaryToggleButtons(view || root, showing);
    return;
  }
  syncCalendarDiaryToggleButtons(document, showing);
}

/**
 * 일기 토글 후 — 주 행 높이만 보이는 막대 기준으로 맞춤 (전체 재그리기 없음)
 * @param {Element | null | undefined} root
 */
export function softReflowCalendarAfterDiaryToggle(root) {
  if (!(root instanceof Element)) return;
  const remPx =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  root.querySelectorAll(".calendar-monthly-week-wrap").forEach((weekWrap) => {
    const weekRow = weekWrap.querySelector(".calendar-monthly-week");
    const barsEl = weekWrap.querySelector(".calendar-monthly-bars");
    if (!(weekRow instanceof HTMLElement) || !(barsEl instanceof HTMLElement)) {
      return;
    }
    const visibleBars = [
      ...barsEl.querySelectorAll(".calendar-monthly-span-bar"),
    ].filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hidden) return false;
      return getComputedStyle(el).display !== "none";
    });
    if (!visibleBars.length) {
      weekRow.style.removeProperty("min-height");
      return;
    }
    const wrapTop = weekWrap.getBoundingClientRect().top;
    let maxBottom = 0;
    for (const bar of visibleBars) {
      const r = bar.getBoundingClientRect();
      if (r.height <= 0) continue;
      maxBottom = Math.max(maxBottom, r.bottom - wrapTop);
    }
    if (maxBottom <= 0) return;
    const minRem = Math.max(4, maxBottom / remPx + 0.35);
    weekRow.style.minHeight = `${minRem}rem`;
  });
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {() => void} [onToggle] — 선택. 기본은 CSS 토글만 (전체 renderCalendar 금지)
 */
export function wireCalendarDiaryToggle(root, onToggle) {
  if (!root) return;
  const layoutRoot =
    root instanceof Element
      ? root.closest?.(".calendar-monthly-layout") ||
        root.closest?.(".calendar-view") ||
        root
      : null;
  const applyNow = () => {
    if (layoutRoot instanceof Element) {
      applyCalendarDiaryVisibilityToRoot(layoutRoot);
    }
  };
  applyNow();
  /* 홈 3분할은 붙인 뒤에야 숨김 기본이 맞음 — 버튼도 그때 다시 맞춤 */
  requestAnimationFrame(() => {
    applyNow();
    requestAnimationFrame(applyNow);
  });

  root.querySelectorAll("[data-calendar-diary-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleCalendarShowDiary();
      const viewRoot =
        btn.closest?.(".calendar-monthly-layout") ||
        btn.closest?.(".calendar-view") ||
        (layoutRoot instanceof Element ? layoutRoot : null);
      applyCalendarDiaryVisibilityToRoot(viewRoot);
      softReflowCalendarAfterDiaryToggle(viewRoot);
      try {
        onToggle?.();
      } catch (_) {}
    });
  });
}
