/** KPI 일지 로그 — 시간가계부 연동 필드(로컬·DB 공통 의미) */

import { readTimeLedgerEntriesRaw } from "./timeLedgerEntriesModel.js";
import { isUuid } from "./idUtils.js";
import {
  formatMinutesToKoreanHm,
  parseKpiTargetTimeRequiredToMinutes,
  getAccumulatedMinutesForKpiIdOnDate,
  normalizeKpiLogDateYmd,
  kpiShouldUseTimeLedgerLogs,
} from "./timeKpiSync.js";
import { kpiHasHabitUnitGoal } from "./kpiHabitUnitGoal.js";

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

/** 합산 분 → 회고 표용 "Xh Ym" / "0m" */
export function formatMinutesToShortHm(totalMin) {
  if (!isFinite(totalMin) || totalMin < 0) return "0m";
  const rounded = Math.round(totalMin);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** @param {object} log @param {object} [kpi] */
export function getKpiLogDisplayMinutes(log, kpi) {
  const cached = Number(log?.__ledgerMinutes);
  if (Number.isFinite(cached) && cached > 0) return Math.round(cached);

  const fromIds = sumLinkedLedgerMinutesFromLog(log);
  if (fromIds > 0) return fromIds;

  const shouldLookupLedger =
    kpiShouldUseTimeLedgerLogs(kpi) || kpiLogIsTimeLinked(log);
  if (!shouldLookupLedger) return 0;
  const kpiId = String(kpi?.id || "").trim();
  if (!kpiId) return 0;
  const dateRaw = normalizeKpiLogDateYmd(log?.dateRaw || log?.date || "");
  if (dateRaw.length < 10) return 0;
  return getAccumulatedMinutesForKpiIdOnDate(kpiId, kpi?.name, dateRaw);
}

/**
 * 로그에 입력된 value·unit (수동) 또는 시간기록 연동 행들의 합산 분
 * @param {{ durationShortHm?: boolean }} [opts] durationShortHm이면 합산 시간을 h/m로 (회고 표만)
 */
export function formatKpiHistoryValueText(log, kpi, opts) {
  const shortHm = Boolean(opts && opts.durationShortHm);
  const u = kpi?.unit ? String(kpi.unit).trim() : "";
  const ledgerMins = getKpiLogDisplayMinutes(log, kpi);
  const v = String(log?.value ?? "").trim();

  /** 매일하기+단위·직접입력 수행값 — 시간 표시보다 우선 */
  if (v && u && (kpiHasHabitUnitGoal(kpi) || (!kpi?.useTimeAsUnit && !kpi?.needHabitTracker))) {
    return `${v} ${u}`;
  }
  if (v && !kpi?.useTimeAsUnit && !(kpi?.needHabitTracker && v === "1" && ledgerMins > 0)) {
    if (kpi?.useTimeAsUnit) {
      const mins = parseKpiTargetTimeRequiredToMinutes(v);
      return mins > 0 ? formatMinutesToKoreanHm(mins) : `${v} 시간`;
    }
    return u ? `${v} ${u}` : v;
  }

  if (
    (kpi?.useTimeAsUnit || kpi?.needHabitTracker || kpiLogIsTimeLinked(log)) &&
    ledgerMins > 0
  ) {
    return shortHm
      ? formatMinutesToShortHm(ledgerMins)
      : formatMinutesToKoreanHm(ledgerMins);
  }

  if (ledgerMins > 0) {
    return shortHm ? formatMinutesToShortHm(ledgerMins) : `${ledgerMins}분`;
  }

  if (kpiLogIsTimeLinked(log)) {
    return kpi?.useTimeAsUnit ? "0분" : formatMinutesToShortHm(0);
  }

  return "—";
}

function hhMmToMinutesLocal(str) {
  if (!str || typeof str !== "string") return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/** @param {object} log */
function sumLinkedLedgerMinutesFromLog(log) {
  const ids = Array.isArray(log?.timeLedgerEntryIds)
    ? new Set(
        log.timeLedgerEntryIds
          .map((x) => String(x ?? "").trim())
          .filter((id) => isUuid(id)),
      )
    : new Set();
  if (ids.size === 0) return 0;
  const rows = readTimeLedgerEntriesRaw();
  let sum = 0;
  for (const r of rows) {
    const id = String(r.id || "").trim();
    if (!ids.has(id)) continue;
    sum += hhMmToMinutesLocal(String(r.timeTracked || ""));
  }
  return sum;
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
    ? "이 로그는 시간 가계부 기록과 연결될 수 있습니다."
    : "KPI 화면에서 직접 입력한 로그입니다.";
  return `<span class="${cls}" title="${title}">${label}</span>`;
}
