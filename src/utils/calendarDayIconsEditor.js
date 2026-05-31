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
 * 월간 셀·모달 공통 — 날짜 아이콘 선택/수정
 * @param {string} dateKey
 * @param {{ onSaved?: () => void }} [opts]
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
      void syncCalendarDayIconForDate(ymd, iconKey).then(() => {
        opts.onSaved?.();
      });
    },
    onRemove: () => {
      setCalendarDayIconKeyForDate(ymd, "");
      void syncCalendarDayIconForDate(ymd, "").then(() => {
        opts.onSaved?.();
      });
    },
  });
}

/**
 * @param {HTMLElement|null|undefined} mountEl
 * @param {{ dateKey: string }} opts
 * @returns {{ getIconKey: () => string }}
 */
export function mountCalendarDayIconsEditor(mountEl, opts = {}) {
  const noop = { getIconKey: () => "" };
  if (!(mountEl instanceof HTMLElement)) return noop;

  const dateKey = String(opts.dateKey || "").trim().slice(0, 10);
  if (!dateKey) return noop;

  let iconKey = getCalendarDayIconKeyForDate(dateKey);

  mountEl.innerHTML = "";
  mountEl.className = "calendar-day-icons-editor";

  const label = document.createElement("span");
  label.className = "calendar-day-icons-editor__label";
  label.textContent = "날짜 아이콘";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "calendar-day-icons-editor__trigger";

  function syncTrigger() {
    const src = iconKey ? getTimeTaskIconSrcByKey(iconKey) : "";
    trigger.replaceChildren();
    if (src) {
      trigger.setAttribute("aria-label", "날짜 아이콘 변경");
      trigger.title = "탭하여 아이콘 변경";
      trigger.classList.add("calendar-day-icons-editor__trigger--selected");
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      applyStaticAppIconImg(img);
      img.className = "calendar-day-icons-editor__trigger-icon";
      trigger.appendChild(img);
    } else {
      trigger.setAttribute("aria-label", "날짜 아이콘 추가");
      trigger.title = "탭하여 아이콘 선택";
      trigger.classList.remove("calendar-day-icons-editor__trigger--selected");
      trigger.textContent = "+";
    }
  }

  function persistIconKey(nextKey) {
    iconKey = String(nextKey || "").trim();
    syncTrigger();
    void syncCalendarDayIconForDate(dateKey, iconKey).catch(() => {});
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showCalendarDayIconPickModal({
      currentKey: iconKey,
      onPick: (key) => {
        persistIconKey(key);
      },
      onRemove: () => {
        persistIconKey("");
      },
    });
  });

  mountEl.appendChild(label);
  mountEl.appendChild(trigger);
  syncTrigger();

  return {
    getIconKey: () => iconKey,
  };
}

/**
 * 월간 셀 하단 — 아이콘 1개 (탭하면 수정)
 * @param {HTMLElement} container
 * @param {string} dateKey
 * @param {{ onAfterChange?: () => void }} [opts]
 */
export function renderCalendarMonthlyDayIcons(container, dateKey, opts = {}) {
  if (!(container instanceof HTMLElement)) return;
  container.replaceChildren();
  const iconKey = getCalendarDayIconKeyForDate(dateKey);
  if (!iconKey) {
    container.hidden = true;
    return;
  }
  const src = getTimeTaskIconSrcByKey(iconKey);
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

/** @param {string} dateKey */
export function calendarDayHasIcon(dateKey) {
  return !!getCalendarDayIconKeyForDate(dateKey);
}

/** 월간 주 행 — 아이콘 하단 여백(rem). calendar.css `--cal-day-icon-strip-rem` 과 동기 */
export const CALENDAR_MONTHLY_DAY_ICONS_STRIP_REM = 2.85;
