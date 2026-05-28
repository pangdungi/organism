/**
 * KPI 「시간」 단위 모드 — 꿈·행복·건강·부수입 공통 (폼·진행률·카드 표시)
 */

import {
  getAccumulatedMinutesForKpi,
  parseKpiTargetTimeRequiredToMinutes,
  formatMinutesToKoreanHm,
  formatKpiTargetTimeRequiredDisplay,
} from "./timeKpiSync.js";
import { getLatestKpiLogWithExplicitValue } from "./kpiLogsSort.js";

export function sanitizeKpiNumericInput(val) {
  return String(val || "").replace(/[^\d.-]/g, "");
}

export function sanitizeKpiTimeInput(val) {
  return String(val || "").replace(/[^\d:]/g, "");
}

export function kpiTargetValueFieldHtml(kpi, escapeHtml, opts = {}) {
  const sanitizeNumericInput = opts.sanitizeNumericInput ?? sanitizeKpiNumericInput;
  const useTime = !!(kpi && kpi.useTimeAsUnit);
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

export function kpiUnitSubchecksRowHtml(kpi = null) {
  const useTime = !!(kpi && kpi.useTimeAsUnit);
  const habitChecked = !!(kpi && kpi.needHabitTracker);
  return `
    <div class="lp-modal-field-subcheck-row" data-legacy="lp-modal-field-subcheck-row">
      <div class="lp-modal-field-subcheck" data-legacy="lp-modal-field-subcheck">
        <label class="lp-modal-field-subcheck__label" data-legacy="lp-modal-field-subcheck__label">
          <input type="checkbox" name="unitIsTime" class="lp-modal-field-subcheck__input" data-legacy="lp-modal-field-subcheck__input"${useTime ? " checked" : ""} />
          <span class="lp-modal-field-subcheck__text" data-legacy="lp-modal-field-subcheck__text">시간</span>
        </label>
      </div>
      <div class="lp-modal-field-subcheck" data-legacy="lp-modal-field-subcheck">
        <label class="lp-modal-field-subcheck__label" data-legacy="lp-modal-field-subcheck__label">
          <input type="checkbox" name="needHabitTracker" class="lp-modal-field-subcheck__input" data-legacy="lp-modal-field-subcheck__input"${habitChecked ? " checked" : ""} />
          <span class="lp-modal-field-subcheck__text" data-legacy="lp-modal-field-subcheck__text">매일 반복</span>
        </label>
      </div>
    </div>
  `;
}

export function kpiUnitFieldHtml(kpi, escapeHtml, opts = {}) {
  const unitPlaceholder = opts.unitPlaceholder ?? "예) %(완성도), 일";
  const useTime = !!(kpi && kpi.useTimeAsUnit);
  const unitVal = useTime ? "시간" : kpi?.unit || "";
  const unitAttrs = useTime
    ? ' value="시간" readonly aria-readonly="true" class="dream-kpi-input-readonly"'
    : kpi
      ? ` value="${escapeHtml(unitVal)}"`
      : "";
  return `
    <label>단위</label>
    <input type="text" name="unit"${unitAttrs} placeholder="${escapeHtml(unitPlaceholder)}" />
    ${kpiUnitSubchecksRowHtml(kpi)}
  `;
}

export function readKpiTimeUnitFormFields(form, sanitizeNumericInput = sanitizeKpiNumericInput) {
  const useTimeAsUnit = !!form.querySelector('input[name="unitIsTime"]')?.checked;
  const targetRaw = (form.targetValue?.value || "").trim();
  if (useTimeAsUnit) {
    return {
      useTimeAsUnit: true,
      unit: "시간",
      targetValue: "",
      targetTimeRequired: targetRaw,
    };
  }
  return {
    useTimeAsUnit: false,
    unit: (form.unit?.value || "").trim(),
    targetValue: sanitizeNumericInput(targetRaw) || "",
    targetTimeRequired: "",
  };
}

export function bindKpiUnitTimeMode(form, kpi = null, opts = {}) {
  if (!form) return;
  const sanitizeNumericInput = opts.sanitizeNumericInput ?? sanitizeKpiNumericInput;
  const sanitizeTimeInput = opts.sanitizeTimeInput ?? sanitizeKpiTimeInput;
  const lowerPlaceholder = opts.lowerPlaceholder ?? "예) 5";
  const higherPlaceholder = opts.higherPlaceholder ?? "예) 99";
  const timePlaceholder = opts.timePlaceholder ?? "예) 25:00";

  const unitInput = form.querySelector('input[name="unit"]');
  const useTimeCheck = form.querySelector('input[name="unitIsTime"]');
  const targetInput = form.querySelector('input[name="targetValue"]');
  const labelSpan = form.querySelector(".dream-kpi-target-label-text");
  const directionField = form.querySelector(".dream-kpi-direction-field");
  const directionRadios = form.querySelectorAll('input[name="direction"]');
  let savedUnit = (kpi?.useTimeAsUnit ? "" : kpi?.unit || unitInput?.value || "").trim();
  if (savedUnit === "시간") savedUnit = "";

  const syncTargetLabelForDirection = () => {
    if (useTimeCheck?.checked) {
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
    const on = !!useTimeCheck?.checked;
    syncTargetLabelForDirection();
    if (unitInput) {
      if (on) {
        const cur = (unitInput.value || "").trim();
        if (cur && cur !== "시간") savedUnit = cur;
        unitInput.value = "시간";
        unitInput.readOnly = true;
        unitInput.setAttribute("aria-readonly", "true");
        unitInput.classList.add("dream-kpi-input-readonly");
      } else {
        unitInput.readOnly = false;
        unitInput.removeAttribute("aria-readonly");
        unitInput.classList.remove("dream-kpi-input-readonly");
        if ((unitInput.value || "").trim() === "시간") {
          unitInput.value = savedUnit;
        }
      }
    }
    if (targetInput) {
      if (on) targetInput.removeAttribute("inputmode");
      else targetInput.setAttribute("inputmode", "numeric");
    }
    if (directionField) directionField.hidden = on;
    if (on) {
      const higherRadio = form.querySelector('input[name="direction"][value="higher"]');
      if (higherRadio) higherRadio.checked = true;
    }
  };

  useTimeCheck?.addEventListener("change", sync);
  directionRadios.forEach((r) => r.addEventListener("change", syncTargetLabelForDirection));
  sync();

  if (targetInput && !targetInput.dataset.kpiTargetBound) {
    targetInput.dataset.kpiTargetBound = "1";
    targetInput.addEventListener("input", () => {
      const pos = targetInput.selectionStart;
      const on = !!useTimeCheck?.checked;
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

/**
 * @param {object} kpi
 * @param {{ toDateKey: (d: Date) => string, getAllKpiLogs: () => Array, getAccumulatedKpiValue: (id: string) => number, parseNum: (s: unknown) => number }} deps
 */
export function computeKpiProgress(kpi, deps) {
  const { toDateKey, getAllKpiLogs, getAccumulatedKpiValue, parseNum } = deps;
  const lower = kpi.direction === "lower";
  const todayKey = toDateKey(new Date());
  const startKey = (kpi.targetStartDate || "").slice(0, 10);
  const endKey = (kpi.targetDeadline || "").slice(0, 10);
  const hasStart = startKey.length >= 10;

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
  const displayProgress = useTimeAsUnit ? timeProgress : progress;
  const progressText = useTimeAsUnit
    ? `${accumulatedLabel} / ${targetTimeLabel}`
    : lowerBetter
      ? `최근 ${currentStr} / 상한 ${targetStr}${unitSuffix}`
      : `${currentStr} / ${targetStr}${unitSuffix}`;
  const heroStr = useTimeAsUnit ? accumulatedLabel : currentStr;
  const heroUnit = useTimeAsUnit ? "" : kpi.unit;
  const cardExtraClass = useTimeAsUnit ? " dream-kpi-card--time-unit" : "";
  return { displayProgress, progressText, heroStr, heroUnit, cardExtraClass };
}
