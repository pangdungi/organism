/**
 * KPI 과제 상태 — 진행 전 / 진행중 / 완료 (로컬 progressStatus ↔ DB progress_status)
 *
 * 직접입력 KPI: 목표 수치를 달성하면(progress.isCompleted) 사용자 설정과 무관하게 완료로 본다.
 */

export const KPI_PROGRESS_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
};

/** 새 행동 기본값 · 미지정 시 */
export const KPI_PROGRESS_STATUS_DEFAULT = KPI_PROGRESS_STATUS.ACTIVE;

/**
 * 목표 모드「직접입력」(시간·습관·과제완료 아님)
 * @param {unknown} kpi
 */
export function isManualInputKpi(kpi) {
  return (
    !!kpi &&
    !kpi.useTimeAsUnit &&
    !kpi.needHabitTracker &&
    !kpi.useTaskCompletionGoal
  );
}

/**
 * @param {unknown} value
 * @returns {"pending"|"active"|"completed"}
 */
export function normalizeKpiProgressStatus(value) {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (v === "pending" || v === "not_started" || v === "todo") {
    return KPI_PROGRESS_STATUS.PENDING;
  }
  if (v === "completed" || v === "done") {
    return KPI_PROGRESS_STATUS.COMPLETED;
  }
  if (v === "active" || v === "in_progress" || v === "progress") {
    return KPI_PROGRESS_STATUS.ACTIVE;
  }
  return KPI_PROGRESS_STATUS_DEFAULT;
}

/** 저장된 상태만 (자동 완료 반영 전) */
export function getKpiProgressStatus(kpi) {
  return normalizeKpiProgressStatus(kpi?.progressStatus);
}

function localTodayYmdTen() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 시작일이 오늘보다 미래면 진행 전.
 * @param {string} startYmd
 * @param {unknown} [fallbackStatus]
 */
export function progressStatusForKpiStartDate(
  startYmd,
  fallbackStatus = KPI_PROGRESS_STATUS_DEFAULT,
) {
  const start = String(startYmd || "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && start > localTodayYmdTen()) {
    return KPI_PROGRESS_STATUS.PENDING;
  }
  return normalizeKpiProgressStatus(fallbackStatus);
}

/**
 * 시간가계부 과제목록에 올릴 KPI인지 — 진행중만 (진행전·완료 제외)
 * @param {unknown} kpi
 * @param {{ isCompleted?: boolean }|null|undefined} [progress]
 */
export function isKpiEligibleForTimeTaskList(kpi, progress = null) {
  return resolveKpiProgressStatus(kpi, progress) === KPI_PROGRESS_STATUS.ACTIVE;
}

/**
 * 목록·필터용 유효 상태.
 * 직접입력이고 목표 달성(isCompleted)이면 항상 완료.
 * 시작일이 미래면 진행 전(완료 제외).
 * @param {unknown} kpi
 * @param {{ isCompleted?: boolean }|null|undefined} progress
 */
export function resolveKpiProgressStatus(kpi, progress = null) {
  if (isManualInputKpi(kpi) && progress?.isCompleted) {
    return KPI_PROGRESS_STATUS.COMPLETED;
  }
  const stored = getKpiProgressStatus(kpi);
  if (stored === KPI_PROGRESS_STATUS.COMPLETED) return stored;
  const start = String(kpi?.targetStartDate || "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && start > localTodayYmdTen()) {
    return KPI_PROGRESS_STATUS.PENDING;
  }
  return stored;
}

/**
 * 직접입력 + 목표 달성이면 progressStatus를 completed로 맞춘다.
 * @returns {boolean} 값이 바뀌었으면 true
 */
export function applyAutoCompleteManualKpiIfNeeded(kpi, progress) {
  if (!kpi || !isManualInputKpi(kpi) || !progress?.isCompleted) return false;
  if (getKpiProgressStatus(kpi) === KPI_PROGRESS_STATUS.COMPLETED) return false;
  kpi.progressStatus = KPI_PROGRESS_STATUS.COMPLETED;
  return true;
}

/**
 * 목록 필터 값 (레거시 "all" → 진행중)
 * @param {unknown} filter
 * @returns {"pending"|"active"|"completed"}
 */
