/**
 * KPI 목표 방식·시간 단위 — 꿈·행복·건강·부수입 공통 (폼·진행률·카드 표시)
 */

import {
  getAccumulatedMinutesForKpi,
  parseKpiTargetTimeRequiredToMinutes,
  formatMinutesToKoreanHm,
  formatKpiTargetTimeRequiredDisplay,
  getKpiAccumulatedMeasureValue,
} from "./timeKpiSync.js";
import { getLatestKpiLogWithExplicitValue } from "./kpiLogsSort.js";
import {
  collectKpiHabitSuccessDateKeys,
  computeKpiHabitCurrentStreakFromSuccess,
  getKpiHabitTodayNumericValue,
  kpiHasHabitUnitGoal,
  buildKpiCardHabitStreakAsideMarkup,
} from "./kpiHabitStreak.js";
import { normalizeKpiLogDateYmd } from "./timeKpiSync.js";
import { buildModalNativeDateFieldMarkup } from "./modalNativeDateField.js";
import { setupDeadlineQuickButtons } from "./deadlineQuickButtons.js";

function localTodayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sanitizeKpiNumericInput(val) {
  return String(val || "").replace(/[^\d.-]/g, "");
}

export function sanitizeKpiTimeInput(val) {
  return String(val || "").replace(/[^\d:]/g, "");
}

/** @returns {"time"|"habit"|"task"|"manual"} */
export function resolveKpiGoalMode(kpi) {
  if (kpi?.useTimeAsUnit) return "time";
  if (kpi?.needHabitTracker) return "habit";
  if (kpi?.useTaskCompletionGoal) return "task";
  return "manual";
}

function goalModeRadioAttr(kpi, mode) {
  const active = kpi ? resolveKpiGoalMode(kpi) : "time";
  return active === mode ? " checked" : "";
}

function resolveKpiGoalModeForForm(kpi) {
  if (!kpi) return "time";
  return resolveKpiGoalMode(kpi);
}

export function kpiGoalModeOptionsHtml(kpi = null) {
  return `
    <div class="dream-kpi-goal-mode-block" data-legacy="dream-kpi-goal-mode-block">
      <span class="dream-kpi-goal-mode-caption">목표 방식</span>
      <div class="lp-modal-field-subcheck-row dream-kpi-goal-mode-row dream-kpi-goal-mode-row--single" data-legacy="lp-modal-field-subcheck-row">
        <div class="lp-modal-field-subcheck" data-legacy="lp-modal-field-subcheck">
          <label class="lp-modal-field-subcheck__label" data-legacy="lp-modal-field-subcheck__label">
            <input type="radio" name="kpiGoalMode" value="time" class="lp-modal-field-subcheck__input" data-legacy="lp-modal-field-subcheck__input"${goalModeRadioAttr(kpi, "time")} />
            <span class="lp-modal-field-subcheck__text" data-legacy="lp-modal-field-subcheck__text">시간목표</span>
          </label>
        </div>
        <div class="lp-modal-field-subcheck" data-legacy="lp-modal-field-subcheck">
          <label class="lp-modal-field-subcheck__label" data-legacy="lp-modal-field-subcheck__label">
            <input type="radio" name="kpiGoalMode" value="habit" class="lp-modal-field-subcheck__input" data-legacy="lp-modal-field-subcheck__input"${goalModeRadioAttr(kpi, "habit")} />
            <span class="lp-modal-field-subcheck__text" data-legacy="lp-modal-field-subcheck__text">매일하기</span>
          </label>
        </div>
        <div class="lp-modal-field-subcheck" data-legacy="lp-modal-field-subcheck">
          <label class="lp-modal-field-subcheck__label" data-legacy="lp-modal-field-subcheck__label">
            <input type="radio" name="kpiGoalMode" value="task" class="lp-modal-field-subcheck__input" data-legacy="lp-modal-field-subcheck__input"${goalModeRadioAttr(kpi, "task")} />
            <span class="lp-modal-field-subcheck__text" data-legacy="lp-modal-field-subcheck__text">태스크완료</span>
          </label>
        </div>
        <div class="lp-modal-field-subcheck" data-legacy="lp-modal-field-subcheck">
          <label class="lp-modal-field-subcheck__label" data-legacy="lp-modal-field-subcheck__label">
            <input type="radio" name="kpiGoalMode" value="manual" class="lp-modal-field-subcheck__input" data-legacy="lp-modal-field-subcheck__input"${goalModeRadioAttr(kpi, "manual")} />
            <span class="lp-modal-field-subcheck__text" data-legacy="lp-modal-field-subcheck__text">직접입력</span>
          </label>
        </div>
      </div>
    </div>
  `;
}

