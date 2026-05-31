/**
 * KPI 목표 방식·시간 단위 — 꿈·행복·건강·부수입 공통 (폼·진행률·카드 표시)
 */

import {
  getAccumulatedMinutesForKpi,
  parseKpiTargetTimeRequiredToMinutes,
  formatMinutesToKoreanHm,
  formatKpiTargetTimeRequiredDisplay,
} from "./timeKpiSync.js";
import { getLatestKpiLogWithExplicitValue } from "./kpiLogsSort.js";
import { computeKpiHabitCurrentStreak } from "./kpiHabitStreak.js";

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
  return `
            <div class="dream-kpi-field dream-kpi-goal-mode-field" data-legacy="time-add-task-field">
              ${kpiGoalModeOptionsHtml(kpi)}
            </div>
            <div class="dream-kpi-row dream-kpi-target-fields-row" data-kpi-target-fields data-legacy="time-add-task-field">
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                ${kpiTargetValueFieldHtml(kpi, escapeHtml, opts)}
              </div>
              <div class="dream-kpi-field dream-kpi-unit-field" data-legacy="time-add-task-field">
                ${kpiUnitFieldHtml(kpi, escapeHtml, opts)}
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
  const unitPlaceholder = opts.unitPlaceholder ?? "예) %(완성도), 일";
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

export function readKpiGoalModeFormFields(
  form,
  sanitizeNumericInput = sanitizeKpiNumericInput,
) {
  const mode =
    form.querySelector('input[name="kpiGoalMode"]:checked')?.value || "manual";
  const useTimeAsUnit = mode === "time";
  const needHabitTracker = mode === "habit";
  const useTaskCompletionGoal = mode === "task";
  const targetRaw = (form.targetValue?.value || "").trim();

  if (useTimeAsUnit) {
    return {
      useTimeAsUnit: true,
      needHabitTracker: false,
      useTaskCompletionGoal: false,
      unit: "시간",
      targetValue: "",
      targetTimeRequired: targetRaw,
    };
  }
  if (needHabitTracker || useTaskCompletionGoal) {
    return {
      useTimeAsUnit: false,
      needHabitTracker,
      useTaskCompletionGoal,
      unit: "",
      targetValue: "",
      targetTimeRequired: "",
    };
  }
  return {
    useTimeAsUnit: false,
    needHabitTracker: false,
    useTaskCompletionGoal: false,
    unit: (form.unit?.value || "").trim(),
    targetValue: sanitizeNumericInput(targetRaw) || "",
    targetTimeRequired: "",
  };
}

/** @deprecated — readKpiGoalModeFormFields */
export function readKpiTimeUnitFormFields(form, sanitizeNumericInput) {
  return readKpiGoalModeFormFields(form, sanitizeNumericInput);
}

export function applyKpiFormGoalFieldsToKpi(target, form, opts = {}) {
  const fields = readKpiGoalModeFormFields(form, opts.sanitizeNumericInput);
  target.useTimeAsUnit = fields.useTimeAsUnit;
  target.needHabitTracker = fields.needHabitTracker;
  target.useTaskCompletionGoal = fields.useTaskCompletionGoal;
  target.unit = fields.unit;
  target.targetValue = fields.targetValue;
  target.targetTimeRequired = fields.targetTimeRequired;
}

export function bindKpiGoalModeForm(form, kpi = null, opts = {}) {
  if (!form) return;
  const sanitizeNumericInput = opts.sanitizeNumericInput ?? sanitizeKpiNumericInput;
  const sanitizeTimeInput = opts.sanitizeTimeInput ?? sanitizeKpiTimeInput;
  const lowerPlaceholder = opts.lowerPlaceholder ?? "예) 5";
  const higherPlaceholder = opts.higherPlaceholder ?? "예) 99";
  const timePlaceholder = opts.timePlaceholder ?? "예) 25:00";

  const unitInput = form.querySelector('input[name="unit"]');
  const targetInput = form.querySelector('input[name="targetValue"]');
  const labelSpan = form.querySelector(".dream-kpi-target-label-text");
  const directionField = form.querySelector(".dream-kpi-direction-field");
  const directionRadios = form.querySelectorAll('input[name="direction"]');
  const targetFieldsRow = form.querySelector("[data-kpi-target-fields]");
  const unitFieldWrap = form.querySelector(".dream-kpi-unit-field");
  const goalModeRadios = form.querySelectorAll('input[name="kpiGoalMode"]');
  let savedUnit = (kpi && resolveKpiGoalMode(kpi) === "manual"
    ? kpi?.unit || unitInput?.value || ""
    : unitInput?.value || ""
  ).trim();
  if (savedUnit === "시간") savedUnit = "";

  const currentMode = () =>
    form.querySelector('input[name="kpiGoalMode"]:checked')?.value || "manual";

  const syncTargetLabelForDirection = () => {
    if (currentMode() === "time") {
      if (labelSpan) labelSpan.textContent = "목표 시간";
      if (targetInput) targetInput.placeholder = timePlaceholder;
      return;
    }
    const lower =
      form.querySelector('input[name="direction"]:checked')?.value === "lower";
    if (labelSpan) labelSpan.textContent = lower ? "허용 상한" : "목표값";
    if (targetInput) {
      targetInput.placeholder = lower ? lowerPlaceholder : higherPlaceholder;
    }
  };

  const sync = () => {
    const mode = currentMode();
    const showTargetFields = mode === "time" || mode === "manual";
    if (targetFieldsRow) targetFieldsRow.hidden = !showTargetFields;
    if (unitFieldWrap) unitFieldWrap.hidden = mode !== "manual";
    syncTargetLabelForDirection();

    const onTime = mode === "time";
    if (unitInput && mode === "manual") {
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
      else if (mode === "manual") targetInput.setAttribute("inputmode", "numeric");
    }
    if (directionField) {
      directionField.hidden = mode !== "manual";
    }
    if (onTime) {
      const higherRadio = form.querySelector('input[name="direction"][value="higher"]');
      if (higherRadio) higherRadio.checked = true;
    }
  };

  goalModeRadios.forEach((r) => r.addEventListener("change", sync));
  directionRadios.forEach((r) => r.addEventListener("change", syncTargetLabelForDirection));
  sync();

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
  const { toDateKey, getAllKpiLogs, getAccumulatedKpiValue, getKpiTodos, parseNum } =
    deps;
  const lower = kpi.direction === "lower";
  const todayKey = toDateKey(new Date());
  const startKey = (kpi.targetStartDate || "").slice(0, 10);
  const endKey = (kpi.targetDeadline || "").slice(0, 10);
  const hasStart = startKey.length >= 10;

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
    const isInProgress =
      hasStart &&
      startKey <= todayKey &&
      (!endKey || endKey >= todayKey) &&
      !isCompleted &&
      !taskCompletionEmpty;
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
    const isInProgress =
      hasStart && startKey <= todayKey && (!endKey || endKey >= todayKey) && !isCompleted;
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
    currentVal = getAccumulatedKpiValue(kpi.id);
    progress = targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
  }
  const valueComplete = lower
    ? latestLog != null && currentVal != null && currentVal <= targetVal
    : progress >= 100;
  const isCompleted = valueComplete;
  const isInProgress =
    hasStart && startKey <= todayKey && (!endKey || endKey >= todayKey) && !isCompleted;
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
  return {
    ...progressResult,
    habitStreak: computeKpiHabitCurrentStreak(kpi, storedLogs, todayYmd),
  };
}

function appendHabitStreakToProgressText(kpi, progressResult, progressText) {
  if (!kpi?.needHabitTracker) return progressText;
  const streak = Math.max(0, Number(progressResult?.habitStreak) || 0);
  if (streak <= 0) return progressText;
  return `${progressText} · 연속 ${streak}일째!`;
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
  } = progressResult;
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
    };
  }

  progressText = useTimeAsUnit
    ? `${accumulatedLabel} / ${targetTimeLabel}`
    : lowerBetter
      ? `최근 ${currentStr} / 상한 ${targetStr}${unitSuffix}`
      : `${currentStr} / ${targetStr}${unitSuffix}`;
  progressText = appendHabitStreakToProgressText(kpi, progressResult, progressText);
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
  };
}
