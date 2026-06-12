/**
 * 캘린더 월간 뷰 — 날짜당 아이콘 1개 (과제 설정 picker 아이콘 재사용)
 */

import { applyStaticAppIconImg } from "./staticAppIconImg.js";
import {
  getCalendarDayIconKeyForDate,
  setCalendarDayIconKeyForDate,
} from "./calendarDayIconsModel.js";
import { syncCalendarDayIconForDate } from "./calendarDayIconsSupabase.js";
import { getTimeTaskIconSrcByKey } from "./timeTaskIconUrls.js";
import { openStandaloneTimeTaskIconPickModal } from "./timeAddTaskIconPicker.js";

/**
 * @param {{ onPick: (iconKey: string) => void, onRemove?: () => void, currentKey?: string, title?: string }} opts
 */
export function showCalendarDayIconPickModal(opts = {}) {
  openStandaloneTimeTaskIconPickModal({
    title: opts.title ?? "날짜 아이콘",
    currentKey: opts.currentKey,
    onPick: opts.onPick,
    onRemove: opts.onRemove,
  });
}

/**
 * 날짜 아이콘 선택/수정 (날짜 패널·월간 셀)
 * @param {string} dateKey
 * @param {{ onSaved?: () => void, onClose?: () => void }} [opts]
 */
export function openCalendarDayIconEditor(dateKey, opts = {}) {
  const ymd = String(dateKey || "").trim().slice(0, 10);
  if (!ymd) return;
  const currentKey = getCalendarDayIconKeyForDate(ymd);

  showCalendarDayIconPickModal({
    currentKey,
    onPick: (key) => {
      const iconKey = String(key || "").trim();
      if (!iconKey) return;
      setCalendarDayIconKeyForDate(ymd, iconKey);
      opts.onClose?.();
      void syncCalendarDayIconForDate(ymd, iconKey).then(() => {
        opts.onSaved?.();
      });
    },
    onRemove: () => {
      setCalendarDayIconKeyForDate(ymd, "");
      opts.onClose?.();
      void syncCalendarDayIconForDate(ymd, "").then(() => {
        opts.onSaved?.();
      });
    },
  });
}

/**
 * @param {HTMLElement} container
 * @param {string} dateKey
 * @param {{ onAfterChange?: () => void }} [opts]
 */
export function renderCalendarMonthlyDayIcons(container, dateKey, opts = {}) {
  if (!(container instanceof HTMLElement)) return;
  container.replaceChildren();
  const iconKey = getCalendarDayIconKeyForDate(dateKey);
  const src = iconKey ? getTimeTaskIconSrcByKey(iconKey) : "";
  if (!src) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.className = "calendar-monthly-day-icons";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "calendar-monthly-day-icon-btn";
  btn.setAttribute("aria-label", "날짜 아이콘 수정");
  btn.title = "아이콘 수정";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  applyStaticAppIconImg(img);
  img.className = "calendar-monthly-day-icons__img";
  btn.appendChild(img);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCalendarDayIconEditor(dateKey, { onSaved: opts.onAfterChange });
  });
  container.appendChild(btn);
}

/**
 * 날짜 확대 버블 — 할일 추가 옆 작은 아이콘 버튼(탭하면 선택·교체)
 * @param {HTMLElement|null|undefined} mountEl
 * @param {string} dateKey
 * @param {{ onAfterChange?: () => void, onClose?: () => void }} [opts]
 */
export function mountCalendarDayExpandIconBtn(mountEl, dateKey, opts = {}) {
  if (!(mountEl instanceof HTMLElement)) return;
  const ymd = String(dateKey || "").trim().slice(0, 10);
  if (!ymd) {
    mountEl.replaceChildren();
    return;
  }

  mountEl.replaceChildren();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "calendar-day-expand-icon-btn";

  function syncBtn() {
    const iconKey = getCalendarDayIconKeyForDate(ymd);
    const src = iconKey ? getTimeTaskIconSrcByKey(iconKey) : "";
    btn.replaceChildren();
    if (src) {
      btn.classList.add("calendar-day-expand-icon-btn--selected");
      btn.setAttribute("aria-label", "날짜 아이콘 변경");
      btn.title = "아이콘 변경";
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      applyStaticAppIconImg(img);
      img.className = "calendar-day-expand-icon-btn__img";
      btn.appendChild(img);
    } else {
      btn.classList.remove("calendar-day-expand-icon-btn--selected");
      btn.setAttribute("aria-label", "스탬프 추가");
      btn.title = "스탬프 추가";
      const label = document.createElement("span");
      label.className = "calendar-day-expand-icon-btn__label";
      label.textContent = "스탬프 추가";
      label.setAttribute("aria-hidden", "true");
      btn.appendChild(label);
    }
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCalendarDayIconEditor(ymd, {
      onClose: opts.onClose,
      onSaved: () => {
        syncBtn();
        opts.onAfterChange?.();
      },
    });
  });

  syncBtn();
  mountEl.appendChild(btn);
}

/** @param {string} dateKey */
export function calendarDayHasIcon(dateKey) {
  return !!getCalendarDayIconKeyForDate(dateKey);
}

/** 월간 주 행 — 스탬프 아이콘 높이(rem, 상단). calendar.css `--cal-day-icon-strip-rem` 과 동기 */
export const CALENDAR_MONTHLY_DAY_ICONS_STRIP_REM = 2.85;