export function kpiFormGoalAndTargetSectionHtml(kpi, escapeHtml, opts = {}) {
  const habitMode = kpi ? resolveKpiGoalMode(kpi) === "habit" : false;
  const trackHabitTarget =
    habitMode && kpi ? kpiHasHabitUnitGoal(kpi) : false;
  return `
            <div class="dream-kpi-field dream-kpi-goal-mode-field" data-legacy="time-add-task-field">
              ${kpiGoalModeOptionsHtml(kpi)}
            </div>
            <div class="dream-kpi-field dream-kpi-field-checkbox dream-kpi-habit-target-toggle" data-kpi-habit-target-toggle data-legacy="time-add-task-field"${habitMode ? "" : " hidden"}>
              <label class="dream-kpi-checkbox-label">
                목표값·단위 입력하기
                <input type="checkbox" name="trackHabitTargetValue"${trackHabitTarget ? " checked" : ""} />
              </label>
            </div>
            <div class="dream-kpi-row dream-kpi-target-fields-row" data-kpi-target-fields data-legacy="time-add-task-field">
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                ${kpiTargetValueFieldHtml(kpi, escapeHtml, opts)}
              </div>
              <div class="dream-kpi-field dream-kpi-unit-field" data-legacy="time-add-task-field">
                ${kpiUnitFieldHtml(kpi, escapeHtml, opts)}
              </div>
            </div>
            ${kpiFormManualDeadlineSectionHtml(kpi, escapeHtml, opts)}`;
}

function kpiFormManualDeadlineSectionHtml(kpi, escapeHtml, opts = {}) {
  const mode = kpi ? resolveKpiGoalMode(kpi) : "";
  const showInitially = mode === "manual";
  const deadlineVal = (kpi?.targetDeadline || "").trim().slice(0, 10);
  return `
            <div class="dream-kpi-period-block" data-kpi-period-fields data-legacy="time-add-task-field"${showInitially ? "" : " hidden"}>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>마감기한</label>
                ${buildModalNativeDateFieldMarkup({
                  name: "targetDeadline",
                  ariaLabel: "마감기한",
                  value: escapeHtml(deadlineVal),
                })}
              </div>
              <div class="dream-kpi-deadline-quick" role="group" aria-label="마감기한 빠른 입력">
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="14">+14일</button>
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="30">+30일</button>
              </div>
            </div>`;
}

export function kpiTargetValueFieldHtml(kpi, escapeHtml, opts = {}) {
  const sanitizeNumericInput = opts.sanitizeNumericInput ?? sanitizeKpiNumericInput;
  const mode = resolveKpiGoalModeForForm(kpi);
  const useTime = mode === "time";
  const val = kpi
    ? useTime
      ? kpi.targetTimeRequired || ""
      : sanitizeNumericInput(kpi.targetValue)
    : "";
  const valueAttr = kpi ? ` value="${escapeHtml(val)}"` : "";
  const timePh = opts.timePlaceholder ?? "예) 25:00";
  const higherPh = opts.higherPlaceholder ?? "예) 99";
  const inputAttrs = useTime
    ? ` placeholder="${timePh}"`
    : ` placeholder="${higherPh}" inputmode="numeric"`;
  return `
      <label><span class="dream-kpi-target-label-text">${useTime ? "목표 시간" : "목표값"}</span></label>
      <input type="text" name="targetValue"${valueAttr}${inputAttrs} />
    `;
}

