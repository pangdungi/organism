/**
 * 일간 캘린더「예상 일정」— 시간가계부「과제 기록」모달과 동일 셸(과제 드롭다운·날짜·시간·빠른선택·메모만).
 * 서버 과제 목록은 과제 기록 모달과 같이 먼저 열고 pull 후 드롭다운을 맞춤.
 */

import { showToast } from "./showToast.js";
import { allowModalInputFocus } from "./modalNoAutoFocus.js";
import { showConfirmModal } from "./confirmModal.js";
import {
  lpTokenToggle,
} from "./timeLedgerClassPolicy.js";
import { syncTimeDailyBudgetDateToSupabase } from "./timeDailyBudgetSupabase.js";
import { buildTimeTaskLogPickerDropdown } from "./timeTaskLogPickerDropdown.js";
import { pullKpiMapsForTaskLogModalOpen } from "./kpiTabCloudRefresh.js";
import {
  getFullTaskOptions,
  migrateTimeLogRowsTaskIds,
} from "./timeTaskOptionsModel.js";
import {
  appendBudgetScheduleBlock,
  getBudgetGoals,
  loadTimeRows,
  getNextTaskLogStartHhMmFromLedger,
  getLatestBudgetScheduleEndHhMm,
  updateBudgetScheduleBlockAtIndex,
  removeBudgetScheduleBlockAtIndex,
} from "../views/Time.js";