export function normalizeKpiListFilter(filter) {
  const f = String(filter ?? "").trim();
  if (
    f === KPI_PROGRESS_STATUS.PENDING ||
    f === KPI_PROGRESS_STATUS.ACTIVE ||
    f === KPI_PROGRESS_STATUS.COMPLETED
  ) {
    return f;
  }
  return KPI_PROGRESS_STATUS.ACTIVE;
}

/**
 * @param {Array<object>} kpis
 * @param {(kpi: object) => { isCompleted?: boolean }} [progressFor]
 */
export function partitionKpisByProgressStatus(kpis, progressFor) {
  const pending = [];
  const active = [];
  const completed = [];
  const getProgress =
    typeof progressFor === "function" ? progressFor : () => null;
  for (const k of Array.isArray(kpis) ? kpis : []) {
    const s = resolveKpiProgressStatus(k, getProgress(k));
    if (s === KPI_PROGRESS_STATUS.PENDING) pending.push(k);
    else if (s === KPI_PROGRESS_STATUS.COMPLETED) completed.push(k);
    else active.push(k);
  }
  return { pending, active, completed };
}

/**
 * @param {Array<object>} kpis
 * @param {unknown} filter
 * @param {(kpi: object) => { isCompleted?: boolean }} [progressFor]
 */
export function filterKpisByProgressStatus(kpis, filter, progressFor) {
  const f = normalizeKpiListFilter(filter);
  const { pending, active, completed } = partitionKpisByProgressStatus(
    kpis,
    progressFor,
  );
  if (f === KPI_PROGRESS_STATUS.PENDING) return pending;
  if (f === KPI_PROGRESS_STATUS.COMPLETED) return completed;
  return active;
}

/** @param {unknown} kpiFilter */
export function kpiProgressStatusFilterBarHtml(kpiFilter) {
  const f = normalizeKpiListFilter(kpiFilter);
  return `
      <button type="button" class="dream-kpi-filter-btn ${f === "pending" ? "active" : ""}" data-filter="pending">진행 전</button>
      <button type="button" class="dream-kpi-filter-btn ${f === "active" ? "active" : ""}" data-filter="active">진행중</button>
      <button type="button" class="dream-kpi-filter-btn ${f === "completed" ? "active" : ""}" data-filter="completed">완료</button>
    `;
}

/**
 * 행동 수정 모달 — 과제 상태 (진행전·진행중·완료 라디오)
 * @param {object} kpi
 * @param {{ isCompleted?: boolean }|null} [progress]
 */
export function kpiProgressStatusFieldHtml(kpi, progress = null) {
  const cur = resolveKpiProgressStatus(kpi, progress);
  return `
            <div class="dream-kpi-field dream-kpi-progress-status-field" data-legacy="time-add-task-field">
              <span class="dream-kpi-field-label">과제 상태</span>
              <div class="dream-kpi-progress-status-radios" role="radiogroup" aria-label="과제 상태">
                <label class="dream-kpi-progress-status-radio">
                  <input type="radio" name="progressStatus" value="pending"${cur === "pending" ? " checked" : ""} />
                  <span>진행전</span>
                </label>
                <label class="dream-kpi-progress-status-radio">
                  <input type="radio" name="progressStatus" value="active"${cur === "active" ? " checked" : ""} />
                  <span>진행중</span>
                </label>
                <label class="dream-kpi-progress-status-radio">
                  <input type="radio" name="progressStatus" value="completed"${cur === "completed" ? " checked" : ""} />
                  <span>완료</span>
                </label>
              </div>
            </div>`;
}

/**
 * @param {ParentNode|null|undefined} root — 모달 또는 form
 * 라디오는 name=progressStatus 로 폼에서 바로 읽힘 (바인딩 불필요, 호출 호환용)
 */
export function bindKpiProgressStatusField(root) {
  void root;
}

/** @param {HTMLFormElement|null|undefined} form */
export function readKpiProgressStatusFromForm(form) {
  if (!form) return KPI_PROGRESS_STATUS_DEFAULT;
  const checked = form.querySelector?.(
    'input[type="radio"][name="progressStatus"]:checked',
  );
  if (checked && "value" in checked) {
    return normalizeKpiProgressStatus(checked.value);
  }
  const el =
    form.querySelector?.('input[name="progressStatus"]') ||
    form.elements?.namedItem?.("progressStatus");
  const value = el && "value" in el ? el.value : "";
  return normalizeKpiProgressStatus(value);
}