/** @deprecated — kpiGoalModeOptionsHtml 사용 */
export function kpiUnitSubchecksRowHtml(kpi = null) {
  return kpiGoalModeOptionsHtml(kpi);
}

export function kpiUnitFieldHtml(kpi, escapeHtml, opts = {}) {
  const unitPlaceholder =
    opts.unitPlaceholder ??
    (resolveKpiGoalModeForForm(kpi) === "habit"
      ? opts.habitUnitPlaceholder ?? "km"
      : "km");
  const mode = resolveKpiGoalModeForForm(kpi);
  const useTime = mode === "time";
  const unitVal = useTime ? "시간" : kpi?.unit || "";
  const unitAttrs = useTime
    ? ' value="시간" readonly aria-readonly="true" class="dream-kpi-input-readonly"'
    : kpi
      ? ` value="${escapeHtml(unitVal)}"`
      : "";
  return `
    <label>단위</label>
    <input type="text" name="unit"${unitAttrs} placeholder="${escapeHtml(unitPlaceholder)}" />
  `;
}

function getKpiFormFieldWrap(form, fieldName) {
  const el = form.querySelector(
    `input[name="${fieldName}"], textarea[name="${fieldName}"]`,
  );
  return el?.closest(".dream-kpi-field") || null;
}

export function clearKpiFormFieldErrors(form) {
  if (!form) return;
  form.querySelectorAll(".dream-kpi-field-error").forEach((el) => el.remove());
  form
    .querySelectorAll(".dream-kpi-field--invalid")
    .forEach((el) => el.classList.remove("dream-kpi-field--invalid"));
}

function showKpiFormFieldError(form, fieldName, message) {
  const wrap = getKpiFormFieldWrap(form, fieldName);
  if (!wrap) return;
  wrap.classList.add("dream-kpi-field--invalid");
  let err = wrap.querySelector(".dream-kpi-field-error");
  if (!err) {
    err = document.createElement("p");
    err.className = "dream-kpi-field-error";
    err.setAttribute("role", "alert");
    wrap.appendChild(err);
  }
  err.textContent = message;
}

/**
 * KPI 추가·수정 폼 필수값 검증. 실패 시 해당 필드 아래 안내 문구 표시.
 * @returns {boolean}
 */
export function validateKpiActionForm(form, opts = {}) {
  const sanitizeNumericInput = opts.sanitizeNumericInput ?? sanitizeKpiNumericInput;
  clearKpiFormFieldErrors(form);
  if (!form) return false;

  let valid = true;
  const addError = (field, message) => {
    showKpiFormFieldError(form, field, message);
    valid = false;
  };

  const name = (form.name?.value || "").trim();
  if (!name) addError("name", "행동 이름을 입력해 주세요.");

  const modeRadio = form.querySelector('input[name="kpiGoalMode"]:checked');
  const isLegacyLove = !modeRadio && form.needHabitTracker != null;

  if (isLegacyLove) {
    const habit = !!form.needHabitTracker?.checked;
    if (!habit) {
      const targetValue = sanitizeNumericInput((form.targetValue?.value || "").trim());
      const unit = (form.unit?.value || "").trim();
      if (!targetValue) addError("targetValue", "목표값을 입력해 주세요.");
      if (!unit) addError("unit", "단위를 입력해 주세요.");
    }
  } else {
    const mode = modeRadio?.value || "manual";
    if (mode === "time") {
      const targetRaw = (form.targetValue?.value || "").trim();
      if (!targetRaw) {
        addError("targetValue", "목표 시간을 입력해 주세요.");
      } else if (parseKpiTargetTimeRequiredToMinutes(targetRaw) <= 0) {
        addError("targetValue", "올바른 목표 시간을 입력해 주세요.");
      }
    } else if (mode === "habit") {
      const trackHabitTarget = !!form.querySelector(
        'input[name="trackHabitTargetValue"]',
      )?.checked;
      if (trackHabitTarget) {
        const targetValue = sanitizeNumericInput(
          (form.targetValue?.value || "").trim(),
        );
        const unit = (form.unit?.value || "").trim();
        if (!targetValue) addError("targetValue", "목표값을 입력해 주세요.");
        if (!unit) addError("unit", "단위를 입력해 주세요.");
      }
    } else if (mode === "manual") {
      const targetValue = sanitizeNumericInput((form.targetValue?.value || "").trim());
      const unit = (form.unit?.value || "").trim();
      const deadline = (
        form.querySelector('input[name="targetDeadline"]')?.value || ""
      ).trim();
      if (!targetValue) addError("targetValue", "목표값을 입력해 주세요.");
      if (!unit) addError("unit", "단위를 입력해 주세요.");
      if (!deadline) addError("targetDeadline", "마감기한을 선택해 주세요.");
    }
  }

  if (!valid) {
    form.querySelector(".dream-kpi-field--invalid")?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }

  return valid;
}