function parseDateFromDateTime(str) {
  if (!str || typeof str !== "string") return "";
  const m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

function parseLedgerTimeStringToMinutes(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  const m = t.match(/[T\s](\d{1,2}):(\d{2})/) || t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  const hh = ((h % 24) + 24) % 24;
  const mm = ((min % 60) + 60) % 60;
  return hh * 60 + mm;
}

function formatTaskLogDateOverlayYmd(isoTen) {
  const m = String(isoTen || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function openNativeDateInput(inp) {
  if (!inp) return;
  allowModalInputFocus(inp);
  try {
    inp.focus({ preventScroll: true });
  } catch (_) {
    try {
      inp.focus();
    } catch (_) {}
  }
  if (typeof inp.showPicker === "function") {
    try {
      inp.showPicker();
      return;
    } catch (_) {}
  }
  inp.click();
}

async function ensureExpectedModalCloudData() {
  await Promise.all([pullKpiMapsForTaskLogModalOpen().catch(() => {})]);
  try {
    getFullTaskOptions();
    migrateTimeLogRowsTaskIds();
  } catch (_) {}
}

function afterTaskListSyncForExpectedModal(dropdown) {
  const v = (dropdown?._getValue?.() || "").trim();
  if (v) return;
  const mainTasks = getFullTaskOptions().filter(
    (t) => !(t.name || "").includes(" > "),
  );
  const first = mainTasks[0]?.name || "";
  if (first) dropdown._setValue?.(first);
}

function attachExpectedScheduleDatetimeUI(panel, ctx) {
  const {
    fallbackYmd,
    signal,
    taskLogDateStart,
    taskLogTimeStart,
    taskLogTimeEnd,
    taskLogStartInput,
    taskLogEndInput,
    taskLogTimeOrderWarning,
    /** 일간 뷰 등: 화면에 보이는 예상 블록과 동일한 기준의 시작 시각(없으면 미전달) */
    defaultStartHhMm: defaultStartHhMmFromCtx,
  } = ctx;

  const normalizeHhMm = (val) => {
    if (!val || typeof val !== "string") return "";
    const m = val.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return val.trim();
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };

  const autoFormatDigitsToHhMm = (val) => {
    const digits = (val || "").trim().replace(/\D/g, "");
    if (digits.length >= 4) {
      const h = Math.min(23, Math.max(0, parseInt(digits.slice(0, 2), 10)));
      const min = Math.min(59, Math.max(0, parseInt(digits.slice(2, 4), 10)));
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    if (digits.length === 3) {
      const h = Math.min(9, Math.max(0, parseInt(digits[0], 10)));
      const min = Math.min(59, Math.max(0, parseInt(digits.slice(1), 10)));
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    if (digits.length === 2) {
      const min = Math.min(59, Math.max(0, parseInt(digits, 10)));
      return `00:${String(min).padStart(2, "0")}`;
    }
    if (digits.length === 1) {
      return `00:0${digits}`;
    }
    return val.trim();
  };

  function syncTaskLogDateOverlay() {
    if (!taskLogDateStart) return;
    let v = (taskLogDateStart.value || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const fromHidden = parseDateFromDateTime(
        String(taskLogStartInput?.value || "").trim(),
      );
      if (fromHidden) v = fromHidden;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      v = fallbackYmd;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const cur = (taskLogDateStart.value || "").trim().slice(0, 10);
      if (cur !== v) taskLogDateStart.value = v;
    }
    const has = /^\d{4}-\d{2}-\d{2}$/.test(v);
    lpTokenToggle(taskLogDateStart, "time-task-log-date-has-value", has);
    const wrap = taskLogDateStart.closest(
      '[data-legacy~="time-task-log-date-native-wrap"]',
    );
    if (wrap?.classList) {
      lpTokenToggle(wrap, "time-task-log-date-native-wrap--has-value", has);
    }
    const ov = wrap?.querySelector?.(
      '[data-legacy~="time-task-log-date-overlay"]',
    );
    if (ov) ov.textContent = has ? formatTaskLogDateOverlayYmd(v) : "";
  }

  function taskLogResolveYmdForSync() {
    const fromDateInput = (taskLogDateStart?.value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromDateInput)) return fromDateInput;
    const fromStartHidden = parseDateFromDateTime(
      String(taskLogStartInput?.value || "").trim(),
    );
    if (fromStartHidden) return fromStartHidden;
    return fallbackYmd;
  }

  function updateTaskLogTimeOrderWarning() {
    const el = taskLogTimeOrderWarning;
    if (!el) return;
    const startRaw = normalizeHhMm((taskLogTimeStart?.value || "").trim());
    const endRaw = normalizeHhMm((taskLogTimeEnd?.value || "").trim());
    if (!endRaw || !/^\d{1,2}:\d{2}$/.test(endRaw)) {
      el.hidden = true;
      return;
    }
    if (!startRaw || !/^\d{1,2}:\d{2}$/.test(startRaw)) {
      el.hidden = true;
      return;
    }
    const sm = parseLedgerTimeStringToMinutes(startRaw);
    const em = parseLedgerTimeStringToMinutes(endRaw);
    if (sm == null || em == null) {
      el.hidden = true;
      return;
    }
    el.hidden = em >= sm;
  }

  function syncStartToHidden() {
    let date = (taskLogDateStart?.value || "").trim();
    const time = normalizeHhMm(taskLogTimeStart?.value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const prevHidden = String(taskLogStartInput?.value || "").trim();
      date = parseDateFromDateTime(prevHidden) || fallbackYmd;
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && taskLogDateStart) {
        taskLogDateStart.value = date;
      }
    }
    if (date && time) {
      taskLogStartInput.value = `${date}T${time}`;
    } else if (date) {
      taskLogStartInput.value = `${date}T00:00`;
    } else {
      taskLogStartInput.value = "";
    }
    syncTaskLogDateOverlay();
    updateTaskLogTimeOrderWarning();
  }

  function syncEndToHidden() {
    const date = taskLogResolveYmdForSync();
    const time = normalizeHhMm(taskLogTimeEnd?.value || "");
    if (date && time) {
      taskLogEndInput.value = `${date}T${time}`;
      if (
        taskLogDateStart &&
        !String(taskLogDateStart.value || "").trim() &&
        /^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        taskLogDateStart.value = date;
      }
    } else {
      taskLogEndInput.value = "";
    }
    updateEndTimeClearVisibility();
    syncTaskLogDateOverlay();
    updateTaskLogTimeOrderWarning();
  }

  const taskLogEndWrap = panel.querySelector(
    '[data-legacy~="time-task-log-datetime-wrap-end"]',
  );
  const taskLogTimeEndClearBtn = taskLogEndWrap?.querySelector(
    ".time-task-log-date-clear",
  );

  let taskLogTimeEndInputFocused = false;

  function updateEndTimeClearVisibility() {
    const hasValue = (taskLogTimeEnd?.value || "").trim().length > 0;
    const showClear = taskLogTimeEndInputFocused && hasValue;
    if (taskLogEndWrap) lpTokenToggle(taskLogEndWrap, "has-value", showClear);
    if (taskLogTimeEndClearBtn) taskLogTimeEndClearBtn.hidden = !showClear;
  }

  function clearTaskLogEndTime() {
    if (taskLogTimeEnd) taskLogTimeEnd.value = "";
    syncEndToHidden();
    setTaskLogQuickAdjustActive(null);
  }

  const beforeInputTimeDigitsOnly = (e) => {
    const it = e.inputType || "";
    if (
      it === "deleteContentBackward" ||
      it === "deleteContentForward" ||
      it === "deleteByCut" ||
      it === "historyUndo" ||
      it === "historyRedo"
    ) {
      return;
    }
    const d = e.data;
    if (d == null || d === "") return;
    if (/[^\d:]/.test(d)) {
      e.preventDefault();
    }
  };

  const sanitizeTaskLogTimeField = (el) => {
    if (!el) return;
    const raw = String(el.value || "");
    const cleaned = raw.replace(/[^\d:]/g, "");
    if (cleaned !== raw) el.value = cleaned;
  };

  const restrictToTimeChars = (e) => {
    if (
      [
        "Backspace",
        "Delete",
        "Tab",
        "Escape",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(e.key)
    )
      return;
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const input = e.target;
      const formatted =
        autoFormatDigitsToHhMm(input.value) || normalizeHhMm(input.value);
      input.value = formatted;
      input.blur();
      return;
    }
    if (!/^\d$/.test(e.key)) e.preventDefault();
  };

  const filterPastedTime = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
    const input = e.target;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const current = input.value;
    const newVal = current.slice(0, start) + pasted + current.slice(end);
    input.value = newVal;
    input.setSelectionRange(start + pasted.length, start + pasted.length);
    updateTaskLogTimeOrderWarning();
  };

  const taskLogFocusOutTargetIsTimeAdjustBtn = (ev) =>
    !!ev.relatedTarget?.closest?.(
      '[data-legacy~="time-task-log-time-adjust-btns"]',
    );

  const dateNativeWrap = taskLogDateStart?.closest?.(
    '[data-legacy~="time-task-log-date-native-wrap"]',
  );
  if (dateNativeWrap && taskLogDateStart) {
    dateNativeWrap.addEventListener(
      "click",
      () => openNativeDateInput(taskLogDateStart),
      { signal },
    );
  }

  [taskLogDateStart, taskLogTimeStart].forEach((el) => {
    el?.addEventListener(
      "change",
      () => {
        syncStartToHidden();
        syncEndToHidden();
      },
      { signal },
    );
    el?.addEventListener(
      "focusout",
      (ev) => {
        const skipEndSync = taskLogFocusOutTargetIsTimeAdjustBtn(ev);
        if (el === taskLogTimeStart) {
          const preformatted =
            autoFormatDigitsToHhMm(taskLogTimeStart.value) ||
            taskLogTimeStart.value;
          taskLogTimeStart.value =
            normalizeHhMm(preformatted) || preformatted;
        }
        syncStartToHidden();
        if (!skipEndSync) syncEndToHidden();
      },
      { signal },
    );
  });
  taskLogDateStart?.addEventListener("input", syncTaskLogDateOverlay, {
    signal,
  });
  taskLogTimeStart?.addEventListener("beforeinput", beforeInputTimeDigitsOnly, {
    signal,
  });
  taskLogTimeStart?.addEventListener(
    "input",
    () => {
      sanitizeTaskLogTimeField(taskLogTimeStart);
      updateTaskLogTimeOrderWarning();
    },
    { signal },
  );
  taskLogTimeStart?.addEventListener(
    "compositionend",
    (ev) => {
      sanitizeTaskLogTimeField(ev.target);
      updateTaskLogTimeOrderWarning();
    },
    { signal },
  );
  taskLogTimeStart?.addEventListener("keydown", restrictToTimeChars, {
    signal,
  });
  taskLogTimeStart?.addEventListener("paste", filterPastedTime, { signal });

  taskLogTimeEnd?.addEventListener("change", syncEndToHidden, { signal });
  taskLogTimeEnd?.addEventListener(
    "focusout",
    (ev) => {
      if (ev.relatedTarget === taskLogTimeEndClearBtn) return;
      if (taskLogFocusOutTargetIsTimeAdjustBtn(ev)) return;
      taskLogTimeEndInputFocused = false;
      updateEndTimeClearVisibility();
      const preformatted =
        autoFormatDigitsToHhMm(taskLogTimeEnd.value) || taskLogTimeEnd.value;
      taskLogTimeEnd.value = normalizeHhMm(preformatted) || preformatted;
      syncEndToHidden();
    },
    { signal },
  );
  taskLogTimeEnd?.addEventListener("beforeinput", beforeInputTimeDigitsOnly, {
    signal,
  });
  taskLogTimeEnd?.addEventListener(
    "input",
    () => {
      sanitizeTaskLogTimeField(taskLogTimeEnd);
      updateEndTimeClearVisibility();
      updateTaskLogTimeOrderWarning();
    },
    { signal },
  );
  taskLogTimeEnd?.addEventListener(
    "compositionend",
    (ev) => {
      sanitizeTaskLogTimeField(ev.target);
      updateTaskLogTimeOrderWarning();
    },
    { signal },
  );
  taskLogTimeEnd?.addEventListener("keydown", restrictToTimeChars, {
    signal,
  });
  taskLogTimeEnd?.addEventListener("paste", filterPastedTime, { signal });

  taskLogTimeEndClearBtn?.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 0) e.preventDefault();
    },
    { signal },
  );
  taskLogTimeEndClearBtn?.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTaskLogEndTime();
    },
    { signal },
  );

  let lastFocusedTimeField = "end";
  [taskLogTimeStart, taskLogDateStart].forEach((el) => {
    if (!el) return;
    el.addEventListener("focus", () => {
      lastFocusedTimeField = "start";
    }, { signal });
  });
  taskLogTimeEnd?.addEventListener(
    "focus",
    () => {
      taskLogTimeEndInputFocused = true;
      updateEndTimeClearVisibility();
      lastFocusedTimeField = "end";
    },
    { signal },
  );

  function setTaskLogQuickAdjustActive(btn) {
    panel
      .querySelectorAll('[data-legacy~="time-task-log-time-adjust-btn"]')
      .forEach((b) => {
        lpTokenToggle(
          b,
          "time-task-log-time-adjust-active",
          !!(btn && b === btn),
        );
      });
  }

  panel
    .querySelectorAll('[data-legacy~="time-task-log-time-adjust-btn"]')
    .forEach((btn) => {
      btn.addEventListener(
        "mousedown",
        (e) => {
          if (e.button === 0) e.preventDefault();
        },
        { signal },
      );
      btn.addEventListener(
        "click",
        () => {
          const endVal = (taskLogTimeEnd?.value || "").trim();
          const endHasTime = endVal && endVal.match(/\d{1,2}:\d{2}/);
          const targetIsStart =
            lastFocusedTimeField === "start" && endHasTime;

          const startTimeVal = normalizeHhMm(
            (taskLogTimeStart?.value || "").trim(),
          );
          const startHasTime =
            startTimeVal && startTimeVal.match(/\d{1,2}:\d{2}/);
          const fallbackTime = startHasTime
            ? startTimeVal
            : `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;

          if (btn.dataset.last === "true") {
            const dateVal = (taskLogDateStart?.value || "").trim() || fallbackYmd;
            const latest = getNextTaskLogStartHhMmFromLedger(
              dateVal,
              null,
              loadTimeRows(),
            );
            if (!latest) {
              showToast("해당 날짜에 참고할 기록이 없습니다.");
              return;
            }
            if (targetIsStart) {
              if (taskLogTimeStart) taskLogTimeStart.value = latest;
              syncStartToHidden();
            } else {
              if (taskLogTimeEnd) taskLogTimeEnd.value = latest;
              syncEndToHidden();
            }
            setTaskLogQuickAdjustActive(btn);
            return;
          }

          if (btn.dataset.dayEnd === "true") {
            if (taskLogTimeEnd) taskLogTimeEnd.value = "23:59";
            syncEndToHidden();
            setTaskLogQuickAdjustActive(btn);
            return;
          }

          if (btn.dataset.now === "true") {
            const newTime = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
            if (targetIsStart) {
              if (taskLogTimeStart) taskLogTimeStart.value = newTime;
              syncStartToHidden();
            } else {
              if (taskLogTimeEnd) taskLogTimeEnd.value = newTime;
              syncEndToHidden();
            }
            setTaskLogQuickAdjustActive(btn);
          } else {
            const delta = parseInt(btn.dataset.delta || "0", 10);
            const baseTime = targetIsStart
              ? startHasTime
                ? startTimeVal
                : fallbackTime
              : endHasTime
                ? normalizeHhMm(endVal)
                : startHasTime
                  ? startTimeVal
                  : fallbackTime;
            const normalized = normalizeHhMm(baseTime) || fallbackTime;
            const [h, min] = normalized
              .split(":")
              .map((n) => parseInt(n, 10) || 0);
            let totalMin = h * 60 + min + delta;
            totalMin = ((totalMin % 1440) + 1440) % 1440;
            const nh = Math.floor(totalMin / 60) % 24;
            const nmin = totalMin % 60;
            const newTime = `${String(nh).padStart(2, "0")}:${String(nmin).padStart(2, "0")}`;
            if (targetIsStart) {
              if (taskLogTimeStart) taskLogTimeStart.value = newTime;
              syncStartToHidden();
            } else {
              if (taskLogTimeEnd) taskLogTimeEnd.value = newTime;
              syncEndToHidden();
            }
            setTaskLogQuickAdjustActive(btn);
          }
        },
        { signal },
      );
    });

  function applyDefaultsForYmd(ymd) {
    let startHhMm = "00:00";
    if (defaultStartHhMmFromCtx !== undefined) {
      const raw = String(defaultStartHhMmFromCtx || "").trim();
      startHhMm = (raw && normalizeHhMm(raw)) || raw || "00:00";
    } else {
      const fromBudget = getLatestBudgetScheduleEndHhMm(ymd);
      const fromLedger = getNextTaskLogStartHhMmFromLedger(
        ymd,
        null,
        loadTimeRows(),
      );
      startHhMm = fromBudget || fromLedger || "00:00";
    }
    if (taskLogDateStart) {
      taskLogDateStart.value = ymd;
      try {
        taskLogDateStart.defaultValue = ymd;
      } catch (_) {}
    }
    if (taskLogTimeStart) {
      taskLogTimeStart.value = startHhMm;
      try {
        taskLogTimeStart.defaultValue = startHhMm;
      } catch (_) {}
    }
    if (taskLogTimeEnd) {
      taskLogTimeEnd.value = "";
      try {
        taskLogTimeEnd.defaultValue = "";
      } catch (_) {}
    }
    taskLogEndInput.value = "";
    const wrap = taskLogDateStart?.closest?.(
      '[data-legacy~="time-task-log-date-native-wrap"]',
    );
    const ov = wrap?.querySelector?.(
      '[data-legacy~="time-task-log-date-overlay"]',
    );
    if (ov && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      ov.textContent = formatTaskLogDateOverlayYmd(ymd);
    }
    syncStartToHidden();
    syncEndToHidden();
  }

  function flushBeforeSubmit() {
    if (taskLogTimeStart) {
      const raw = taskLogTimeStart.value || "";
      const preformatted = autoFormatDigitsToHhMm(raw) || raw;
      taskLogTimeStart.value =
        normalizeHhMm(preformatted) || preformatted;
    }
    if (taskLogTimeEnd) {
      const raw = taskLogTimeEnd.value || "";
      const preformatted = autoFormatDigitsToHhMm(raw) || raw;
      taskLogTimeEnd.value = normalizeHhMm(preformatted) || preformatted;
    }
    syncStartToHidden();
    syncEndToHidden();
    const endVisNorm = normalizeHhMm(
      (taskLogTimeEnd?.value || "").trim(),
    ).trim();
    const endHid = (taskLogEndInput?.value || "").trim();
    if (endVisNorm && /^\d{1,2}:\d{2}$/.test(endVisNorm) && !endHid) {
      syncEndToHidden();
    }
  }

  setTaskLogQuickAdjustActive(
    panel.querySelector(
      '[data-legacy~="time-task-log-time-adjust-last"]',
    ),
  );

  return {
    applyDefaultsForYmd,
    syncTaskLogDateOverlay,
    flushBeforeSubmit,
  };
} /** end attachExpectedScheduleDatetimeUI */

/**
 * @param {{ dateKey: string, title?: string, submitLabel?: string, onSaved?: () => void,
 *   edit?: { taskName: string, timeIdx: number },
 *   defaultStartHhMm?: string }} options
 */
export function openCalendarExpectedScheduleModal(options) {
  const {
    dateKey,
    title = "예상 일정 추가",
    submitLabel = "등록",
    onSaved,
    edit,
    defaultStartHhMm,
  } = options || {};

  if (document.querySelector(".lp-calendar-budget-add-modal")) return;

  const dk = String(dateKey || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return;

  const ac = new AbortController();
  const { signal } = ac;

  const modal = document.createElement("div");
  modal.className =
    "time-task-setup-modal time-task-log-modal lp-calendar-budget-add-modal";

  modal.innerHTML = `
    <div data-legacy="time-task-setup-backdrop"></div>
    <div data-legacy="time-task-setup-panel time-task-log-panel" role="dialog" aria-modal="true">
      <div data-legacy="time-task-setup-header time-task-log-header">
        <h3 data-legacy="time-task-setup-title"></h3>
        <button type="button" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div data-legacy="time-task-setup-body time-task-log-body">
        <div data-legacy="time-task-log-scroll-area">
          <div data-legacy="time-task-log-datetime-fields-wrap">
            <div data-legacy="time-task-log-field">
              <label>이 시간에 할 행동</label>
              <div data-legacy="time-task-log-task-wrap"></div>
            </div>
            <div data-legacy="time-task-log-field time-task-log-datetime-onerow">
              <div data-legacy="time-task-log-datetime-card lp-modal-datetime-card">
                <div data-legacy="time-task-log-datetime-date-row">
                  <div data-legacy="time-task-log-date-native-wrap">
                    <input type="date" data-legacy="time-task-log-date-start" data-hide-delete-btn="true" data-use-native-mobile="true" aria-label="기록 날짜" />
                    <span data-legacy="time-task-log-date-overlay" aria-hidden="true"></span>
                  </div>
                </div>
                <div data-legacy="time-task-log-datetime-time-row">
                  <input type="text" data-legacy="time-task-log-time-start" lang="en" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="--:--" maxlength="5" autocomplete="off" inputmode="numeric" pattern="[0-9]*" aria-label="시작 시각" />
                  <span data-legacy="time-task-log-datetime-sep" aria-hidden="true">–</span>
                  <div data-legacy="time-task-log-datetime-wrap-end">
                    <input type="text" data-legacy="time-task-log-time-end" lang="en" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="--:--" maxlength="5" autocomplete="off" inputmode="numeric" pattern="[0-9]*" aria-label="마감 시각" />
                    <button type="button" class="time-task-log-date-clear" data-legacy="time-task-log-date-clear" aria-label="마감 시각 지우기" title="마감 시각 지우기" hidden><span aria-hidden="true">×</span></button>
                  </div>
                </div>
              </div>
              <p data-legacy="time-task-log-time-order-warning" hidden role="alert">마감시간은 시작시간보다 빠를 수 없습니다.</p>
              <div data-legacy="time-task-log-quick-block">
                <div data-legacy="time-task-log-time-adjust-btns">
                  <button type="button" data-legacy="time-task-log-time-adjust-btn time-task-log-time-adjust-now" data-now="true">지금</button>
                  <button type="button" data-legacy="time-task-log-time-adjust-btn time-task-log-time-adjust-last" data-last="true">마지막</button>
                  <button type="button" data-legacy="time-task-log-time-adjust-btn" data-delta="-30">−30</button>
                  <button type="button" data-legacy="time-task-log-time-adjust-btn" data-delta="-15">−15</button>
                  <button type="button" data-legacy="time-task-log-time-adjust-btn" data-delta="15">+15</button>
                  <button type="button" data-legacy="time-task-log-time-adjust-btn" data-delta="30">+30</button>
                  <button type="button" data-legacy="time-task-log-time-adjust-btn" data-day-end="true">하루끝</button>
                </div>
              </div>
              <input type="hidden" data-legacy="time-task-log-start" />
              <input type="hidden" data-legacy="time-task-log-end" />
            </div>
          </div>
          <div data-legacy="time-task-log-memo-section">
            <span data-legacy="time-task-log-section-label time-task-log-memo-section-label">메모</span>
            <div data-legacy="time-task-log-memo-fields">
              <div data-legacy="time-task-log-field">
                <textarea data-legacy="time-task-log-feedback time-task-log-memo-input" rows="2" placeholder="메모를 입력하세요"></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div data-legacy="time-task-log-footer" data-task-log-footer>
        <button type="button" class="lp-calendar-expected-delete-btn" data-legacy="lp-calendar-expected-delete-btn" hidden>삭제</button>
        <button type="button" data-legacy="time-task-log-submit"></button>
      </div>
    </div>
  `;

  const panel = modal.querySelector('[data-legacy~="time-task-log-panel"]');
  const titleEl = modal.querySelector('[data-legacy~="time-task-setup-title"]');
  if (titleEl) titleEl.textContent = title;
  const submitBtn = modal.querySelector('[data-legacy~="time-task-log-submit"]');
  if (submitBtn) submitBtn.textContent = submitLabel;

  const taskWrap = modal.querySelector('[data-legacy~="time-task-log-task-wrap"]');
  const taskDropdown = buildTimeTaskLogPickerDropdown({
    abortSignal: signal,
    onTaskSelected: () => {},
  });
  taskWrap.appendChild(taskDropdown);

  const taskLogDateStart = modal.querySelector(
    '[data-legacy~="time-task-log-date-start"]',
  );
  const taskLogTimeStart = modal.querySelector(
    '[data-legacy~="time-task-log-time-start"]',
  );
  const taskLogTimeEnd = modal.querySelector(
    '[data-legacy~="time-task-log-time-end"]',
  );
  const taskLogStartInput = modal.querySelector(
    '[data-legacy~="time-task-log-start"]',
  );
  const taskLogEndInput = modal.querySelector(
    '[data-legacy~="time-task-log-end"]',
  );
  const taskLogTimeOrderWarning = modal.querySelector(
    '[data-legacy~="time-task-log-time-order-warning"]',
  );
  const taskLogFeedbackInput = modal.querySelector(
    '[data-legacy~="time-task-log-feedback"]',
  );

  const editTaskName = String(edit?.taskName || "").trim();
  const editTimeIdx = Number(edit?.timeIdx);
  const isEdit =
    edit &&
    editTaskName &&
    Number.isFinite(editTimeIdx) &&
    editTimeIdx >= 0;

  const { applyDefaultsForYmd, flushBeforeSubmit } =
    attachExpectedScheduleDatetimeUI(panel, {
      fallbackYmd: dk,
      signal,
      taskLogDateStart,
      taskLogTimeStart,
      taskLogTimeEnd,
      taskLogStartInput,
      taskLogEndInput,
      taskLogTimeOrderWarning,
      defaultStartHhMm:
        isEdit || defaultStartHhMm === undefined
          ? undefined
          : defaultStartHhMm,
    });

  applyDefaultsForYmd(dk);

  const deleteBtn = modal.querySelector(
    '[data-legacy~="lp-calendar-expected-delete-btn"]',
  );

  if (isEdit) {
    const goal = getBudgetGoals(dk)[editTaskName];
    let slotRaw = goal?.scheduledTimes?.[editTimeIdx];
    if (
      (!slotRaw || !String(slotRaw).trim()) &&
      editTimeIdx === 0 &&
      goal?.scheduledTime
    ) {
      slotRaw = goal.scheduledTime;
    }
    const parts = String(slotRaw || "").trim().split("-");
    const memoStored = String(goal?.scheduleMemos?.[editTimeIdx] || "").trim();
    if (parts.length >= 2 && taskLogTimeStart && taskLogTimeEnd) {
      taskLogTimeStart.value = parts[0].trim().slice(0, 5);
      taskLogTimeEnd.value = parts[1].trim().slice(0, 5);
    }
    if (taskLogFeedbackInput) {
      taskLogFeedbackInput.value = memoStored;
    }
    if (deleteBtn) deleteBtn.hidden = false;
    flushBeforeSubmit();
  }

  afterTaskListSyncForExpectedModal(taskDropdown);

  if (isEdit) {
    taskDropdown._setValue?.(editTaskName);
  }

  const close = () => {
    try {
      ac.abort();
    } catch (_) {}
    modal.remove();
    document.body.style.overflow = "";
  };

  /* 배경 탭으로 닫지 않음 — 입력 중 실수로 닫히는 것 방지 (닫기는 ×만) */
  modal
    .querySelector('[data-legacy~="time-task-setup-close"]')
    ?.addEventListener("click", close, { signal });

  submitBtn?.addEventListener(
    "click",
    async () => {
      flushBeforeSubmit();
      const taskName = (taskDropdown._getValue?.() || "").trim();
      const dateStr = taskLogResolveYmdForSyncInline(
        taskLogDateStart,
        taskLogStartInput,
        dk,
      );
      const startHHmm = (taskLogTimeStart?.value || "").trim();
      const endHHmm = (taskLogTimeEnd?.value || "").trim();
      const memo = (taskLogFeedbackInput?.value || "").trim();

      if (!taskName) {
        showToast("과제를 선택해 주세요.");
        return;
      }
      let r;
      if (isEdit) {
        r = updateBudgetScheduleBlockAtIndex(
          dateStr,
          editTaskName,
          editTimeIdx,
          taskName,
          startHHmm,
          endHHmm,
          memo,
        );
        if (!r.ok) {
          showToast(r.error || "저장에 실패했습니다.");
          return;
        }
      } else {
        r = appendBudgetScheduleBlock(
          dateStr,
          taskName,
          startHHmm,
          endHHmm,
          memo,
        );
        if (!r.ok) {
          showToast(r.error || "등록에 실패했습니다.");
          return;
        }
      }
      try {
        await syncTimeDailyBudgetDateToSupabase(dateStr);
      } catch (_) {}
      close();
      try {
        onSaved?.();
      } catch (_) {}
    },
    { signal },
  );

  deleteBtn?.addEventListener(
    "click",
    async () => {
      if (!isEdit) return;
      const ok = await showConfirmModal({
        title: "예상 일정 삭제",
        message: "이 예상 일정을 삭제할까요?",
        warnMessage: "삭제 후에는 복구할 수 없습니다.",
        confirmText: "삭제",
        cancelText: "취소",
        confirmDanger: true,
      });
      if (!ok) return;
      const dateStr = taskLogResolveYmdForSyncInline(
        taskLogDateStart,
        taskLogStartInput,
        dk,
      );
      const r = removeBudgetScheduleBlockAtIndex(
        dateStr,
        editTaskName,
        editTimeIdx,
      );
      if (!r.ok) {
        showToast(r.error || "삭제에 실패했습니다.");
        return;
      }
      try {
        await syncTimeDailyBudgetDateToSupabase(dateStr);
      } catch (_) {}
      close();
      try {
        onSaved?.();
      } catch (_) {}
    },
    { signal },
  );

  if (isEdit) {
    const g = getBudgetGoals(dk)[editTaskName];
    let slotRaw = g?.scheduledTimes?.[editTimeIdx];
    if (
      (!slotRaw || !String(slotRaw).trim()) &&
      editTimeIdx === 0 &&
      g?.scheduledTime
    ) {
      slotRaw = g.scheduledTime;
    }
    const pt = String(slotRaw || "").trim().split("-");
    if (!g || pt.length < 2) {
      showToast("수정할 예상 일정을 찾지 못했습니다.");
      try {
        ac.abort();
      } catch (_) {}
      return;
    }
  }

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  void ensureExpectedModalCloudData()
    .catch(() => {})
    .then(() => {
      if (!modal.isConnected) return;
      afterTaskListSyncForExpectedModal(taskDropdown);
      if (isEdit) {
        taskDropdown._setValue?.(editTaskName);
      }
    });
}

function taskLogResolveYmdForSyncInline(taskLogDateStart, taskLogStartInput, fallbackYmd) {
  const fromDateInput = (taskLogDateStart?.value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromDateInput)) return fromDateInput;
  const fromStartHidden = parseDateFromDateTime(
    String(taskLogStartInput?.value || "").trim(),
  );
  if (fromStartHidden) return fromStartHidden;
  return fallbackYmd;
}
