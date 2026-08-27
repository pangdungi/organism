/**
 * 캘린더 월간 뷰 — 날짜당 아이콘 1개 (과제 설정 picker 아이콘 재사용)
 */

import { applyStaticAppIconImg } from "./staticAppIconImg.js";
import {
  salvageDisplayIconImgs,
  takeDisplayIconImg,
} from "./reuseDisplayIconImg.js";
import {
  getCalendarDayIconKeyForDate,
  setCalendarDayIconKeyForDate,
} from "./calendarDayIconsModel.js";
import { syncCalendarDayIconForDate } from "./calendarDayIconsSupabase.js";
import { getTimeTaskIconDisplaySrcByKey } from "./timeTaskIconUrls.js";
import { attachIconSvgFallback } from "./toolbarIconUrl.js";
import { openStandaloneTimeTaskIconPickModal } from "./timeAddTaskIconPicker.js";

export const DRAG_TYPE_CALENDAR_DAY_ICON = "application/x-lp-calendar-day-icon";

export function calendarDayIconDragAllowsDrop(dataTransfer) {
  const types = dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes(DRAG_TYPE_CALENDAR_DAY_ICON);
}

/** @returns {{ fromDateKey: string, iconKey: string } | null} */
export function readCalendarDayIconDragPayload(dataTransfer) {
  if (!calendarDayIconDragAllowsDrop(dataTransfer)) return null;
  try {
    const raw = dataTransfer.getData(DRAG_TYPE_CALENDAR_DAY_ICON);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    const fromDateKey = String(p.fromDateKey || "").trim().slice(0, 10);
    const iconKey = String(p.iconKey || "").trim();
    if (!fromDateKey || !iconKey) return null;
    return { fromDateKey, iconKey };
  } catch (_) {
    return null;
  }
}

/**
 * @param {{ onPick: (iconKey: string) => void, onRemove?: () => void, currentKey?: string, title?: string }} opts
 */
export function showCalendarDayIconPickModal(opts = {}) {
  openStandaloneTimeTaskIconPickModal({
    title: opts.title ?? "날짜 스탬프",
    currentKey: opts.currentKey,
    onPick: opts.onPick,
    onRemove: opts.onRemove,
  });
}

function syncWeekStampStripAfterCellPaint(cell) {
  const weekRow = cell?.closest?.(".calendar-monthly-week");
  if (!(weekRow instanceof HTMLElement)) return;
  const hasVisible = !!weekRow.querySelector(
    ".calendar-monthly-day-icons:not([hidden])",
  );
  weekRow.classList.toggle("calendar-monthly-week--has-stamps", hasVisible);
  if (!hasVisible) {
    weekRow.style.removeProperty("--lp-cal-stamp-strip-rem");
  }
  weekRow._lpMonthlyBarLayoutRerun?.();
}

/**
 * 화면에 붙은 모든 월간·1주 날짜 셀 — 스탬프 DOM 즉시 갱신(모바일 버블 경로 포함)
 * @param {string} dateKey
 * @param {{ onAfterChange?: () => void }} [opts]
 */