export function bindKpiFormValidationClear(form) {
  if (!form || form.dataset.kpiValidationClearBound) return;
  form.dataset.kpiValidationClearBound = "1";
  const clearFieldError = (field) => {
    if (!field?.name) return;
    const wrap = field.closest(".dream-kpi-field");
    if (!wrap) return;
    wrap.classList.remove("dream-kpi-field--invalid");
    wrap.querySelector(".dream-kpi-field-error")?.remove();
  };
  form.addEventListener("input", (e) => clearFieldError(e.target));
  form.addEventListener("change", (e) => clearFieldError(e.target));
}

function readKpiPeriodFieldsFromForm(form, mode, opts = {}) {
  if (mode !== "manual") {
    return { targetStartDate: "", targetDeadline: "" };
  }
  const deadline = (
    form.querySelector('input[name="targetDeadline"]')?.value || ""
  )
    .trim()
    .slice(0, 10);
  const existingStart = (opts.existingKpi?.targetStartDate || "")
    .trim()
    .slice(0, 10);
  const targetStartDate =
    opts.isNewKpi || !existingStart ? localTodayYmd() : existingStart;
  return { targetStartDate, targetDeadline: deadline };
}

export function readKpiGoalModeFormFields(
  form,
  sanitizeNumericInput = sanitizeKpiNumericInput,
  opts = {},
) {
  const mode =
    form.querySelector('input[name="kpiGoalMode"]:checked')?.value || "manual";
  const useTimeAsUnit = mode === "time";
  const needHabitTracker = mode === "habit";
  const useTaskCompletionGoal = mode === "task";
  const targetRaw = (form.targetValue?.value || "").trim();
  const period = readKpiPeriodFieldsFromForm(form, mode, opts);

  if (useTimeAsUnit) {
    return {
      useTimeAsUnit: true,
      needHabitTracker: false,
      useTaskCompletionGoal: false,
      unit: "시간",
      targetValue: "",
      targetTimeRequired: targetRaw,
      targetStartDate: "",
      targetDeadline: "",
    };
  }
  if (useTaskCompletionGoal) {
    return {
      useTimeAsUnit: false,
      needHabitTracker: false,
      useTaskCompletionGoal: true,
      unit: "",
      targetValue: "",
      targetTimeRequired: "",
      targetStartDate: "",
      targetDeadline: "",
    };
  }
  if (needHabitTracker) {
    const trackHabitTarget = !!form.querySelector(
      'input[name="trackHabitTargetValue"]',
    )?.checked;
    if (!trackHabitTarget) {
      return {
        useTimeAsUnit: false,
        needHabitTracker: true,
        useTaskCompletionGoal: false,
        unit: "",
        targetValue: "",
        targetTimeRequired: "",
        targetStartDate: "",
        targetDeadline: "",
      };
    }
    return {
      useTimeAsUnit: false,
      needHabitTracker: true,
      useTaskCompletionGoal: false,
      unit: (form.unit?.value || "").trim(),
      targetValue: sanitizeNumericInput(targetRaw) || "",
      targetTimeRequired: "",
      targetStartDate: "",
      targetDeadline: "",
    };
  }
  return {
    useTimeAsUnit: false,
    needHabitTracker: false,
    useTaskCompletionGoal: false,
    unit: (form.unit?.value || "").trim(),
    targetValue: sanitizeNumericInput(targetRaw) || "",
    targetTimeRequired: "",
    ...period,
  };
}

