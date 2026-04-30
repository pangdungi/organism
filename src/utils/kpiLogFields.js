/** KPI 일지 로그 — 시간가계부 연동 필드(로컬·DB 공통 의미) */

export const KPI_LOG_SOURCE_MANUAL = "manual";
export const KPI_LOG_SOURCE_TIME_LEDGER = "time_ledger";

export function defaultManualKpiLogMeta() {
  return {
    kpiLogSource: KPI_LOG_SOURCE_MANUAL,
    timeLedgerEntryIds: [],
  };
}

/** DB dream/health/…_map_kpi_logs 행 → 로컬 KPI 로그 동일 필드 */
export function kpiLogMetaFromDbRow(r) {
  const src = String(r?.kpi_log_source ?? "").trim();
  const kpiLogSource =
    src === KPI_LOG_SOURCE_TIME_LEDGER
      ? KPI_LOG_SOURCE_TIME_LEDGER
      : KPI_LOG_SOURCE_MANUAL;
  const raw = r?.time_ledger_entry_ids;
  const timeLedgerEntryIds = Array.isArray(raw)
    ? raw.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
  return { kpiLogSource, timeLedgerEntryIds };
}

/** @param {object} log */
export function kpiLogIsTimeLinked(log) {
  if (!log || typeof log !== "object") return false;
  if (log.kpiLogSource === KPI_LOG_SOURCE_TIME_LEDGER) return true;
  return (
    Array.isArray(log.timeLedgerEntryIds) && log.timeLedgerEntryIds.length > 0
  );
}

/**
 * KPI 일지 목록 HTML — 날짜 옆 출처 뱃지
 * @param {object} log
 * @returns {string}
 */
export function kpiLogSourceBadgeHtml(log) {
  const linked = kpiLogIsTimeLinked(log);
  const label = linked ? "시간기록" : "직접";
  const cls = linked
    ? "dream-kpi-log-source dream-kpi-log-source--time"
    : "dream-kpi-log-source dream-kpi-log-source--manual";
  const title = linked
    ? "이 로그는 시간가계부 기록과 연결될 수 있습니다."
    : "KPI 화면에서 직접 입력한 로그입니다.";
  return `<span class="${cls}" title="${title}">${label}</span>`;
}