export function repaintCalendarDayStampCells(dateKey, opts = {}) {
  const key = String(dateKey || "").trim().slice(0, 10);
  if (!key || typeof document === "undefined") return;
  let selectorKey = key;
  try {
    selectorKey = CSS.escape(key);
  } catch (_) {}
  document
    .querySelectorAll(`.calendar-monthly-day[data-date="${selectorKey}"]`)
    .forEach((cell) => {
      if (!(cell instanceof HTMLElement)) return;
      let dayIconsEl = cell.querySelector(".calendar-monthly-day-icons");
      if (!dayIconsEl) {
        dayIconsEl = document.createElement("div");
        dayIconsEl.className = "calendar-monthly-day-icons";
        dayIconsEl.setAttribute("aria-hidden", "true");
        const dayNum = cell.querySelector(".calendar-monthly-day-num");
        if (dayNum?.nextSibling) {
          cell.insertBefore(dayIconsEl, dayNum.nextSibling);
        } else if (dayNum) {
          dayNum.insertAdjacentElement("afterend", dayIconsEl);
        } else {
          cell.prepend(dayIconsEl);
        }
      }
      renderCalendarMonthlyDayIcons(dayIconsEl, key, {
        onAfterChange: opts.onAfterChange,
      });
      cell.classList.toggle(
        "calendar-monthly-day--has-stamp",
        !dayIconsEl.hidden,
      );
      syncWeekStampStripAfterCellPaint(cell);
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

  const notifyStampUiChanged = () => {
    repaintCalendarDayStampCells(ymd, { onAfterChange: opts.onSaved });
    opts.onSaved?.();
  };

  showCalendarDayIconPickModal({
    currentKey,
    onPick: (key) => {
      const iconKey = String(key || "").trim();
      if (!iconKey) return;
      setCalendarDayIconKeyForDate(ymd, iconKey);
      notifyStampUiChanged();
      opts.onClose?.();
      void syncCalendarDayIconForDate(ymd, iconKey).finally(() => {
        notifyStampUiChanged();
      });
    },
    onRemove: () => {
      setCalendarDayIconKeyForDate(ymd, "");
      notifyStampUiChanged();
      opts.onClose?.();
      void syncCalendarDayIconForDate(ymd, "").finally(() => {
        notifyStampUiChanged();
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
  salvageDisplayIconImgs(container);
  container.replaceChildren();
  const iconKey = getCalendarDayIconKeyForDate(dateKey);
  const src = iconKey ? getTimeTaskIconDisplaySrcByKey(iconKey) : "";
  if (!src) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.className = "calendar-monthly-day-icons";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "calendar-monthly-day-icon-btn";
  btn.setAttribute("aria-label", "날짜 스탬프 — 드래그로 옮기기, 탭으로 수정");
  btn.title = "드래그로 다른 날짜로 옮기기 · 탭하여 수정";
  btn.draggable = true;
  let suppressClickAfterDrag = false;
  const img = takeDisplayIconImg(src, {
    className: "calendar-monthly-day-icons__img",
  });
  attachIconSvgFallback(img, src);
  applyStaticAppIconImg(img);
  btn.appendChild(img);
  const requestWeekStampLayout = () => {
    const weekRow = container.closest(".calendar-monthly-week");
    weekRow?._lpMonthlyBarLayoutRerun?.();
  };
  img.addEventListener("load", requestWeekStampLayout, { once: true });
  if (img.complete) {
    requestAnimationFrame(requestWeekStampLayout);
  }
  btn.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    const key = getCalendarDayIconKeyForDate(dateKey);
    if (!key) {
      e.preventDefault();
      return;
    }
    suppressClickAfterDrag = true;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      DRAG_TYPE_CALENDAR_DAY_ICON,
      JSON.stringify({ fromDateKey: dateKey, iconKey: key }),
    );
    container.classList.add("calendar-monthly-day-icons--dragging");
  });
  btn.addEventListener("dragend", () => {
    container.classList.remove("calendar-monthly-day-icons--dragging");
    requestAnimationFrame(() => {
      suppressClickAfterDrag = false;
    });
  });
  btn.addEventListener("click", (e) => {
    if (suppressClickAfterDrag) return;
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
    salvageDisplayIconImgs(mountEl);
    mountEl.replaceChildren();
    return;
  }

  salvageDisplayIconImgs(mountEl);
  mountEl.replaceChildren();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "calendar-day-expand-icon-btn";

  function syncBtn() {
    const iconKey = getCalendarDayIconKeyForDate(ymd);
    const src = iconKey ? getTimeTaskIconDisplaySrcByKey(iconKey) : "";
    salvageDisplayIconImgs(btn);
    btn.replaceChildren();
    if (src) {
      btn.classList.add("calendar-day-expand-icon-btn--selected");
      btn.setAttribute("aria-label", "날짜 스탬프 변경");
      btn.title = "아이콘 변경";
      const img = takeDisplayIconImg(src, {
        className: "calendar-day-expand-icon-btn__img",
      });
      attachIconSvgFallback(img, src);
      applyStaticAppIconImg(img);
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