/** @deprecated — readKpiGoalModeFormFields */
export function readKpiTimeUnitFormFields(form, sanitizeNumericInput) {
  return readKpiGoalModeFormFields(form, sanitizeNumericInput);
}

export function applyKpiFormGoalFieldsToKpi(target, form, opts = {}) {
  const fields = readKpiGoalModeFormFields(form, opts.sanitizeNumericInput, {
    isNewKpi: false,
    existingKpi: target,
  });
  target.useTimeAsUnit = fields.useTimeAsUnit;
  target.needHabitTracker = fields.needHabitTracker;
  target.useTaskCompletionGoal = fields.useTaskCompletionGoal;
  target.unit = fields.unit;
  target.targetValue = fields.targetValue;
  target.targetTimeRequired = fields.targetTimeRequired;
  target.targetStartDate = fields.targetStartDate;
  target.targetDeadline = fields.targetDeadline;
}

export function bindKpiGoalModeForm(form, kpi = null, opts = {}) {
  if (!form) return;
  const sanitizeNumericInput = opts.sanitizeNumericInput ?? sanitizeKpiNumericInput;
  const sanitizeTimeInput = opts.sanitizeTimeInput ?? sanitizeKpiTimeInput;
  const higherPlaceholder = opts.higherPlaceholder ?? "30";
  const habitTargetPlaceholder = opts.habitTargetPlaceholder ?? "5";
  const habitUnitPlaceholder = opts.habitUnitPlaceholder ?? "km";
  const unitPlaceholder = opts.unitPlaceholder ?? "km";
  const timePlaceholder = opts.timePlaceholder ?? "예) 25:00";

  const unitInput = form.querySelector('input[name="unit"]');
  const targetInput = form.querySelector('input[name="targetValue"]');
  const labelSpan = form.querySelector(".dream-kpi-target-label-text");
  const directionField = form.querySelector(".dream-kpi-direction-field");
  const targetFieldsRow = form.querySelector("[data-kpi-target-fields]");
  const unitFieldWrap = form.querySelector(".dream-kpi-unit-field");
  const habitTargetToggle = form.querySelector("[data-kpi-habit-target-toggle]");
  const trackHabitTargetCheck = form.querySelector(
    'input[name="trackHabitTargetValue"]',
  );
  const periodFieldsBlock = form.querySelector("[data-kpi-period-fields]");
  const goalModeRadios = form.querySelectorAll('input[name="kpiGoalMode"]');
  const kpiMode = kpi ? resolveKpiGoalMode(kpi) : "";
  let savedUnit = (
    kpi && (kpiMode === "manual" || kpiMode === "habit")
      ? kpi?.unit || unitInput?.value || ""
      : unitInput?.value || ""
  ).trim();
  if (savedUnit === "시간") savedUnit = "";

  const currentMode = () =>
    form.querySelector('input[name="kpiGoalMode"]:checked')?.value || "manual";

  const syncTargetLabelForDirection = () => {
    const mode = currentMode();
    if (mode === "time") {
      if (labelSpan) labelSpan.textContent = "목표 시간";
      if (targetInput) targetInput.placeholder = timePlaceholder;
      return;
    }
    if (mode === "habit") {
      if (labelSpan) labelSpan.textContent = "목표값";
      if (targetInput) targetInput.placeholder = habitTargetPlaceholder;
      if (unitInput) unitInput.placeholder = habitUnitPlaceholder;
      return;
    }
    if (labelSpan) labelSpan.textContent = "목표값";
    if (targetInput) targetInput.placeholder = higherPlaceholder;
    if (unitInput) unitInput.placeholder = unitPlaceholder;
  };

  const sync = () => {
    const mode = currentMode();
    const isHabit = mode === "habit";
    const trackHabitTarget = !!trackHabitTargetCheck?.checked;
    if (habitTargetToggle) habitTargetToggle.hidden = !isHabit;
    const showTargetFields =
      mode === "time" ||
      mode === "manual" ||
      (isHabit && trackHabitTarget);
    const showUnitField = mode === "manual" || (isHabit && trackHabitTarget);
    if (targetFieldsRow) targetFieldsRow.hidden = !showTargetFields;
    if (unitFieldWrap) unitFieldWrap.hidden = !showUnitField;
    if (periodFieldsBlock) periodFieldsBlock.hidden = mode !== "manual";
    syncTargetLabelForDirection();

    const onTime = mode === "time";
    if (unitInput && showUnitField) {
      unitInput.readOnly = false;
      unitInput.removeAttribute("aria-readonly");
      unitInput.classList.remove("dream-kpi-input-readonly");
      if ((unitInput.value || "").trim() === "시간") {
        unitInput.value = savedUnit;
      }
    } else if (unitInput && onTime) {
      const cur = (unitInput.value || "").trim();
      if (cur && cur !== "시간") savedUnit = cur;
      unitInput.value = "시간";
      unitInput.readOnly = true;
      unitInput.setAttribute("aria-readonly", "true");
      unitInput.classList.add("dream-kpi-input-readonly");
    }

    if (targetInput) {
      if (onTime) targetInput.removeAttribute("inputmode");
      else if (mode === "manual" || mode === "habit") {
        targetInput.setAttribute("inputmode", "numeric");
      }
    }
    if (directionField) directionField.hidden = true;
  };

  goalModeRadios.forEach((r) =>
    r.addEventListener("change", () => {
      clearKpiFormFieldErrors(form);
      sync();
    }),
  );
  trackHabitTargetCheck?.addEventListener("change", () => {
    clearKpiFormFieldErrors(form);
    sync();
  });
  sync();
  bindKpiFormValidationClear(form);

  const modalRoot = form.closest(".time-task-setup-modal") || form;
  if (!modalRoot.dataset.kpiDeadlineQuickBound) {
    modalRoot.dataset.kpiDeadlineQuickBound = "1";
    setupDeadlineQuickButtons(modalRoot);
  }

  if (targetInput && !targetInput.dataset.kpiTargetBound) {
    targetInput.dataset.kpiTargetBound = "1";
    targetInput.addEventListener("input", () => {
      const pos = targetInput.selectionStart;
      const on = currentMode() === "time";
      const sanitized = on
        ? sanitizeTimeInput(targetInput.value)
        : sanitizeNumericInput(targetInput.value);
      if (targetInput.value !== sanitized) {
        targetInput.value = sanitized;
        targetInput.setSelectionRange(
          Math.min(pos, sanitized.length),
          Math.min(pos, sanitized.length),
        );
      }
    });
  }
}

/** @deprecated — bindKpiGoalModeForm */
export function bindKpiUnitTimeMode(form, kpi = null, opts = {}) {
  bindKpiGoalModeForm(form, kpi, opts);
}

/**
 * @param {object} kpi
 * @param {{ toDateKey: (d: Date) => string, getAllKpiLogs: () => Array, getAccumulatedKpiValue: (id: string) => number, getKpiTodos?: (id: string) => Array, parseNum: (s: unknown) => number }} deps
 */
export function computeKpiProgress(kpi, deps) {
  const { getAllKpiLogs, getAccumulatedKpiValue, getKpiTodos, parseNum } = deps;
  const lower = kpi.direction === "lower";

  if (kpi.useTaskCompletionGoal) {
    const todos = (getKpiTodos?.(kpi.id) || []).filter(
      (t) => String(t?.text || "").trim() !== "",
    );
    const total = todos.length;
    const done = todos.filter((t) => !!t.completed).length;
    const taskCompletionEmpty = total === 0;
    const progress =
      total > 0 ? Math.min(100, (done / total) * 100) : 0;
    const isCompleted = total > 0 && done >= total;
    const isInProgress = !isCompleted;
    return {
      progress,
      timeProgress: 0,
      currentVal: done,
      targetVal: total,
      targetMins: 0,
      accumulatedMins: 0,
      isCompleted,
      isInProgress,
      lowerBetter: false,
      useTimeAsUnit: false,
      useTaskCompletionGoal: true,
      taskCompletionEmpty,
      taskDoneCount: done,
      taskTotalCount: total,
    };
  }

  if (kpi.useTimeAsUnit) {
    const targetMins = parseKpiTargetTimeRequiredToMinutes(kpi.targetTimeRequired);
    const accumulatedMins = getAccumulatedMinutesForKpi(kpi);
    const timeProgress =
      targetMins > 0 ? Math.min(100, (accumulatedMins / targetMins) * 100) : 0;
    const isCompleted = targetMins > 0 && timeProgress >= 100;
    const isInProgress = !isCompleted;
    return {
      progress: timeProgress,
      timeProgress,
      currentVal: accumulatedMins,
      targetVal: targetMins,
      targetMins,
      accumulatedMins,
      isCompleted,
      isInProgress,
      lowerBetter: false,
      useTimeAsUnit: true,
      useTaskCompletionGoal: false,
      taskCompletionEmpty: false,
    };
  }

  if (kpi.needHabitTracker && kpiHasHabitUnitGoal(kpi)) {
    const todayYmd =
      deps.toDateKey?.(new Date()) ||
      normalizeKpiLogDateYmd(new Date().toISOString().slice(0, 10));
    const kpiLogs = (getAllKpiLogs() || []).filter(
      (l) => String(l.kpiId || "").trim() === String(kpi.id || "").trim(),
    );
    const currentVal = getKpiHabitTodayNumericValue(kpi, kpiLogs, todayYmd);
    const targetVal = parseNum(kpi.targetValue);
    const progress =
      targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    const isCompleted = targetVal > 0 && currentVal >= targetVal;
    return {
      progress,
      timeProgress: 0,
      currentVal,
      targetVal,
      targetMins: 0,
      accumulatedMins: 0,
      isCompleted,
      isInProgress: !isCompleted,
      lowerBetter: false,
      useTimeAsUnit: false,
      useTaskCompletionGoal: false,
      taskCompletionEmpty: false,
      habitUnitGoal: true,
    };
  }

  const latestLog = lower
    ? getLatestKpiLogWithExplicitValue(kpi.id, getAllKpiLogs())
    : null;
  const targetVal = parseNum(kpi.targetValue);
  let currentVal;
  let progress = 0;
  if (lower) {
    currentVal = latestLog != null ? parseNum(latestLog.value) : null;
    if (latestLog != null && currentVal != null) {
      if (targetVal > 0) {
        const c = Math.max(currentVal, 1e-9);
        progress = Math.min(100, (targetVal / c) * 100);
      } else if (targetVal === 0) {
        progress = currentVal <= 0 ? 100 : 0;
      }
    }
  } else {
    const kid = String(kpi?.id || "").trim();
    const relevantLogs = (getAllKpiLogs() || []).filter(
      (l) => String(l?.kpiId || "").trim() === kid,
    );
    currentVal = getKpiAccumulatedMeasureValue(kpi, relevantLogs);
    progress = targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
  }
  const valueComplete = lower
    ? latestLog != null && currentVal != null && currentVal <= targetVal
    : progress >= 100;
  const isCompleted = valueComplete;
  const isInProgress = !isCompleted;
  return {
    progress,
    timeProgress: 0,
    currentVal,
    targetVal,
    targetMins: 0,
    accumulatedMins: 0,
    isCompleted,
    isInProgress,
    lowerBetter: lower,
    useTimeAsUnit: false,
    useTaskCompletionGoal: false,
    taskCompletionEmpty: false,
  };
}

/** 매일하기 KPI — progressResult에 연속 일수 부가 */
export function enrichKpiProgressWithHabitStreak(
  kpi,
  progressResult,
  storedLogs,
  todayYmd,
) {
  if (!kpi?.needHabitTracker) return progressResult;
  const success = collectKpiHabitSuccessDateKeys(kpi, storedLogs);
  return {
    ...progressResult,
    habitStreak: computeKpiHabitCurrentStreakFromSuccess(success, todayYmd),
    habitTotalDays: success.size,
  };
}

/** 카드 진행·히어로 문구 */
export function buildKpiCardTimePresentation(kpi, progressResult, formatNum) {
  const {
    progress,
    timeProgress,
    currentVal,
    accumulatedMins,
    lowerBetter,
    useTimeAsUnit,
    useTaskCompletionGoal,
    taskCompletionEmpty,
    taskDoneCount,
    taskTotalCount,
    habitStreak,
    habitTotalDays,
  } = progressResult;

  if (kpi?.needHabitTracker) {
    const totalDays = Math.max(0, Number(habitTotalDays) || 0);
    const streak = Math.max(0, Number(habitStreak) || 0);
    const streakText = streak > 0 ? `연속 ${streak}일째!` : "연속 0일";
    const hasUnitGoal = kpiHasHabitUnitGoal(kpi);

    if (hasUnitGoal) {
      const unitSuffix = kpi.unit ? " " + kpi.unit : "";
      const currentStr = formatNum(currentVal);
      const targetStr = kpi.targetValue
        ? String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
        : "—";
      return {
        displayProgress: progress,
        progressText: `${currentStr} / ${targetStr}${unitSuffix} · 총 ${totalDays}일`,
        heroStr: currentStr,
        heroUnit: kpi.unit,
        heroPrefix: "",
        habitStatsHtml: "",
        heroStreakAsideHtml: buildKpiCardHabitStreakAsideMarkup(streak),
        cardExtraClass: " dream-kpi-card--habit dream-kpi-card--habit-unit",
        hideProgressFill: false,
        hideProgressBar: false,
      };
    }

    return {
      displayProgress: 0,
      progressText: streakText,
      heroStr: String(totalDays),
      heroUnit: "일",
      heroPrefix: "총 ",
      habitStatsHtml: "",
      heroStreakAsideHtml: "",
      cardExtraClass: " dream-kpi-card--habit",
      hideProgressFill: true,
      hideProgressBar: true,
    };
  }

  const unitSuffix = kpi.unit ? " " + kpi.unit : "";
  const currentStr = formatNum(currentVal);
  const targetStr = kpi.targetValue
    ? String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : "—";
  const targetTimeLabel =
    useTimeAsUnit && kpi.targetTimeRequired
      ? formatKpiTargetTimeRequiredDisplay(kpi.targetTimeRequired)
      : "—";
  const accumulatedLabel = useTimeAsUnit ? formatMinutesToKoreanHm(accumulatedMins) : "";
  let displayProgress = useTimeAsUnit ? timeProgress : progress;
  let progressText;
  let hideProgressFill = false;

  if (useTaskCompletionGoal) {
    if (taskCompletionEmpty) {
      progressText = "아직 할일이 없습니다";
      displayProgress = 0;
      hideProgressFill = true;
    } else {
      progressText = `태스크 ${taskDoneCount}개 / ${taskTotalCount}개`;
    }
    return {
      displayProgress,
      progressText,
      heroStr: taskCompletionEmpty ? "—" : String(Math.round(displayProgress)),
      heroUnit: taskCompletionEmpty ? "" : "%",
      cardExtraClass: " dream-kpi-card--task-completion",
      hideProgressFill,
      hideProgressBar: false,
      heroPrefix: "",
      habitStatsHtml: "",
      heroStreakAsideHtml: "",
    };
  }

  progressText = useTimeAsUnit
    ? `${accumulatedLabel} / ${targetTimeLabel}`
    : lowerBetter
      ? `최근 ${currentStr} / 상한 ${targetStr}${unitSuffix}`
      : `${currentStr} / ${targetStr}${unitSuffix}`;
  const heroStr = useTimeAsUnit ? accumulatedLabel : currentStr;
  const heroUnit = useTimeAsUnit ? "" : kpi.unit;
  const cardExtraClass = useTimeAsUnit ? " dream-kpi-card--time-unit" : "";
  return {
    displayProgress,
    progressText,
    heroStr,
    heroUnit,
    cardExtraClass,
    hideProgressFill,
    hideProgressBar: false,
    heroPrefix: "",
    habitStatsHtml: "",
    heroStreakAsideHtml: "",
  };
}
