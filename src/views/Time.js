/**
 * 시간가계부 - 데일리 시간 입력용
 * 과제명, 사용시간, 생산성, 카테고리, 날짜
 */

import {
  loadExpenseRows,
  saveExpenseRows,
  newExpenseRowId,
  getClassificationToCategoryMap,
  getClassificationsByFlowType,
  getPaymentOptions,
} from "./Asset.js";
import { EXPENSE_MODAL_CLASSIFICATIONS } from "../expenseModalClassifications.js";
import { BAG_DOLLAR_PATHS_INNER } from "../utils/expenseLedgerIcons.js";
import {
  getKpiSyncedTaskNames,
  syncHabitTrackerLogs,
  upsertHabitTrackerLogWithDailyState,
  getHabitTrackerDailyCompletedForDate,
  removeKpiHabitLogsForTimeLedgerEntry,
} from "../utils/timeKpiSync.js";
import {
  getKpiTodosAsTasks,
  getKpiDailyRepeatInfoByKpiName,
  getRetrospectKpiSectionedRows,
  getRetrospectKpiHabitMarkState,
  formatRetrospectKpiDayCell,
} from "../utils/kpiTodoSync.js";
import { kpiTodoFineTrace } from "../utils/kpiTodoFineTrace.js";
import { getCustomSections, getCategoryColorForReport } from "../utils/todoSettings.js";
import { showToast } from "../utils/showToast.js";
import { USER_HOURLY_RATE_KEY } from "../utils/userHourlySync.js";
import * as TTC from "../utils/timeTaskOptionsConstants.js";
import {
  getFullTaskOptions,
  getTaskOptions,
  addTaskOption,
  addTaskOptionFull,
  updateTaskOption,
  removeTaskOption,
  getTaskOptionByName,
  migrateTimeLogRowsTaskIds,
  isUuid,
} from "../utils/timeTaskOptionsModel.js";
import {
  attachTimeLedgerTasksSaveListener,
  pullTimeLedgerTasksFromSupabase,
} from "../utils/timeLedgerTasksSupabase.js";
import { pullKpiMapsForTaskLogModalOpen } from "../utils/kpiTabCloudRefresh.js";
import { pullWorkScheduleFromSupabase } from "../utils/workScheduleSupabase.js";
import {
  getStoredImproveNotes,
  setStoredImproveNote,
} from "../utils/timeImproveNotesModel.js";
import { attachTimeImproveNotesSaveListener } from "../utils/timeImproveNotesSupabase.js";
import { scheduleTimeDailyBudgetSyncPush } from "../utils/timeDailyBudgetSupabase.js";
import {
  ensureTimeLedgerEntryIds,
  readTimeLedgerEntriesRaw,
  splitUnhealthyMealMemoFromDb,
  stripTimeLedgerSyncMetaForCompare,
  writeTimeLedgerEntriesRaw,
} from "../utils/timeLedgerEntriesModel.js";
import {
  deleteTimeLedgerEntryFromSupabase,
  pullTimeLedgerEntriesForDateRange,
  pushDirtyTimeLedgerEntriesToSupabase,
  readTimeLedgerSessionFilterRangeYmd,
  readTimeLedgerAuditSessionFilterRangeYmd,
  readTimeLedgerCombinedPullRangeYmd,
  readTimeLedgerRetrospectSessionFilterRangeYmd,
} from "../utils/timeLedgerEntriesSupabase.js";
import { hydrateAssetExpenseTransactionsFromCloud } from "../utils/assetExpenseTransactionsSupabase.js";
import { pullTimeLedgerTabEnterFromCloud } from "../utils/timeLedgerCloudRefresh.js";
import { timeLedgerSyncLog } from "../utils/timeLedgerSyncDebug.js";
import { lpSaveDebug } from "../utils/lpSaveDebug.js";
import { logTabSync } from "../utils/lpTabSyncDebug.js";
import {
  persistSectionTasksAndSchedule,
  persistCustomSectionTasksAndSchedule,
} from "../utils/todoSectionTasksSupabase.js";
import {
  readSectionTasksObject,
  readCustomSectionTasksObject,
} from "../utils/todoSectionTasksModel.js";
import { listWorkScheduleDietTypeNamesFromMem } from "../utils/workScheduleModel.js";
import {
  getMealChecklistState,
  setMealChecklistItem,
} from "../utils/mealTaskChecklistStorage.js";
import {
  dietNameFromLedgerMemoTag,
  isWorkScheduleDietLedgerMemoTag,
  ledgerRowLogsDietForWorkSchedule,
  makeWorkScheduleDietLedgerMemoTag,
} from "../utils/workScheduleDietLedgerTags.js";

export { getTaskOptionByName };

/** false: 시간가계부 상단「개선하기」탭 비표시. 다시 쓰려면 true 로 변경. */
const TIME_LEDGER_SHOW_IMPROVE_TAB = false;

/** 시간가계부: 1024px 이하는 모바일 카드·요약 레이아웃(main.css 분기와 동일) */
const MQ_TIME_LEDGER_MAX_MOBILE = "(max-width: 64rem)";
const MQ_TIME_LEDGER_MIN_DESKTOP = "(min-width: 64.0625rem)";

/** 모바일 과제 기록 FAB — TodoList ADD_TASK_ICON과 동일 */
const TIME_LEDGER_ADD_FAB_SVG =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>';

/** 상단 툴바: 라벨 없는 단순 + (설정·필터 아이콘과 동일 20px 박스) */
const TIME_LEDGER_ADD_PLUS_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';

/** 툴바 설정·필터: img 필터 대신 +와 동일 currentColor (버튼 color #dc2626 상속) */
const TIME_LEDGER_TOOLBAR_SETTINGS_ICON_SVG =
  '<svg class="time-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m19.845 13.561c.1-.505.155-1.027.155-1.561s-.055-1.056-.155-1.561l1.806-1.489c.502-.414.632-1.132.307-1.696l-.869-1.508c-.325-.564-1.011-.811-1.62-.582l-2.198.825c-.779-.684-1.689-1.218-2.691-1.559l-.385-2.316c-.108-.643-.663-1.114-1.314-1.114h-1.738c-.651 0-1.206.471-1.313 1.114l-.386 2.316c-1.002.341-1.912.875-2.691 1.559l-2.198-.825c-.61-.228-1.295.018-1.62.582l-.87 1.508c-.325.564-.195 1.282.307 1.696l1.806 1.489c-.1.505-.155 1.026-.155 1.561s.055 1.056.155 1.561l-1.806 1.489c-.502.414-.632 1.132-.307 1.696l.869 1.508c.325.564 1.011.811 1.62.582l2.198-.825c.779.684 1.689 1.218 2.691 1.559l.385 2.316c.109.643.664 1.114 1.315 1.114h1.738c.651 0 1.206-.471 1.313-1.114l.385-2.316c1.002-.341 1.913-.875 2.691-1.559l2.198.825c.609.229 1.295-.017 1.62-.582l.869-1.508c.325-.564.196-1.282-.307-1.696z"/><circle cx="12.012" cy="12" r="3"/></g></svg>';

const TIME_LEDGER_TOOLBAR_FILTER_ICON_SVG =
  '<svg class="time-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="m20.988 2h-17.976c-1.664 0-2.606 1.899-1.595 3.216l7.583 9.784v7l4.853-2.101c.731-.318 1.147-1.037 1.147-1.832v-3.067l7.583-9.784c1.011-1.317.069-3.216-1.595-3.216z"/></svg>';

/** 개선하기·기타: 해당 날짜 할일 목록 (Calendar getTasksForDate와 동일 데이터) */
const KPI_SECTION_IDS_AUDIT = [
  "dream",
  "sideincome",
  "health",
  "happy",
];
function getTasksForAuditDate(dateKey) {
  const out = [];
  try {
    const kpiTasks = getKpiTodosAsTasks().filter(
      (t) => (t.dueDate || "").slice(0, 10) === dateKey,
    );
    kpiTasks.forEach((t) =>
      out.push({
        name: t.name || "",
        done: !!t.done,
        eisenhower: (t.eisenhower || "").trim() || "",
        classification: (t.classification || "").trim() || "",
        sectionId: t.sectionId || "kpi",
        taskId: t.kpiTodoId || "",
        kpiTodoId: t.kpiTodoId,
        storageKey: t.storageKey,
      }),
    );
    const obj = readSectionTasksObject();
    KPI_SECTION_IDS_AUDIT.forEach((sectionId) => {
      const arr = obj[sectionId];
      if (!Array.isArray(arr)) return;
      arr
        .filter(
          (t) =>
            (t.name || "").trim() !== "" &&
            (t.dueDate || "").slice(0, 10) === dateKey,
        )
        .forEach((t) =>
          out.push({
            name: (t.name || "").trim(),
            done: !!t.done,
            eisenhower: (t.eisenhower || "").trim() || "",
            classification: "",
            sectionId,
            taskId: t.taskId || "",
          }),
        );
    });
    const cobj = readCustomSectionTasksObject();
    getCustomSections().forEach((sec) => {
      const arr = cobj[sec.id];
      if (!Array.isArray(arr)) return;
      arr
        .filter(
          (t) =>
            (t.name || "").trim() !== "" &&
            (t.dueDate || "").slice(0, 10) === dateKey,
        )
        .forEach((t) =>
          out.push({
            name: (t.name || "").trim(),
            done: !!t.done,
            eisenhower: (t.eisenhower || "").trim() || "",
            classification: "",
            sectionId: sec.id,
            taskId: t.taskId || "",
          }),
        );
    });
  } catch (_) {}
  return out;
}

/** 비생산적 시간 비율 파이 – 파란색 계열 */
const TIME_THIEF_PIE_COLORS = [
  "#93c5fd",
  "#bfdbfe",
  "#dbeafe",
  "#a5b4fc",
  "#c7d2fe",
  "#e0e7ff",
  "#818cf8",
  "#a78bfa",
];

/** 보고서 파이차트: 전체 대비 이 비율(%) 미만 조각은 「기타」로 합침 */
const AUDIT_PIE_MIN_DISPLAY_PCT = 3;
function mergeSmallAuditPieSlices(entries, minPct = AUDIT_PIE_MIN_DISPLAY_PCT) {
  const total = entries.reduce((s, e) => s + e.hours, 0);
  if (total <= 0) return [];
  const majors = [];
  let otherH = 0;
  for (const e of entries) {
    const pct100 = (e.hours / total) * 100;
    if (pct100 >= minPct)
      majors.push({ taskName: e.taskName, hours: e.hours });
    else otherH += e.hours;
  }
  if (otherH > 0) majors.push({ taskName: "기타", hours: otherH });
  return majors;
}

/** 건강 오딧: 내장 과제 중 식사 2종만 포함, 그 외 내장 건강·비건강 과제는 제외 */
const AUDIT_HEALTHY_MEAL_TASK_NAMES = new Set(["건강한 식사"]);
const AUDIT_UNHEALTHY_MEAL_TASK_NAMES = new Set(["건강하지 않은 식사"]);
const AUDIT_HEALTH_SECTION_BUILTIN_NAMES = new Set(
  TTC.DEFAULT_TASK_OPTIONS.map((t) => String(t.name || "").trim()).filter(Boolean),
);

/** 과제 기록 — 근무-식단표 식단 체크리스트 (건강한 식사·식사 준비) */
const MEAL_CHECKLIST_TASK_NAMES = new Set([
  "건강한 식사",
  "건강한 식사 준비",
  "건강한 식사준비",
]);
function isMealChecklistTaskName(n) {
  return MEAL_CHECKLIST_TASK_NAMES.has((n || "").trim());
}

function getAuditTimeThiefHtml(dateStr, filtered, hourlyRate, periodMode) {
  const dateRows =
    dateStr == null
      ? filtered
      : filtered.filter(
          (r) =>
            (normalizeDateForCompare(r.date || "") || (r.date || "").trim()) ===
            dateStr,
        );
  const nonproductiveRows = dateRows.filter(
    (r) => String(r.productivity || "").trim() === "nonproductive",
  );
  const hourly = parseFloat(String(hourlyRate || "0").replace(/,/g, "")) || 0;
  const byTask = {};
  nonproductiveRows.forEach((r) => {
    const name = (r.taskName || "").trim() || "—";
    const hrs = parseTimeToHours(r.timeTracked) || 0;
    const price = hrs * hourly * -1;
    if (!byTask[name]) byTask[name] = { taskName: name, hours: 0, price: 0 };
    byTask[name].hours += hrs;
    byTask[name].price += price;
  });
  const tableRows = Object.values(byTask).sort((a, b) => b.hours - a.hours);
  const totalWastedHours = tableRows.reduce((s, r) => s + r.hours, 0);
  const totalWastedValue = tableRows.reduce((s, r) => s + r.price, 0);
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const tableHtml =
    tableRows.length > 0
      ? (() => {
          const rowsHtml = tableRows
            .map(
              (r) =>
                `<tr><td class="time-audit-thief-task">${esc(r.taskName)}</td><td class="time-audit-thief-time">${formatHoursToHHMM(r.hours)}</td><td class="time-audit-thief-value">${formatPrice(r.price)}</td></tr>`,
            )
            .join("");
          return `<div class="time-audit-thief-table-wrap"><table class="time-audit-thief-table"><thead><tr><th>과제명</th><th>실제 보낸 시간</th><th>시간의 가치</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
        })()
      : `<div class="time-audit-thief-empty">${periodMode ? "해당 기간 비생산적 기록 없음" : "해당 날짜 비생산적 기록 없음"}</div>`;
  const makePieByHours = (entries, title) => {
    const merged = mergeSmallAuditPieSlices(entries);
    const total = merged.reduce((s, e) => s + e.hours, 0);
    if (total <= 0)
      return `<div class="time-audit-pie-box"><div class="time-audit-pie-title">${esc(title)}</div><div class="time-audit-pie-empty">데이터 없음</div></div>`;
    let acc = 0;
    const cx = 50;
    const cy = 50;
    const r = 40;
    const segs = merged
      .map((e, i) => {
        const color = TIME_THIEF_PIE_COLORS[i % TIME_THIEF_PIE_COLORS.length];
        const pct = e.hours / total;
        if (pct >= 0.9999)
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" title="${esc(e.taskName)}: ${Math.round(pct * 100)}%"/>`;
        const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2;
        acc += e.hours;
        const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const large = pct > 0.5 ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
        return `<path d="${d}" fill="${color}" title="${esc(e.taskName)}: ${Math.round(pct * 100)}%"/>`;
      })
      .join("");
    const legend = merged
      .map((e, i) => {
        const color = TIME_THIEF_PIE_COLORS[i % TIME_THIEF_PIE_COLORS.length];
        const pct = total > 0 ? Math.round((e.hours / total) * 100) : 0;
        return `<span class="time-audit-pie-legend-item" style="--pie-color:${color}">${esc(e.taskName)} ${pct}%</span>`;
      })
      .join("");
    return `<div class="time-audit-pie-box"><div class="time-audit-pie-title">${esc(title)}</div><div class="time-audit-pie-svg-wrap"><svg viewBox="0 0 100 100" class="time-audit-pie-svg">${segs}</svg></div><div class="time-audit-pie-legend">${legend}</div></div>`;
  };
  const pieHtml =
    tableRows.length > 0
      ? makePieByHours(tableRows, "비생산적 시간 비율")
      : `<div class="time-audit-pie-box"><div class="time-audit-pie-title">비생산적 시간 비율</div><div class="time-audit-pie-empty">데이터 없음</div></div>`;
  const timeBoxHtml = `
    <div class="time-audit-thief-summary time-audit-thief-summary-time">
      <div class="time-audit-thief-summary-label">낭비한 시간</div>
      <div class="time-audit-thief-summary-num">${formatHoursToReadable(totalWastedHours)}</div>
    </div>`;
  const valueBoxHtml = `
    <div class="time-audit-thief-summary time-audit-thief-summary-value">
      <div class="time-audit-thief-summary-label">낭비로 잃은 시간의 가치</div>
      <div class="time-audit-thief-summary-num">${formatPrice(totalWastedValue)}원</div>
    </div>`;
  const rightHalf = `<div class="time-audit-thief-right-half"><div class="time-audit-thief-center">${pieHtml}</div><div class="time-audit-thief-summaries"><div class="time-audit-thief-right time-audit-thief-time-wrap">${timeBoxHtml}</div><div class="time-audit-thief-right time-audit-thief-value-wrap">${valueBoxHtml}</div></div></div>`;
  return `<div class="time-audit-thief-content"><div class="time-audit-thief-left">${tableHtml}</div>${rightHalf}</div>`;
}

/** 오딧 5. 시간 투자 내역: 생산적 카테고리, 파이 빨간 계열(볼드하지 않게) */
const TIME_INVESTMENT_PIE_COLORS = [
  "#fecaca",
  "#fca5a5",
  "#f87171",
  "#fca5a5",
  "#fecaca",
  "#fda4a4",
  "#fb7185",
  "#f9a8d4",
];
function getAuditTimeInvestmentHtml(dateStr, filtered, hourlyRate, periodMode) {
  const dateRows =
    dateStr == null
      ? filtered
      : filtered.filter(
          (r) =>
            (normalizeDateForCompare(r.date || "") || (r.date || "").trim()) ===
            dateStr,
        );
  const productiveRows = dateRows.filter(
    (r) => String(r.productivity || "").trim() === "productive",
  );
  const hourly = parseFloat(String(hourlyRate || "0").replace(/,/g, "")) || 0;
  const byTask = {};
  productiveRows.forEach((r) => {
    const name = (r.taskName || "").trim() || "—";
    const hrs = parseTimeToHours(r.timeTracked) || 0;
    const price = hrs * hourly;
    if (!byTask[name]) byTask[name] = { taskName: name, hours: 0, price: 0 };
    byTask[name].hours += hrs;
    byTask[name].price += price;
  });
  const tableRows = Object.values(byTask).sort((a, b) => b.hours - a.hours);
  const totalInvestedHours = tableRows.reduce((s, r) => s + r.hours, 0);
  const totalEarned = tableRows.reduce((s, r) => s + r.price, 0);
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const tableHtml =
    tableRows.length > 0
      ? (() => {
          const rowsHtml = tableRows
            .map(
              (r) =>
                `<tr><td class="time-audit-thief-task">${esc(r.taskName)}</td><td class="time-audit-thief-time">${formatHoursToHHMM(r.hours)}</td><td class="time-audit-thief-value">+${formatPrice(r.price)}</td></tr>`,
            )
            .join("");
          return `<div class="time-audit-thief-table-wrap"><table class="time-audit-thief-table"><thead><tr><th>과제명</th><th>실제 보낸 시간</th><th>시간의 가치</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
        })()
      : `<div class="time-audit-thief-empty">${periodMode ? "해당 기간 생산적 기록 없음" : "해당 날짜 생산적 기록 없음"}</div>`;
  const makePieByHours = (entries, title) => {
    const merged = mergeSmallAuditPieSlices(entries);
    const total = merged.reduce((s, e) => s + e.hours, 0);
    if (total <= 0)
      return `<div class="time-audit-pie-box"><div class="time-audit-pie-title">${esc(title)}</div><div class="time-audit-pie-empty">데이터 없음</div></div>`;
    let acc = 0;
    const cx = 50;
    const cy = 50;
    const r = 40;
    const segs = merged
      .map((e, i) => {
        const color =
          TIME_INVESTMENT_PIE_COLORS[i % TIME_INVESTMENT_PIE_COLORS.length];
        const pct = e.hours / total;
        if (pct >= 0.9999)
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" title="${esc(e.taskName)}: ${Math.round(pct * 100)}%"/>`;
        const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2;
        acc += e.hours;
        const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const large = pct > 0.5 ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
        return `<path d="${d}" fill="${color}" title="${esc(e.taskName)}: ${Math.round(pct * 100)}%"/>`;
      })
      .join("");
    const legend = merged
      .map((e, i) => {
        const color =
          TIME_INVESTMENT_PIE_COLORS[i % TIME_INVESTMENT_PIE_COLORS.length];
        const pct = total > 0 ? Math.round((e.hours / total) * 100) : 0;
        return `<span class="time-audit-pie-legend-item" style="--pie-color:${color}">${esc(e.taskName)} ${pct}%</span>`;
      })
      .join("");
    return `<div class="time-audit-pie-box"><div class="time-audit-pie-title">${esc(title)}</div><div class="time-audit-pie-svg-wrap"><svg viewBox="0 0 100 100" class="time-audit-pie-svg">${segs}</svg></div><div class="time-audit-pie-legend">${legend}</div></div>`;
  };
  const pieHtml =
    tableRows.length > 0
      ? makePieByHours(tableRows, "생산적 시간 비율")
      : `<div class="time-audit-pie-box"><div class="time-audit-pie-title">생산적 시간 비율</div><div class="time-audit-pie-empty">데이터 없음</div></div>`;
  const timeBoxHtml = `
    <div class="time-audit-thief-summary time-audit-thief-summary-time">
      <div class="time-audit-thief-summary-label">투자한 시간</div>
      <div class="time-audit-thief-summary-num">${formatHoursToReadable(totalInvestedHours)}</div>
    </div>`;
  const valueBoxHtml = `
    <div class="time-audit-thief-summary time-audit-thief-summary-value time-audit-investment-earned">
      <div class="time-audit-thief-summary-label">투자한 시간의 가치</div>
      <div class="time-audit-thief-summary-num">+${formatPrice(totalEarned)}원</div>
    </div>`;
  const rightHalf = `<div class="time-audit-thief-right-half"><div class="time-audit-thief-center">${pieHtml}</div><div class="time-audit-thief-summaries"><div class="time-audit-thief-right time-audit-thief-time-wrap">${timeBoxHtml}</div><div class="time-audit-thief-right time-audit-thief-value-wrap">${valueBoxHtml}</div></div></div>`;
  return `<div class="time-audit-thief-content time-audit-investment-content"><div class="time-audit-thief-left">${tableHtml}</div>${rightHalf}</div>`;
}

/** 오딧 6. 가용시간: 24 - 근무 - 수면, 오늘 하루의 가치(낭비+번돈 합), 총 수면/총 근무 – 4열 동일 너비 */
function getAuditAvailableTimeHtml(dateStr, filtered, hourlyRate, periodMode) {
  const hourly = parseFloat(String(hourlyRate || "0").replace(/,/g, "")) || 0;
  let workHours = 0;
  let sleepHours = 0;
  let totalWastedValue = 0;
  let totalEarned = 0;
  let availableHours = 0;

  if (periodMode) {
    const byDay = {};
    filtered.forEach((r) => {
      const d =
        normalizeDateForCompare(r.date || "") ||
        String(r.date || "")
          .trim()
          .replace(/\//g, "-")
          .slice(0, 10);
      if (!d) return;
      if (!byDay[d])
        byDay[d] = { work: 0, sleep: 0, wasted: 0, earned: 0 };
      const hrs = parseTimeToHours(r.timeTracked) || 0;
      const cat = (
        r.category ||
        getTaskOptionByName(r.taskName)?.category ||
        ""
      ).trim();
      if (cat === "work") byDay[d].work += hrs;
      else if (cat === "sleep") byDay[d].sleep += hrs;
      const p = (r.productivity || getProductivityFromCategory(cat) || "").trim();
      if (p === "nonproductive") byDay[d].wasted += hrs * hourly * -1;
      else if (p === "productive") byDay[d].earned += hrs * hourly;
    });
    Object.values(byDay).forEach((x) => {
      availableHours += Math.max(0, 24 - x.work - x.sleep);
      workHours += x.work;
      sleepHours += x.sleep;
      totalWastedValue += x.wasted;
      totalEarned += x.earned;
    });
  } else {
    const dateRows = filtered.filter(
      (r) =>
        (normalizeDateForCompare(r.date || "") || (r.date || "").trim()) ===
        dateStr,
    );
    dateRows.forEach((r) => {
      const hrs = parseTimeToHours(r.timeTracked) || 0;
      const cat = (
        r.category ||
        getTaskOptionByName(r.taskName)?.category ||
        ""
      ).trim();
      if (cat === "work") workHours += hrs;
      else if (cat === "sleep") sleepHours += hrs;
      const p = (r.productivity || getProductivityFromCategory(cat) || "").trim();
      if (p === "nonproductive") totalWastedValue += hrs * hourly * -1;
      else if (p === "productive") totalEarned += hrs * hourly;
    });
    availableHours = Math.max(0, 24 - workHours - sleepHours);
  }

  const dayValue = totalEarned + totalWastedValue;
  const valueSign = dayValue >= 0 ? "+" : "";
  const valueText = `${valueSign}${formatPrice(dayValue)}원`;
  const valueClass =
    dayValue >= 0
      ? "time-audit-available-box-value time-audit-available-value-plus"
      : "time-audit-available-box-value time-audit-available-value-minus";
  const boxes = [
    {
      label: periodMode ? "가용시간 합계" : "가용시간",
      value: formatHoursToReadable(availableHours),
      class: "time-audit-available-box-available",
    },
    {
      label: periodMode ? "기간 동안의 가치" : "오늘 하루의 가치",
      value: valueText,
      class: valueClass,
    },
    {
      label: periodMode ? "근무시간 합계" : "총 근무시간",
      value: formatHoursToReadable(workHours),
      class: "time-audit-available-box-work",
    },
    {
      label: periodMode ? "수면시간 합계" : "총 수면시간",
      value: formatHoursToReadable(sleepHours),
      class: "time-audit-available-box-sleep",
    },
  ];
  const items = boxes
    .map(
      (b) =>
        `<div class="time-audit-available-item ${b.class}"><div class="time-audit-available-label">${b.label}</div><div class="time-audit-available-num">${b.value}</div></div>`,
    )
    .join("");
  return `<div class="time-audit-available-content">${items}</div>`;
}

const PRODUCTIVITY_OPTIONS = [
  { value: "productive", label: "생산적", color: "prod-pink" },
  { value: "nonproductive", label: "비생산적", color: "prod-blue" },
  { value: "other", label: "그 외", color: "prod-green" },
];

const BUDGET_GOALS_KEY = "time_daily_budget_goals";
const BUDGET_EXCLUDED_KEY = "time_budget_excluded";

function notifyTimeDailyBudgetSaved(dateStr) {
  if (!(dateStr || "").trim()) return;
  scheduleTimeDailyBudgetSyncPush(String(dateStr).trim().slice(0, 10));
}

/** 감정적이기 과제 선택 시 감정 드롭다운 필터 */
const EMOTION_TASK_POSITIVE = "감정적이기(긍정적)";
const EMOTION_TASK_NEGATIVE = "감정적이기(부정적)";
const EMOTION_LIST_POSITIVE = [
  "기쁨",
  "행복",
  "즐거움",
  "고마움",
  "기특함",
  "감동",
  "사랑",
  "신뢰감",
  "자신감",
  "자부심",
  "편안감",
];
const EMOTION_LIST_NEGATIVE = [
  "공포",
  "불안",
  "걱정",
  "자존심",
  "자격지심",
  "열등감",
  "분노",
  "억울함",
  "괘씸함",
  "서운함",
  "미움",
  "혐오",
  "괴로움",
  "부담감",
  "죄책감",
  "수치심",
  "짜증",
  "원망",
];

function collectKpiLinkedNamesFromFullTaskOptions() {
  const s = new Set();
  try {
    for (const o of getFullTaskOptions()) {
      const kid = String(o.kpiId || "").trim();
      const n = String(o.name || "").trim();
      if (kid && n) s.add(n);
    }
  } catch (_) {}
  return s;
}

function getLockedTaskNames() {
  return new Set([
    ...TTC.FIXED_OTHER_TASKS.map((t) => t.name),
    ...TTC.FIXED_PRODUCTIVE_TASKS.map((t) => t.name),
    ...TTC.FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
    ...TTC.TASKS_LOCKED_FOR_EDIT,
    ...getKpiSyncedTaskNames(),
    ...collectKpiLinkedNamesFromFullTaskOptions(),
  ]);
}

/** 과제 설정 모달에서 수정/삭제 버튼 숨김 대상 (고정 과제 + KPI 연동) */
function getLockedForSetupDisplay() {
  return getLockedTaskNames();
}

/** KPI 맵에서 연동된 과제 — 서버 time_ledger_tasks.kpi_id 기준 */
function isTimeTaskKpiLinked(task) {
  return Boolean(task && String(task.kpiId || "").trim());
}

/** 앱 기본 제공 과제(삭제 불가 템플릿) — FIXED_* 목록 이름 일치 */
const BUILTIN_TEMPLATE_NAMES = new Set([
  ...TTC.FIXED_OTHER_TASKS.map((t) => t.name),
  ...TTC.FIXED_PRODUCTIVE_TASKS.map((t) => t.name),
  ...TTC.FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
]);

function isTimeTaskBuiltinTemplate(task) {
  const n = String(task?.name ?? "").trim();
  return Boolean(n && BUILTIN_TEMPLATE_NAMES.has(n));
}

function appendTaskDropdownBadges(textWrap, task, opts = {}) {
  if (opts.omitBadges) return;
  if (isTimeTaskBuiltinTemplate(task)) {
    const bb = document.createElement("span");
    bb.className = "time-task-builtin-badge";
    bb.textContent = "기본";
    bb.title =
      "앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.";
    textWrap.appendChild(bb);
  }
  if (isTimeTaskKpiLinked(task)) {
    const kb = document.createElement("span");
    kb.className = "time-task-kpi-badge";
    kb.textContent = "KPI";
    kb.title = "KPI(맵)에서 연결된 과제입니다";
    textWrap.appendChild(kb);
  }
}

/** KPI에서 만든 과제 — 시간가계부 과제 설정에서 삭제 불가 안내 */
const MSG_TIME_TASK_KPI_LINKED =
  "KPI와 연결된 과제입니다. 과제 설정에서는 삭제할 수 없습니다. 꿈·건강·행복·부수입 등 KPI 화면에서 해당 KPI를 삭제하면 서버와 과제 목록에서 함께 제거됩니다.";

const PRODUCTIVE_CATEGORIES = [
  { value: "dream", label: "꿈", color: "cat-dream" },
  { value: "sideincome", label: "부수입", color: "cat-sideincome" },
  { value: "happiness", label: "행복", color: "cat-happiness" },
  { value: "health", label: "건강", color: "cat-health" },
];

const NONPRODUCTIVE_CATEGORIES = [
  { value: "pleasure", label: "쾌락충족", color: "cat-pleasure" },
  {
    value: "media_watch",
    label: "미디어 시청",
    color: "cat-media-watch",
  },
  {
    value: "dreamblocking",
    label: "꿈을 방해하는 일",
    color: "cat-dreamblocking",
  },
  { value: "unhappiness", label: "불행", color: "cat-unhappiness" },
  { value: "unhealthy", label: "비건강", color: "cat-unhealthy" },
  { value: "moneylosing", label: "돈을 잃는 일", color: "cat-moneylosing" },
];

/** 일간시간예산 목표 시간 저장/불러오기 - { "YYYY-MM-DD": { "과제명": { goalTime: "08:00", scheduledTime: "hh:mm-hh:mm", isInvest: true } } } */
export function getBudgetGoals(dateStr) {
  try {
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
    if (raw) {
      const all = JSON.parse(raw);
      const result = all[dateStr] || {};
      if (
        typeof result !== "object" ||
        result === null ||
        Array.isArray(result)
      )
        return {};
      return result;
    }
  } catch (_) {}
  return {};
}

export function saveBudgetGoal(dateStr, taskName, goalTime, isInvest) {
  if (!(taskName || "").trim()) return;
  try {
    removeFromBudgetExcluded(dateStr, taskName);
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    if (!all[dateStr]) all[dateStr] = {};
    const key = String(taskName).trim();
    const existing = all[dateStr][key] || {};
    if (goalTime && goalTime.trim()) {
      all[dateStr][key] = { ...existing, goalTime: goalTime.trim(), isInvest };
    } else {
      const { goalTime: _, ...rest } = existing;
      // 과제만 선택했을 때(목표 시간 없음)에도 행 유지
      all[dateStr][key] = Object.keys(rest).length
        ? { ...rest, isInvest }
        : { isInvest };
    }
    localStorage.setItem(BUDGET_GOALS_KEY, JSON.stringify(all));
    notifyTimeDailyBudgetSaved(dateStr);
  } catch (_) {}
}

/** 일간 예산 과제 드롭다운: 빈 값 옵션(—)은 위에 두고, 과제명은 한글 가나다순 */
function sortDailyBudgetTaskDropdownOptions(opts) {
  if (!Array.isArray(opts)) return opts;
  const empty = opts.filter((o) => !String(o.value || "").trim());
  const named = opts.filter((o) => String(o.value || "").trim());
  named.sort((a, b) =>
    String(a.label || a.value || "").localeCompare(
      String(b.label || b.value || ""),
      "ko",
    ),
  );
  return [...empty, ...named];
}

/** 새 행 플레이스홀더 (재렌더 시 행 유지용) */
const BUDGET_PLACEHOLDER_PREFIX = "(과제 선택)·";
function isBudgetPlaceholder(key) {
  return (key || "").startsWith(BUDGET_PLACEHOLDER_PREFIX);
}
function createBudgetPlaceholder() {
  return BUDGET_PLACEHOLDER_PREFIX + Date.now();
}

/** 캘린더 1일뷰 - 과제 행 전체 삭제 (목표+예상시간 제거, 해당 날짜에서 제외) */
function deleteBudgetGoalEntry(dateStr, taskName) {
  const key = (taskName || "").trim();
  if (!key) return;
  try {
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    if (all[dateStr]) {
      delete all[dateStr][key];
      localStorage.setItem(BUDGET_GOALS_KEY, JSON.stringify(all));
    }
    const exclRaw = localStorage.getItem(BUDGET_EXCLUDED_KEY);
    const excl = exclRaw ? JSON.parse(exclRaw) : {};
    if (!excl[dateStr]) excl[dateStr] = [];
    if (!excl[dateStr].includes(key)) excl[dateStr].push(key);
    localStorage.setItem(BUDGET_EXCLUDED_KEY, JSON.stringify(excl));
    notifyTimeDailyBudgetSaved(dateStr);
  } catch (_) {}
}

function getBudgetExcluded(dateStr) {
  try {
    const raw = localStorage.getItem(BUDGET_EXCLUDED_KEY);
    const excl = raw ? JSON.parse(raw) : {};
    return new Set(excl[dateStr] || []);
  } catch (_) {}
  return new Set();
}

/** 제외 목록에서 과제 제거 (다시 추가 시 행이 표시되도록) */
function removeFromBudgetExcluded(dateStr, taskName) {
  const key = (taskName || "").trim();
  if (!key) return;
  try {
    const raw = localStorage.getItem(BUDGET_EXCLUDED_KEY);
    const excl = raw ? JSON.parse(raw) : {};
    if (excl[dateStr]) {
      excl[dateStr] = excl[dateStr].filter((n) => n !== key);
      if (excl[dateStr].length === 0) delete excl[dateStr];
      localStorage.setItem(BUDGET_EXCLUDED_KEY, JSON.stringify(excl));
      notifyTimeDailyBudgetSaved(dateStr);
    }
  } catch (_) {}
}

/** scheduledTimes 배열 반환 (하위 호환: scheduledTime 문자열 → 배열) */
function getScheduledTimesArray(data) {
  if (!data) return [];
  if (Array.isArray(data.scheduledTimes))
    return data.scheduledTimes.filter((s) => s && String(s).trim());
  if (data.scheduledTime && String(data.scheduledTime).trim())
    return [String(data.scheduledTime).trim()];
  return [];
}

/** scheduleMemos — scheduledTimes와 동일 인덱스(없으면 빈 배열) */
function getScheduleMemosArray(data) {
  if (!data) return [];
  if (Array.isArray(data.scheduleMemos))
    return data.scheduleMemos.map((x) => String(x ?? ""));
  return [];
}

/** hh:mm -> 분으로 변환 */
function parseHhMmToMinutes(s) {
  if (!s || !s.trim()) return null;
  const m = String(s)
    .trim()
    .match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!m) return null;
  return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
}

/** 분 -> hh:mm */
function minutesToHhMm(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** scheduled "start-end"를 {startMin, endMin}으로 파싱 */
function parseScheduledSlotToMinutes(str) {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split("-");
  const startMin = parseHhMmToMinutes(parts[0]);
  if (startMin == null) return null;
  const endMin = parts[1] ? parseHhMmToMinutes(parts[1]) : null;
  return { startMin, endMin: endMin != null ? endMin : startMin + 60 };
}

/** 두 구간이 겹치는지 */
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** 기존 슬롯 배열에서 overlap 구간을 제거한 새 배열 반환 (새 과제가 해당 시간을 차지하면 기존 과제 비움) */
function removeOverlapFromSlots(existingSlots, overlapStartMin, overlapEndMin) {
  const result = [];
  for (const slot of existingSlots) {
    const parsed = parseScheduledSlotToMinutes(slot);
    if (!parsed) continue;
    const { startMin, endMin } = parsed;
    if (!rangesOverlap(overlapStartMin, overlapEndMin, startMin, endMin)) {
      result.push(slot);
    } else {
      const before =
        startMin < overlapStartMin
          ? `${minutesToHhMm(startMin)}-${minutesToHhMm(overlapStartMin)}`
          : null;
      const after =
        endMin > overlapEndMin
          ? `${minutesToHhMm(overlapEndMin)}-${minutesToHhMm(endMin)}`
          : null;
      if (before) result.push(before);
      if (after) result.push(after);
    }
  }
  return result;
}

/** 같은 과제 내 겹치는 슬롯 정리 - 배열 뒤쪽(최신) 슬롯이 우선, 앞쪽 겹침 구간 제거 */
function resolveOverlapsWithinSlots(slots) {
  if (!Array.isArray(slots) || slots.length <= 1) return slots;
  let result = [];
  for (const slot of slots) {
    const parsed = parseScheduledSlotToMinutes(slot);
    if (!parsed) continue;
    const { startMin, endMin } = parsed;
    result = removeOverlapFromSlots(result, startMin, endMin);
    result.push(slot);
  }
  return result;
}

/** 새 과제의 예상 시간 저장 시, 겹치는 다른 과제들의 예상 시간 비우기 (새 입력이 우선). 수정된 다른 과제명 Set 반환 */
function clearOverlappingScheduledTimes(all, dateStr, taskName, newSlots) {
  const key = String(taskName).trim();
  const modifiedKeys = new Set();
  if (!key || !all[dateStr]) return modifiedKeys;
  const dateData = all[dateStr];
  for (const slot of newSlots) {
    const parsed = parseScheduledSlotToMinutes(slot);
    if (!parsed) continue;
    const { startMin, endMin } = parsed;
    for (const otherKey of Object.keys(dateData)) {
      if (otherKey === key) continue;
      const other = dateData[otherKey];
      const otherSlots = getScheduledTimesArray(other);
      if (otherSlots.length === 0) continue;
      const remaining = removeOverlapFromSlots(otherSlots, startMin, endMin);
      const sameContent =
        remaining.length === otherSlots.length &&
        remaining.every(
          (s, i) => (otherSlots[i] || "").trim() === (s || "").trim(),
        );
      if (remaining.length === 0) {
        const {
          scheduledTime: _st,
          scheduledTimes: _sts,
          scheduleMemos: _sm,
          ...rest
        } = other;
        dateData[otherKey] = Object.keys(rest).length ? rest : undefined;
        if (!dateData[otherKey]) delete dateData[otherKey];
        modifiedKeys.add(otherKey);
      } else if (!sameContent) {
        let oMemos = getScheduleMemosArray(other);
        while (oMemos.length < remaining.length) oMemos.push("");
        oMemos = oMemos.slice(0, remaining.length);
        dateData[otherKey] = {
          ...other,
          scheduledTimes: remaining,
          scheduleMemos: oMemos,
        };
        modifiedKeys.add(otherKey);
      }
    }
  }
  return modifiedKeys;
}

/** 오늘의 할일 등 예산 블록 외부 과제: 겹침 해결 비활성화 (사용자 요청) */
export function clearOverlapFromBudgetGoalsOnly(dateStr, scheduledTimes) {
  return false;
}

/** 캘린더 1일뷰 예정 시간 저장 - scheduledTimes 배열 지원 (같은 과제 여러 구간). 겹침 해결 시 true 반환 */
export function saveBudgetScheduledTimes(
  dateStr,
  taskName,
  scheduledTimes,
  isInvest,
) {
  if (!(taskName || "").trim()) return false;
  try {
    removeFromBudgetExcluded(dateStr, taskName);
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const dateData = all[dateStr];
    if (!dateData || typeof dateData !== "object" || Array.isArray(dateData))
      all[dateStr] = {};
    const key = String(taskName).trim();
    const existing = all[dateStr][key] || {};
    let arr = Array.isArray(scheduledTimes)
      ? scheduledTimes.map((s) => String(s || "").trim()).filter(Boolean)
      : [];
    arr = resolveOverlapsWithinSlots(arr);
    if (arr.length > 0) {
      let memos = getScheduleMemosArray(existing);
      while (memos.length < arr.length) memos.push("");
      if (memos.length > arr.length) memos = memos.slice(0, arr.length);
      all[dateStr][key] = {
        ...existing,
        scheduledTimes: arr,
        scheduleMemos: memos,
        isInvest,
      };
    } else {
      const {
        scheduledTime: _st,
        scheduledTimes: _sts,
        scheduleMemos: _sm,
        ...rest
      } = existing;
      all[dateStr][key] = Object.keys(rest).length ? rest : undefined;
      if (!all[dateStr][key]) delete all[dateStr][key];
    }
    localStorage.setItem(BUDGET_GOALS_KEY, JSON.stringify(all));
    notifyTimeDailyBudgetSaved(dateStr);
    return false;
  } catch (_) {
    return false;
  }
}

/** @deprecated 단일 구간 저장 - saveBudgetScheduledTimes 사용 권장 */
function saveBudgetScheduledTime(dateStr, taskName, scheduledTime, isInvest) {
  saveBudgetScheduledTimes(
    dateStr,
    taskName,
    scheduledTime ? [scheduledTime] : [],
    isInvest,
  );
}

function calendarBudgetTimesValid(start, end) {
  if (!start || !end) return false;
  const hhmmRe = /^\d{1,2}:\d{2}$/;
  if (!hhmmRe.test(start) || !hhmmRe.test(end)) return false;
  return parseTimeToHours(end) > parseTimeToHours(start);
}

function resolveCalendarBudgetIsInvest(taskName) {
  const n = String(taskName || "").trim();
  if (n === "수면하기" || n === "근무하기") return true;
  const opt = getTaskOptionByName(n);
  if (!opt) return true;
  const p = String(opt.productivity || "").toLowerCase();
  if (p === "nonproductive") return false;
  return true;
}

/**
 * 캘린더 일간 예산(예상 타임블록) — 모달에서만 저장할 때 사용.
 * slotIndex 가 없으면 새 구간 추가, 있으면 해당 인덱스만 교체.
 */
export function commitCalendarBudgetTaskModal(dateStr, payload) {
  const dk = String(dateStr || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return false;
  const taskName = String(payload?.taskName || "").trim();
  if (!taskName) return false;
  const start = String(payload?.start || "").trim();
  const end = String(payload?.end || "").trim();
  if (!calendarBudgetTimesValid(start, end)) {
    showToast(
      "시작·마감 시간을 hh:mm 형식으로, 마감이 시작보다 뒤에 오게 입력해 주세요.",
    );
    return false;
  }
  const isInvest =
    typeof payload?.isInvest === "boolean"
      ? payload.isInvest
      : resolveCalendarBudgetIsInvest(taskName);
  const slotStr = `${start}-${end}`;
  const memoStr = String(payload?.memo ?? "").trim();
  try {
    removeFromBudgetExcluded(dk, taskName);
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    if (!all[dk] || typeof all[dk] !== "object" || Array.isArray(all[dk]))
      all[dk] = {};
    const key = taskName;
    const existing = all[dk][key] || {};
    let times = getScheduledTimesArray(existing);
    let memos = getScheduleMemosArray(existing);
    while (memos.length < times.length) memos.push("");
    const siRaw = payload?.slotIndex;
    if (siRaw == null || siRaw === "") {
      times.push(slotStr);
      memos.push(memoStr);
      } else {
      const si = Number(siRaw);
      if (!Number.isInteger(si) || si < 0 || si >= times.length) return false;
      times[si] = slotStr;
      memos[si] = memoStr;
    }
    times = resolveOverlapsWithinSlots(times);
    while (memos.length < times.length) memos.push("");
    memos = memos.slice(0, times.length);
    all[dk][key] = {
      ...existing,
      scheduledTimes: times,
      scheduleMemos: memos,
      isInvest,
    };
    localStorage.setItem(BUDGET_GOALS_KEY, JSON.stringify(all));
    notifyTimeDailyBudgetSaved(dk);
    return true;
  } catch (_) {
    return false;
  }
}

/** 예상 구간 한 덩어리 삭제(모달 삭제 버튼) */
export function deleteCalendarBudgetScheduleSlot(dateStr, taskName, slotIndex) {
  const dk = String(dateStr || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return false;
  const key = String(taskName || "").trim();
  if (!key) return false;
  const idx = Number(slotIndex);
  if (!Number.isInteger(idx) || idx < 0) return false;
  try {
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const existing = all[dk]?.[key];
    if (!existing) return false;
    let times = getScheduledTimesArray(existing);
    let memos = getScheduleMemosArray(existing);
    if (idx >= times.length) return false;
    times.splice(idx, 1);
    memos.splice(idx, 1);
    if (times.length === 0) {
      deleteBudgetGoalEntry(dk, key);
    } else {
      all[dk][key] = {
        ...existing,
        scheduledTimes: times,
        scheduleMemos: memos,
      };
    localStorage.setItem(BUDGET_GOALS_KEY, JSON.stringify(all));
      notifyTimeDailyBudgetSaved(dk);
    }
    return true;
  } catch (_) {
    return false;
  }
}

/** 과제 기록 로컬 저장 — IndexedDB(+미러) 경로는 timeLedgerEntriesModel */
export function loadTimeRows() {
  try {
    const arr = readTimeLedgerEntriesRaw();
    const { rows, dirty } = ensureTimeLedgerEntryIds(arr);
    if (dirty) {
      writeTimeLedgerEntriesRaw(rows);
    }
    return rows;
  } catch (_) {
    return [];
  }
}

function saveTimeRows(rows) {
  try {
    const prevSnap = readTimeLedgerEntriesRaw();
    const prevById = new Map(
      (Array.isArray(prevSnap) ? prevSnap : []).map((r) => [
        String(r?.id || "").trim(),
        r,
      ]),
    );
    const arr = Array.isArray(rows) ? rows : [];
    const { rows: withIds, dirty } = ensureTimeLedgerEntryIds(arr);
    const toSave = withIds.map((r) => {
      const id = String(r?.id || "").trim();
      const prevRow = id ? prevById.get(id) : null;
      if (!prevRow) {
        const lm =
          typeof r.localModifiedAt === "number" && Number.isFinite(r.localModifiedAt)
            ? r.localModifiedAt
            : Date.now();
        return { ...r, localModifiedAt: lm };
      }
      const same =
        stripTimeLedgerSyncMetaForCompare(prevRow) ===
        stripTimeLedgerSyncMetaForCompare(r);
      if (same) {
        return {
          ...r,
          localModifiedAt: prevRow.localModifiedAt,
          serverUpdatedAt:
            prevRow.serverUpdatedAt !== undefined && prevRow.serverUpdatedAt !== ""
              ? prevRow.serverUpdatedAt
              : r.serverUpdatedAt,
        };
      }
      return { ...r, localModifiedAt: Date.now() };
    });
    if (dirty) {
      /* 신규 id 부여분 반영 */
    }
    writeTimeLedgerEntriesRaw(toSave);
    timeLedgerSyncLog("local_rows_saved", {
      totalRows: toSave.length,
      note: "로컬 저장 완료 → 곧 서버 반영(push) 시도",
    });
    syncHabitTrackerLogs();
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("calendar-time-rows-updated", { detail: {} }),
      );
    }
    try {
      if (typeof window !== "undefined") {
        void pushDirtyTimeLedgerEntriesToSupabase({ skipPull: true });
      }
    } catch (_) {}
  } catch (_) {}
}

const TASK_BAR_COLORS = [
  "#a8e6cf",
  "#dcedc1",
  "#ffd3b6",
  "#ffaaa5",
  "#ff8b94",
  "#c7ceea",
  "#b8a9c9",
  "#d4a5a5",
  "#92a8d1",
  "#88b04b",
  "#f7cac9",
  "#92c5de",
  "#f4a460",
  "#98d8c8",
  "#f7dc6f",
  "#bb8fce",
  "#85c1e9",
  "#f8b500",
  "#2ecc71",
  "#e74c3c",
];

const CATEGORY_OPTIONS = [
  { value: "", label: "—", color: "cat-empty" },
  { value: "dream", label: "꿈", color: "cat-dream" },
  { value: "sideincome", label: "부수입", color: "cat-sideincome" },
  { value: "happiness", label: "행복", color: "cat-happiness" },
  { value: "health", label: "건강", color: "cat-health" },
  { value: "pleasure", label: "쾌락충족", color: "cat-pleasure" },
  {
    value: "media_watch",
    label: "미디어 시청",
    color: "cat-media-watch",
  },
  {
    value: "dreamblocking",
    label: "꿈을 방해하는 일",
    color: "cat-dreamblocking",
  },
  { value: "unhappiness", label: "불행", color: "cat-unhappiness" },
  { value: "unhealthy", label: "비건강", color: "cat-unhealthy" },
  { value: "moneylosing", label: "돈을 잃는 일", color: "cat-moneylosing" },
  { value: "work", label: "근무", color: "cat-work" },
  { value: "sleep", label: "수면", color: "cat-sleep" },
];

/** 오딧 그래프용 카테고리 색상 (time-tag-pill과 동일) */
const CATEGORY_GRAPH_COLORS = {
  dream: "rgba(216,238,242,0.5)",
  sideincome: "rgba(214,235,232,0.5)",
  happiness: "rgba(216,228,240,0.5)",
  health: "rgba(228,238,232,0.5)",
  productive_consumption:
    "rgba(214,235,232,0.5)" /* 구 카테고리: 부수입과 동일 색 */,
  pleasure: "rgba(173,216,230,0.5)",
  dreamblocking: "rgba(255,200,124,0.5)",
  media_watch: "rgba(166,124,138,0.5)",
  unhappiness: "rgba(221,160,221,0.5)",
  unhealthy: "rgba(176,196,222,0.5)",
  moneylosing: "rgba(255,160,122,0.5)",
  work: "rgba(255,239,213,0.6)",
  sleep: "rgba(230,230,250,0.6)",
  "": "rgba(209,213,219,0.5)",
};

/** 투자=생산적(prod-pink), 소비=비생산적(prod-blue) 컬러 */
function getTaskColorForDropdown(taskOpt, isProductive) {
  return isProductive ? "prod-pink" : "prod-blue";
}

/** 카테고리에 따른 생산성 자동 매핑 */
function getProductivityFromCategory(categoryValue) {
  if (!categoryValue) return "";
  const productive = ["dream", "sideincome", "happiness", "health"];
  const nonproductive = [
    "unhappiness",
    "unhealthy",
    "moneylosing",
    "dreamblocking",
    "pleasure",
    "media_watch",
  ];
  const other = ["work", "sleep"];
  if (productive.includes(categoryValue)) return "productive";
  if (nonproductive.includes(categoryValue)) return "nonproductive";
  if (other.includes(categoryValue)) return "other";
  return "";
}

/** 낮잠 과제: 사용시간 30분 초과 시 쾌락충족/비생산적, 30분 이하 시 건강/생산적 */
function getNapCategoryProductivity(timeTracked) {
  const hours = parseTimeToHours(timeTracked);
  const minutes = hours * 60;
  if (minutes > 30)
    return { category: "pleasure", productivity: "nonproductive" };
  return { category: "health", productivity: "productive" };
}

function resolveRowCategoryProductivityForAudit(r) {
  const taskName = (r.taskName || "").trim();
  if (!taskName) return { category: "", productivity: "" };
  const opt = getTaskOptionByName(taskName);
  let productivity = String(r.productivity || "").trim() || opt?.productivity || "";
  let category = String(r.category || "").trim() || opt?.category || "";
  if (TTC.isNapBuiltinTaskName(taskName) && r.timeTracked) {
    const nap = getNapCategoryProductivity(r.timeTracked);
    category = nap.category;
    productivity = nap.productivity;
  }
  if (!productivity && category)
    productivity = getProductivityFromCategory(category) || productivity;
  return { category, productivity };
}

/** 홈·간단 UI용: 행의 표시 생산성 키 (productive | nonproductive | other) */
export function getTimeLedgerRowDisplayProductivity(row) {
  if (!row) return "other";
  try {
    const { productivity } = resolveRowCategoryProductivityForAudit(row);
    const p = String(productivity || "").trim().toLowerCase();
    if (p === "productive") return "productive";
    if (p === "nonproductive") return "nonproductive";
  } catch (_) {}
  return "other";
}

/** 생산적·건강 / 비생산적·비건강 사분면 중, 내장은 식사 2과제만·나머지는 사용자 추가 과제만 */
function rowMatchesAuditHealthCategoryReport(r) {
  const taskName = (r.taskName || "").trim();
  if (!taskName) return false;
  const { category, productivity } = resolveRowCategoryProductivityForAudit(r);
  const inHealthy = category === "health" && productivity === "productive";
  const inUnhealthy = category === "unhealthy" && productivity === "nonproductive";
  if (!inHealthy && !inUnhealthy) return false;
  if (
    AUDIT_HEALTHY_MEAL_TASK_NAMES.has(taskName) ||
    AUDIT_UNHEALTHY_MEAL_TASK_NAMES.has(taskName)
  )
    return true;
  if (AUDIT_HEALTH_SECTION_BUILTIN_NAMES.has(taskName)) return false;
  return true;
}

/** 오딧 4. 건강 카테고리: 과제별 시간 합산 표 (타임라인 그래프는 표시하지 않음) */
function getAuditHealthDietTimelineHtml(filtered, normStart, normEnd) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  if (!normStart || !normEnd) {
    return `<div class="time-audit-achievement-empty">날짜 범위를 확인할 수 없습니다.</div>`;
  }

  const dates = [];
  eachDateStrInInclusiveRange(normStart, normEnd, (d) => dates.push(d));
  if (dates.length === 0) {
    return `<div class="time-audit-achievement-empty">표시할 날짜가 없습니다.</div>`;
  }

  const relevant = filtered.filter(rowMatchesAuditHealthCategoryReport);

  const byTask = {};
  relevant.forEach((r) => {
    const name = (r.taskName || "").trim();
    if (!name) return;
    const hrs = parseTimeToHours(r.timeTracked) || 0;
    if (hrs <= 0) return;
    const { category, productivity } = resolveRowCategoryProductivityForAudit(r);
    const isHealthy = category === "health" && productivity === "productive";
    const kindLabel = isHealthy ? "건강" : "비건강";
    const sortGroup = isHealthy ? 0 : 1;
    if (!byTask[name]) {
      byTask[name] = {
        taskName: name,
        hours: 0,
        kindLabel,
        sortGroup,
      };
    }
    byTask[name].hours += hrs;
  });
  const tableRows = Object.values(byTask).sort(
    (a, b) =>
      a.sortGroup - b.sortGroup ||
      b.hours - a.hours ||
      a.taskName.localeCompare(b.taskName),
  );

  if (tableRows.length === 0) {
    return `<div class="time-audit-achievement-empty">선택한 기간에 해당하는 건강·비건강 과제 기록이 없습니다.</div>`;
  }

  const rowsHtml = tableRows
    .map(
      (r) =>
        `<tr><td class="time-audit-thief-task">${esc(r.kindLabel)}</td><td class="time-audit-thief-task">${esc(r.taskName)}</td><td class="time-audit-thief-time">${formatHoursToHHMM(r.hours)}</td></tr>`,
    )
    .join("");
  const tableBlock = `<div class="time-audit-thief-table-wrap time-audit-health-table-wrap"><table class="time-audit-thief-table"><thead><tr><th>구분</th><th>과제명</th><th>시간</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;

  return `<div class="time-audit-health-diet-wrap">${tableBlock}</div>`;
}

/** 오딧·회고: 비생산 「미디어 시청」카테고리(media_watch). 구 기록(pleasure) 호환. */
const AUDIT_MEDIA_WATCH_BUILTIN_ORDER = [
  "쇼츠/릴스 피드 보기",
  "무의식적 SNS",
  "단순 쾌락형 영상 시청",
];
const MEDIA_WATCH_BUILTIN_NAME_SET = new Set(AUDIT_MEDIA_WATCH_BUILTIN_ORDER);

function rowMatchesAuditMediaSection(r) {
  const { category, productivity } = resolveRowCategoryProductivityForAudit(r);
  if (String(productivity || "").trim() !== "nonproductive") return false;
  if (category === "media_watch") return true;
  const name = (r.taskName || "").trim();
  /* pull 직후 등 옛 카테고리 pleasure로 저장된 내장 3종 */
  if (MEDIA_WATCH_BUILTIN_NAME_SET.has(name) && category === "pleasure")
    return true;
  return false;
}

/** 회고: 하루 칸 — 미디어 시청 행 = media_watch(+) 구 pleasure 호환 */
function computeRetrospectDayMetrics(dayRows) {
  let sleep = 0;
  let work = 0;
  let media = 0;
  for (const r of dayRows) {
    const hrs = parseTimeToHours(r.timeTracked) || 0;
    if (hrs <= 0) continue;
    const { category } = resolveRowCategoryProductivityForAudit(r);
    if (category === "sleep") sleep += hrs;
    else if (category === "work") work += hrs;
    if (rowMatchesAuditMediaSection(r)) media += hrs;
  }
  const available = Math.max(0, 24 - sleep - work);
  return { sleep, work, available, media };
}

/** 회고 「미디어 시청」칸: 가용시간 대비 비율(0~100, 막대 길이용) */
function retrospectMediaPctOfAvailable(availableHours, mediaHours) {
  const a = Number(availableHours) || 0;
  const m = Number(mediaHours) || 0;
  if (a <= 0) return 0;
  return Math.min(100, Math.round((m / a) * 100));
}

/** 회고 표 미디어 셀 — 가용 대비 비율 막대(비생산 톤 파랑) + 시청 시간(h/m) */
function fillRetrospectMediaDayCell(td, m) {
  const avail = m.available;
  const media = m.media;
  const pct = retrospectMediaPctOfAvailable(avail, media);
  const wrap = document.createElement("div");
  wrap.className = "time-retrospect-media-cell";
  wrap.setAttribute(
    "title",
    `가용 ${formatHoursToShortHm(avail)} · 미디어 ${formatHoursToShortHm(media)} · ${pct}%`,
  );
  wrap.setAttribute(
    "aria-label",
    `미디어 시청 ${formatHoursToShortHm(media)}, 가용시간 대비 ${pct}%`,
  );
  const track = document.createElement("div");
  track.className = "time-retrospect-media-bar-track";
  track.setAttribute("aria-hidden", "true");
  const fill = document.createElement("div");
  fill.className = "time-retrospect-media-bar-fill";
  fill.style.width = `${pct}%`;
  track.appendChild(fill);
  const timeEl = document.createElement("span");
  timeEl.className = "time-retrospect-media-time";
  timeEl.textContent = formatHoursToShortHm(media);
  wrap.appendChild(track);
  wrap.appendChild(timeEl);
  td.appendChild(wrap);
}

/** 회고 「식단」칸: 건강 메모(lp-meal:), 비건강 meal_detail — 라벨 없이 색만 (건강 빨강 / 비건강 파랑) */
function formatRetrospectDietDayCellHtml(dayRows) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const healthy = new Set();
  const unhealthy = [];
  for (const r of Array.isArray(dayRows) ? dayRows : []) {
    const tn = (r.taskName || "").trim();
    if (AUDIT_UNHEALTHY_MEAL_TASK_NAMES.has(tn)) {
      let md = String(r.mealDetail || "").trim();
      if (!md) {
        md = splitUnhealthyMealMemoFromDb(String(r.feedback || "")).mealDetail;
      }
      if (md) unhealthy.push(md);
    } else if (ledgerRowLogsDietForWorkSchedule(r)) {
      for (const t of Array.isArray(r.memoTags) ? r.memoTags : []) {
        const name = dietNameFromLedgerMemoTag(t);
        if (name) healthy.add(name);
      }
    }
  }
  if (healthy.size === 0 && unhealthy.length === 0) return "";
  const lines = [];
  if (healthy.size > 0) {
    const text = [...healthy]
      .sort((a, b) => a.localeCompare(b, "ko"))
      .join(", ");
    lines.push(
      `<span class="time-retrospect-diet-line time-retrospect-diet--healthy">${esc(text)}</span>`,
    );
  }
  if (unhealthy.length > 0) {
    const text = unhealthy.join(", ");
    lines.push(
      `<span class="time-retrospect-diet-line time-retrospect-diet--unhealthy">${esc(text)}</span>`,
    );
  }
  return `<div class="time-retrospect-diet-lines">${lines.join("<br>")}</div>`;
}

/** 회고 「지출」칸: 가계부 해당 일자 지출(flowType 지출) 목록 */
function normalizeExpenseRowDateYmd(row) {
  return String(row?.date ?? "")
    .trim()
    .replace(/\//g, "-")
    .slice(0, 10);
}

function formatRetrospectExpenseDayCell(ymd) {
  const key = String(ymd || "")
    .trim()
    .replace(/\//g, "-")
    .slice(0, 10);
  if (key.length < 10) return "—";
  const rows = loadExpenseRows().filter((r) => {
    if (String(r?.flowType || "").trim() !== "지출") return false;
    return normalizeExpenseRowDateYmd(r) === key;
  });
  if (rows.length === 0) return "—";
  const lines = rows
    .map((r) => formatExpenseLineForMobileCard(r))
    .filter(Boolean);
  return lines.length ? lines.join("\n") : "—";
}

function retrospectRowDateKey(r) {
  return (
    normalizeDateForCompare(r.date || "") ||
    String(r.date || "")
      .trim()
      .replace(/\//g, "-")
      .slice(0, 10)
  );
}

function getAuditMediaBarCategoryKey(_taskName) {
  return "media_watch";
}

function getAuditMediaWatchHoursHtml(filtered) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const hoursByTask = {};
  filtered.filter(rowMatchesAuditMediaSection).forEach((r) => {
    const name = (r.taskName || "").trim();
    if (!name) return;
    const hrs = parseTimeToHours(r.timeTracked) || 0;
    hoursByTask[name] = (hoursByTask[name] || 0) + hrs;
  });

  const allNames = new Set([
    ...AUDIT_MEDIA_WATCH_BUILTIN_ORDER,
    ...Object.keys(hoursByTask),
  ]);
  const orderIdx = new Map(
    AUDIT_MEDIA_WATCH_BUILTIN_ORDER.map((n, i) => [n, i]),
  );
  const barRows = [...allNames].map((task) => ({
    task,
    hours: hoursByTask[task] || 0,
    color: getCategoryColorForReport(getAuditMediaBarCategoryKey(task)),
  }));
  barRows.sort((a, b) => {
    if (b.hours !== a.hours) return b.hours - a.hours;
    const ia = orderIdx.has(a.task) ? orderIdx.get(a.task) : 1000;
    const ib = orderIdx.has(b.task) ? orderIdx.get(b.task) : 1000;
    if (ia !== ib) return ia - ib;
    return a.task.localeCompare(b.task, "ko");
  });

  const maxHrs = Math.max(0.01, ...barRows.map((x) => x.hours));
  const barRowsHtml = barRows
    .map((r) => {
      const pct = (r.hours / maxHrs) * 100;
      const timeLabel =
        r.hours > 0 ? formatHoursToHHMM(r.hours) : "—";
      return `<div class="time-audit-bar-row">
        <div class="time-audit-bar-label" title="${esc(r.task)}">${esc(r.task)}</div>
        <div class="time-audit-bar-track">
          <div class="time-audit-bar-slot" style="flex:1 1 auto;min-width:0">
            <div class="time-audit-bar-actual-wrap">
              <div class="time-audit-bar-actual" style="width:${pct}%;--bar-color:${r.color}" title="합계: ${timeLabel}"></div>
            </div>
          </div>
        </div>
        <div class="time-audit-bar-values">
          <span class="time-audit-bar-goal-val"> </span>
          <span class="time-audit-bar-actual-val">${timeLabel}</span>
        </div>
      </div>`;
    })
    .join("");

  return `<div class="time-audit-media-watch-wrap">
    <div class="time-audit-bar-chart time-audit-media-watch-bars">
      <div class="time-audit-bar-rows">${barRowsHtml}</div>
    </div>
  </div>`;
}

/** 보고서 §6: 과제 옵션의 kpiId가 있는 기록만 — 버킷(꿈·부수입·건강·행복) 분류 */
function getAuditKpiBucketKeyFromOpt(opt) {
  if (!opt) return "other";
  const cat = String(opt.category || "").trim();
  if (cat === "dream") return "dream";
  if (cat === "sideincome" || cat === "productive_consumption")
    return "sideincome";
  if (cat === "health") return "health";
  if (cat === "happiness" || cat === "happy") return "happiness";
  return "other";
}

function getAuditKpiStatusHtml(filtered) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const BUCKETS = ["dream", "sideincome", "health", "happiness", "other"];
  const bucketLabel = {
    dream: "꿈",
    sideincome: "부수입",
    health: "건강",
    happiness: "행복",
    other: "기타·KPI",
  };
  const bucketColor = {
    dream: CATEGORY_GRAPH_COLORS.dream,
    sideincome: CATEGORY_GRAPH_COLORS.sideincome,
    health: CATEGORY_GRAPH_COLORS.health,
    happiness: CATEGORY_GRAPH_COLORS.happiness,
    other: CATEGORY_GRAPH_COLORS[""] || "rgba(148,163,184,0.65)",
  };

  const byBucket = {
    dream: 0,
    sideincome: 0,
    health: 0,
    happiness: 0,
    other: 0,
  };
  const byTask = {};

  filtered.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked) || 0;
    if (hrs <= 0) return;
    const name = (r.taskName || "").trim();
    if (!name) return;
    const opt = getTaskOptionByName(name);
    if (!opt || !String(opt.kpiId || "").trim()) return;
    const b = getAuditKpiBucketKeyFromOpt(opt);
    byBucket[b] = (byBucket[b] || 0) + hrs;
    if (!byTask[name]) {
      byTask[name] = {
        taskName: name,
        hours: 0,
        bucket: b,
        bucketLabel: bucketLabel[b] || bucketLabel.other,
      };
    }
    byTask[name].hours += hrs;
  });

  const taskRows = Object.values(byTask).sort((a, b) => b.hours - a.hours);
  const totalKpiHrs = BUCKETS.reduce((s, k) => s + (byBucket[k] || 0), 0);

  if (totalKpiHrs <= 0) {
    return `<div class="time-audit-kpi-empty">KPI와 연결된 과제에 대한 사용 시간 기록이 없습니다. KPI 화면에서 연결된 과제로 시간을 기록·저장하면 이 보고서에 집계됩니다.</div>`;
  }

  const maxBar = Math.max(0.01, ...BUCKETS.map((k) => byBucket[k] || 0));
  const barRowsHtml = BUCKETS.map((k) => {
    const hrs = byBucket[k] || 0;
    const pct = (hrs / maxBar) * 100;
    const lab = bucketLabel[k];
    const color = bucketColor[k];
    const timeLabel = hrs > 0 ? formatHoursToHHMM(hrs) : "—";
    return `<div class="time-audit-bar-row time-audit-kpi-bucket-row">
      <div class="time-audit-bar-label">${esc(lab)}</div>
      <div class="time-audit-bar-track">
        <div class="time-audit-bar-slot" style="flex:1 1 auto;min-width:0">
          <div class="time-audit-bar-actual-wrap">
            <div class="time-audit-bar-actual" style="width:${pct}%;--bar-color:${color}" title="합계: ${timeLabel}"></div>
          </div>
        </div>
      </div>
      <div class="time-audit-bar-values">
        <span class="time-audit-bar-goal-val"> </span>
        <span class="time-audit-bar-actual-val">${timeLabel}</span>
      </div>
    </div>`;
  }).join("");

  const pieEntries = BUCKETS.map((k) => ({
    taskName: bucketLabel[k],
    hours: byBucket[k] || 0,
  })).filter((e) => e.hours > 0);
  const mergedPie = mergeSmallAuditPieSlices(pieEntries);
  const pieTotal = mergedPie.reduce((s, e) => s + e.hours, 0);

  const KPI_PIE_COLORS = [
    "#f9a8d4",
    "#c4b5fd",
    "#86efac",
    "#fcd34d",
    "#94a3b8",
  ];
  let pieHtml = "";
  if (pieTotal > 0) {
    let acc = 0;
    const cx = 50;
    const cy = 50;
    const pr = 40;
    const segs = mergedPie
      .map((e, i) => {
        const color = KPI_PIE_COLORS[i % KPI_PIE_COLORS.length];
        const pct = e.hours / pieTotal;
        if (pct >= 0.9999)
          return `<circle cx="${cx}" cy="${cy}" r="${pr}" fill="${color}" title="${esc(e.taskName)}: ${Math.round(pct * 100)}%"/>`;
        const a0 = (acc / pieTotal) * 2 * Math.PI - Math.PI / 2;
        acc += e.hours;
        const a1 = (acc / pieTotal) * 2 * Math.PI - Math.PI / 2;
        const x0 = cx + pr * Math.cos(a0);
        const y0 = cy + pr * Math.sin(a0);
        const x1 = cx + pr * Math.cos(a1);
        const y1 = cy + pr * Math.sin(a1);
        const large = pct > 0.5 ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x0} ${y0} A ${pr} ${pr} 0 ${large} 1 ${x1} ${y1} Z`;
        return `<path d="${d}" fill="${color}" title="${esc(e.taskName)}: ${Math.round((e.hours / pieTotal) * 100)}%"/>`;
      })
      .join("");
    const legend = mergedPie
      .map((e, i) => {
        const color = KPI_PIE_COLORS[i % KPI_PIE_COLORS.length];
        const p = pieTotal > 0 ? Math.round((e.hours / pieTotal) * 100) : 0;
        return `<span class="time-audit-pie-legend-item" style="--pie-color:${color}">${esc(e.taskName)} ${p}%</span>`;
      })
      .join("");
    pieHtml = `<div class="time-audit-pie-box time-audit-kpi-pie-box"><div class="time-audit-pie-title">영역 비율</div><div class="time-audit-pie-svg-wrap"><svg viewBox="0 0 100 100" class="time-audit-pie-svg">${segs}</svg></div><div class="time-audit-pie-legend">${legend}</div></div>`;
  }

  const tableRowsHtml = taskRows
    .map(
      (row) =>
        `<tr><td>${esc(row.bucketLabel)}</td><td class="time-audit-kpi-task-cell">${esc(row.taskName)}</td><td class="time-audit-kpi-time-cell">${formatHoursToHHMM(row.hours)}</td></tr>`,
    )
    .join("");

  const tableHtml = `<div class="time-audit-kpi-table-wrap"><table class="time-audit-thief-table time-audit-kpi-table"><thead><tr><th>영역</th><th>KPI 과제</th><th>사용 시간</th></tr></thead><tbody>${tableRowsHtml}</tbody></table></div>`;

  return `<div class="time-audit-kpi-inner">
    <div class="time-audit-kpi-subtitle">버킷(꿈·부수입·건강·행복)별 사용 시간</div>
    <div class="time-audit-kpi-split">
      <div class="time-audit-kpi-bars-col">
        <div class="time-audit-bar-chart time-audit-kpi-bucket-bars">
          <div class="time-audit-bar-rows">${barRowsHtml}</div>
        </div>
      </div>
      <div class="time-audit-kpi-pie-col">${pieHtml}</div>
    </div>
    <div class="time-audit-kpi-subtitle">KPI 과제별 상세</div>
    ${tableHtml}
    <div class="time-audit-kpi-total-note">KPI 연동 과제 합계: <strong>${formatHoursToHHMM(totalKpiHrs)}</strong></div>
  </div>`;
}

function formatDateDisplay(val) {
  if (!val || val.length < 10) return "";
  const [y, m, d] = val.split("-");
  return `${y}/${m}/${d}`;
}

/** yyyy/mm/dd hh:mm <-> datetime-local(yyyy-mm-ddThh:mm) 변환 */
function toDateTimeLocalValue(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  if (!s) return "";
  const m = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/,
  );
  if (m) {
    const [, y, mo, d, h, min] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min}`;
  }
  if (s.includes("T")) return s;
  return "";
}

function toDisplayDateTime(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, d, h, min] = m;
    return `${y}/${mo}/${d} ${h}:${min}`;
  }
  const m2 = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (m2) return s;
  return "";
}

/** 테이블 표시용: hh:mm 시간만 추출 */
function toDisplayTimeOnly(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const [, h, min] = m;
    return `${h.padStart(2, "0")}:${min}`;
  }
  return "";
}

/** 날짜·시간 문자열에서 YYYY-MM-DD 추출 */
function parseDateFromDateTime(str) {
  if (!str || typeof str !== "string") return "";
  const m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

/** 마감시간에 시작시간 날짜 적용 (날짜 통일) */
function mergeEndTimeWithStartDate(startTime, endTime) {
  const startDate = parseDateFromDateTime(startTime);
  if (!startDate || !endTime) return endTime;
  const m = endTime.match(/[T\s](\d{1,2}):(\d{2})/);
  if (!m) return endTime;
  const [, h, min] = m;
  return `${startDate}T${String(h).padStart(2, "0")}:${min}`;
}

/** 시작/마감시간 입력을 yyyy/mm/dd hh:mm 형식으로 정규화 */
function formatDateTimeInput(val) {
  if (!val || typeof val !== "string") return "";
  const s = val.trim();
  if (!s) return "";
  const m = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/,
  );
  if (m) {
    const [, y, mo, d, h, min] = m;
    return `${y}/${mo.padStart(2, "0")}/${d.padStart(2, "0")} ${h.padStart(2, "0")}:${min}`;
  }
  const m2 = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):?(\d{2})?/,
  );
  if (m2) {
    const [, y, mo, d, h = "00", min = "00"] = m2;
    return `${y}/${mo.padStart(2, "0")}/${d.padStart(2, "0")} ${h.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  const m3 = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m3) {
    const [, y, mo, d, h, min] = m3;
    return `${y}/${mo}/${d} ${h}:${min}`;
  }
  /* 숨은값·외부 데이터에 2026-4-5T9:05 식 한 자리 월/일·시가 섞인 경우 */
  const m3lax = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})T(\d{1,2}):(\d{2})/,
  );
  if (m3lax) {
    const [, y, mo, d, h, min] = m3lax;
    return `${y}/${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:${min}`;
  }
  return "";
}

/** 숫자만 입력된 경우 콜론 자동 삽입 (0030 -> 00:30) */
function formatTimeInput(val) {
  if (!val || typeof val !== "string") return val;
  const digits = val.replace(/\D/g, "");
  if (digits.length === 4) {
    return digits.slice(0, 2) + ":" + digits.slice(2);
  }
  if (digits.length === 3) {
    return "0" + digits.slice(0, 1) + ":" + digits.slice(1);
  }
  return val;
}

/** hh:mm 형식을 시간(소수)으로 변환 */
export function parseTimeToHours(str) {
  if (!str || typeof str !== "string") return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h + m / 60;
}

/**
 * 오늘 해치우기 등 시계 예약 합산용 하루 길이(시간).
 * 24:00은 다음날 00:00과 겹치므로 마감은 23:59 — 00:00~23:59 구간은 23h59m이며,
 * 남은 시간은 이 값에서 예약 합을 뺀다(예약만 24h로 두면 1분이 항상 남던 문제 제거).
 */
const DAY_WALL_CLOCK_HOURS_FOR_BUDGET = 24 - 1 / 60;

/** 목표 대비 배치 차이 포맷: (-1h) / (+1h25m) / (-30m) / "" — 초과 +, 부족 - */
export function formatGoalDiff(diffHours) {
  if (diffHours === 0 || !isFinite(diffHours) || Math.abs(diffHours) < 1 / 60)
    return "";
  const sign =
    diffHours > 0 ? "+" : diffHours < 0 ? "-" : "";
  const absH = Math.abs(diffHours);
  const h = Math.floor(absH);
  const m = Math.round((absH - h) * 60);
  if (h === 0 && m === 0) return "";
  if (h === 0) return `(${sign}${m}m)`;
  if (m === 0) return `(${sign}${h}h)`;
  return `(${sign}${h}h${m}m)`;
}

/** 날짜·시간 문자열(YYYY-MM-DDThh:mm 등)을 시간(소수)으로 변환 */
function parseDateTimeToHours(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/[T\s](\d{1,2}):?(\d{2})?/);
  if (!m) return null;
  const h = parseInt(m[1], 10) || 0;
  const min = parseInt(m[2], 10) || 0;
  return h + min / 60;
}

/** 성취능력 문자열을 -50~+50 숫자로 파싱 */
function parseEnergyToNumber(val) {
  const s = String(val || "")
    .trim()
    .replace(/%/g, "");
  if (!s) return null;
  const n = parseInt(s.replace(/^\+/, ""), 10);
  if (!isNaN(n) && n >= -50 && n <= 50) return n;
  return null;
}

/** 성취능력 곡선용: 시간대별(0~23시) 성취능력 평균 집계 */
function aggregateEnergyByHour(rows) {
  const byHour = {};
  for (let h = 0; h <= 23; h++) byHour[h] = { sum: 0, count: 0 };
  rows.forEach((r) => {
    const energy = parseEnergyToNumber(r.energy);
    if (energy == null) return;
    const startH = parseDateTimeToHours(r.startTime);
    const endH = parseDateTimeToHours(r.endTime);
    if (startH == null || endH == null) return;
    for (let h = 0; h <= 23; h++) {
      if (startH < h + 1 && endH > h) {
        byHour[h].sum += energy;
        byHour[h].count += 1;
      }
    }
  });
  const result = {};
  for (let h = 0; h <= 23; h++) {
    result[h] = byHour[h].count > 0 ? byHour[h].sum / byHour[h].count : null;
  }
  return result;
}

/** 방해 이벤트 파싱: "10:30|메신저체크;11:15|유튜브" → [{time,type},...] (구형 "3|메신저체크" 호환) */
function parseFocusEvents(raw, defaultTime = "") {
  const s = String(raw || "").trim();
  if (!s) return [];
  if (s.includes(";")) {
    return s.split(";").map((seg) => {
      const [t, type] = seg.split("|");
      return { time: (t || "").trim(), type: (type || "").trim() };
    });
  }
  const [a, b] = s.split("|");
  if (/^\d{1,2}:\d{2}$/.test(String(a || "").trim())) {
    return [{ time: (a || "").trim(), type: (b || "").trim() }];
  }
  const cnt = parseInt(String(a || "0").replace(/\D/g, ""), 10) || 0;
  const type = (b || "").trim();
  if (cnt <= 0 || !type) return [];
  return Array.from({ length: cnt }, () => ({ time: defaultTime, type }));
}

/** 방해 값을 인라인 표시용 문자열로: "10:30 메신저체크, 11:15 유튜브" */
function formatFocusForDisplay(raw) {
  const events = parseFocusEvents(raw);
  if (events.length === 0) return "";
  return events
    .map((e) => (e.time ? `${e.time} ${e.type}`.trim() : e.type || "").trim())
    .filter(Boolean)
    .join(", ");
}

/** 방해 빈도 곡선용: 시간대별(0~23시) 방해횟수 집계 */
function aggregateFocusByHour(rows) {
  const byHour = {};
  for (let h = 0; h <= 23; h++) byHour[h] = 0;
  rows.forEach((r) => {
    const events = parseFocusEvents(r.focus);
    if (events.length === 0) return;
    const startH = parseDateTimeToHours(r.startTime);
    const endH = parseDateTimeToHours(r.endTime);
    const hasTaskRange = startH != null && endH != null;
    events.forEach((e) => {
      if (e.time) {
        const m = e.time.match(/^(\d{1,2}):?(\d{2})?/);
        const h = m ? parseInt(m[1], 10) : null;
        if (h != null && h >= 0 && h <= 23) byHour[h] += 1;
      } else if (hasTaskRange) {
        for (let h = 0; h <= 23; h++) {
          if (startH < h + 1 && endH > h) byHour[h] += 1;
        }
      }
    });
  });
  return byHour;
}

/** 시간(소수)을 "Xh Ym" 형식으로 표시 (단위 소문자) */
function formatHoursDisplay(hours) {
  if (hours < 0 || !isFinite(hours)) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 필터 구간 합계 표시용 "hh:mm" (시·분 두 자리) */
function formatTotalRecordedHoursAsHhMm(hours) {
  if (hours < 0 || !isFinite(hours)) return "00:00";
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 모바일 시간기록 카드: 진행 중(마감 없음)일 때 경과 시간 갱신용 타이머 정리 */
function clearTimeLedgerMobileElapsedTimer(viewEl) {
  if (!viewEl?._timeLedgerMobileElapsedIntervalId) return;
  clearInterval(viewEl._timeLedgerMobileElapsedIntervalId);
  viewEl._timeLedgerMobileElapsedIntervalId = null;
}

function rowHasEndTimeForMobileCard(rowData) {
  return !!(rowData?.endTime && String(rowData.endTime).trim());
}

/** 행의 시작 시각을 로컬 Date로 (없으면 null) */
function getRowStartInstantForMobileCard(rowData) {
  if (!rowData) return null;
  const st = (rowData.startTime || "").trim();
  if (!st) return null;
  const normalized = formatDateTimeInput(st);
  const s = normalized || st;
  const m = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (m) {
    return new Date(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
      0,
      0,
    );
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/);
  if (m2) {
    return new Date(
      parseInt(m2[1], 10),
      parseInt(m2[2], 10) - 1,
      parseInt(m2[3], 10),
      parseInt(m2[4], 10),
      parseInt(m2[5], 10),
      0,
      0,
    );
  }
  const dateStr = (rowData.date || "").trim().replace(/\//g, "-");
  const timeStr = toDisplayTimeOnly(st);
  if (!dateStr || !timeStr) return null;
  const dm = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  return new Date(
    parseInt(dm[1], 10),
    parseInt(dm[2], 10) - 1,
    parseInt(dm[3], 10),
    parseInt(tm[1], 10),
    parseInt(tm[2], 10),
    0,
    0,
  );
}

function formatElapsedDurationForMobileCard(ms) {
  const hours = ms / 3600000;
  return formatHoursDisplay(hours);
}

/** 모바일 카드 우측: 수동 사용시간 > 마감 있음(빈 사용시간은 —) > 진행 중이면 경과 */
function getMobileCardTrackedDisplayForRow(rowData) {
  const tracked = (rowData.timeTracked || "").trim();
  if (tracked) return tracked;
  if (rowHasEndTimeForMobileCard(rowData)) return "—";
  const start = getRowStartInstantForMobileCard(rowData);
  if (!start) return "—";
  const ms = Date.now() - start.getTime();
  if (ms < 0) return "0h";
  return formatElapsedDurationForMobileCard(ms);
}

/** 마감 미입력(진행 중)일 때 테이블·모바일 카드에 쓰는 표시 (실제 종료 시각으로 오해하지 않도록) */
const TIME_LEDGER_IN_PROGRESS_LABEL = "진행중";

function formatTimeLedgerEndCellDisplay(startTime, endTime) {
  const end = String(endTime || "").trim();
  if (end) return toDisplayTimeOnly(end) || end;
  const start = String(startTime || "").trim();
  return start ? TIME_LEDGER_IN_PROGRESS_LABEL : "";
}

/** 모바일 카드 시간 줄 HTML: 완료 시 시작–마감, 진행 중이면 시작–「진행중」태그(현재 시각 미표시) */
function getMobileCardTimeRangeHtmlForRow(rowData) {
  const startStr = toDisplayTimeOnly(rowData?.startTime) || "";
  const endStr = toDisplayTimeOnly(rowData?.endTime) || "";
  if (startStr && endStr)
    return escapeHtml(`${startStr} - ${endStr}`);
  if (startStr && !rowHasEndTimeForMobileCard(rowData)) {
    return `${escapeHtml(startStr)} - <span class="time-mobile-card-in-progress-tag">${escapeHtml(TIME_LEDGER_IN_PROGRESS_LABEL)}</span>`;
  }
  const single = startStr || endStr || "";
  return single ? escapeHtml(single) : "";
}

function getMobileCardProductivityValue(rowData) {
  if (!rowData) return "";
  return (
    (rowData.productivity || "").trim() ||
    getProductivityFromCategory(rowData.category) ||
    ""
  );
}

function hoursBetweenRowStartEnd(rowData) {
  let startTime =
    formatDateTimeInput(rowData.startTime) ||
    String(rowData.startTime || "").trim();
  let endTime =
    formatDateTimeInput(rowData.endTime) ||
    String(rowData.endTime || "").trim();
  if (!startTime || !endTime) return 0;
  endTime = mergeEndTimeWithStartDate(startTime, endTime) || endTime;
  const toIso = (str) => {
    const m = str.match(
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s]+(\d{1,2}):(\d{2})/,
    );
    if (m)
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00`;
    const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m2)
      return `${m2[1]}-${m2[2]}-${m2[3]}T${m2[4]}:${m2[5]}:00`;
    return String(str).replace(" ", "T") + ":00";
  };
  try {
    const s = new Date(toIso(startTime));
    const e = new Date(toIso(endTime));
    const diff = (e - s) / (1000 * 60 * 60);
    return diff > 0 && isFinite(diff) ? diff : 0;
  } catch (_) {
    return 0;
  }
}

/** 행동의 가치 계산용 유효 시간(h): 사용시간 입력 > 마감 있음(구간) > 진행 중(경과) */
function getMobileCardEffectiveHoursForPrice(rowData) {
  const tracked = (rowData.timeTracked || "").trim();
  if (tracked) return parseTimeToHours(tracked) || 0;
  if (rowHasEndTimeForMobileCard(rowData))
    return hoursBetweenRowStartEnd(rowData);
  const start = getRowStartInstantForMobileCard(rowData);
  if (!start) return 0;
  const ms = Date.now() - start.getTime();
  return ms < 0 ? 0 : ms / 3600000;
}

function computeMobileCardPriceValue(rowData, hourlyRate) {
  const hours = getMobileCardEffectiveHoursForPrice(rowData);
  const rate = parseFloat(String(hourlyRate ?? 0).replace(/,/g, "")) || 0;
  const pv = getMobileCardProductivityValue(rowData);
  let price = hours * rate;
  if (pv === "nonproductive") price *= -1;
  else if (pv === "other" || pv === "그 외" || !pv) price = 0;
  return price;
}

function applyMobileCardPriceEl(priceEl, value) {
  if (!priceEl) return;
  priceEl.textContent = formatPrice(value);
  priceEl.classList.toggle("is-negative", value < 0);
  priceEl.classList.toggle("is-positive", value > 0);
}

function mobileCardNeedsLiveClock(rowData) {
  if (!rowData) return false;
  if ((rowData.timeTracked || "").trim()) return false;
  if (rowHasEndTimeForMobileCard(rowData)) return false;
  return !!getRowStartInstantForMobileCard(rowData);
}

/** 마감 없이 시작만 있는 오늘 기록 = 진행 중 (홈 타임트래커·모바일 카드와 동일 기준) */
function timeLedgerRowIsLiveInProgress(row) {
  return mobileCardNeedsLiveClock(row);
}

/** Calendar 타임라인 등: 실제로 마감 없이 기록 중인 행인지 */
export function isTimeLedgerRowLiveRecording(row) {
  return timeLedgerRowIsLiveInProgress(row);
}

/**
 * 오늘 날짜 기준, 현재 진행 중인 시간기록 행 하나(시작 최신 순).
 * 없으면 null.
 */
export function getTodayLiveTimeLedgerRow() {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const rows = loadTimeRows().filter(
    (r) => (r.date || "").toString().slice(0, 10) === todayKey,
  );
  const live = rows.filter(timeLedgerRowIsLiveInProgress);
  if (!live.length) return null;
  live.sort((a, b) => {
    const sa = getRowStartInstantForMobileCard(a)?.getTime() ?? 0;
    const sb = getRowStartInstantForMobileCard(b)?.getTime() ?? 0;
    return sb - sa;
  });
  return live[0];
}

/** 갱신 타이머용 행 식별 (id 또는 날짜·시작·과제명) */
export function getTimeLedgerRowLiveStableKey(row) {
  if (!row) return "";
  const id = String(row.id || "").trim();
  if (id) return `id:${id}`;
  return `k:${(row.date || "").slice(0, 10)}|${(row.startTime || "").trim()}|${(row.taskName || "").trim()}`;
}

export function getTimeLedgerRowLiveElapsedMs(row) {
  const start = getRowStartInstantForMobileCard(row);
  if (!start) return 0;
  return Date.now() - start.getTime();
}

/** 홈 타임트래커 부가 문구: 「N분째」(60분 미만) 또는 「h시간 m분째」 */
export function formatHomeLiveElapsedMinutesPhrase(ms) {
  const m = Math.floor(ms / 60000);
  if (m <= 0) return "방금 시작";
  if (m < 60) return `${m}분째`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}시간 ${r}분째`;
}

/** 정수 분 소요 시간: 60분 미만 「N분」, 이상 「h시간 m분」(예: 480 → 8시간 0분) */
export function formatIntegerMinutesDurationKo(totalMinutes) {
  const n = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (n < 60) return `${n}분`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h}시간 ${m}분`;
}

/** 홈 타임트래커: 시작 시각 (짧은 h:mm) */
export function formatHomeLiveStartClock(row) {
  if (!row) return "";
  const fromStart = toDisplayTimeOnly(row.startTime || "");
  if (fromStart) {
    const parts = fromStart.split(":");
    if (parts.length >= 2)
      return `${parseInt(parts[0], 10)}:${parts[1].padStart(2, "0")}`;
  }
  const inst = getRowStartInstantForMobileCard(row);
  if (!inst) return "";
  return `${inst.getHours()}:${String(inst.getMinutes()).padStart(2, "0")}`;
}

function updateMobileTimeCardLiveFields(card) {
  if (!card?._rowData) return;
  const live = mobileCardNeedsLiveClock(card._rowData);
  card.classList.toggle("time-ledger-mobile-card--in-progress", live);
  if (!live) return;
  const rd = card._rowData;
  const viewEl = card._timeLedgerViewEl;
  const trackedEl = card.querySelector(".time-mobile-card-tracked");
  const timeEl = card.querySelector(".time-mobile-card-time");
  const priceEl = card.querySelector(".time-mobile-card-price");
  const start = getRowStartInstantForMobileCard(rd);
  if (!start) return;
  const ms = Date.now() - start.getTime();
  if (trackedEl)
    trackedEl.textContent =
      ms < 0 ? "0h" : formatElapsedDurationForMobileCard(ms);
  if (timeEl) {
    timeEl.innerHTML = getMobileCardTimeRangeHtmlForRow(rd) || "—";
  }
  if (priceEl && viewEl) {
    const hourlyInput = viewEl.querySelector(".time-hourly-input");
    const hourlyRate =
      parseFloat(String(hourlyInput?.value || "0").replace(/,/g, "")) || 0;
    applyMobileCardPriceEl(priceEl, computeMobileCardPriceValue(rd, hourlyRate));
  }
}

/** 시간(소수)을 "HH:MM" 형식으로 표시 */
function formatHoursToHHMM(hours) {
  if (hours < 0 || !isFinite(hours)) return "00:00";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 시간(소수)을 "X시간 Y분" 또는 "X분" 형식으로 표시 (평가 문구용) */
function formatHoursToReadable(hours) {
  if (hours < 0 || !isFinite(hours)) return "0분";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** 회고 표 시간 칸용: "Xh Ym" / "0m" (분만일 때는 분만) */
function formatHoursToShortHm(hours) {
  if (hours < 0 || !isFinite(hours)) return "0m";
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 성취능력 값(-50~+50)을 표시용 퍼센트 문자열로 변환 */
function formatEnergyForDisplay(val) {
  const s = String(val || "")
    .trim()
    .replace(/%/g, "");
  if (!s) return "";
  const n = parseInt(s.replace(/^\+/, ""), 10);
  if (!isNaN(n) && n >= -50 && n <= 50) {
    return n > 0 ? `+${n}%` : n + "%";
  }
  return s;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD 구간(포함)마다 콜백 (로컬 정오 기준) */
function eachDateStrInInclusiveRange(normStart, normEnd, fn) {
  if (!normStart || !normEnd || normStart > normEnd) return;
  const cur = new Date(normStart + "T12:00:00");
  const endAt = new Date(normEnd + "T12:00:00");
  while (cur <= endAt) {
    fn(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
}

/** YYYY-MM-DD → 해당 주의 일요일(로컬, 일=0 기준 — 앱 전역 요일 표기와 동일) */
function startOfWeekSundayYmd(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "";
  const d = new Date(ymd + "T12:00:00");
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() - d.getDay());
  return toDateStr(d);
}

/** YYYY-MM-DD → 해당 주의 월요일(로컬) — 회고 주간 표 등 */
function startOfWeekMondayYmd(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "";
  const d = new Date(ymd + "T12:00:00");
  if (Number.isNaN(d.getTime())) return ymd;
  const daysSinceMon = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMon);
  return toDateStr(d);
}

/** YYYY-MM-DD에 일수 더하기 */
function addDaysToYmd(ymd, deltaDays) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "";
  const d = new Date(ymd + "T12:00:00");
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + deltaDays);
  return toDateStr(d);
}

/** 기간에 따른 날짜 범위 반환 (YYYY-MM-DD, 로컬 기준) - 레거시 period 문자열용 */
function getDateRangeForPeriod(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === "이번달") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today);
    return { start: toDateStr(start), end: toDateStr(end) };
  }
  if (period === "지난달") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: toDateStr(start), end: toDateStr(end) };
  }
  if (period === "최근 7일") {
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { start: toDateStr(start), end: toDateStr(end) };
  }
  if (period === "전일") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: toDateStr(yesterday), end: toDateStr(yesterday) };
  }
  return { start: null, end: null };
}

/** 하루 필터용 날짜 표시 포맷 (예: 2월 27일 (금)) */
function formatDateForDayFilter(dateStr) {
  if (!dateStr || dateStr.length < 10) return "";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = d.toLocaleDateString("ko-KR", { weekday: "short" });
  return `${month}월 ${day}일 (${weekday})`;
}

/** 필터 타입에 따른 날짜 범위 반환 (월별/일주일/하루/날짜선택) */
function getDateRangeForFilterType(type, year, month, start, end) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (type === "day") {
    const d = start && start.length >= 10 ? start : toDateStr(today);
    return { start: d, end: d };
  }
  if (type === "week") {
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { start: toDateStr(weekAgo), end: toDateStr(today) };
  }
  if (type === "month" && year && month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return { start: toDateStr(startDate), end: toDateStr(endDate) };
  }
  if (type === "range" && start && end) {
    let s = start;
    let e = end;
    if (s > e) {
      const t = s;
      s = e;
      e = t;
    }
    return { start: s, end: e };
  }
  return { start: null, end: null };
}

/** 필터 타입에 따른 표시 라벨 */
function getFilterPeriodLabel(type, year, month, start, end) {
  if (type === "month" && year && month) return `${year}년 ${month}월`;
  if (type === "week") return "최근 7일";
  if (type === "day")
    return formatDateForDayFilter(start || toDateStr(new Date())) || "오늘";
  if (type === "range" && start && end)
    return start === end
      ? formatDateForDayFilter(start) || start
      : `${start} ~ ${end}`;
  return "";
}

/** 기간에 맞는 행 필터링 */
function filterRowsByPeriod(rows, period) {
  const { start, end } = getDateRangeForPeriod(period);
  return rows.filter((r) => {
    const d = (r.date || "").trim();
    if (!d) return false;
    if (!start || !end) return true;
    return d >= start && d <= end;
  });
}

/** 날짜 문자열을 YYYY-MM-DD로 정규화 (필터 비교용) */
function normalizeDateForCompare(str) {
  if (!str || typeof str !== "string") return "";
  const m = str.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

/** 로컬 저장 행의 시각 문자열 → 당일 기준 분(0~1439) */
function parseLedgerTimeStringToMinutes(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  const m =
    t.match(/[T\s](\d{1,2}):(\d{2})/) || t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  const hh = ((h % 24) + 24) % 24;
  const mm = ((min % 60) + 60) % 60;
  return hh * 60 + mm;
}

/** 행당 '그날 마지막 시각': 마감 있으면 마감, 없으면 시작 */
function rowEffectiveLastMinutesLedger(row) {
  const endTrim = (row?.endTime || "").trim();
  const src = endTrim ? row.endTime : row.startTime;
  return parseLedgerTimeStringToMinutes(String(src || ""));
}

/** loadTimeRows와 화면 캐시(allRowsCache) 병합 — 동일 id·동일 복합키는 캐시가 우선 */
function mergeLedgerRowsForDedupe(diskRows, cacheRows) {
  const map = new Map();
  const keyOf = (r) => {
    if (!r || typeof r !== "object") return "";
    const id = String(r.id || "").trim();
    if (id) return `id:${id}`;
    const d =
      normalizeDateForCompare(r.date || "") ||
      String(r.date || "")
        .trim()
        .replace(/\//g, "-")
        .slice(0, 10);
    return `c:${d}|${(r.taskName || "").trim()}|${(r.startTime || "").trim()}`;
  };
  for (const r of diskRows || []) {
    if (r) map.set(keyOf(r), r);
  }
  for (const r of cacheRows || []) {
    if (r) map.set(keyOf(r), r);
  }
  return [...map.values()];
}

/**
 * 로컬 배열에서 시간기록 행 제거.
 * - id(UUID)가 있으면 id만으로 제거(시작시간 표기 yyyy/mm/dd HH:mm vs HH:mm 불일치로 캐시에서 안 지워지던 문제 방지).
 * - id가 없으면 날짜·과제명·시작시간 복합키(여러 표기 변형)로 시도.
 * @returns {{ next: typeof rows, removed: number }}
 */
function removeTimeLedgerRowFromRows(rows, rowData) {
  const arr = Array.isArray(rows) ? rows.slice() : [];
  if (!rowData || typeof rowData !== "object") {
    return { next: arr, removed: 0 };
  }
  const entryId = String(rowData.id || "").trim();
  if (entryId) {
    const before = arr.length;
    const next = arr.filter((c) => String(c?.id || "").trim() !== entryId);
    return { next, removed: before - next.length };
  }
  const d =
    normalizeDateForCompare(rowData.date || "") ||
    String(rowData.date || "").trim().replace(/\//g, "-").slice(0, 10);
  const task = String(rowData.taskName || "").trim();
  const stRaw = String(rowData.startTime || "").trim();
  const stNorm = formatDateTimeInput(stRaw) || stRaw;
  const dateVariants = new Set([d]);
  const rawDate = String(rowData.date || "").trim();
  if (rawDate) {
    dateVariants.add(rawDate.replace(/\//g, "-").slice(0, 10));
  }
  const keySet = new Set();
  for (const dv of dateVariants) {
    if (!dv) continue;
    keySet.add(`${dv}|${task}|${stRaw}`);
    keySet.add(`${dv}|${task}|${stNorm}`);
  }
  const before = arr.length;
  const next = arr.filter((c) => {
    const cd =
      normalizeDateForCompare(c.date || "") ||
      String(c.date || "").trim().replace(/\//g, "-").slice(0, 10);
    const cn = String(c.taskName || "").trim();
    const stc = String(c.startTime || "").trim();
    const cNorm = formatDateTimeInput(stc) || stc;
    const c1 = `${cd}|${cn}|${stc}`;
    const c2 = `${cd}|${cn}|${cNorm}`;
    for (const k of keySet) {
      if (k === c1 || k === c2) return false;
    }
    return true;
  });
  return { next, removed: before - next.length };
}

/**
 * 과제 기록 모달용: 선택한 날짜에 저장된 기록 중 가장 늦은 시각(HH:mm).
 * exclude: 수정 중인 행(id 또는 composite 키)은 제외.
 * rowsOverride: 넘기면 loadTimeRows 대신 사용(디스크+캐시 병합본 등).
 */
function getLatestLedgerHhMmForTaskLogDate(dateInputValue, exclude, rowsOverride) {
  const normDate =
    normalizeDateForCompare(dateInputValue || "") ||
    String(dateInputValue || "")
      .trim()
      .replace(/\//g, "-")
      .slice(0, 10);
  if (!normDate) return null;
  const rows =
    rowsOverride !== undefined && rowsOverride !== null
      ? rowsOverride
      : loadTimeRows();
  let maxM = -1;
  for (const r of rows) {
    const rd =
      normalizeDateForCompare(r.date || "") ||
      String(r.date || "")
        .trim()
        .replace(/\//g, "-")
        .slice(0, 10);
    if (rd !== normDate) continue;
    if (exclude) {
      const rid = String(r.id || "").trim();
      if (exclude.id && rid && rid === exclude.id) continue;
      const ck = `${rd}|${(r.taskName || "").trim()}|${(r.startTime || "").trim()}`;
      if (exclude.composite && ck === exclude.composite) continue;
    }
    const mm = rowEffectiveLastMinutesLedger(r);
    if (mm != null && mm > maxM) maxM = mm;
  }
  if (maxM < 0) return null;
  const h = Math.floor(maxM / 60) % 24;
  const mi = maxM % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** 날짜·시작시간 기준 최신 먼저 (최근 날짜 위, 같은 날은 늦은 시각→이른 시각) */
function sortRowsByDateTime(rows) {
  return [...rows].sort((a, b) => {
    const dateA = normalizeDateForCompare(a.date || "") || a.date || "";
    const dateB = normalizeDateForCompare(b.date || "") || b.date || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const startA = parseDateTimeToHours(a.startTime) ?? 0;
    const startB = parseDateTimeToHours(b.startTime) ?? 0;
    return startB - startA;
  });
}

/** 필터 타입에 따른 행 필터링 (기록날짜 기준) */
function filterRowsByFilterType(rows, type, year, month, start, end) {
  const { start: s, end: e } = getDateRangeForFilterType(
    type,
    year,
    month,
    start,
    end,
  );
  const normStart = normalizeDateForCompare(s) || s;
  const normEnd = normalizeDateForCompare(e) || e;
  const filtered = rows.filter((r) => {
    const d = normalizeDateForCompare(r.date || "");
    if (!d) return false;
    if (!normStart || !normEnd) return true;
    return d >= normStart && d <= normEnd;
  });
  return sortRowsByDateTime(filtered);
}

/** 과제명별 시간 집계 { taskName: hours } */
function aggregateHoursByTask(rows) {
  const map = {};
  rows.forEach((r) => {
    const task = (r.taskName || "").trim();
    if (!task) return;
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    map[task] = (map[task] || 0) + hrs;
  });
  return map;
}

/** 과제별 dominant 카테고리 (해당 과제에 가장 많은 시간이 배정된 카테고리) */
function getDominantCategoryForTask(rows, taskName) {
  const byCat = {};
  rows.forEach((r) => {
    if ((r.taskName || "").trim() !== taskName) return;
    const cat = (r.category || "").trim() || "";
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    byCat[cat] = (byCat[cat] || 0) + hrs;
  });
  let maxHrs = 0;
  let maxCat = "";
  Object.entries(byCat).forEach(([cat, hrs]) => {
    if (hrs > maxHrs) {
      maxHrs = hrs;
      maxCat = cat;
    }
  });
  return maxCat;
}

/** 카테고리별 시간 집계 { category: hours } */
function aggregateHoursByCategory(rows) {
  const map = {};
  rows.forEach((r) => {
    const cat = (r.category || "").trim() || "그 외";
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    map[cat] = (map[cat] || 0) + hrs;
  });
  return map;
}

/** 생산성별 시간 집계 { productive: hrs, nonproductive: hrs } */
function aggregateHoursByProductivity(rows) {
  let productive = 0;
  let nonproductive = 0;
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    const p = r.productivity || getProductivityFromCategory(r.category);
    if (p === "productive") productive += hrs;
    else if (p === "nonproductive") nonproductive += hrs;
  });
  return { productive, nonproductive };
}

/** 생산성별 시간 집계 (3분류) { productive, nonproductive, other } */
function aggregateHoursByProductivityAllThree(rows) {
  let productive = 0;
  let nonproductive = 0;
  let other = 0;
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    const p = r.productivity || getProductivityFromCategory(r.category);
    if (p === "productive") productive += hrs;
    else if (p === "nonproductive") nonproductive += hrs;
    else other += hrs;
  });
  return { productive, nonproductive, other };
}

/** 일별 수익 집계 (날짜별 가치 합계) */
function aggregateDailyRevenue(rows, period, hourlyRate) {
  const filtered = filterRowsByPeriod(rows, period);
  return aggregateDailyRevenueFromFiltered(filtered, hourlyRate);
}

function aggregateDailyRevenueFromFiltered(filtered, hourlyRate) {
  const byDate = {};
  filtered.forEach((r) => {
    const d = (r.date || "").trim();
    if (!d) return;
    const hrs = parseTimeToHours(r.timeTracked);
    const pv = (
      r.productivity ||
      getProductivityFromCategory(r.category) ||
      ""
    ).trim();
    let price = hrs * hourlyRate;
    if (pv === "nonproductive") price *= -1;
    else if (pv === "other" || pv === "그 외" || !pv) price = 0;
    byDate[d] = (byDate[d] || 0) + price;
  });
  return byDate;
}

/** 일별 수익 차트 위젯 생성 (rangeStart, rangeEnd 있을 때만) */
function createDailyRevenueWidget(
  periodLabel,
  filtered,
  hourlyRate,
  rangeStart,
  rangeEnd,
) {
  if (!rangeStart || !rangeEnd) return null;
  const dailyRev = aggregateDailyRevenueFromFiltered(filtered, hourlyRate);
  const dailyData = [];
  const cur = new Date(rangeStart + "T00:00:00");
  const endDate = new Date(rangeEnd + "T00:00:00");
  while (cur <= endDate) {
    const dateStr = toDateStr(cur);
    const day = cur.getDate();
    const month = cur.getMonth();
    dailyData.push({
      date: dateStr,
      day,
      month,
      price: dailyRev[dateStr] || 0,
    });
    cur.setDate(cur.getDate() + 1);
  }
  const daysCount = dailyData.length;
  if (daysCount === 0) return null;
  const allPrices = dailyData.map((x) => x.price).filter((v) => v !== 0);
  const dataMin = allPrices.length ? Math.min(...allPrices) : 0;
  const dataMax = allPrices.length ? Math.max(...allPrices) : 0;
  const pad = 0.12;
  let yMin = 0;
  let yMax = 100000;
  if (dataMin < 0 && dataMax > 0) {
    yMin = dataMin * (1 + pad);
    yMax = dataMax * (1 + pad);
  } else if (dataMin < 0) {
    yMin = dataMin * (1 + pad);
    yMax = 0;
  } else if (dataMax > 0) {
    yMin = 0;
    yMax = dataMax * (1 + pad);
  }
  if (yMax - yMin < 50000) {
    const mid = (yMin + yMax) / 2;
    yMin = mid - 25000;
    yMax = mid + 25000;
  }
  const yRange = yMax - yMin;
  const chartH = 200;
  const chartW = 700;
  const padLeft = 40;
  const padRight = 14;
  const padTop = 22;
  const padBottom = 34;
  const plotH = chartH - padTop - padBottom;
  const plotW = chartW - padLeft - padRight;
  const barGap = 10;
  const barTotalW = plotW / daysCount;
  const barW = Math.max(4, barTotalW - barGap);
  const zeroY = padTop + plotH - ((0 - yMin) / yRange) * plotH;
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const yTicks = [];
  const step =
    yRange <= 0 ? 100000 : Math.ceil(yRange / 7 / 10000) * 10000 || 10000;
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    yTicks.push(v);
  }
  if (yTicks.length === 0) yTicks.push(0);
  const barsSvg = dailyData
    .map((item, i) => {
      if (item.price === 0) return "";
      const x = padLeft + i * barTotalW + (barTotalW - barW) / 2;
      const barH =
        yRange > 0 ? Math.max(1, (Math.abs(item.price) / yRange) * plotH) : 0;
      const isNeg = item.price < 0;
      const y = isNeg ? zeroY : zeroY - barH;
      const fill = isNeg
        ? "#8b7355"
        : ["#4a5568", "#718096", "#a0aec0", "#2b6cb0", "#3182ce", "#63b3ed"][
            i % 6
          ];
      const rx = 3;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="${rx}" ry="${rx}" fill="${fill}" class="time-dash-vbar"/>`;
    })
    .filter(Boolean)
    .join("");
  const priceLabel = `<text x="${padLeft - 5}" y="14" text-anchor="end" font-size="6" fill="#9ca3af">Price</text>`;
  const yLabels = yTicks
    .map((v) => {
      const y = padTop + plotH - ((v - yMin) / yRange) * plotH;
      return `<text x="${padLeft - 5}" y="${y + 4}" text-anchor="end" font-size="6" fill="#6b7280">${formatPriceK(v)}</text>`;
    })
    .join("");
  const xLabels = dailyData
    .map((item, idx) => {
      const x = padLeft + (idx + 0.5) * barTotalW;
      const y = chartH - 6;
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="6" fill="#6b7280" transform="rotate(-45, ${x}, ${y})">${String(item.day).padStart(2, "0")} ${monthNames[item.month]}</text>`;
    })
    .join("");
  const hGridLines = yTicks
    .map((v) => {
      const y = padTop + plotH - ((v - yMin) / yRange) * plotH;
      return `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e8eaed" stroke-width="0.5"/>`;
    })
    .join("");
  const vGridLines = Array.from({ length: daysCount + 1 }, (_, i) => {
    const x = padLeft + i * barTotalW;
    return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotH}" stroke="#e8eaed" stroke-width="0.5"/>`;
  }).join("");
  const gridLines = vGridLines + hGridLines;
  const valueLabels = dailyData
    .map((item, i) => {
      if (item.price === 0) return "";
      const x = padLeft + (i + 0.5) * barTotalW;
      const isNeg = item.price < 0;
      const barH = yRange > 0 ? (Math.abs(item.price) / yRange) * plotH : 0;
      const barTop = isNeg ? zeroY : zeroY - barH;
      const barBottom = isNeg ? zeroY + barH : zeroY;
      const labelGap = 8;
      const y = isNeg ? barBottom + labelGap + 6 : barTop - labelGap;
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="7" fill="#374151" font-weight="500">${formatPrice(item.price)}</text>`;
    })
    .filter(Boolean)
    .join("");
  const widget = document.createElement("div");
  widget.className =
    "time-dashboard-widget time-dashboard-widget-daily-revenue";
  widget.innerHTML = `
    <div class="time-dashboard-widget-title">${periodLabel} 일별 수익</div>
    <div class="time-dash-daily-chart-wrap">
      <svg class="time-dash-daily-chart" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet" style="overflow:visible">
        ${priceLabel}
        ${gridLines}
        ${barsSvg}
        ${yLabels}
        ${xLabels}
        ${valueLabels}
      </svg>
    </div>
  `;
  return widget;
}

/** 기간 내 하루 가치 합계 (시급 * 시간, 생산성 반영) */
function calcPeriodValue(rows, period, hourlyRate) {
  const filtered = filterRowsByPeriod(rows, period);
  return calcPeriodValueFromFiltered(filtered, hourlyRate);
}

function calcPeriodValueFromFiltered(filtered, hourlyRate) {
  let sum = 0;
  filtered.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    const pv = (
      r.productivity ||
      getProductivityFromCategory(r.category) ||
      ""
    ).trim();
    let price = hrs * hourlyRate;
    if (pv === "nonproductive") price *= -1;
    else if (pv === "other" || pv === "그 외" || !pv) price = 0;
    sum += price;
  });
  return sum;
}

/** 오늘 날짜 시간 기록 요약 (홈/오늘 뷰 4분면용) */
export function getTodayTimeSummary() {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const rows = loadTimeRows().filter(
    (r) => (r.date || "").toString().slice(0, 10) === todayKey,
  );
  let hourlyRate = 0;
  try {
    hourlyRate = parseFloat(String(localStorage.getItem(USER_HOURLY_RATE_KEY) || "0").replace(/,/g, "")) || 0;
  } catch (_) {}
  let totalHrs = 0;
  let productiveHrs = 0;
  let investedPrice = 0;
  let wastedValue = 0;
  let workHrsToday = 0;
  let sleepHrsToday = 0;
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked) || 0;
    totalHrs += hrs;
    const cat = (r.category || "").trim();
    if (cat === "work") workHrsToday += hrs;
    else if (cat === "sleep") sleepHrsToday += hrs;
    const pv = (r.productivity || getProductivityFromCategory(r.category) || "").trim();
    if (pv === "productive") {
      productiveHrs += hrs;
      investedPrice += hrs * hourlyRate;
    }
    if (pv === "nonproductive") {
      wastedValue += hrs * hourlyRate;
    }
  });
  const trackedDisplay = totalHrs <= 0 || !isFinite(totalHrs) ? "0h 0m" : formatHoursDisplay(totalHrs);
  const productiveDisplay = productiveHrs <= 0 || !isFinite(productiveHrs) ? "0h 0m" : formatHoursDisplay(productiveHrs);
  /** 홈 오늘 통계: 총 기록 목표(고정) */
  const totalRecordGoalHours = 23 + 59 / 60;
  const totalRecordGoalDisplay = formatHoursDisplay(totalRecordGoalHours);
  /** 24h − 근무 − 수면 = 가용 시간(당일 기록 기준) */
  const availableHrsToday = Math.max(0, 24 - workHrsToday - sleepHrsToday);
  /** 홈 통계 푸터: 짧은 한 줄(가용 시·분 + '중'은 줄바꿈 유발) */
  const productiveContextDisplay = "가용 시간의";
  /** 홈 요약 막대: 하루 24시간 기준… (호환용) */
  const trackedPct24 = Math.min(100, Math.max(0, (totalHrs / 24) * 100));
  const productivePct24 = Math.min(100, Math.max(0, (productiveHrs / 24) * 100));
  /** 총기록 막대: 고정 목표(23h59m) 대비 */
  const trackedPctOfGoal = Math.min(
    100,
    Math.max(0, (totalHrs / totalRecordGoalHours) * 100),
  );
  /** 생산적 막대: 당일 가용 시간 대비 */
  const productivePctOfAvailable =
    availableHrsToday > 0 && isFinite(availableHrsToday)
      ? Math.min(100, Math.max(0, (productiveHrs / availableHrsToday) * 100))
      : 0;
  return {
    trackedDisplay,
    productiveDisplay,
    priceDisplay: `+${formatPrice(investedPrice)}`,
    wastedDisplay: `-${formatPrice(wastedValue)}`,
    totalRecordGoalDisplay,
    productiveContextDisplay,
    trackedPct24,
    productivePct24,
    trackedPctOfGoal,
    productivePctOfAvailable,
    trackedGoalPercentLabel: `${Math.round(trackedPctOfGoal)}%`,
    productiveOfAvailablePercentLabel: `${Math.round(productivePctOfAvailable)}%`,
  };
}

/** 카테고리 라벨 조회 */
function getCategoryLabel(value) {
  if (value === "productive_consumption")
    return "부수입"; /* 구 카테고리 → 부수입으로 표시 */
  const opt = CATEGORY_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : value || "그 외";
}

function getCategoryColor(value) {
  if (value === "productive_consumption") return "cat-sideincome";
  const opt = CATEGORY_OPTIONS.find((o) => o.value === value);
  return opt ? opt.color : "cat-empty";
}

/** 하루 평균 가용시간 계산 (24 - 근무 - 수면) */
function calcAvgAvailableHours(rows, period = "이번달") {
  const filtered = filterRowsByPeriod(rows, period);
  return calcAvgAvailableHoursFromFiltered(filtered);
}

function calcAvgAvailableHoursFromFiltered(filtered) {
  const byDate = {};
  filtered.forEach((r) => {
    if (r.category !== "work" && r.category !== "sleep") return;
    const d = r.date.trim();
    if (!byDate[d]) byDate[d] = { work: 0, sleep: 0 };
    const hrs = parseTimeToHours(r.timeTracked);
    if (r.category === "work") byDate[d].work += hrs;
    else byDate[d].sleep += hrs;
  });
  const dates = Object.keys(byDate);
  if (dates.length === 0) return null;
  let totalAvailable = 0;
  dates.forEach((d) => {
    const used = byDate[d].work + byDate[d].sleep;
    const available = Math.max(0, 24 - used);
    totalAvailable += available;
  });
  return totalAvailable / dates.length;
}

function formatPrice(n) {
  if (n === 0) return "0";
  const abs = Math.abs(Math.round(n));
  const str = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-${str}` : str;
}

/** 차트용 가격 표시 (k 단위) */
function formatPriceK(n) {
  if (n === 0) return "0";
  const k = Math.round(n / 1000);
  return n < 0 ? `-${Math.abs(k)}k` : `${k}k`;
}

function parsePriceFromDisplay(text) {
  if (!text || typeof text !== "string") return 0;
  const trimmed = text.trim().replace(/,/g, "");
  if (!trimmed) return 0;
  const num = parseFloat(trimmed);
  return isNaN(num) ? 0 : num;
}

function createDateCell(initialValue) {
  const wrap = document.createElement("div");
  wrap.className = "time-date-cell";
  const display = document.createElement("span");
  display.className = "time-date-display";
  const input = document.createElement("input");
  input.type = "date";
  input.className = "time-input-date-hidden";
  input.name = "time-date";
  function refresh() {
    if (input.value) {
      display.textContent = formatDateDisplay(input.value);
      display.classList.add("has-value");
    } else {
      display.textContent = "";
      display.classList.remove("has-value");
    }
  }
  input.addEventListener("change", refresh);
  wrap.appendChild(display);
  wrap.appendChild(input);
  wrap.addEventListener("click", () => {
    input.focus();
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  });
  if (initialValue) {
    input.value = initialValue;
    refresh();
  }
  return { wrap, input, refresh };
}

/**
 * @param {AbortSignal} [tabSignal] 탭 이탈 시 document 리스너 정리용
 * @param {boolean} [enablePanelFilter] true면 열린 패널 맨 위 입력칸으로 목록만 필터 (표·트리거 스타일 변경 없음)
 */
function createTagDropdown(
  options,
  initialValue,
  optionClass,
  onSelect,
  tabSignal,
  enablePanelFilter = false,
) {
  const wrap = document.createElement("div");
  wrap.className = "time-tag-dropdown-wrap";
  let value =
    initialValue !== undefined && initialValue !== null
      ? String(initialValue)
      : options[0]?.value !== undefined && options[0]?.value !== null
        ? String(options[0].value)
        : "";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "time-tag-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  function updateTrigger() {
    const opt = options.find((o) => o.value === value);
    const label = opt ? opt.label : value || "—";
    const colorClass = opt ? opt.color : "";
    trigger.innerHTML = `<span class="time-tag-pill ${optionClass} ${colorClass}">${label}</span>`;
    trigger.setAttribute("aria-label", `선택: ${label}. 클릭 시 메뉴 열기`);
  }
  updateTrigger();

  const panel = document.createElement("div");
  panel.className =
    "time-tag-panel" +
    (enablePanelFilter ? " time-tag-panel--with-filter" : "");
  panel.hidden = true;

  /** @type {HTMLInputElement | null} */
  let filterInput = null;
  let listRoot = panel;

  if (enablePanelFilter) {
    filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.className = "time-tag-panel-filter";
    filterInput.setAttribute("aria-label", "과제 검색");
    filterInput.placeholder = "과제 검색…";
    filterInput.autocomplete = "off";
    listRoot = document.createElement("div");
    listRoot.className = "time-tag-panel-list";
    panel.appendChild(filterInput);
    panel.appendChild(listRoot);

    function applyFilter() {
      const q = (filterInput.value || "").trim().toLowerCase();
      listRoot.querySelectorAll(".time-tag-option").forEach((el) => {
        const label = (el.dataset.filterLabel || "").toLowerCase();
        const show = !q || label.includes(q);
        el.hidden = !show;
      });
    }
    filterInput.addEventListener("input", applyFilter);
    filterInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePanel();
        trigger.focus();
      }
    });
  }

  function appendOption(o) {
    const opt = document.createElement("div");
    opt.className =
      "time-tag-option" +
      (String(o.value ?? "") === String(value ?? "") ? " is-selected" : "");
    opt.innerHTML = `<span class="time-tag-pill ${o.color || ""}">${o.label}</span>`;
    opt.setAttribute(
      "data-option-value",
      o.value === undefined || o.value === null ? "" : String(o.value),
    );
    if (enablePanelFilter) {
      opt.dataset.filterLabel = String(o.label ?? o.value ?? "");
    }
    opt.addEventListener("click", () => {
      value = o.value === undefined || o.value === null ? "" : String(o.value);
      updateTrigger();
      closePanel();
      onSelect?.(value);
    });
    listRoot.appendChild(opt);
  }
  if (enablePanelFilter) {
    const hadEmpty = options.some((o) => o.value === "");
    options
      .filter((o) => o.value !== "")
      .forEach(appendOption);
    if (hadEmpty) {
      appendOption({
        value: "",
        label: "선택 안 함",
        color: "cat-empty",
      });
    }
  } else {
    options.forEach(appendOption);
  }

  function resetPanelFilter() {
    if (!enablePanelFilter || !filterInput) return;
    filterInput.value = "";
    listRoot.querySelectorAll(".time-tag-option").forEach((el) => {
      el.hidden = false;
    });
  }

  /** body 고정 패널을 트리거 위치에 맞춤 (스크롤·리사이즈 후에도 깨짐 방지) */
  let panelScrollSyncAc = null;
  function syncPanelToTrigger() {
    if (panel.hidden) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 4;
    panel.style.position = "fixed";
    panel.style.top = `${rect.bottom + margin}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 140)}px`;
    panel.style.zIndex = "999999";
    const vw = window.innerWidth;
    const estW = Math.max(panel.offsetWidth, Math.max(rect.width, 140));
    let left = rect.left;
    if (left + estW > vw - 8) left = Math.max(8, vw - estW - 8);
    panel.style.left = `${left}px`;
  }

  function closePanel() {
    panelScrollSyncAc?.abort();
    panelScrollSyncAc = null;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (panel.parentElement === document.body) {
      document.body.removeChild(panel);
      wrap.appendChild(panel);
    }
    resetPanelFilter();
  }

  function openPanel() {
    trigger.setAttribute("aria-expanded", "true");
    panelScrollSyncAc?.abort();
    panelScrollSyncAc = new AbortController();
    const { signal } = panelScrollSyncAc;
    const reposition = () => {
      syncPanelToTrigger();
    };
    /* 캘린더 1일뷰 등: 부모 overflow 스크롤 시에도 트리거와 맞춤 */
    document.addEventListener("scroll", reposition, { capture: true, signal });
    window.addEventListener("resize", reposition, { signal });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", reposition, { signal });
      window.visualViewport.addEventListener("scroll", reposition, { signal });
    }
    if (panel.parentElement !== document.body) {
      wrap.removeChild(panel);
      document.body.appendChild(panel);
    }
    panel.hidden = false;
    syncPanelToTrigger();
    requestAnimationFrame(() => syncPanelToTrigger());
    resetPanelFilter();
    if (enablePanelFilter && filterInput) {
      requestAnimationFrame(() => filterInput.focus());
    }
  }

  trigger.addEventListener("click", () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });
  if (tabSignal) {
    tabSignal.addEventListener(
      "abort",
      () => {
        closePanel();
      },
      { once: true },
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (panel.hidden) return;
        if (e.key === "Escape") {
          closePanel();
          trigger.focus();
        }
      },
      { signal: tabSignal },
    );
    document.addEventListener(
      "click",
      (e) => {
        if (!wrap.contains(e.target) && !panel.contains(e.target)) {
          closePanel();
        }
      },
      { signal: tabSignal },
    );
  } else {
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target) && !panel.contains(e.target)) {
        closePanel();
      }
    });
  }

  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  wrap._getValue = () => value;
  wrap._setValue = (v) => {
    value = v !== undefined && v !== null ? String(v) : "";
    updateTrigger();
    panel.querySelectorAll(".time-tag-option").forEach((optEl) => {
      const ov = optEl.getAttribute("data-option-value");
      optEl.classList.toggle("is-selected", ov === value);
    });
  };
  return { wrap, getValue: () => value };
}

const DELETE_ICON =
  '<svg class="time-task-delete-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/** 과제명 입력: 포커스 시 목록 표시, 목록에 없으면 Create 옵션 @param {AbortSignal} [tabSignal] */
function createTaskNameInput(initialValue, onTaskSelect, tabSignal) {
  const wrap = document.createElement("div");
  wrap.className = "time-task-name-wrap";

  const inputWrap = document.createElement("div");
  inputWrap.className = "time-task-input-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.name = "time-task-name";
  input.className = "time-input-task";
  input.placeholder = "Search";
  if (initialValue) input.value = initialValue;

  inputWrap.appendChild(input);

  const panel = document.createElement("div");
  panel.className = "time-task-name-panel";
  panel.hidden = true;

  let highlightedIndex = -1;

  function renderPanel(query) {
    const q = (query || "").trim().toLowerCase();
    const all = getTaskOptions();
    const getName = (o) => (typeof o === "string" ? o : o.name);
    let matches = q
      ? all.filter((o) => getName(o).toLowerCase().includes(q))
      : all;
    matches = [...matches].sort((a, b) =>
      getName(a).localeCompare(getName(b), "ko"),
    );
    const exactMatch = q && matches.some((o) => getName(o).toLowerCase() === q);
    const showCreate = q && !exactMatch;

    panel.innerHTML = "";
    highlightedIndex = -1;

    if (matches.length === 0 && !showCreate) {
      panel.hidden = true;
      return;
    }

    const sep = document.createElement("div");
    sep.className = "time-task-name-separator";
    sep.textContent = "—";
    panel.appendChild(sep);

    const lockedNames = getLockedTaskNames();
    matches.forEach((opt) => {
      const name = getName(opt);
      const isLocked = lockedNames.has(name);
      const row = document.createElement("div");
      row.className = "time-task-name-option";
      row.innerHTML = `<span class="time-task-tag">${name}</span>${isLocked ? "" : `<button type="button" class="time-task-delete-btn" title="삭제">${DELETE_ICON}</button>`}`;
      row.dataset.value = name;
      const delBtn = row.querySelector(".time-task-delete-btn");
      row.addEventListener("click", (e) => {
        if (e.target.closest(".time-task-delete-btn")) return;
        input.value = name;
        panel.hidden = true;
        input.blur();
        onTaskSelect?.(name);
      });
      if (delBtn) {
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (getLockedTaskNames().has(name)) {
            alert(MSG_TIME_TASK_KPI_LINKED);
            return;
          }
          if (!(await removeTaskOption(name))) {
            alert(MSG_TIME_TASK_KPI_LINKED);
            return;
          }
          renderPanel(input.value);
        });
      }
      panel.appendChild(row);
    });

    if (showCreate) {
      const createRow = document.createElement("div");
      createRow.className = "time-task-name-option time-task-name-create";
      createRow.innerHTML = `<span class="time-task-create-label">Create</span><span class="time-task-tag">${(query || "").trim()}</span>`;
      createRow.dataset.value = (query || "").trim();
      createRow.dataset.isCreate = "true";
      createRow.addEventListener("click", () => {
        const val = (query || "").trim();
        addTaskOption(val);
        input.value = val;
        panel.hidden = true;
        input.blur();
        onTaskSelect?.(val);
      });
      panel.appendChild(createRow);
    }

    highlightedIndex = 0;
    const opts = panel.querySelectorAll(".time-task-name-option");
    if (opts[0]) opts[0].classList.add("is-highlighted");
    panel.hidden = false;
  }

  function closePanel() {
    panel.hidden = true;
    highlightedIndex = -1;
  }

  input.addEventListener("focus", () => renderPanel(input.value));

  input.addEventListener("input", () => renderPanel(input.value));

  input.addEventListener("blur", () => {
    setTimeout(closePanel, 150);
  });

  input.addEventListener("keydown", (e) => {
    if (panel.hidden) {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
      return;
    }
    const opts = panel.querySelectorAll(".time-task-name-option");
    if (opts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, opts.length - 1);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) =>
        o.classList.toggle("is-highlighted", i === highlightedIndex),
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) =>
        o.classList.toggle("is-highlighted", i === highlightedIndex),
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = opts[highlightedIndex >= 0 ? highlightedIndex : 0];
      if (sel) {
        const val = sel.dataset.value;
        if (sel.dataset.isCreate === "true") addTaskOption(val);
        input.value = val;
        closePanel();
        input.blur();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
    }
  });

  const docClickClose = (e) => {
    if (!wrap.contains(e.target)) closePanel();
  };
  if (tabSignal) {
    document.addEventListener("click", docClickClose, { signal: tabSignal });
  } else {
    document.addEventListener("click", docClickClose);
  }

  wrap.appendChild(inputWrap);
  wrap.appendChild(panel);
  return { wrap, input, getValue: () => input.value };
}

function createRow(initialData, onUpdate, viewEl, onRowDelete, onRowEdit) {
  const tr = document.createElement("tr");
  tr.className = "time-row";

  const taskName = initialData?.taskName || "";
  const opt = taskName ? getTaskOptionByName(taskName) : null;
  const idIn = String(initialData?.id || "").trim();
  const rowId =
    isUuid(idIn)
      ? idIn
      : typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const tid = String((initialData?.taskId || opt?.id || "").trim());
  const rowData = {
    id: rowId,
    taskName,
    taskId: isUuid(tid) ? tid : "",
    startTime: (initialData?.startTime || "").trim(),
    endTime: (initialData?.endTime || "").trim(),
    timeTracked: initialData?.timeTracked || "",
    productivity:
      initialData?.productivity ??
      (initialData?.category
        ? getProductivityFromCategory(initialData.category)
        : taskName
          ? opt?.productivity
          : ""),
    category:
      initialData?.category ?? (taskName ? opt?.category : ""),
    date: initialData?.date || "",
    feedback: initialData?.feedback || "",
    mealDetail: String(initialData?.mealDetail || "").trim(),
    memoTags: Array.isArray(initialData?.memoTags) ? initialData.memoTags : [],
    linkedExpenseIds: Array.isArray(initialData?.linkedExpenseIds)
      ? initialData.linkedExpenseIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [],
    focus: String(initialData?.focus || "").trim(),
  };
  tr._rowData = rowData;

  const prodTd = document.createElement("td");
  prodTd.className = "time-cell time-cell-productivity";
  const priceTd = document.createElement("td");
  priceTd.className = "time-cell time-cell-price";
  const priceDisplay = document.createElement("span");
  priceDisplay.className = "time-price-display";

  const prodDisplay = document.createElement("span");
  prodDisplay.className = "time-tag-pill prod";
  const prodOpt = PRODUCTIVITY_OPTIONS.find(
    (o) => o.value === rowData.productivity,
  );
  prodDisplay.textContent = prodOpt ? prodOpt.label : "";
  prodDisplay.className =
    "time-tag-pill prod " + (prodOpt ? prodOpt.color : "");
  prodTd.appendChild(prodDisplay);

  const startTimeTd = document.createElement("td");
  startTimeTd.className = "time-cell time-cell-start";
  const startTimeSpan = document.createElement("span");
  startTimeSpan.className = "time-display-start";
  startTimeSpan.textContent = rowData.startTime
    ? toDisplayTimeOnly(rowData.startTime) || rowData.startTime
    : "";
  startTimeTd.appendChild(startTimeSpan);

  const endTimeTd = document.createElement("td");
  endTimeTd.className = "time-cell time-cell-end";
  const endTimeSpan = document.createElement("span");
  endTimeSpan.className = "time-display-end";
  endTimeSpan.textContent = formatTimeLedgerEndCellDisplay(
    rowData.startTime,
    rowData.endTime,
  );
  endTimeTd.appendChild(endTimeSpan);

  const timeTd = document.createElement("td");
  timeTd.className = "time-cell time-cell-tracked";
  const timeSpan = document.createElement("span");
  timeSpan.className = "time-display-tracked";
  timeTd.appendChild(timeSpan);

  function updatePrice() {
    const data = tr._rowData || rowData;
    const hourlyInput = viewEl?.querySelector(".time-hourly-input");
    const hourlyRate =
      parseFloat(String(hourlyInput?.value || "0").replace(/,/g, "")) || 0;
    const hours = getMobileCardEffectiveHoursForPrice(data);
    const pv = getMobileCardProductivityValue(data);
    let price = hours * hourlyRate;
    if (pv === "nonproductive") price *= -1;
    else if (pv === "other" || pv === "그 외" || !pv) price = 0;
    priceDisplay.textContent = formatPrice(price);
    priceDisplay.classList.toggle("is-negative", price < 0);
    priceDisplay.classList.toggle("is-positive", price > 0);

    const tracked = (data.timeTracked || "").trim();
    const hasStart = !!(data.startTime && String(data.startTime).trim());
    if (tracked) timeSpan.textContent = tracked;
    else if (!hasStart) timeSpan.textContent = "";
    else timeSpan.textContent = formatHoursToHHMM(hours);

    /* 마감 없음·시작 있음 → 「진행중」(모바일 카드 시간 줄과 동일 의미) */
    endTimeSpan.textContent = formatTimeLedgerEndCellDisplay(
      data.startTime,
      data.endTime,
    );

    viewEl?._updateTotal?.();
  }

  const catTd = document.createElement("td");
  catTd.className = "time-cell time-cell-category";
  const catDisplay = document.createElement("span");
  catDisplay.className = "time-tag-pill cat cat-empty";
  catDisplay.textContent = getCategoryLabel(rowData.category) || "—";
  catDisplay.className =
    "time-tag-pill cat " + getCategoryColor(rowData.category);
  catTd.appendChild(catDisplay);

  const taskTd = document.createElement("td");
  taskTd.className = "time-cell time-cell-task";
  const taskInner = document.createElement("div");
  taskInner.className = "time-cell-task-inner";
  const prodBar = document.createElement("span");
  prodBar.className = "time-task-prod-bar";
  const prodBarMod =
    rowData.productivity === "productive"
      ? "time-task-prod-bar--productive"
      : rowData.productivity === "nonproductive"
        ? "time-task-prod-bar--nonproductive"
        : "time-task-prod-bar--other";
  prodBar.classList.add(prodBarMod);
  const taskSpan = document.createElement("span");
  taskSpan.className = "time-display-task";
  taskSpan.textContent = rowData.taskName || "";
  taskInner.appendChild(prodBar);
  taskInner.appendChild(taskSpan);
  taskTd.appendChild(taskInner);

  tr.appendChild(taskTd);
  tr.appendChild(startTimeTd);
  tr.appendChild(endTimeTd);
  tr.appendChild(timeTd);
  tr.appendChild(catTd);
  tr.appendChild(prodTd);

  const dateTd = document.createElement("td");
  dateTd.className = "time-cell time-cell-date";
  const dateSpan = document.createElement("span");
  dateSpan.className = "time-display-date";
  dateSpan.textContent = rowData.date ? formatDateDisplay(rowData.date) : "";
  dateTd.appendChild(dateSpan);
  tr.appendChild(dateTd);

  priceTd.appendChild(priceDisplay);
  tr.appendChild(priceTd);

  const feedbackTd = document.createElement("td");
  feedbackTd.className = "time-cell time-cell-feedback";
  const feedbackSpan = document.createElement("span");
  feedbackSpan.className = "time-display-feedback";
  feedbackSpan.textContent = rowData.feedback || "";
  feedbackTd.appendChild(feedbackSpan);
  tr.appendChild(feedbackTd);

  const memoTagTd = document.createElement("td");
  memoTagTd.className = "time-cell time-cell-memo-tag";
  const memoTagDisplayTexts = getMemoTagDisplayTextsForLedgerRow(rowData);
  const memoTagWrap = document.createElement("span");
  memoTagWrap.className = "time-display-memo-tags";
  memoTagDisplayTexts.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "time-memo-tag-pill";
    pill.textContent = tag;
    memoTagWrap.appendChild(pill);
  });
  memoTagTd.appendChild(memoTagWrap);
  tr.appendChild(memoTagTd);

  tr._onRowDelete = onRowDelete;
  tr._updatePrice = updatePrice;
  updatePrice();

  if (onRowEdit) {
    tr.classList.add("time-row-clickable");
    tr.title = "클릭하여 수정";
    tr.addEventListener("click", (e) => {
      onRowEdit(tr, collectRowFromTR(tr));
    });
  }

  return tr;
}

const PRODUCTIVITY_VIEW_ORDER = [
  { value: "productive", label: "생산적" },
  { value: "nonproductive", label: "비생산적" },
];

/** 메모 문자열에서 #태그명 패턴 추출 → 태그 배열 (Archive 등에서 사용) */
export function parseTagsFromFeedback(feedbackStr) {
  if (!feedbackStr || typeof feedbackStr !== "string") return [];
  const matches = feedbackStr.match(/#([^\s#]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).trim()).filter(Boolean))];
}

/** 구버전 memo_tags에 섞여 있던 가계부 지출 참조 접두사 — pull 시 linkedExpenseIds로 이전 */
const LP_LEDGER_EXPENSE_TAG_PREFIX = "lp-expense:";

function isLedgerExpenseRefTag(tag) {
  return String(tag || "").trim().startsWith(LP_LEDGER_EXPENSE_TAG_PREFIX);
}

function expenseIdFromLedgerMemoTag(tag) {
  const s = String(tag || "").trim();
  if (!isLedgerExpenseRefTag(s)) return "";
  return s.slice(LP_LEDGER_EXPENSE_TAG_PREFIX.length).trim();
}

/**
 * memo_tags에서 사용자 표시 태그와 소비 거래 id 목록 분리
 * @returns {{ userTags: string[], expenseIds: string[] }}
 */
function splitLedgerMemoTags(memoTags) {
  const userTags = [];
  const expenseIds = [];
  for (const t of Array.isArray(memoTags) ? memoTags : []) {
    const s = String(t ?? "").trim();
    if (!s) continue;
    const eid = expenseIdFromLedgerMemoTag(s);
    if (eid) expenseIds.push(eid);
    else userTags.push(s);
  }
  return { userTags, expenseIds };
}

/** 사용자 메모 태그·투두만 memo_tags에 넣음. 가계부 지출 id는 linkedExpenseIds(서버 컬럼)로 별도 저장 */
function buildLedgerMemoTagsForSubmit(userTags, todoTags) {
  const base = [
    ...(Array.isArray(userTags) ? userTags : []),
    ...(Array.isArray(todoTags) ? todoTags : []),
  ];
  const seen = new Set();
  const out = [];
  for (const x of base) {
    const k = String(x).trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** 연결된 지출 id: 필드 + 구버전 memo_tags 내 lp-expense: (로컬만 남은 행 호환) */
function getLedgerLinkedExpenseIds(row) {
  const fromField = Array.isArray(row?.linkedExpenseIds)
    ? row.linkedExpenseIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const fromMemo = splitLedgerMemoTags(row?.memoTags || []).expenseIds;
  return [...new Set([...fromField, ...fromMemo])];
}

function ledgerExpenseAddedItemsFromIds(expenseIds) {
  const ids = Array.isArray(expenseIds) ? expenseIds : [];
  if (ids.length === 0) return [];
  const all = loadExpenseRows();
  const out = [];
  for (const eid of ids) {
    const row = all.find((r) => String(r?.id || "").trim() === String(eid).trim());
    if (!row || row.flowType !== "지출") continue;
    out.push({
      id: row.id,
      name: row.name || "",
      classification: row.classification || "",
      amountFormatted: row.amount || "",
    });
  }
  return out;
}

/** 가계부 지출 행 → 한 줄 표시용 (이름·분류·금액·카테고리) — 테이블·모바일 카드 공통 */
function formatExpenseLineForMobileCard(row) {
  if (!row || typeof row !== "object") return "";
  const name = String(row.name || "").trim();
  const amt = String(row.amount || "").trim();
  const cls = String(row.classification || "").trim();
  const cat = String(row.category || "").trim();
  if (name) return [name, amt].filter(Boolean).join(" | ");
  const clsAmt = [cls, amt].filter(Boolean).join(" | ");
  if (clsAmt) return clsAmt;
  if (cat && amt) return `${cat} | ${amt}`;
  if (amt) return amt;
  if (cls) return cls;
  if (cat) return cat;
  return "";
}

/** 테이블 메모 태그 열: 사용자 태그 + 소비 요약(가계부 행 기준) */
function getMemoTagDisplayTextsForLedgerRow(rowData) {
  const raw =
    rowData?.memoTags?.length > 0
      ? rowData.memoTags
      : parseTagsFromFeedback(rowData?.feedback || "");
  const { userTags } = splitLedgerMemoTags(Array.isArray(raw) ? raw : []);
  const expenseIds = getLedgerLinkedExpenseIds(rowData);
  const texts = [];
  for (const t of userTags) {
    const s = String(t ?? "").trim();
    if (!s) continue;
    const meal = dietNameFromLedgerMemoTag(s);
    if (meal) {
      texts.push(meal);
      continue;
    }
    if (!isWorkScheduleDietLedgerMemoTag(s)) texts.push(s);
  }
  const allExp = loadExpenseRows();
  for (const eid of expenseIds) {
    const row = allExp.find((r) => String(r?.id || "").trim() === eid);
    if (!row) continue;
    const label = formatExpenseLineForMobileCard(row);
    if (label) texts.push(label);
  }
  return texts;
}

/** 모바일 카드: 방해기록과 동일 레이아웃으로 연결된 소비 요약 (lp-expense 태그 기준) */
function buildMobileCardExpenseBlockHtml(rowData) {
  const expenseIds = getLedgerLinkedExpenseIds(rowData);
  if (expenseIds.length === 0) return "";
  const allExp = loadExpenseRows();
  const parts = [];
  for (const eid of expenseIds) {
    const row = allExp.find((r) => String(r?.id || "").trim() === eid);
    if (!row) continue;
    const line = formatExpenseLineForMobileCard(row);
    if (!line) continue;
    const safe = line.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    parts.push(safe);
  }
  if (parts.length === 0) return "";
  const text = parts.join(" · ");
  return `<div class="time-mobile-card-focus time-mobile-card-expense-snippet"><span class="time-mobile-card-focus-label">소비</span><span class="time-mobile-card-focus-text">${text}</span></div>`;
}

/**
 * 가계부 지출이 늦게 메모리에 올 때 카드는 이미 그려져 '소비'만 보이던 문제 → 동기화·탭 복귀 후 소비 줄만 다시 그림
 */
function refreshMobileTimeCardExpenseSnippetsIn(container) {
  if (!container?.querySelectorAll) return;
  container.querySelectorAll(".time-ledger-mobile-card").forEach((card) => {
    const rd = card._rowData;
    if (!rd || getLedgerLinkedExpenseIds(rd).length === 0) return;
    const body = card.querySelector(".time-mobile-card-body");
    if (!body) return;
    body.querySelectorAll(".time-mobile-card-expense-snippet").forEach((n) =>
      n.remove(),
    );
    const html = buildMobileCardExpenseBlockHtml(rd);
    if (html) body.insertAdjacentHTML("beforeend", html);
  });
}

/** contenteditable 메모 영역 직렬화: 텍스트 + #태그명 → 한 줄 문자열 */
function serializeMemoContent(containerEl) {
  if (!containerEl) return "";
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || "").trim();
      if (t) parts.push(t);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList?.contains("time-memo-tag-chip")) {
        const tag = (node.getAttribute("data-tag") || "").trim();
        if (tag) parts.push("#" + tag);
        return;
      }
      node.childNodes.forEach(walk);
    }
  };
  containerEl.childNodes.forEach(walk);
  return parts.join(" ");
}

/** 메모 문자열을 contenteditable에 반영 (텍스트 + 태그 칩) */
function setMemoContent(containerEl, feedbackStr) {
  if (!containerEl) return;
  const str = (feedbackStr || "").trim();
  containerEl.innerHTML = "";
  if (!str) {
    containerEl.classList.add("is-empty");
    return;
  }
  containerEl.classList.remove("is-empty");
  const tokens = str.split(/(#[^\s#]+)/g).filter(Boolean);
  tokens.forEach((tok) => {
    if (tok.startsWith("#") && tok.length > 1) {
      const tagName = tok.slice(1).trim();
      if (!tagName) return;
      const chip = document.createElement("span");
      chip.className = "time-memo-tag-chip";
      chip.contentEditable = "false";
      chip.setAttribute("data-tag", tagName);
      chip.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(tagName)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
      chip
        .querySelector(".time-memo-tag-chip-remove")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          chip.remove();
        });
      containerEl.appendChild(chip);
    } else {
      const text = document.createTextNode(tok);
      containerEl.appendChild(text);
    }
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** contenteditable 메모 필드에 # 태그 입력·삭제 동작 초기화 */
function initMemoFeedbackWithTags(containerEl) {
  if (!containerEl) return;
  let composing = false;
  containerEl.addEventListener("compositionstart", () => {
    composing = true;
  });
  containerEl.addEventListener("compositionend", () => {
    composing = false;
  });

  function getTextBeforeCaret(container, range) {
    const preRange = document.createRange();
    preRange.setStart(container, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().replace(/\u200B/g, "");
  }
  function getTextAfterCaret(container, range) {
    const postRange = document.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(container, getNodeLength(container));
    return postRange.toString();
  }
  function getNodeLength(node) {
    if (node.nodeType === Node.TEXT_NODE)
      return (node.textContent || "").length;
    return node.childNodes.length;
  }
  function tryCommitTag(
    container,
    range,
    replaceLen,
    tagName,
    insertSpaceAfter,
  ) {
    const tagNameTrim = (tagName || "").trim();
    if (!tagNameTrim) return;
    const sel = window.getSelection();
    const startCharOffset = getCharacterOffset(
      container,
      range.startContainer,
      range.startOffset,
    );
    const fromOffset = Math.max(0, startCharOffset - replaceLen);
    const fromPos = getNodeAndOffsetAt(container, fromOffset);
    if (!fromPos) return;
    const delRange = document.createRange();
    delRange.setStart(fromPos.node, fromPos.offset);
    delRange.setEnd(range.startContainer, range.startOffset);
    delRange.deleteContents();
    const chip = document.createElement("span");
    chip.className = "time-memo-tag-chip";
    chip.contentEditable = "false";
    chip.setAttribute("data-tag", tagNameTrim);
    chip.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(tagNameTrim)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
    chip
      .querySelector(".time-memo-tag-chip-remove")
      ?.addEventListener("click", (ev) => {
        ev.preventDefault();
        chip.remove();
      });
    range.setStart(fromPos.node, fromPos.offset);
    range.collapse(true);
    range.insertNode(chip);
    if (insertSpaceAfter) {
      const space = document.createTextNode("\u00A0");
      chip.after(space);
      range.setStart(space, 1);
      range.setEnd(space, 1);
    } else {
      range.setStartAfter(chip);
      range.setEndAfter(chip);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function getCharacterOffset(container, targetNode, targetOffset) {
    let count = 0;
    const walk = (n) => {
      if (n === targetNode) {
        if (n.nodeType === Node.TEXT_NODE) {
          count += Math.min(targetOffset, (n.textContent || "").length);
          return true;
        }
        if (
          n.nodeType === Node.ELEMENT_NODE &&
          n.classList?.contains("time-memo-tag-chip")
        ) {
          count += 1 + (n.getAttribute("data-tag") || "").trim().length;
          return true;
        }
        return true;
      }
      if (n.nodeType === Node.TEXT_NODE) {
        count += (n.textContent || "").length;
        return false;
      }
      if (
        n.nodeType === Node.ELEMENT_NODE &&
        n.classList?.contains("time-memo-tag-chip")
      ) {
        count += 1 + (n.getAttribute("data-tag") || "").trim().length;
        return false;
      }
      if (n.nodeType === Node.ELEMENT_NODE) {
        for (let i = 0; i < n.childNodes.length; i++) {
          if (walk(n.childNodes[i])) return true;
        }
      }
      return false;
    };
    walk(container);
    return count;
  }
  function getNodeAndOffsetAt(container, charOffset) {
    let passed = 0;
    const walk = (n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const len = (n.textContent || "").length;
        if (passed + len >= charOffset)
          return { node: n, offset: charOffset - passed };
        passed += len;
        return null;
      }
      if (
        n.nodeType === Node.ELEMENT_NODE &&
        n.classList?.contains("time-memo-tag-chip")
      ) {
        const len = 1 + (n.getAttribute("data-tag") || "").trim().length;
        if (passed + len >= charOffset) return { node: n, offset: 0 };
        passed += len;
        return null;
      }
      if (n.nodeType === Node.ELEMENT_NODE) {
        for (let i = 0; i < n.childNodes.length; i++) {
          const r = walk(n.childNodes[i]);
          if (r) return r;
        }
      }
      return null;
    };
    return walk(container);
  }

  containerEl.addEventListener("input", () => {
    if (serializeMemoContent(containerEl).trim() === "")
      containerEl.classList.add("is-empty");
    else containerEl.classList.remove("is-empty");
    if (composing) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!containerEl.contains(range.commonAncestorContainer)) return;
    const beforeCaret = getTextBeforeCaret(containerEl, range);
    const tagMatch = beforeCaret.match(/#([^\s#]*)$/);
    if (tagMatch) {
      const tagPart = tagMatch[1];
      if (/[\s,，]/.test(tagPart) || tagPart.endsWith("#")) return;
      const after = getTextAfterCaret(containerEl, range).charAt(0);
      if (tagPart.length > 0 && /[\s\n,]/.test(after)) {
        tryCommitTag(containerEl, range, tagMatch[0].length, tagPart, false);
      }
    }
  });

  containerEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (composing)
        return; /* 한글 조합 중에는 태그 확정하지 않음 → 글자 중복/깨짐 방지 */
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!containerEl.contains(range.commonAncestorContainer)) return;
      const beforeCaret = getTextBeforeCaret(containerEl, range);
      const tagMatch = beforeCaret.match(/#([^\s#]*)$/);
      if (tagMatch && tagMatch[1].length > 0) {
        e.preventDefault();
        tryCommitTag(
          containerEl,
          range,
          tagMatch[0].length,
          tagMatch[1],
          e.key === " ",
        );
      }
    }
  });
}

/** 과제명, 사용시간, 피드백이 전부 비어있으면 빈 행 (저장 제외) */
function isEmptyTimeRow(row) {
  const taskName = (row.taskName || "").trim();
  const timeTracked = (row.timeTracked || "").trim();
  const feedback = (row.feedback || "").trim();
  return !taskName && !timeTracked && !feedback;
}

function collectRowFromTR(tr) {
  if (tr._rowData) return tr._rowData;
  const taskInput = tr.querySelector(".time-input-task");
  const timeInput = tr.querySelector(".time-input-tracked");
  const startInput = tr.querySelector(".time-input-start");
  const endInput = tr.querySelector(".time-input-end");
  const prodWrap = tr.querySelector(
    ".time-cell-productivity .time-productivity-display-wrap",
  );
  const dateInput = tr.querySelector(".time-cell-date input[type='date']");
  const feedbackInput = tr.querySelector(".time-input-feedback");
  const taskName = (taskInput?.value || "").trim();
  const opt = taskName ? getTaskOptionByName(taskName) : null;
  const tid = (opt?.id || "").trim();
  const startVal = (startInput?.value || "").trim();
  const endVal = (endInput?.value || "").trim();
  return {
    taskName,
    taskId: isUuid(tid) ? tid : "",
    startTime: startVal ? formatDateTimeInput(startVal) || startVal : "",
    endTime: endVal ? formatDateTimeInput(endVal) || endVal : "",
    timeTracked: timeInput?.value || "",
    productivity:
      (typeof prodWrap?._getValue === "function"
        ? prodWrap._getValue()
        : null) || "",
    category: opt?.category || "",
    date: dateInput?.value || "",
    feedback: feedbackInput?.value || "",
    focus: (tr._rowData?.focus || "").trim(),
    memoTags: [],
    linkedExpenseIds: [],
  };
}

function collectRowsFromDOM(container) {
  const rows = [];
  container.querySelectorAll(".time-row").forEach((tr) => {
    const row = collectRowFromTR(tr);
    if (!isEmptyTimeRow(row)) rows.push(row);
  });
  container.querySelectorAll(".time-ledger-mobile-card").forEach((card) => {
    if (card._rowData && !isEmptyTimeRow(card._rowData))
      rows.push(card._rowData);
  });
  return rows;
}

/** 모바일 카드용: 데스크탑 time-task-prod-bar와 동일한 생산성별 색상 */
function getProductivityBarColor(prod) {
  if (prod === "productive") return "rgba(232, 164, 184, 0.5)";
  if (prod === "nonproductive") return "rgba(126, 184, 218, 0.5)";
  return "rgba(124, 184, 124, 0.5)"; /* 기타(other) - 데스크탑 prod-bar--other */
}

/** 모바일 시간가계부 카드 생성 */
function createMobileTimeCard(rowData, onEdit, onDelete, viewEl) {
  const prod =
    rowData.productivity || getProductivityFromCategory(rowData.category) || "";
  const color = getProductivityBarColor(prod);
  const tracked = getMobileCardTrackedDisplayForRow(rowData);
  const timeRangeHtml = getMobileCardTimeRangeHtmlForRow(rowData) || "—";
  const hourlyRate =
    parseFloat(
      String(viewEl?.querySelector(".time-hourly-input")?.value || "0").replace(
        /,/g,
        "",
      ),
    ) || 0;
  const priceVal = computeMobileCardPriceValue(rowData, hourlyRate);
  const priceClass =
    priceVal < 0 ? " is-negative" : priceVal > 0 ? " is-positive" : "";
  const taskName = (rowData.taskName || "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const memo = (rowData.feedback || "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const expenseBlock = buildMobileCardExpenseBlockHtml(rowData);

  const card = document.createElement("div");
  card.className =
    "time-ledger-mobile-card" +
    (mobileCardNeedsLiveClock(rowData)
      ? " time-ledger-mobile-card--in-progress"
      : "");
  card._rowData = rowData;
  card._timeLedgerViewEl = viewEl || null;
  card._onRowDelete = onDelete;
  card.innerHTML = `
    <div class="time-mobile-card-leading">
      <div class="time-mobile-card-color-bar" style="background:${color}"></div>
    </div>
    <div class="time-mobile-card-body">
      <div class="time-mobile-card-header">
        <span class="time-mobile-card-task">${taskName}</span>
        <span class="time-mobile-card-tracked">${tracked}</span>
      </div>
      <div class="time-mobile-card-meta">
        <span class="time-mobile-card-time">${timeRangeHtml}</span>
        <span class="time-mobile-card-price${priceClass}">${formatPrice(priceVal)}</span>
      </div>
      ${memo ? `<div class="time-mobile-card-memo">${memo}</div>` : ""}
      ${expenseBlock}
    </div>
  `;
  card.addEventListener("click", (e) => {
    if (e.target.closest(".time-mobile-card-body")) onEdit(card, rowData);
  });
  return card;
}

/** 과제명 열 너비 변경 시 sticky left 위치 동기화 */
function updateStickyLefts(table) {
  if (!table) return;
  const taskEl = table.querySelector(".time-th-task");
  if (!taskEl) return;
  const taskW = taskEl.getBoundingClientRect().width;
  const startW = 90;
  const endW = 90;
  const trackedW = 90;
  table.style.setProperty("--sticky-left-start", `${taskW}px`);
  table.style.setProperty("--sticky-left-end", `${taskW + startW}px`);
  table.style.setProperty(
    "--sticky-left-tracked",
    `${taskW + startW + endW}px`,
  );
}

/** 시간 기록 탭 요약: 데스크톱·숨김 패널용 5칸(마지막: 오늘 하루의 가치) */
const TIME_LEDGER_SUMMARY_FIVE_CELLS_HTML = `
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">총 기록 시간</div>
      <div class="time-ledger-summary-value"><span class="time-ledger-summary-num time-ledger-summary-tracked">0</span><span class="time-ledger-summary-unit">h</span><span class="time-ledger-summary-num time-ledger-summary-tracked">0</span><span class="time-ledger-summary-unit">m</span></div>
    </div>
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">생산적 시간</div>
      <div class="time-ledger-summary-value"><span class="time-ledger-summary-num time-ledger-summary-productive">0</span><span class="time-ledger-summary-unit">h</span><span class="time-ledger-summary-num time-ledger-summary-productive">0</span><span class="time-ledger-summary-unit">m</span></div>
    </div>
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">투자한 시급</div>
      <div class="time-ledger-summary-value time-ledger-summary-value--invested"><span class="time-ledger-summary-num time-ledger-summary-price time-ledger-summary-invested">+0</span><span class="time-ledger-summary-unit">원</span></div>
    </div>
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">낭비한 시급</div>
      <div class="time-ledger-summary-value time-ledger-summary-value--spent"><span class="time-ledger-summary-num time-ledger-summary-wasted time-ledger-summary-spent">-0</span><span class="time-ledger-summary-unit">원</span></div>
    </div>
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">오늘 하루의 가치</div>
      <div class="time-ledger-summary-value time-ledger-summary-value--day-net"><span class="time-ledger-summary-num time-ledger-summary-day-net">+0</span><span class="time-ledger-summary-unit">원</span></div>
    </div>`;

function createTableHTML() {
  return `
    <colgroup>
      <col class="time-col-task">
      <col class="time-col-start">
      <col class="time-col-end">
      <col class="time-col-tracked">
      <col class="time-col-category">
      <col class="time-col-productivity">
      <col class="time-col-date">
      <col class="time-col-price">
      <col class="time-col-feedback">
      <col class="time-col-memo-tag">
    </colgroup>
    <thead>
      <tr>
        <th class="time-th-task">과제명</th>
        <th class="time-th-start">시작시간</th>
        <th class="time-th-end">마감시간</th>
        <th class="time-th-tracked">사용 시간</th>
        <th class="time-th-category">카테고리</th>
        <th class="time-th-productivity">생산성</th>
        <th class="time-th-date">기록 날짜</th>
        <th class="time-th-price">행동의 가치</th>
        <th class="time-th-feedback">과제 메모</th>
        <th class="time-th-memo-tag">메모 태그</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
}

function createProductivitySection(
  prod,
  rows,
  viewEl,
  updateTotal,
  onRowDelete,
  openTaskLogModal,
  openTaskLogModalForEdit,
) {
  const section = document.createElement("section");
  section.className = "time-section";
  section.dataset.productivity = prod.value;

  const header = document.createElement("div");
  header.className = "time-section-header";
  const title = document.createElement("span");
  title.className = "time-section-title";
  title.textContent = prod.label;
  const countSpan = document.createElement("span");
  countSpan.className = "time-section-count";
  countSpan.textContent = "0";
  header.appendChild(title);
  header.appendChild(countSpan);
  section.appendChild(header);

  const tableWrap = document.createElement("div");
  tableWrap.className = "time-ledger-table-wrap";
  const table = document.createElement("table");
  table.className = "time-ledger-table";
  table.innerHTML = createTableHTML();
  const tbody = table.querySelector("tbody");
  const tfoot = document.createElement("tfoot");
  tfoot.innerHTML = `
    <tr class="time-section-summary-row">
      <td class="time-cell time-cell-task" colspan="3">합계</td>
      <td class="time-cell time-cell-tracked time-section-summary-tracked"></td>
      <td class="time-cell time-cell-category" colspan="3"></td>
      <td class="time-cell time-cell-price"><span class="time-section-summary-price"></span></td>
      <td class="time-cell time-cell-feedback" colspan="3"></td>
    </tr>
  `;
  table.appendChild(tfoot);
  const summaryTrackedEl = tfoot.querySelector(".time-section-summary-tracked");
  const summaryPriceEl = tfoot.querySelector(".time-section-summary-price");

  function updateCount() {
    const rows = tbody.querySelectorAll(".time-row");
    const n = rows.length;
    countSpan.textContent = n;
    let totalHrs = 0;
    let totalPrice = 0;
    const hourlyRate =
      parseFloat(
        String(
          viewEl?.querySelector(".time-hourly-input")?.value || "0",
        ).replace(/,/g, ""),
      ) || 0;
    rows.forEach((tr) => {
      const timeEl =
        tr.querySelector(".time-input-tracked") ||
        tr.querySelector(".time-display-tracked");
      const val = (timeEl?.value ?? timeEl?.textContent ?? "").trim();
      const hrs = parseTimeToHours(val) || 0;
      totalHrs += hrs;
      const pv = (tr._rowData?.productivity || prod.value || "").trim();
      let price = hrs * hourlyRate;
      if (pv === "nonproductive") price *= -1;
      else if (pv === "other" || pv === "그 외" || !pv) price = 0;
      totalPrice += price;
    });
    summaryTrackedEl.textContent =
      totalHrs > 0 ? formatHoursDisplay(totalHrs) : "";
    summaryPriceEl.textContent = formatPrice(totalPrice);
    summaryPriceEl.className =
      "time-section-summary-price" +
      (totalPrice < 0 ? " is-negative" : totalPrice > 0 ? " is-positive" : "");
  }

  const onRowUpdate = () => {
    updateTotal();
    updateCount();
  };

  const handleRowDelete = (tr, rowData) => {
    const entryId = String(rowData?.id || "").trim();
    tr.remove();
    onRowUpdate();
    if (!rowData) return;
    void (async () => {
      /* saveTimeRows → pushDirty → pull 이 delete 보다 먼저 끝나면 서버에 행이 남아 다시 부활함 */
      if (entryId) {
        removeKpiHabitLogsForTimeLedgerEntry(entryId);
        timeLedgerSyncLog("ui_time_row_delete", {
          idPreview: `${entryId.slice(0, 8)}…`,
        });
        await deleteTimeLedgerEntryFromSupabase(entryId);
      }
      const diskBefore = loadTimeRows();
      const { next } = removeTimeLedgerRowFromRows(diskBefore, rowData);
      saveTimeRows(next);
    })();
  };

  const handleRowEdit = (tr, rowData) => {
    openTaskLogModalForEdit?.(tr, rowData);
  };

  rows.forEach((d) => {
    const tr = createRow(
      { ...d, productivity: prod.value },
      onRowUpdate,
      viewEl,
      onRowDelete ?? handleRowDelete,
      openTaskLogModalForEdit ?? handleRowEdit,
    );
    tbody.appendChild(tr);
  });
  updateCount();

  const taskTh = table.querySelector(".time-th-task");
  const taskCol = table.querySelector(".time-col-task");
  if (taskTh && taskCol) {
    const resizer = document.createElement("div");
    resizer.className = "time-col-resizer";
    resizer.title = "드래그하여 너비 조절";
    taskTh.appendChild(resizer);
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = taskTh.getBoundingClientRect().width;
      const onMove = (moveE) => {
        const dx = moveE.clientX - startX;
        const newWidth = Math.max(80, Math.min(500, startWidth + dx));
        taskCol.style.width = `${newWidth}px`;
        taskCol.style.minWidth = `${newWidth}px`;
        updateStickyLefts(table);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        updateStickyLefts(table);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });
    requestAnimationFrame(() => updateStickyLefts(table));
  }

  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  return section;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content time-ledger-view";
  el.dataset.timeContentView = "all";
  const timeTabAbort = new AbortController();
  el._lpTabAbortController = timeTabAbort;
  const signal = timeTabAbort.signal;

  attachTimeLedgerTasksSaveListener();
  attachTimeImproveNotesSaveListener();

  const hourlyWrap = document.createElement("div");
  hourlyWrap.className = "time-hourly-wrap time-hourly-wrap--hint-row";
  const hourlyAddSlot = document.createElement("div");
  hourlyAddSlot.className = "time-hourly-add-slot";
  const hourlyRateBlock = document.createElement("div");
  hourlyRateBlock.className = "time-hourly-rate-block";
  const hourlyHint = document.createElement("span");
  hourlyHint.className = "time-hourly-hint";
  hourlyHint.textContent = "My account에서 시급을 설정하면 금액이 계산됩니다";
  const hourlyRateValues = document.createElement("div");
  hourlyRateValues.className = "time-hourly-rate-values";
  const hourlyLabel = document.createElement("span");
  hourlyLabel.className = "time-hourly-label";
  hourlyLabel.textContent = "내 시급: ";
  const hourlyDisplay = document.createElement("span");
  hourlyDisplay.className = "time-hourly-display";
  const storedRate = (() => {
    try {
      const v = localStorage.getItem(USER_HOURLY_RATE_KEY);
      const n = parseFloat(v);
      return Number.isNaN(n) ? 0 : n;
    } catch (_) {
      return 0;
    }
  })();
  hourlyDisplay.textContent =
    storedRate > 0
      ? new Intl.NumberFormat("ko-KR").format(Math.round(storedRate)) + "원"
      : "—";
  if (storedRate <= 0) {
    const setupLink = document.createElement("button");
    setupLink.type = "button";
    setupLink.className = "time-hourly-setup-link";
    setupLink.textContent = "My account에서 설정";
    setupLink.addEventListener("click", () => {
      document.dispatchEvent(
        new CustomEvent("app-switch-tab", { detail: { tabId: "idea" } }),
      );
    });
    hourlyRateValues.appendChild(setupLink);
  }
  const hourlyInput = document.createElement("input");
  hourlyInput.type = "hidden";
  hourlyInput.className = "time-hourly-input";
  hourlyInput.value = String(storedRate);
  hourlyRateValues.appendChild(hourlyLabel);
  hourlyRateValues.appendChild(hourlyDisplay);
  hourlyRateValues.appendChild(hourlyInput);
  hourlyRateBlock.appendChild(hourlyHint);
  hourlyWrap.appendChild(hourlyRateBlock);

  function updateHourlyHint() {
    const hasTime = Array.from(
      contentWrap.querySelectorAll(".time-input-tracked"),
    ).some((inp) => (inp?.value || "").trim().length > 0);
    const hasHourly =
      parseFloat(String(hourlyInput?.value || "0").replace(/,/g, "")) > 0;
    hourlyHint.classList.toggle("is-visible", hasTime && !hasHourly);
  }

  function isTimeLedgerAuditLikeView(v) {
    return v === "audit" || v === "retrospect";
  }

  const viewTabs = document.createElement("div");
  viewTabs.className = "time-view-tabs time-view-tabs--segmented";
  const improveTabHtml = TIME_LEDGER_SHOW_IMPROVE_TAB
    ? '<button type="button" class="time-view-tab" data-view="improve">개선하기</button>'
    : "";
  viewTabs.innerHTML = `
    <span class="time-view-tabs-thumb" aria-hidden="true"></span>
    <button type="button" class="time-view-tab active" data-view="all">시간 기록</button>
    <button type="button" class="time-view-tab" data-view="audit">보고서</button>
    <button type="button" class="time-view-tab" data-view="retrospect">회고</button>
    ${improveTabHtml}
  `;

  function syncTimeLedgerSegmentThumb() {
    if (!viewTabs.classList.contains("time-view-tabs--segmented")) return;
    const btns = [...viewTabs.querySelectorAll(".time-view-tab")];
    const n = Math.max(1, btns.length);
    const idx = Math.max(
      0,
      btns.findIndex((b) => b.classList.contains("active")),
    );
    viewTabs.style.setProperty("--time-segment-count", String(n));
    viewTabs.style.setProperty("--thumb-col-start", String(idx + 1));
  }
  syncTimeLedgerSegmentThumb();

  const now = new Date();
  const filterType = "range";
  let filterYear = now.getFullYear();
  let filterMonth = now.getMonth() + 1;
  const {
    rangeStart: filterStartDateInit,
    rangeEnd: filterEndDateInit,
  } = readTimeLedgerSessionFilterRangeYmd();
  let filterStartDate = filterStartDateInit;
  let filterEndDate = filterEndDateInit;

  function persistActiveViewTimeFilterToSession() {
    let view =
      viewTabs.querySelector(".time-view-tab.active")?.dataset?.view || "all";
    if (!TIME_LEDGER_SHOW_IMPROVE_TAB && view === "improve") view = "all";
    const start = pickYmdFromFilter(startDateInput.value, filterStartDate);
    const end = pickYmdFromFilter(endDateInput.value, filterEndDate);
    try {
      if (typeof sessionStorage === "undefined") return;
      if (view === "audit") {
        sessionStorage.setItem("lp_time_audit_filter_start", start);
        sessionStorage.setItem("lp_time_audit_filter_end", end);
      } else if (view === "retrospect") {
        sessionStorage.setItem("lp_time_retrospect_filter_start", start);
        sessionStorage.setItem("lp_time_retrospect_filter_end", end);
      } else {
        sessionStorage.setItem("lp_time_filter_start", start);
        sessionStorage.setItem("lp_time_filter_end", end);
      }
    } catch (_) {}
  }
  /** 과제 필터: null = 전체, string[] = 선택한 과제만 표시 (히스토리 기준) */
  let selectedTaskNamesForFilter = null;

  const filterBar = document.createElement("div");
  filterBar.className = "time-filter-bar";
  filterBar.innerHTML = `
    <div class="time-filter-nav-cluster" data-filter-for="all">
      <div class="time-filter-range-wrap" data-filter-wrap="range">
        <div class="time-filter-date-field">
          <input type="date" class="time-filter-start-date" name="time-filter-start" aria-label="시작일" />
          <span class="time-filter-date-label time-filter-date-label--start" aria-hidden="true"></span>
          <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
        </div>
        <span class="time-filter-range-sep" data-audit-range-hidden>~</span>
        <div class="time-filter-date-field">
          <input type="date" class="time-filter-end-date" name="time-filter-end" data-audit-range-hidden aria-label="종료일" />
          <span class="time-filter-date-label time-filter-date-label--end" aria-hidden="true"></span>
          <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
        </div>
      </div>
      <div class="time-filter-day-nav">
        <button type="button" class="time-filter-day-prev" aria-label="이전 날짜">
          <img src="/toolbaricons/caret-left-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
        <button type="button" class="time-filter-day-next" aria-label="다음 날짜">
          <img src="/toolbaricons/caret-right-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
      </div>
    </div>
  `;

  const startDateInput = filterBar.querySelector(".time-filter-start-date");
  const endDateInput = filterBar.querySelector(".time-filter-end-date");
  const rangeWrap = filterBar.querySelector("[data-filter-wrap='range']");
  const filterNavCluster = filterBar.querySelector(".time-filter-nav-cluster");
  const taskSetupBtn = document.createElement("button");
  taskSetupBtn.type = "button";
  taskSetupBtn.className = "time-task-setup-btn";
  taskSetupBtn.dataset.filterFor = "all";
  taskSetupBtn.title = "과제명, 생산성, 카테고리를 한 번에 설정";
  taskSetupBtn.setAttribute("aria-label", "과제 설정");
  taskSetupBtn.innerHTML = TIME_LEDGER_TOOLBAR_SETTINGS_ICON_SVG;
  taskSetupBtn.classList.add(
    "time-ledger-tabs-settings-btn",
    "time-ledger-toolbar-icon-btn",
  );

  const taskSelectBtn = document.createElement("button");
  taskSelectBtn.type = "button";
  taskSelectBtn.className =
    "time-task-setup-btn time-filter-task-select-btn time-ledger-toolbar-icon-btn";
  taskSelectBtn.id = "time-task-select-btn";
  taskSelectBtn.title = "과제 선택";
  taskSelectBtn.setAttribute("aria-label", "과제 선택");
  taskSelectBtn.innerHTML = TIME_LEDGER_TOOLBAR_FILTER_ICON_SVG;

  /** YYYY-MM-DD → "2026. 05. 05(화)" — 필터·목록 일자(모바일·데스크탑 공통) */
  function formatTimeFilterDateDotsWithWeekday(dStr) {
    if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
    const [y, mo, d] = dStr.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const yy = String(y);
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${yy}. ${mm}. ${dd}(${weekdays[dt.getDay()]})`;
  }

  /** 회고: 매일 반복 KPI 행 라벨 앞 아이콘 — 글자색·크기(1em)와 동일 */
  function createRetrospectKpiDailyRepeatIconSvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "time-retrospect-kpi-daily-icon");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("fill", "none");
    g.setAttribute("stroke", "currentColor");
    g.setAttribute("stroke-width", "2");
    g.setAttribute("stroke-linecap", "round");
    g.setAttribute("stroke-linejoin", "round");
    g.setAttribute("stroke-miterlimit", "10");
    const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p1.setAttribute("d", "m17 5v-4h4");
    const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p2.setAttribute(
      "d",
      "m17.5 2c3.562 1.821 5.5 5.725 5.5 10 0 6.075-4.925 11-11 11s-11-4.925-11-11c0-5.738 4.393-10.45 10-10.955",
    );
    g.appendChild(p1);
    g.appendChild(p2);
    svg.appendChild(g);
    return svg;
  }

  /** 회고 표 열 제목: 1행 요일 한 글자, 2행 m/dd */
  function fillRetrospectTableHeaderTh(thEl, dStr) {
    thEl.textContent = "";
    if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return;
    const [y, mo, d] = dStr.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const stack = document.createElement("span");
    stack.className = "time-retrospect-th-day-stack";
    const lineWd = document.createElement("span");
    lineWd.className =
      "time-retrospect-th-day-line time-retrospect-th-day-line--wd";
    lineWd.textContent = weekdays[dt.getDay()];
    const lineDate = document.createElement("span");
    lineDate.className =
      "time-retrospect-th-day-line time-retrospect-th-day-line--date";
    lineDate.textContent = `${mo}/${d}`;
    stack.appendChild(lineWd);
    stack.appendChild(lineDate);
    thEl.appendChild(stack);
  }

  function syncTimeFilterDateLabels() {
    /* 모바일: navCluster가 contentWrap 툴바로 옮겨져도 같은 노드 — filterBar로 찾으면 라벨이 끊김 */
    const labelRoot = filterNavCluster || filterBar;
    const startLabel = labelRoot?.querySelector(".time-filter-date-label--start");
    const endLabel = labelRoot?.querySelector(".time-filter-date-label--end");
    const fmt = formatTimeFilterDateDotsWithWeekday;
    if (startLabel) {
      startLabel.textContent = fmt(startDateInput.value || filterStartDate);
    }
    if (endLabel) {
      endLabel.textContent = fmt(endDateInput.value || filterEndDate);
    }
  }

  startDateInput.value = filterStartDate;
  endDateInput.value = filterEndDate;
  syncTimeFilterDateLabels();

  function pickYmdFromFilter(raw, fallback) {
    const a = (raw && String(raw).trim()) || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) return a;
    const b = (fallback && String(fallback).trim()) || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(b)) return b;
    return toDateStr(new Date());
  }

  /** 날짜 피커 구간이 바뀌면 서버에서 그 구간만 다시 받기 */
  function computePickerRangeKeyForPull() {
    const a = pickYmdFromFilter(startDateInput.value, filterStartDate);
    const b = pickYmdFromFilter(endDateInput.value, filterEndDate);
    return a <= b ? `${a}|${b}` : `${b}|${a}`;
  }
  let _pickerRangeKeyAtLastPullIntent = computePickerRangeKeyForPull();
  let _timeLedgerFilterPullTimer = null;

  function schedulePullTimeLedgerForPickerRange() {
    if (_timeLedgerFilterPullTimer) clearTimeout(_timeLedgerFilterPullTimer);
    _timeLedgerFilterPullTimer = setTimeout(async () => {
      _timeLedgerFilterPullTimer = null;
      if (!el.isConnected) return;
      const { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
      const ok = await pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
      if (ok && el.isConnected) refreshTimeLedgerFromRemotePull();
    }, 400);
  }

  function shiftFilterRangeByDays(delta) {
    const s0 = pickYmdFromFilter(startDateInput.value, filterStartDate);
    const e0 = pickYmdFromFilter(endDateInput.value, filterEndDate);
    const sd = new Date(`${s0}T12:00:00`);
    const ed = new Date(`${e0}T12:00:00`);
    if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return;
    sd.setDate(sd.getDate() + delta);
    ed.setDate(ed.getDate() + delta);
    filterStartDate = toDateStr(sd);
    filterEndDate = toDateStr(ed);
    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;
    persistActiveViewTimeFilterToSession();
  }

  /* 모바일에서 툴바로 DOM만 옮겨지므로, 클러스터에 위임해 < > 탭이 항상 동일하게 동작 */
  filterNavCluster?.addEventListener("click", (e) => {
    const prev = e.target.closest(".time-filter-day-prev");
    const next = e.target.closest(".time-filter-day-next");
    if (!prev && !next) return;
    e.preventDefault();
    shiftFilterRangeByDays(prev ? -1 : 1);
    onFilterChange();
  });

  function openTimeLedgerFilterDateInput(inp) {
    if (!inp) return;
    try {
      inp.focus({ preventScroll: true });
    } catch (_) {
      inp.focus();
    }
    if (typeof inp.showPicker === "function") {
      try {
        inp.showPicker();
        return;
      } catch (_) {}
    }
    inp.click();
  }
  filterNavCluster?.querySelectorAll(".time-filter-date-field").forEach((field) => {
    const inp = field.querySelector('input[type="date"]');
    if (!inp) return;
    field.addEventListener("click", () => {
      if (!window.matchMedia(MQ_TIME_LEDGER_MAX_MOBILE).matches) return;
      openTimeLedgerFilterDateInput(inp);
    });
  });

  startDateInput.addEventListener("change", () => {
    const v = startDateInput.value;
    if (v) filterStartDate = v;
    onFilterChange();
  });
  startDateInput.addEventListener("input", syncTimeFilterDateLabels);
  endDateInput.addEventListener("change", () => {
    const v = endDateInput.value;
    if (v) filterEndDate = v;
    onFilterChange();
  });
  endDateInput.addEventListener("input", syncTimeFilterDateLabels);

  function onFilterChange(skipMerge = false) {
    let view = viewTabs.querySelector(".time-view-tab.active")?.dataset?.view;
    if (!TIME_LEDGER_SHOW_IMPROVE_TAB && view === "improve") {
      view = "all";
      viewTabs.querySelectorAll(".time-view-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.view === "all");
      });
      syncTimeLedgerSegmentThumb();
    }
    const type = filterType;
    const rows = getFullRowsForFilter(skipMerge);
    cachedRows = rows;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    let filtered = filterRowsByFilterType(rows, type, y, m, start, end);
    if (
      selectedTaskNamesForFilter != null &&
      selectedTaskNamesForFilter.length > 0
    ) {
      const set = new Set(selectedTaskNamesForFilter);
      filtered = filtered.filter((r) => set.has((r.taskName || "").trim()));
    }
    if (view === "all") {
      renderAll(filtered);
      updateTotal();
    } else if (view === "blank") {
      clearTimeLedgerMobileElapsedTimer(el);
      rescueTimeFilterControlsToFilterBar();
      contentWrap.innerHTML = "";
    } else if (view === "audit") {
      renderAudit(filtered);
    } else if (view === "retrospect") {
      renderRetrospect(filtered);
    } else if (view === "improve" && TIME_LEDGER_SHOW_IMPROVE_TAB) {
      renderImprove(filtered);
    }
    syncTimeFilterDateLabels();
    persistActiveViewTimeFilterToSession();
    const pickerKeyNow = computePickerRangeKeyForPull();
    if (pickerKeyNow !== _pickerRangeKeyAtLastPullIntent) {
      _pickerRangeKeyAtLastPullIntent = pickerKeyNow;
      schedulePullTimeLedgerForPickerRange();
    }
  }

  /* filterBar는 월 드롭다운 패널이 세로로 열리므로 .time-view-tabs(overflow-y:hidden) 밖에 둠 */
  const tabsFilterRow = document.createElement("div");
  tabsFilterRow.className = "time-ledger-tabs-filter-row";
  window.addEventListener("resize", syncTimeFilterDateLabels, { signal });
  window.addEventListener("resize", syncTimeLedgerSegmentThumb, { signal });
  const tabsTopMargin = document.createElement("div");
  tabsTopMargin.className = "time-ledger-tabs-top-margin";
  const ledgerToolbarIcons = document.createElement("div");
  ledgerToolbarIcons.className = "time-ledger-toolbar-icons";
  ledgerToolbarIcons.appendChild(taskSetupBtn);
  ledgerToolbarIcons.appendChild(taskSelectBtn);

  const ledgerTopLeft = document.createElement("div");
  ledgerTopLeft.className = "time-ledger-top-strip__left";
  ledgerTopLeft.appendChild(ledgerToolbarIcons);

  const ledgerTopCenter = document.createElement("div");
  ledgerTopCenter.className = "time-ledger-top-strip__center";
  ledgerTopCenter.appendChild(viewTabs);

  const ledgerTopRight = document.createElement("div");
  ledgerTopRight.className = "time-ledger-top-strip__right";
  ledgerTopRight.appendChild(hourlyRateValues);

  /** 모바일: 설정·필터는 왼쪽, 탭은 가운데, 과제 기록(+)은 오른쪽 끝 — 데스크톱은 +만 좌측 아이콘 줄 */
  function syncHourlyAddSlotPlacement() {
    if (!hourlyAddSlot) return;
    const narrow = window.matchMedia(MQ_TIME_LEDGER_MAX_MOBILE).matches;
    if (narrow) {
      ledgerTopRight.appendChild(hourlyAddSlot);
    } else {
      ledgerToolbarIcons.appendChild(hourlyAddSlot);
    }
  }
  syncHourlyAddSlotPlacement();
  window.matchMedia(MQ_TIME_LEDGER_MAX_MOBILE).addEventListener(
    "change",
    syncHourlyAddSlotPlacement,
    { signal },
  );

  const tabHeaderRow = document.createElement("div");
  tabHeaderRow.className = "time-ledger-tab-header-row";
  tabHeaderRow.appendChild(ledgerTopLeft);
  tabHeaderRow.appendChild(ledgerTopCenter);
  tabHeaderRow.appendChild(ledgerTopRight);
  tabsFilterRow.appendChild(tabsTopMargin);
  tabsFilterRow.appendChild(tabHeaderRow);

  /* 2행: 날짜·필터만 (과제 기록·탭·시급은 상단 한 줄) */
  const filterAddRow = document.createElement("div");
  filterAddRow.className = "time-ledger-filter-add-row";
  filterAddRow.appendChild(filterBar);

  const mobileFilterTotalRow = document.createElement("div");
  mobileFilterTotalRow.className = "time-ledger-mobile-filter-total";
  mobileFilterTotalRow.setAttribute("hidden", "");
  mobileFilterTotalRow.innerHTML =
    '<span class="time-ledger-mobile-filter-total-inner"><span class="time-ledger-mobile-filter-total-label">전체</span><span class="time-ledger-mobile-filter-total-sep"> : </span><span class="time-ledger-mobile-filter-total-value" aria-label="필터 구간 전체 기록 시간">00:00</span></span>';

  el.appendChild(tabsFilterRow);
  el.appendChild(hourlyWrap);
  el.appendChild(filterAddRow);
  el.appendChild(mobileFilterTotalRow);

  const taskSetupModal = document.createElement("div");
  taskSetupModal.className = "time-task-setup-modal";
  taskSetupModal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel">
      <div class="time-task-setup-header">
        <h3 class="time-task-setup-title">과제 설정</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body">
        <button type="button" class="time-task-add-btn">+ 과제 추가하기</button>
        <div class="time-task-setup-tabs">
          <button type="button" class="time-task-setup-tab active" data-tab="all">전체</button>
          <button type="button" class="time-task-setup-tab" data-tab="productive">생산적</button>
          <button type="button" class="time-task-setup-tab" data-tab="nonproductive">비생산적</button>
          <button type="button" class="time-task-setup-tab" data-tab="other">그 외</button>
        </div>
        <div class="time-task-setup-subcats" data-subcat-bar style="display:none">
          <button type="button" class="time-task-setup-subcat-btn active" data-subcat="">전체</button>
        </div>
        <div class="time-task-setup-list-scroll">
          <div class="time-task-setup-list" data-tab-content="all"></div>
          <div class="time-task-setup-list" data-tab-content="productive" style="display:none"></div>
          <div class="time-task-setup-list" data-tab-content="nonproductive" style="display:none"></div>
          <div class="time-task-setup-list" data-tab-content="other" style="display:none"></div>
        </div>
      </div>
    </div>
  `;
  taskSetupModal.hidden = true;
  el.appendChild(taskSetupModal);

  const taskSelectModal = document.createElement("div");
  taskSelectModal.className = "time-task-setup-modal time-task-select-modal";
  taskSelectModal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel time-task-select-panel">
      <div class="time-task-setup-header">
        <h3 class="time-task-setup-title">과제 선택</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body">
        <div class="time-task-select-actions">
          <button type="button" class="time-task-select-all-btn">전체 선택</button>
          <button type="button" class="time-task-select-none-btn">전체 해제</button>
        </div>
        <div class="time-task-select-list" data-task-select-list></div>
        <div class="time-task-select-footer">
          <button type="button" class="time-task-select-apply-btn">적용</button>
          <button type="button" class="time-task-select-clear-btn">필터 해제</button>
        </div>
      </div>
    </div>
  `;
  taskSelectModal.hidden = true;
  el.appendChild(taskSelectModal);

  (function initTaskSelectModal() {
    const taskSelectList = taskSelectModal.querySelector(
      "[data-task-select-list]",
    );
    const taskSelectBackdrop = taskSelectModal.querySelector(
      ".time-task-setup-backdrop",
    );
    const taskSelectClose = taskSelectModal.querySelector(
      ".time-task-setup-header .time-task-setup-close",
    );
    const taskSelectAllBtn = taskSelectModal.querySelector(
      ".time-task-select-all-btn",
    );
    const taskSelectNoneBtn = taskSelectModal.querySelector(
      ".time-task-select-none-btn",
    );
    const taskSelectApplyBtn = taskSelectModal.querySelector(
      ".time-task-select-apply-btn",
    );
    const taskSelectClearBtn = taskSelectModal.querySelector(
      ".time-task-select-clear-btn",
    );

    function openTaskSelectModal() {
      const rows = getFullRowsForFilter(true);
      const names = [
        ...new Set(rows.map((r) => (r.taskName || "").trim()).filter(Boolean)),
      ];
      names.sort((a, b) => a.localeCompare(b, "ko"));
      const selectedSet =
        selectedTaskNamesForFilter == null
          ? null
          : new Set(selectedTaskNamesForFilter);
      taskSelectList.innerHTML = names
        .map((name) => {
          const attrEsc = String(name).replace(/"/g, "&quot;");
          const nameHtml = String(name)
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          const opt = getTaskOptionByName(name);
          const kpiMark =
            opt && isTimeTaskKpiLinked(opt)
              ? '<span class="time-task-kpi-badge" title="KPI(맵)에서 연결된 과제입니다">KPI</span>'
              : "";
          const builtinMark = isTimeTaskBuiltinTemplate({ name })
            ? '<span class="time-task-builtin-badge" title="앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.">기본</span>'
            : "";
          return `<label class="time-task-select-item"><input type="checkbox" class="time-task-select-cb" data-task-name="${attrEsc}" ${selectedSet === null || selectedSet.has(name) ? "checked" : ""} /><span class="time-task-select-item-text"><span class="time-task-select-item-name-part">${nameHtml}</span>${builtinMark}${kpiMark}</span></label>`;
        })
        .join("");
      if (names.length === 0)
        taskSelectList.innerHTML =
          '<p class="time-task-select-empty">기록된 과제가 없습니다.</p>';
      taskSelectModal.hidden = false;
    }

    function closeTaskSelectModal() {
      taskSelectModal.hidden = true;
    }

    el.querySelector("#time-task-select-btn")?.addEventListener(
      "click",
      openTaskSelectModal,
    );
    taskSelectClose?.addEventListener("click", closeTaskSelectModal);
    taskSelectAllBtn?.addEventListener("click", () => {
      taskSelectModal.querySelectorAll(".time-task-select-cb").forEach((cb) => {
        cb.checked = true;
      });
    });
    taskSelectNoneBtn?.addEventListener("click", () => {
      taskSelectModal.querySelectorAll(".time-task-select-cb").forEach((cb) => {
        cb.checked = false;
      });
    });
    taskSelectApplyBtn?.addEventListener("click", () => {
      const checked = [
        ...taskSelectModal.querySelectorAll(".time-task-select-cb:checked"),
      ].map((cb) => cb.dataset.taskName || "");
      selectedTaskNamesForFilter = checked.length === 0 ? null : checked;
      closeTaskSelectModal();
      onFilterChange();
      const btn = el.querySelector("#time-task-select-btn");
      if (btn)
        btn.classList.toggle(
          "is-active",
          selectedTaskNamesForFilter != null &&
            selectedTaskNamesForFilter.length > 0,
        );
    });
    taskSelectClearBtn?.addEventListener("click", () => {
      selectedTaskNamesForFilter = null;
      closeTaskSelectModal();
      onFilterChange();
      el.querySelector("#time-task-select-btn")?.classList.remove("is-active");
    });
  })();

  const addTaskModal = document.createElement("div");
  addTaskModal.className = "time-task-setup-modal time-add-task-modal";
  addTaskModal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel time-add-task-panel">
      <div class="time-task-setup-header">
        <h3 class="time-task-setup-title">과제 추가</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body">
        <div class="time-add-task-field">
          <label>과제명</label>
          <input type="text" class="time-add-task-name" name="time-add-task-name" placeholder="과제명 입력" />
        </div>
        <div class="time-add-task-field">
          <label>생산성</label>
          <div class="time-add-task-productivity">
            <label class="time-add-task-radio"><input type="radio" name="addProd" value="productive" checked /> 생산적</label>
            <label class="time-add-task-radio"><input type="radio" name="addProd" value="nonproductive" /> 비생산적</label>
          </div>
        </div>
        <div class="time-add-task-field time-add-task-category-wrap">
          <label>카테고리</label>
          <div class="time-add-task-categories" data-for="productive"></div>
          <div class="time-add-task-categories" data-for="nonproductive" style="display:none"></div>
        </div>
        <button type="button" class="time-add-task-submit">추가</button>
        <button type="button" class="time-add-task-delete" hidden>과제 삭제</button>
      </div>
    </div>
  `;
  addTaskModal.hidden = true;
  el.appendChild(addTaskModal);

  const taskLogModal = document.createElement("div");
  taskLogModal.className = "time-task-setup-modal time-task-log-modal";
  taskLogModal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel time-task-log-panel">
      <div class="time-datetime-picker-backdrop" hidden></div>
      <div class="time-task-setup-header time-task-log-header">
        <h3 class="time-task-setup-title">과제 기록</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body time-task-log-body">
        <div class="time-task-log-scroll-area">
        <div class="time-task-log-datetime-fields-wrap">
          <div class="time-task-log-field">
            <label>이 시간에 할 행동</label>
            <div class="time-task-log-task-wrap"></div>
          </div>
          <div class="time-task-log-field time-task-log-datetime-onerow">
            <span class="time-task-log-section-label">시간</span>
            <div class="time-task-log-datetime-card">
              <div class="time-task-log-datetime-input-row">
                <div class="time-task-log-date-native-wrap">
                  <input type="date" class="time-task-log-date-start" name="time-task-log-date" data-hide-delete-btn="true" data-use-native-mobile="true" />
                  <span class="time-task-log-date-overlay" aria-hidden="true"></span>
                </div>
                <span class="time-task-log-datetime-sep">-</span>
                <input type="text" class="time-task-log-time-start" name="time-task-log-time-start" placeholder="hh:mm" maxlength="5" />
                <span class="time-task-log-datetime-sep">-</span>
                <input type="text" class="time-task-log-time-end" name="time-task-log-time-end" placeholder="hh:mm" maxlength="5" />
              </div>
            </div>
            <span class="time-task-log-section-label time-task-log-quick-section-label">빠른 선택</span>
            <div class="time-task-log-time-adjust-btns">
              <button type="button" class="time-task-log-time-adjust-btn time-task-log-time-adjust-now" data-now="true">지금</button>
              <button type="button" class="time-task-log-time-adjust-btn time-task-log-time-adjust-last" data-last="true">마지막</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-delta="-30">−30</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-delta="-15">−15</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-delta="15">+15</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-delta="30">+30</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-day-end="true">하루끝</button>
            </div>
            <input type="hidden" class="time-task-log-start" />
            <input type="hidden" class="time-task-log-end" />
          </div>
        </div>
        <div class="time-task-log-kpi-todos-section" hidden>
          <h4 class="time-task-log-kpi-todos-title">할일 목록</h4>
          <div class="time-task-log-kpi-todos-list"></div>
        </div>
        <div class="time-task-log-daily-todos-section" hidden>
          <h4 class="time-task-log-daily-todos-title">매일 할일 목록</h4>
          <div class="time-task-log-daily-todos-list"></div>
        </div>
        <div class="time-task-log-memo-section">
          <span class="time-task-log-section-label time-task-log-memo-section-label">메모</span>
          <div class="time-task-log-memo-fields">
            <div class="time-task-log-field time-task-log-meal-detail-section" hidden>
              <label class="time-task-log-section-label time-task-log-meal-detail-label" for="time-task-log-meal-detail">식단명</label>
              <input type="text" id="time-task-log-meal-detail" class="time-task-log-meal-detail-input time-task-log-memo-input" placeholder="무엇을 드셨는지 한 줄로 적어 주세요" autocomplete="off" />
            </div>
            <div class="time-task-log-field">
              <textarea class="time-task-log-feedback time-task-log-memo-input" rows="3" placeholder="메모를 입력하세요"></textarea>
            </div>
            <div class="time-task-log-field">
              <span class="time-task-log-section-label">태그</span>
              <div class="time-task-log-tags-wrap">
                <input type="text" class="time-task-log-tag-input" placeholder="태그 입력 후 Enter" />
                <div class="time-task-log-tag-list"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="time-task-log-todo-row">
          <div class="time-task-log-link-row-head">
            <span class="time-task-log-todo-label time-task-log-link-strip-label">투두 리스트</span>
            <button type="button" class="time-task-log-todo-add-btn time-task-log-link-strip-add" aria-label="할일 추가">+</button>
          </div>
          <div class="time-task-log-todo-pills"></div>
        </div>
        <div class="time-task-log-expense-row">
          <div class="time-task-log-link-row-head">
            <span class="time-task-log-expense-label time-task-log-link-strip-label">소비 기록</span>
            <button type="button" class="time-task-log-expense-add-btn time-task-log-link-strip-add" aria-label="소비 기록 추가">+</button>
          </div>
          <div class="time-task-log-expense-pills"></div>
        </div>
        </div>
      </div>
      <div class="time-task-log-footer" data-task-log-footer>
        <button type="button" class="time-task-log-submit">기록</button>
        <button type="button" class="time-task-log-delete-btn" hidden>이 시간기록 삭제</button>
      </div>
      <div class="time-datetime-picker-wrap time-datetime-picker-bottom" hidden>
        <div class="time-datetime-picker-buttons-wrap">
          <div class="time-datetime-picker-header">
            <span class="time-datetime-picker-title"></span>
            <button type="button" class="time-datetime-picker-confirm">확인</button>
          </div>
          <div class="time-datetime-picker-buttons time-datetime-picker-offset-btns">
            <button type="button" class="time-datetime-picker-btn" data-offset="-30">-30</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="-15">-15</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="-5">-5</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="5">+5</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="15">+15</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="30">+30</button>
          </div>
          <div class="time-datetime-picker-buttons time-datetime-picker-action-btns">
            <button type="button" class="time-datetime-picker-btn" data-action="last">마지막</button>
            <button type="button" class="time-datetime-picker-btn" data-action="now">지금</button>
            <button type="button" class="time-datetime-picker-btn" data-action="eod">하루의 끝</button>
          </div>
        </div>
        <div class="time-datetime-picker-wheels">
          <div class="time-datetime-picker-column" data-col="date"></div>
          <div class="time-datetime-picker-column" data-col="ampm"></div>
          <div class="time-datetime-picker-column" data-col="hour"></div>
          <div class="time-datetime-picker-column" data-col="minute"></div>
        </div>
      </div>
    </div>
    <div class="time-task-log-todo-inner-modal" hidden>
      <div class="time-task-log-todo-inner-backdrop"></div>
      <div class="time-task-log-todo-inner-panel">
        <div class="time-task-log-todo-inner-header time-task-setup-header time-task-log-header">
          <h3 class="time-task-setup-title time-task-log-todo-inner-header-label">투두리스트</h3>
          <button type="button" class="time-task-setup-close time-task-log-todo-inner-close" aria-label="닫기">&times;</button>
        </div>
        <div class="time-task-log-todo-inner-body">
          <div class="time-task-log-field">
            <label>카테고리</label>
            <div class="time-task-log-todo-category-wrap"></div>
          </div>
          <div class="time-task-log-field">
            <input type="text" class="time-task-log-todo-inner-name" placeholder="할 일 이름 입력" />
          </div>
        </div>
        <div class="time-task-log-todo-inner-footer">
          <button type="button" class="time-task-log-todo-inner-add">추가</button>
        </div>
      </div>
    </div>
    <div class="time-task-log-expense-inner-modal" hidden>
      <div class="time-task-log-expense-inner-backdrop"></div>
      <div class="time-task-log-expense-inner-panel">
        <div class="time-task-log-expense-inner-header time-task-setup-header time-task-log-header">
          <h3 class="time-task-setup-title">소비 기록</h3>
          <button type="button" class="time-task-setup-close time-task-log-expense-inner-close" aria-label="닫기">&times;</button>
        </div>
        <div class="time-task-log-expense-inner-body">
          <div class="time-task-log-expense-inner-fields">
            <div class="time-task-log-field time-task-log-expense-amount-name-row">
              <div class="time-task-log-expense-amount-cell">
                <label>금액</label>
                <div class="time-task-log-expense-amount-wrap">
                  <input type="text" class="time-task-log-expense-amount" name="time-task-log-expense-amount" placeholder="0" inputmode="numeric" />
                  <span class="time-task-log-expense-amount-unit">원</span>
                </div>
              </div>
              <div class="time-task-log-expense-name-cell">
                <label>소비명</label>
                <input type="text" class="time-task-log-expense-name" name="time-task-log-expense-name" placeholder="스타벅스" />
              </div>
            </div>
            <div class="time-task-log-field">
              <label>소비 분류</label>
              <div class="time-task-log-expense-classification-wrap"></div>
            </div>
            <div class="time-task-log-expense-error" hidden></div>
            <button type="button" class="time-task-log-expense-inner-add-btn">추가</button>
          </div>
          <div class="time-task-log-expense-added-list"></div>
        </div>
      </div>
    </div>
  `;
  taskLogModal.hidden = true;
  el.appendChild(taskLogModal);

  const taskLogPickerWrap = taskLogModal.querySelector(
    ".time-datetime-picker-wrap",
  );
  const taskLogPickerBackdrop = taskLogModal.querySelector(
    ".time-datetime-picker-backdrop",
  );

  function closeDateTimePicker() {
    taskLogPickerWrap.hidden = true;
    taskLogPickerBackdrop.hidden = true;
  }


  const taskLogTitleEl = taskLogModal.querySelector(".time-task-setup-title");
  const taskLogFooterEl = taskLogModal.querySelector("[data-task-log-footer]");
  const taskLogTaskWrap = taskLogModal.querySelector(
    ".time-task-log-task-wrap",
  );
  const taskLogStartInput = taskLogModal.querySelector(".time-task-log-start");
  const taskLogEndInput = taskLogModal.querySelector(".time-task-log-end");
  const taskLogDateStart = taskLogModal.querySelector(
    ".time-task-log-date-start",
  );
  const taskLogTimeStart = taskLogModal.querySelector(
    ".time-task-log-time-start",
  );
  const taskLogTimeEnd = taskLogModal.querySelector(".time-task-log-time-end");
  const taskLogEndWrap = taskLogModal.querySelector(
    ".time-task-log-datetime-wrap-end",
  );
  const taskLogFeedbackInput = taskLogModal.querySelector(
    ".time-task-log-feedback",
  );
  const taskLogMealDetailSection = taskLogModal.querySelector(
    ".time-task-log-meal-detail-section",
  );
  const taskLogMealDetailInput = taskLogModal.querySelector(
    ".time-task-log-meal-detail-input",
  );
  function updateTaskLogMealDetailVisibility(taskName) {
    const show = AUDIT_UNHEALTHY_MEAL_TASK_NAMES.has((taskName || "").trim());
    if (taskLogMealDetailSection) {
      taskLogMealDetailSection.hidden = !show;
      if (!show && taskLogMealDetailInput) taskLogMealDetailInput.value = "";
    }
  }
  const taskLogTagInput = taskLogModal.querySelector(
    ".time-task-log-tag-input",
  );
  const taskLogTagListEl = taskLogModal.querySelector(
    ".time-task-log-tag-list",
  );
  let taskLogMemoTags = [];

  function renderTaskLogTagPills() {
    if (!taskLogTagListEl) return;
    taskLogTagListEl.innerHTML = "";
    taskLogMemoTags.forEach((tag, i) => {
      const pill = document.createElement("span");
      pill.className = "time-memo-tag-chip time-task-log-tag-pill";
      pill.setAttribute("data-tag", tag);
      pill.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(tag)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
      pill
        .querySelector(".time-memo-tag-chip-remove")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          taskLogMemoTags = taskLogMemoTags.filter((_, idx) => idx !== i);
          renderTaskLogTagPills();
        });
      taskLogTagListEl.appendChild(pill);
    });
  }

  taskLogTagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      if (e.isComposing) return;
      e.preventDefault();
      const val = (taskLogTagInput?.value || "").trim().replace(/^#/, "");
      if (val && !taskLogMemoTags.includes(val)) {
        taskLogMemoTags.push(val);
        renderTaskLogTagPills();
        if (taskLogTagInput) taskLogTagInput.value = "";
      }
    }
  });

  /* 메모 + 버튼 → 내부 모달 (레거시, 미사용) */
  const taskLogMemoAddBtn = taskLogModal.querySelector(
    ".time-task-log-memo-add-btn",
  );
  const taskLogMemoInnerModal = taskLogModal.querySelector(
    ".time-task-log-memo-inner-modal",
  );
  const taskLogMemoInnerBackdrop = taskLogModal.querySelector(
    ".time-task-log-memo-inner-backdrop",
  );
  const taskLogMemoInnerInput = taskLogModal.querySelector(
    ".time-task-log-memo-inner-input",
  );
  const taskLogMemoInnerTagInput = taskLogModal.querySelector(
    ".time-task-log-memo-inner-tag-input",
  );
  const taskLogMemoInnerTagList = taskLogModal.querySelector(
    ".time-task-log-memo-inner-tag-list",
  );
  const taskLogMemoInnerCancel = taskLogModal.querySelector(
    ".time-task-log-memo-inner-cancel",
  );
  const taskLogMemoInnerAdd = taskLogModal.querySelector(
    ".time-task-log-memo-inner-add",
  );

  let taskLogMemoModalTags = [];

  function renderMemoModalTagPills() {
    if (!taskLogMemoInnerTagList) return;
    taskLogMemoInnerTagList.innerHTML = "";
    taskLogMemoModalTags.forEach((tag, i) => {
      const pill = document.createElement("span");
      pill.className = "time-memo-tag-chip time-task-log-tag-pill";
      pill.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(tag)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
      pill
        .querySelector(".time-memo-tag-chip-remove")
        ?.addEventListener("click", () => {
          taskLogMemoModalTags = taskLogMemoModalTags.filter(
            (_, idx) => idx !== i,
          );
          renderMemoModalTagPills();
        });
      taskLogMemoInnerTagList.appendChild(pill);
    });
  }

  function openMemoInnerModal() {
    if (taskLogMemoInnerModal) taskLogMemoInnerModal.hidden = false;
    if (taskLogMemoInnerInput)
      taskLogMemoInnerInput.value = taskLogFeedbackInput?.value || "";
    taskLogMemoModalTags = taskLogMemoTags.slice();
    renderMemoModalTagPills();
    if (taskLogMemoInnerTagInput) taskLogMemoInnerTagInput.value = "";
    taskLogMemoInnerInput?.focus();
  }

  function closeMemoInnerModal() {
    if (taskLogMemoInnerModal) taskLogMemoInnerModal.hidden = true;
  }

  taskLogMemoAddBtn?.addEventListener("click", openMemoInnerModal);
  taskLogMemoInnerCancel?.addEventListener("click", closeMemoInnerModal);

  taskLogMemoInnerAdd?.addEventListener("click", () => {
    if (taskLogFeedbackInput)
      taskLogFeedbackInput.value = (taskLogMemoInnerInput?.value || "").trim();
    taskLogMemoTags = taskLogMemoModalTags.slice();
    renderTaskLogTagPills();
    closeMemoInnerModal();
  });

  taskLogMemoInnerTagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      if (e.isComposing) return;
      e.preventDefault();
      const val = (taskLogMemoInnerTagInput.value || "")
        .trim()
        .replace(/^#/, "");
      if (val && !taskLogMemoModalTags.includes(val)) {
        taskLogMemoModalTags.push(val);
        renderMemoModalTagPills();
        taskLogMemoInnerTagInput.value = "";
      }
    }
  });

  /* 메모 & 태그: 태그 입력 후 Enter → pill 추가 */
  taskLogTagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      if (e.isComposing) return;
      e.preventDefault();
      const val = (taskLogTagInput.value || "").trim().replace(/^#/, "");
      if (val && !taskLogMemoTags.includes(val)) {
        taskLogMemoTags.push(val);
        renderTaskLogTagPills();
        taskLogTagInput.value = "";
      }
    }
  });

  function formatTaskLogDateOverlayYmd(isoTen) {
    const m = String(isoTen || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return `${m[1]}.${m[2]}.${m[3]}`;
  }

  function syncTaskLogDateOverlay() {
    if (!taskLogDateStart) return;
    const v = (taskLogDateStart.value || "").trim().slice(0, 10);
    const has = /^\d{4}-\d{2}-\d{2}$/.test(v);
    taskLogDateStart.classList.toggle("time-task-log-date-has-value", has);
    const wrap = taskLogDateStart.closest(".time-task-log-date-native-wrap");
    if (wrap?.classList) {
      wrap.classList.toggle("time-task-log-date-native-wrap--has-value", has);
    }
    const ov = wrap?.querySelector?.(".time-task-log-date-overlay");
    if (ov) ov.textContent = has ? formatTaskLogDateOverlayYmd(v) : "";
  }

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

  /**
   * 기록일 YYYY-MM-DD — 모바일·PWA(WebKit)에서 type=date 값이 비는 경우가 있어
   * 숨은 시작값에서 날짜를 복구해 마감 hidden 이 비지 않게 함.
   */
  function taskLogResolveYmdForSync() {
    const fromDateInput = (taskLogDateStart?.value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromDateInput)) return fromDateInput;
    const fromStartHidden = parseDateFromDateTime(
      String(taskLogStartInput?.value || "").trim(),
    );
    if (fromStartHidden) return fromStartHidden;
    /* 모바일 WebKit: date 인풋 value가 비어도 마감 시각만 맞추려면 필터 구간 기준일이라도 필요 */
    return pickYmdFromFilter(startDateInput.value, filterStartDate);
  }

  function syncStartToHidden() {
    let date = (taskLogDateStart?.value || "").trim();
    const time = normalizeHhMm(taskLogTimeStart?.value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const prevHidden = String(taskLogStartInput?.value || "").trim();
      date =
        parseDateFromDateTime(prevHidden) ||
        (time
          ? pickYmdFromFilter(startDateInput.value, filterStartDate)
          : "");
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
  }

  function syncEndToHidden() {
    const date = taskLogResolveYmdForSync();
    const time = normalizeHhMm(taskLogTimeEnd?.value || "");
    if (date && time) {
      taskLogEndInput.value = `${date}T${time}`;
      if (
        taskLogDateStart &&
        !(String(taskLogDateStart.value || "").trim()) &&
        /^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        taskLogDateStart.value = date;
      }
    } else {
      taskLogEndInput.value = "";
    }
    updateEndTimeClearVisibility();
    syncTaskLogDateOverlay();
  }

  function setStartFromDatetime(dtStr) {
    if (!dtStr || typeof dtStr !== "string") {
      taskLogDateStart.value = "";
      taskLogTimeStart.value = "";
      syncStartToHidden();
      syncTaskLogDateOverlay();
      return;
    }
    const s = dtStr.trim();
    const m = s.match(
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s](\d{1,2}):(\d{2})/,
    );
    const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    const timeMatch = s.match(/[T\s](\d{1,2}):(\d{2})/);
    let dateStr = "";
    if (m) {
      dateStr = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
      taskLogTimeStart.value = `${String(parseInt(m[4], 10)).padStart(2, "0")}:${m[5]}`;
    } else if (m2 && timeMatch) {
      dateStr = `${m2[1]}-${String(m2[2]).padStart(2, "0")}-${String(m2[3]).padStart(2, "0")}`;
      taskLogTimeStart.value = `${String(parseInt(timeMatch[1], 10)).padStart(2, "0")}:${timeMatch[2]}`;
    } else if (m2) {
      dateStr = `${m2[1]}-${String(m2[2]).padStart(2, "0")}-${String(m2[3]).padStart(2, "0")}`;
      taskLogTimeStart.value = "";
    } else {
      taskLogTimeStart.value = "";
    }
    taskLogDateStart.value = dateStr;
    syncStartToHidden();
  }

  function setEndFromDatetime(dtStr) {
    if (!dtStr || typeof dtStr !== "string") {
      taskLogTimeEnd.value = "";
      syncEndToHidden();
      return;
    }
    const m = dtStr.match(/[T\s](\d{1,2}):(\d{2})/);
    if (m) {
      taskLogTimeEnd.value = `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
    } else {
      taskLogTimeEnd.value = "";
    }
    syncEndToHidden();
  }

  function updateEndTimeClearVisibility() {
    const hasValue = (taskLogEndInput.value || "").trim().length > 0;
    taskLogEndWrap?.classList.toggle("has-value", hasValue);
  }

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
    if (e.key === ":" && e.target.value.includes(":")) {
      e.preventDefault();
      return;
    }
    if (!/^[\d:]$/.test(e.key)) e.preventDefault();
  };

  const filterPastedTime = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData("text") || "").replace(
      /[^\d:]/g,
      "",
    );
    const input = e.target;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const current = input.value;
    const newVal = current.slice(0, start) + pasted + current.slice(end);
    input.value = newVal;
    input.setSelectionRange(start + pasted.length, start + pasted.length);
  };

  const taskLogFocusOutTargetIsTimeAdjustBtn = (ev) =>
    !!ev.relatedTarget?.closest?.(".time-task-log-time-adjust-btns");

  [taskLogDateStart, taskLogTimeStart].forEach((el) => {
    el?.addEventListener("change", () => {
      syncStartToHidden();
      syncEndToHidden();
      const tn = taskLogTaskDropdown?._getValue?.() || "";
      if (tn) refreshKpiTodosInLogModal(tn);
    });
    el?.addEventListener("focusout", (ev) => {
      const skipEndSync = taskLogFocusOutTargetIsTimeAdjustBtn(ev);
      if (el === taskLogTimeStart) {
        const preformatted =
          autoFormatDigitsToHhMm(taskLogTimeStart.value) ||
          taskLogTimeStart.value;
        taskLogTimeStart.value = normalizeHhMm(preformatted) || preformatted;
      }
      syncStartToHidden();
      if (!skipEndSync) syncEndToHidden();
    });
  });
  taskLogDateStart?.addEventListener("input", syncTaskLogDateOverlay);
  taskLogTimeStart?.addEventListener("keydown", restrictToTimeChars);
  taskLogTimeStart?.addEventListener("paste", filterPastedTime);

  taskLogTimeEnd?.addEventListener("change", syncEndToHidden);
  taskLogTimeEnd?.addEventListener("focusout", (ev) => {
    if (taskLogFocusOutTargetIsTimeAdjustBtn(ev)) return;
    const preformatted =
      autoFormatDigitsToHhMm(taskLogTimeEnd.value) || taskLogTimeEnd.value;
    taskLogTimeEnd.value = normalizeHhMm(preformatted) || preformatted;
    syncEndToHidden();
  });
  taskLogTimeEnd?.addEventListener("keydown", restrictToTimeChars);
  taskLogTimeEnd?.addEventListener("paste", filterPastedTime);

  let lastFocusedTimeField = "end";
  [taskLogTimeStart, taskLogDateStart].forEach((el) => {
    if (!el) return;
    el.addEventListener("focus", () => {
      lastFocusedTimeField = "start";
    });
  });
  taskLogTimeEnd?.addEventListener("focus", () => {
    lastFocusedTimeField = "end";
  });

  let taskLogEditExclude = null;

  function setTaskLogQuickAdjustActive(btn) {
    taskLogModal.querySelectorAll(".time-task-log-time-adjust-btn").forEach((b) => {
      b.classList.toggle(
        "time-task-log-time-adjust-active",
        !!(btn && b === btn),
      );
    });
  }

  taskLogModal
    .querySelectorAll(".time-task-log-time-adjust-btn")
    .forEach((btn) => {
      /* 데스크탑: 버튼으로 포커스가 빠지며 blur→syncEndToHidden이 먼저 돌아 마감 hidden이 비는 순서 경합 방지 */
      btn.addEventListener("mousedown", (e) => {
        if (e.button === 0) e.preventDefault();
      });
      btn.addEventListener("click", () => {
        const endVal = (taskLogTimeEnd?.value || "").trim();
        const endHasTime = endVal && endVal.match(/\d{1,2}:\d{2}/);
        /* 마감이 비어 있는데 날짜/시작만 포커스된 경우 lastFocused가 "start"로 남음 → 지금/마지막/±가 시작에만 들어가던 문제 방지 */
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
          const dateVal = (taskLogDateStart?.value || "").trim();
          const mergedRows = mergeLedgerRowsForDedupe(
            loadTimeRows(),
            Array.isArray(allRowsCache) ? allRowsCache : [],
          );
          const latest = getLatestLedgerHhMmForTaskLogDate(
            dateVal,
            taskLogEditExclude,
            mergedRows,
          );
          if (!latest) {
            showToast("해당 날짜에 참고할 기록이 없습니다.", "info");
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
          console.log("[lp-task-log]", "modal_quick_now", {
            targetIsStart,
            lastFocusedTimeField,
            endHasTime: Boolean(endHasTime),
            newTime,
            startVis: (taskLogTimeStart?.value || "").trim(),
            endVis: (taskLogTimeEnd?.value || "").trim(),
            startHidden: (taskLogStartInput?.value || "").trim().slice(0, 30),
            endHidden: (taskLogEndInput?.value || "").trim().slice(0, 30),
          });
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
      });
    });

  const taskLogExpenseAddBtn = taskLogModal.querySelector(
    ".time-task-log-expense-add-btn",
  );
  const taskLogExpenseInnerModal = taskLogModal.querySelector(
    ".time-task-log-expense-inner-modal",
  );
  const taskLogExpenseInnerBackdrop = taskLogModal.querySelector(
    ".time-task-log-expense-inner-backdrop",
  );
  const taskLogExpenseNameInput = taskLogModal.querySelector(
    ".time-task-log-expense-name",
  );
  const taskLogExpenseClassificationWrap = taskLogModal.querySelector(
    ".time-task-log-expense-classification-wrap",
  );
  const taskLogExpenseAmountInput = taskLogModal.querySelector(
    ".time-task-log-expense-amount",
  );
  const taskLogExpenseErrorEl = taskLogModal.querySelector(
    ".time-task-log-expense-error",
  );
  const taskLogExpenseInnerList = taskLogModal.querySelector(
    ".time-task-log-expense-added-list",
  );
  const taskLogExpensePills = taskLogModal.querySelector(
    ".time-task-log-expense-pills",
  );
  const taskLogExpenseInnerAdd = taskLogModal.querySelector(
    ".time-task-log-expense-inner-add-btn",
  );
  const taskLogExpenseInnerClose = taskLogModal.querySelector(
    ".time-task-log-expense-inner-close",
  );
  const taskLogTodoAddBtn = taskLogModal.querySelector(
    ".time-task-log-todo-add-btn",
  );
  const taskLogTodoPills = taskLogModal.querySelector(
    ".time-task-log-todo-pills",
  );
  const taskLogTodoInnerModal = taskLogModal.querySelector(
    ".time-task-log-todo-inner-modal",
  );
  const taskLogTodoCategoryWrap = taskLogModal.querySelector(
    ".time-task-log-todo-category-wrap",
  );
  const taskLogTodoInnerName = taskLogModal.querySelector(
    ".time-task-log-todo-inner-name",
  );
  const taskLogTodoInnerClose = taskLogModal.querySelector(
    ".time-task-log-todo-inner-close",
  );
  const taskLogTodoInnerAdd = taskLogModal.querySelector(
    ".time-task-log-todo-inner-add",
  );
  const taskLogTodoInnerBackdrop = taskLogModal.querySelector(
    ".time-task-log-todo-inner-backdrop",
  );
  const taskLogKpiTodosSection = taskLogModal.querySelector(
    ".time-task-log-kpi-todos-section",
  );
  const taskLogKpiTodosList = taskLogModal.querySelector(
    ".time-task-log-kpi-todos-list",
  );
  const taskLogDailyTodosSection = taskLogModal.querySelector(
    ".time-task-log-daily-todos-section",
  );
  const taskLogDailyTodosList = taskLogModal.querySelector(
    ".time-task-log-daily-todos-list",
  );
  const taskLogSubmitBtn = taskLogModal.querySelector(".time-task-log-submit");
  const taskLogCloseBtn = taskLogModal.querySelector(
    ".time-task-setup-panel .time-task-setup-close",
  );

  /* 아코디언: 한 번에 하나만 열림, 열린 걸 다시 누르면 닫힘 */
  taskLogModal
    .querySelectorAll(".time-task-log-accordion-header")
    .forEach((header) => {
      header.addEventListener("click", (e) => {
        if (e.target.closest("label")) return;
        const item = header.closest(".time-task-log-accordion-item");
        if (!item) return;
        const body = item.querySelector(".time-task-log-accordion-body");
        const chevron = item.querySelector(".time-task-log-accordion-chevron");
        const isExpanded = item.classList.contains(
          "time-task-log-accordion-expanded",
        );
        if (isExpanded) {
          item.classList.remove("time-task-log-accordion-expanded");
          header.setAttribute("aria-expanded", "false");
          if (chevron) chevron.textContent = "▶";
          if (body) body.hidden = true;
        } else {
          taskLogModal
            .querySelectorAll(".time-task-log-accordion-item")
            .forEach((other) => {
              if (other === item) return;
              other.classList.remove("time-task-log-accordion-expanded");
              const otherHeader = other.querySelector(
                ".time-task-log-accordion-header",
              );
              const otherBody = other.querySelector(
                ".time-task-log-accordion-body",
              );
              const otherChevron = other.querySelector(
                ".time-task-log-accordion-chevron",
              );
              if (otherHeader)
                otherHeader.setAttribute("aria-expanded", "false");
              if (otherBody) otherBody.hidden = true;
              if (otherChevron) otherChevron.textContent = "▶";
            });
          item.classList.add("time-task-log-accordion-expanded");
          header.setAttribute("aria-expanded", "true");
          if (chevron) chevron.textContent = "▼";
          if (body) body.hidden = false;
          requestAnimationFrame(() => {
            item.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
      });
    });
  taskLogModal
    .querySelectorAll(
      ".time-task-log-accordion-item:not(.time-task-log-accordion-expanded) .time-task-log-accordion-body",
    )
    .forEach((body) => {
      body.hidden = true;
    });
  taskLogModal
    .querySelectorAll(
      ".time-task-log-accordion-item:not(.time-task-log-accordion-expanded) .time-task-log-accordion-chevron",
    )
    .forEach((chevron) => {
      chevron.textContent = "▶";
    });

  let taskLogTaskDropdown = null;
  let taskLogAddContext = null;
  let taskLogEditTr = null;
  let pendingEditStartTime = "";

  function buildTaskDropdown() {
    const LEDGER_BUCKET_CHIPS = [
      { id: "dream", label: "꿈" },
      { id: "happiness", label: "행복" },
      { id: "sideincome", label: "부수입" },
      { id: "health", label: "건강" },
      { id: "nonproductive", label: "비생산" },
      { id: "other", label: "그외" },
    ];

    function timeLedgerTaskLogPickerBucket(t) {
      let prod = String(t?.productivity ?? "").trim().toLowerCase();
      if (!prod) {
        prod = String(
          getProductivityFromCategory(String(t?.category ?? "").trim()) ||
            "",
        ).toLowerCase();
      }
      if (prod === "nonproductive") return "nonproductive";
      if (prod === "other") return "other";
      const cat = String(t?.category ?? "").trim().toLowerCase();
      if (cat === "dream") return "dream";
      if (cat === "happiness") return "happiness";
      if (cat === "sideincome") return "sideincome";
      if (cat === "health") return "health";
      return "other";
    }

    const wrap = document.createElement("div");
    wrap.className = "time-task-log-task-dropdown";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "time-task-log-task-dropdown-trigger";
    trigger.textContent = "과제를 선택하세요";
    const panel = document.createElement("div");
    panel.className =
      "time-task-log-task-dropdown-panel time-task-log-task-dropdown-panel--ledger-buckets";
    panel.hidden = true;
    let value = "";
    let searchQuery = "";
    let pickerBucket = "dream";

    function renderOptions(container, filter) {
      container.innerHTML = "";
      const q = (filter || "").trim().toLowerCase();
      const allTasks = getFullTaskOptions();
      let tasks = allTasks.filter((t) => !(t.name || "").includes(" > "));
      if (!q) {
        tasks = tasks.filter(
          (t) => timeLedgerTaskLogPickerBucket(t) === pickerBucket,
        );
      }
      if (q) {
        tasks = tasks.filter((t) => (t.name || "").toLowerCase().includes(q));
      }
      tasks.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
      tasks.forEach((t) => {
        const row = document.createElement("div");
        row.className = "time-task-log-task-dropdown-option";
        const prod = (
          t.productivity ||
          getProductivityFromCategory(t.category) ||
          "productive"
        ).trim();
        const barClass =
          prod === "productive"
            ? "time-task-prod-bar time-task-prod-bar--productive"
            : prod === "nonproductive"
              ? "time-task-prod-bar time-task-prod-bar--nonproductive"
              : "time-task-prod-bar time-task-prod-bar--other";
        const bar = document.createElement("span");
        bar.className = barClass;
        bar.setAttribute("aria-hidden", "true");
        const textWrap = document.createElement("span");
        textWrap.className = "time-task-log-task-dropdown-option-text";
        const label = document.createElement("span");
        label.className = "time-task-log-task-dropdown-option-label";
        label.textContent = t.name || "";
        textWrap.appendChild(label);
        appendTaskDropdownBadges(textWrap, t);
        row.appendChild(bar);
        row.appendChild(textWrap);
        const closePanelAndSelect = () => {
          value = t.name || "";
          trigger.textContent = value || "과제를 선택하세요";
          panel.hidden = true;
          onTaskSelectedForLog(value);
        };
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          closePanelAndSelect();
        });
        row.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          closePanelAndSelect();
        });
        container.appendChild(row);
      });
    }

    function renderPanel() {
      panel.innerHTML = "";
      let optionsContainer = null;

      const searchWrap = document.createElement("div");
      searchWrap.className = "time-task-log-task-dropdown-search-wrap";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "과제 검색...";
      searchInput.className = "time-task-log-task-dropdown-search";
      searchInput.value = searchQuery;
      searchInput.setAttribute("autocomplete", "off");
      searchWrap.appendChild(searchInput);
      panel.appendChild(searchWrap);

      const chipsWrap = document.createElement("div");
      chipsWrap.className = "time-task-log-task-dropdown-buckets";
      chipsWrap.setAttribute("role", "tablist");
      chipsWrap.setAttribute("aria-label", "과제 구역");
      LEDGER_BUCKET_CHIPS.forEach(({ id, label: chipLabel }) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "time-task-log-task-dropdown-bucket";
        b.dataset.bucket = id;
        b.textContent = chipLabel;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", id === pickerBucket ? "true" : "false");
        if (id === pickerBucket) b.classList.add("is-active");
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          pickerBucket = id;
          chipsWrap.querySelectorAll(".time-task-log-task-dropdown-bucket").forEach((x) => {
            const on = x.dataset.bucket === id;
            x.classList.toggle("is-active", on);
            x.setAttribute("aria-selected", on ? "true" : "false");
          });
          if (optionsContainer) {
            renderOptions(optionsContainer, searchQuery);
          }
        });
        chipsWrap.appendChild(b);
      });
      panel.appendChild(chipsWrap);

      optionsContainer = document.createElement("div");
      optionsContainer.className = "time-task-log-task-dropdown-options";
      panel.appendChild(optionsContainer);
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value.trim();
        renderOptions(optionsContainer, searchQuery);
      });
      searchInput.addEventListener("click", (e) => e.stopPropagation());
      searchInput.addEventListener("keydown", (e) => e.stopPropagation());
      renderOptions(optionsContainer, searchQuery);
    }

    trigger.addEventListener("click", () => {
      searchQuery = "";
      pickerBucket = "dream";
      renderPanel();
      panel.hidden = !panel.hidden;
      if (!panel.hidden)
        panel.querySelector(".time-task-log-task-dropdown-search")?.focus();
    });
    const closePanelOnOutside = (e) => {
      if (!wrap.contains(e.target)) {
        panel.hidden = true;
      }
    };
    document.addEventListener("mousedown", closePanelOnOutside, {
      capture: true,
      signal,
    });
    document.addEventListener("touchstart", closePanelOnOutside, {
      capture: true,
      signal,
    });
    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    wrap._getValue = () => value;
    wrap._setValue = (v) => {
      value = v || "";
      trigger.textContent = value || "과제를 선택하세요";
      onTaskSelectedForLog(value);
    };
    return wrap;
  }

  const taskLogPickerTitle = taskLogPickerWrap.querySelector(
    ".time-datetime-picker-title",
  );

  function createDateTimePickerModal(getOtherValue, onConfirm) {
    const wrap = taskLogPickerWrap;
    const colDate = wrap.querySelector('[data-col="date"]');
    const colAmpm = wrap.querySelector('[data-col="ampm"]');
    const colHour = wrap.querySelector('[data-col="hour"]');
    const colMinute = wrap.querySelector('[data-col="minute"]');
    const confirmBtn = wrap.querySelector(".time-datetime-picker-confirm");
    let currentD = new Date();
    let fieldType = "start";
    let lastEndTime = null;
    let lockedDate = null;
    let skipScrollSync = false;

    const AMPM = ["오전", "오후"];
    const HOURS_AM = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const HOURS_PM = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    const MINUTES = Array.from({ length: 60 }, (_, i) => i);

    function toValue(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const h = d.getHours();
      const min = d.getMinutes();
      const ampm = h < 12 ? 0 : 1;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${y}-${m}-${day}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }

    function parseValue(str) {
      if (!str || typeof str !== "string") return null;
      const m = str.match(
        /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s]+(\d{1,2}):(\d{2})/,
      );
      if (m) {
        const [, y, mo, d, h, min] = m;
        return new Date(
          parseInt(y),
          parseInt(mo) - 1,
          parseInt(d),
          parseInt(h),
          parseInt(min),
          0,
          0,
        );
      }
      const m2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (m2) {
        const [, y, mo, d] = m2;
        return new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), 0, 0, 0, 0);
      }
      return null;
    }

    function enforceLockedDate() {
      if (fieldType !== "end" || !lockedDate) return;
      const ld = new Date(lockedDate);
      ld.setHours(0, 0, 0, 0);
      const cd = new Date(currentD);
      const currentDayStart = new Date(
        cd.getFullYear(),
        cd.getMonth(),
        cd.getDate(),
      );
      if (currentDayStart.getTime() !== ld.getTime()) {
        if (cd > ld) {
          currentD.setFullYear(ld.getFullYear(), ld.getMonth(), ld.getDate());
          currentD.setHours(23, 59, 0, 0);
        } else {
          currentD.setFullYear(ld.getFullYear(), ld.getMonth(), ld.getDate());
          currentD.setHours(0, 0, 0, 0);
        }
      }
    }

    function renderWheels() {
      const dates = [];
      const base = new Date(currentD);
      base.setHours(0, 0, 0, 0);
      for (let i = -14; i <= 14; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        dates.push(d);
      }
      const ampmIdx = currentD.getHours() < 12 ? 0 : 1;
      const hour24 = currentD.getHours();
      const hoursArr = ampmIdx === 0 ? HOURS_AM : HOURS_PM;
      const min = currentD.getMinutes();

      function scrollOptionToCenter(container, element) {
        const targetY =
          element.offsetTop +
          element.offsetHeight / 2 -
          container.clientHeight / 2;
        container.scrollTop = Math.max(
          0,
          Math.min(targetY, container.scrollHeight - container.clientHeight),
        );
      }

      function renderColumn(container, items, selectedVal, format, addSpacers) {
        container.innerHTML = "";
        if (addSpacers) {
          const spacer = document.createElement("div");
          spacer.className = "time-datetime-picker-spacer";
          container.appendChild(spacer);
        }
        items.forEach((item) => {
          const div = document.createElement("div");
          div.className = "time-datetime-picker-option";
          div.textContent = typeof format === "function" ? format(item) : item;
          div.dataset.value = String(
            typeof item === "object"
              ? item instanceof Date
                ? item.getTime()
                : item
              : item,
          );
          if (String(selectedVal) === div.dataset.value)
            div.classList.add("selected");
          div.addEventListener("click", () => {
            container
              .querySelectorAll(".time-datetime-picker-option")
              .forEach((o) => o.classList.remove("selected"));
            div.classList.add("selected");
            const needsScroll = container !== colAmpm;
            if (item instanceof Date) {
              currentD.setFullYear(
                item.getFullYear(),
                item.getMonth(),
                item.getDate(),
              );
            } else if (container === colAmpm) {
              const h = currentD.getHours();
              if (item === "오후" && h < 12) currentD.setHours(h + 12);
              else if (item === "오전" && h >= 12) currentD.setHours(h - 12);
              renderWheels();
            } else if (container === colHour) {
              currentD.setHours(item, currentD.getMinutes());
            } else if (container === colMinute) {
              currentD.setMinutes(item);
            }
            updateDisplay();
            if (needsScroll)
              requestAnimationFrame(() => scrollOptionToCenter(container, div));
          });
          container.appendChild(div);
        });
        if (addSpacers) {
          const spacer = document.createElement("div");
          spacer.className = "time-datetime-picker-spacer";
          container.appendChild(spacer);
        }
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const selDate = new Date(
        currentD.getFullYear(),
        currentD.getMonth(),
        currentD.getDate(),
      );
      function formatDateItem(d) {
        const dStart = new Date(d);
        dStart.setHours(0, 0, 0, 0);
        if (dStart.getTime() === todayStart.getTime()) return "오늘";
        const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
        return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekdays[d.getDay()]}`;
      }
      if (fieldType === "end") {
        colDate.style.display = "none";
      } else {
        colDate.style.display = "";
        renderColumn(colDate, dates, selDate.getTime(), formatDateItem, true);
      }
      renderColumn(colAmpm, AMPM, AMPM[ampmIdx], null, true);
      renderColumn(
        colHour,
        hoursArr,
        hour24,
        (h) => String(h).padStart(2, "0"),
        true,
      );
      renderColumn(
        colMinute,
        MINUTES,
        min,
        (m) => String(m).padStart(2, "0"),
        true,
      );

      const scrollToSelected = () => {
        [colDate, colAmpm, colHour, colMinute].forEach((col) => {
          const sel = col.querySelector(
            ".time-datetime-picker-option.selected",
          );
          if (sel) {
            sel.scrollIntoView({
              block: "center",
              inline: "nearest",
              behavior: "auto",
            });
          }
        });
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToSelected();
        });
      });
      setTimeout(scrollToSelected, 50);
    }

    function getCenteredOption(col) {
      const opts = col.querySelectorAll(".time-datetime-picker-option");
      if (!opts.length) return null;
      const centerY = col.scrollTop + col.clientHeight / 2;
      let best = opts[0];
      let bestDist = Infinity;
      opts.forEach((o) => {
        const oCenter = o.offsetTop + o.offsetHeight / 2;
        const d = Math.abs(oCenter - centerY);
        if (d < bestDist) {
          bestDist = d;
          best = o;
        }
      });
      return best;
    }

    function applyValueFromCenteredOption(col, option) {
      const val = option.dataset.value;
      if (col === colDate) {
        const t = parseInt(val, 10);
        if (!isNaN(t)) {
          const d = new Date(t);
          currentD.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        }
      } else if (col === colAmpm) {
        const h = currentD.getHours();
        if (val === "오후" && h < 12) currentD.setHours(h + 12);
        else if (val === "오전" && h >= 12) currentD.setHours(h - 12);
      } else if (col === colHour) {
        const h = parseInt(val, 10);
        if (!isNaN(h)) currentD.setHours(h, currentD.getMinutes());
      } else if (col === colMinute) {
        const m = parseInt(val, 10);
        if (!isNaN(m)) currentD.setMinutes(m);
      }
    }

    function updateDisplay() {
      onConfirm?.(toValue(currentD));
    }

    function syncSelectionFromScroll(col) {
      if (skipScrollSync) return;
      const centered = getCenteredOption(col);
      if (!centered) return;
      col
        .querySelectorAll(".time-datetime-picker-option")
        .forEach((o) => o.classList.remove("selected"));
      centered.classList.add("selected");
      const prevAmpm = currentD.getHours() < 12 ? "오전" : "오후";
      applyValueFromCenteredOption(col, centered);
      if (col === colAmpm) {
        const newAmpm = currentD.getHours() < 12 ? "오전" : "오후";
        if (prevAmpm !== newAmpm) renderWheels();
      }
      updateDisplay();
    }

    [colDate, colAmpm, colHour, colMinute].forEach((col) => {
      col.addEventListener("scroll", () => syncSelectionFromScroll(col));
    });

    function applyOffset(mins) {
      currentD.setTime(currentD.getTime() + mins * 60 * 1000);
      enforceLockedDate();
      renderWheels();
      updateDisplay();
    }

    wrap.querySelectorAll(".time-datetime-picker-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const offset = btn.dataset.offset;
        const action = btn.dataset.action;
        if (offset) {
          applyOffset(parseInt(offset, 10));
        } else if (action === "now") {
          if (fieldType === "end" && lockedDate) {
            const now = new Date();
            currentD.setHours(now.getHours(), now.getMinutes(), 0, 0);
            enforceLockedDate();
          } else {
            currentD = new Date();
          }
          console.log("[lp-task-log]", "bottom_picker_now", {
            fieldType,
            lockedDateYmd: lockedDate
              ? `${lockedDate.getFullYear()}-${String(lockedDate.getMonth() + 1).padStart(2, "0")}-${String(lockedDate.getDate()).padStart(2, "0")}`
              : null,
          });
          renderWheels();
          updateDisplay();
        } else if (action === "eod") {
          if (fieldType === "end" && lockedDate) {
            currentD.setFullYear(
              lockedDate.getFullYear(),
              lockedDate.getMonth(),
              lockedDate.getDate(),
            );
          }
          currentD.setHours(23, 59, 0, 0);
          enforceLockedDate();
          renderWheels();
          updateDisplay();
        } else if (action === "last" && lastEndTime) {
          const parsed = parseValue(lastEndTime);
          if (parsed) {
            currentD = parsed;
            renderWheels();
            updateDisplay();
          }
        }
      });
    });

    confirmBtn.addEventListener("click", () => {
      onConfirm?.(toValue(currentD));
      wrap.hidden = true;
      const backdrop = wrap
        .closest(".time-task-log-panel")
        ?.querySelector(".time-datetime-picker-backdrop");
      if (backdrop) backdrop.hidden = true;
    });

    return {
      show(initialValue, refDate, field, lastEnd) {
        fieldType = field || "start";
        lastEndTime = lastEnd || null;
        lockedDate = null;
        taskLogPickerTitle.textContent =
          fieldType === "start" ? "시작 시간" : "마감 시간";
        if (fieldType === "end" && refDate) {
          const startParsed = parseValue(refDate);
          if (startParsed) {
            lockedDate = new Date(
              startParsed.getFullYear(),
              startParsed.getMonth(),
              startParsed.getDate(),
            );
            const endParsed = parseValue(initialValue);
            if (endParsed) {
              currentD = new Date(lockedDate);
              currentD.setHours(
                endParsed.getHours(),
                endParsed.getMinutes(),
                0,
                0,
              );
            } else {
              currentD = new Date(startParsed);
              currentD.setMinutes(currentD.getMinutes() + 30);
            }
          } else {
            currentD = new Date();
          }
        } else {
          const parsed = parseValue(initialValue) || refDate || new Date();
          currentD = new Date(parsed);
        }
        skipScrollSync = true;
        renderWheels();
        wrap.hidden = false;
        const backdrop = wrap
          .closest(".time-task-log-panel")
          ?.querySelector(".time-datetime-picker-backdrop");
        if (backdrop) backdrop.hidden = false;
        setTimeout(() => {
          skipScrollSync = false;
        }, 150);
      },
    };
  }

  /** 소비 기록 모달 전용: 소비 분류(지출은 글만) + 결제수단 선택 */
  function buildExpenseClassificationByFlowTypeButtons(
    getFlowType,
    initialValue,
    onUpdate,
  ) {
    const wrap = document.createElement("div");
    wrap.className = "time-task-log-expense-classification-btns";
    const hint = document.createElement("span");
    hint.className = "time-task-log-expense-classification-hint";
    hint.textContent = "큰분류(입금/지출)를 먼저 선택해 주세요.";
    const btnsWrap = document.createElement("div");
    btnsWrap.className = "time-task-log-expense-cls-btns-wrap";
    let value = (initialValue || "").trim();
    let payment = "";
    /** 지출 전용: "all" | "payment" | "done" */
    let expenseStep = "all";

    function renderButtons() {
      const flowType = (getFlowType && getFlowType()) || "";
      btnsWrap.innerHTML = "";
      const isExpense = flowType === "지출";
      const opts = isExpense
        ? EXPENSE_MODAL_CLASSIFICATIONS
        : getClassificationsByFlowType(flowType);
      if (!flowType || opts.length === 0) {
        hint.hidden = false;
        hint.textContent = "큰분류(입금/지출)를 먼저 선택해 주세요.";
        value = "";
        payment = "";
        expenseStep = "all";
        return;
      }
      hint.hidden = true;

      const paymentOptions = getPaymentOptions && getPaymentOptions();

      function makeClsBtn(opt, selected, onClick) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "time-task-log-expense-cls-btn";
        if (selected) btn.classList.add("selected");
        if (opt.color) btn.classList.add(opt.color);
        btn.dataset.label = opt.label;
        const svgInnerPaths =
          isExpense ? "" : (opt.svg || (flowType === "입금" ? BAG_DOLLAR_PATHS_INNER : ""));
        if (svgInnerPaths) {
          btn.classList.add("time-task-log-expense-cls-btn-with-icon");
          btn.innerHTML = `<span class="time-task-log-expense-cls-icon"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svgInnerPaths}</svg></span><span class="time-task-log-expense-cls-label">${escapeHtml(opt.label)}</span>`;
        } else {
          btn.classList.add("time-task-log-expense-cls-btn--text-only");
          btn.innerHTML = `<span class="time-task-log-expense-cls-label">${escapeHtml(opt.label)}</span>`;
        }
        btn.addEventListener("click", onClick);
        return btn;
      }

      if (isExpense && (expenseStep === "payment" || expenseStep === "done") && value) {
        const selectedOpt = EXPENSE_MODAL_CLASSIFICATIONS.find((o) => o.label === value);
        if (selectedOpt) {
          const clsBtn = makeClsBtn(selectedOpt, true, () => {
            expenseStep = "all";
            value = "";
            payment = "";
            renderButtons();
            onUpdate?.("");
          });
          clsBtn.title = "다시 누르면 분류 수정";
          btnsWrap.appendChild(clsBtn);
        }
        (paymentOptions || ["현금", "체크카드", "신용카드"]).forEach((opt) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "time-task-log-expense-payment-btn";
          btn.dataset.payment = opt;
          btn.textContent = opt;
          if (payment === opt) btn.classList.add("selected");
          btn.addEventListener("click", () => {
            payment = opt;
            expenseStep = "done";
            renderButtons();
            onUpdate?.(value);
          });
          btnsWrap.appendChild(btn);
        });
        return;
      }

      const valid = opts.some((o) => o.label === value);
      if (!valid) {
        value = "";
        payment = "";
        expenseStep = "all";
      }
      opts.forEach((opt) => {
        const btn = makeClsBtn(opt, value === opt.label, () => {
          if (isExpense) {
            value = opt.label;
            expenseStep = "payment";
            payment = "";
            renderButtons();
            onUpdate?.(value);
          } else {
            value = value === opt.label ? "" : opt.label;
            btnsWrap
              .querySelectorAll(".time-task-log-expense-cls-btn")
              .forEach((b) =>
                b.classList.toggle("selected", b.dataset.label === value),
              );
            onUpdate?.(value);
          }
        });
        btnsWrap.appendChild(btn);
      });
    }

    wrap.appendChild(hint);
    wrap.appendChild(btnsWrap);
    wrap._getValue = () => value;
    wrap._getPaymentValue = () => payment;
    wrap._setValue = (v) => {
      value = (v || "").trim();
      payment = "";
      expenseStep = "all";
      renderButtons();
    };
    wrap._setFlowType = () => {
      payment = "";
      expenseStep = "all";
      renderButtons();
    };
    renderButtons();
    return wrap;
  }

  /* 소비 기록 모달: 항상 지출만 기록, 큰분류 선택 없음 */
  const expenseClassificationButtons = buildExpenseClassificationByFlowTypeButtons(
    () => "지출",
    "",
    () => {},
  );

  taskLogExpenseClassificationWrap?.appendChild(expenseClassificationButtons);

  function onTaskSelectedForLog(taskName) {
    refreshKpiTodosInLogModal(taskName);
    updateTaskLogMealDetailVisibility(taskName);
  }

  function refreshKpiTodosInLogModal(taskName) {
    const name = (taskName || "").trim();
    if (taskLogKpiTodosSection) {
      taskLogKpiTodosSection.hidden = true;
      if (taskLogKpiTodosList) taskLogKpiTodosList.innerHTML = "";
    }

    if (!taskLogDailyTodosSection || !taskLogDailyTodosList) return;
    const taskLogDailyTodosTitle = taskLogModal.querySelector(
      ".time-task-log-daily-todos-title",
    );
    const DEFAULT_DAILY_TODOS_TITLE = "매일 할일 목록";

    function normalizeTaskLogPickerDateYmd() {
      const raw = (taskLogDateStart?.value || "").trim();
      if (!raw) return "";
      const m = raw.match(/(\d{4})[.\-\s/]*(\d{1,2})[.\-\s/]*(\d{1,2})/);
      if (m)
        return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
      return raw.replace(/\//g, "-").slice(0, 10);
    }

    const dateYmd = normalizeTaskLogPickerDateYmd();
    const dailyInfo = getKpiDailyRepeatInfoByKpiName(name);
    const dietNames = listWorkScheduleDietTypeNamesFromMem();

    if (dailyInfo && dailyInfo.needHabitTracker) {
      if (taskLogDailyTodosTitle)
        taskLogDailyTodosTitle.textContent = DEFAULT_DAILY_TODOS_TITLE;
      taskLogDailyTodosSection.hidden = false;
      taskLogDailyTodosList.innerHTML = "";
      const { storageKey: dailyStorageKey, kpiId: dailyKpiId, dailyTodos } =
        dailyInfo;
      const fromLog =
        dateYmd.length >= 10
          ? getHabitTrackerDailyCompletedForDate(
              dailyStorageKey,
              dailyKpiId,
              dateYmd,
            )
          : [];
      const logCheckedIds = new Set(
        fromLog.map((x) => String(x.id || "").trim()).filter(Boolean),
      );
      dailyTodos.forEach((todo) => {
        const label = document.createElement("label");
        label.className =
          "time-task-log-kpi-todo-row time-task-log-daily-todo-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = logCheckedIds.has(String(todo.id || "").trim());
        checkbox.dataset.todoId = todo.id;
        const span = document.createElement("span");
        span.className = "time-task-log-kpi-todo-text";
        span.textContent = todo.text || "";
        if (checkbox.checked) span.classList.add("is-done");
        label.appendChild(checkbox);
        label.appendChild(span);
        checkbox.addEventListener("change", () => {
          kpiTodoFineTrace("Time.과제기록모달:매일할일체크(저장은 기록 버튼)", {
            todoId: String(todo.id),
            storageKey: dailyStorageKey,
            checked: checkbox.checked,
          });
          const ymd = normalizeTaskLogPickerDateYmd();
          if (ymd.length < 10) return;
          /* KPI 맵은 「기록」 저장 시에만 반영 — X로 닫으면 체크만 무효 */
          span.classList.toggle("is-done", checkbox.checked);
        });
        taskLogDailyTodosList.appendChild(label);
      });
      return;
    }

    if (
      isMealChecklistTaskName(name) &&
      dateYmd.length >= 10 &&
      dietNames.length > 0
    ) {
      if (taskLogDailyTodosTitle)
        taskLogDailyTodosTitle.textContent = "등록한 식단";
      taskLogDailyTodosSection.hidden = false;
      taskLogDailyTodosList.innerHTML = "";
      const saved = getMealChecklistState(dateYmd, name);
      dietNames.forEach((dietLabel) => {
        const label = document.createElement("label");
        label.className =
          "time-task-log-kpi-todo-row time-task-log-daily-todo-row";
        label.dataset.mealChecklist = "1";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !!saved[dietLabel];
        const span = document.createElement("span");
        span.className = "time-task-log-kpi-todo-text";
        span.textContent = dietLabel;
        if (checkbox.checked) span.classList.add("is-done");
        label.appendChild(checkbox);
        label.appendChild(span);
        checkbox.addEventListener("change", () => {
          setMealChecklistItem(dateYmd, name, dietLabel, checkbox.checked);
          span.classList.toggle("is-done", checkbox.checked);
        });
        taskLogDailyTodosList.appendChild(label);
      });
      return;
    }

    taskLogDailyTodosSection.hidden = true;
    taskLogDailyTodosList.innerHTML = "";
    if (taskLogDailyTodosTitle)
      taskLogDailyTodosTitle.textContent = DEFAULT_DAILY_TODOS_TITLE;
  }

  window.addEventListener("work-schedule-saved", () => {
    if (!taskLogModal || taskLogModal.hidden) return;
    const tn = taskLogTaskDropdown?._getValue?.() || "";
    if (tn) refreshKpiTodosInLogModal(tn);
  });

  function setupScoreButtons(container, getValue, setValue) {
    if (!container) return;
    container.querySelectorAll(".time-task-log-score-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.value || "";
        container
          .querySelectorAll(".time-task-log-score-btn")
          .forEach((b) => b.classList.remove("selected"));
        if (getValue() === val) {
          setValue("");
        } else {
          setValue(val);
          btn.classList.add("selected");
        }
      });
    });
  }
  function updateScoreBtnStates(container, value) {
    if (!container) return;
    container.querySelectorAll(".time-task-log-score-btn").forEach((b) => {
      b.classList.toggle("selected", b.dataset.value === value);
    });
  }
  function parseEnergyToValue(val) {
    const s = String(val || "")
      .trim()
      .replace(/%/g, "");
    if (!s) return null;
    const n = parseInt(s.replace(/^\+/, ""), 10);
    if (!isNaN(n) && n >= -50 && n <= 50) return n;
    return null;
  }
  /** 할일 일정탭 리스트(todo-section-tasks)에 이름만 추가. KPI 불필요. */
  function addTodoNameToSection(sectionId, name) {
    const todoName = (name || "").trim();
    if (!todoName) return false;
    const VALID_SECTIONS = [
      "dream",
      "sideincome",
      "happy",
      "health",
    ];
    if (!VALID_SECTIONS.includes(sectionId)) return false;
    try {
      const obj = readSectionTasksObject();
      const arr = Array.isArray(obj[sectionId]) ? obj[sectionId] : [];
      const taskId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "";
      if (!taskId) return false;
      arr.push({
        taskId,
        name: todoName,
        startDate: "",
        dueDate: "",
        startTime: "",
        endTime: "",
        eisenhower: "",
        done: false,
        itemType: "todo",
      });
      obj[sectionId] = arr;
      persistSectionTasksAndSchedule(obj);
      document.dispatchEvent(
        new CustomEvent("todo-braindump-added", { detail: {} }),
      );
      return true;
    } catch (_) {}
    return false;
  }

  const TODO_CATEGORIES = [
    { id: "dream", label: "꿈" },
    { id: "sideincome", label: "부수입" },
    { id: "happy", label: "행복" },
    { id: "health", label: "건강" },
  ];
  let taskLogTodoSelectedCategory = "dream";
  /** 과제 기록 시 추가한 할 일: { categoryLabel, todoName } → "리스트 | 할일이름" 태그로 저장 */
  let taskLogTodoAddedItems = [];

  function addTodoToSection(sectionId, name) {
    return addTodoNameToSection(sectionId, name);
  }

  function updateTodoPills() {
    if (!taskLogTodoPills) return;
    taskLogTodoPills.innerHTML = "";
    taskLogTodoAddedItems.forEach((item, idx) => {
      const pill = document.createElement("span");
      pill.className = "time-task-log-todo-pill time-memo-tag-chip";
      const label =
        [item.categoryLabel, item.todoName].filter(Boolean).join(" | ") || "";
      pill.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(label)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="삭제">&times;</button>`;
      pill
        .querySelector(".time-memo-tag-chip-remove")
        ?.addEventListener("click", (ev) => {
          ev.preventDefault();
          taskLogTodoAddedItems.splice(idx, 1);
          updateTodoPills();
        });
      taskLogTodoPills.appendChild(pill);
    });
  }

  function renderTodoCategoryButtons() {
    if (!taskLogTodoCategoryWrap) return;
    taskLogTodoCategoryWrap.innerHTML = "";
    TODO_CATEGORIES.forEach(({ id, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `time-task-log-todo-category-btn${taskLogTodoSelectedCategory === id ? " selected" : ""}`;
      btn.dataset.category = id;
      btn.textContent = label;
      btn.addEventListener("click", () => {
        taskLogTodoSelectedCategory = id;
        taskLogModal
          .querySelectorAll(".time-task-log-todo-category-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
      taskLogTodoCategoryWrap.appendChild(btn);
    });
  }

  function openTodoInnerModal() {
    taskLogTodoSelectedCategory = "dream";
    renderTodoCategoryButtons();
    if (taskLogTodoInnerName) taskLogTodoInnerName.value = "";
    if (taskLogTodoInnerModal) taskLogTodoInnerModal.hidden = false;
    taskLogTodoInnerName?.focus();
  }

  function closeTodoInnerModal() {
    if (taskLogTodoInnerModal) taskLogTodoInnerModal.hidden = true;
  }

  taskLogTodoAddBtn?.addEventListener("click", openTodoInnerModal);
  taskLogTodoInnerClose?.addEventListener("click", closeTodoInnerModal);

  taskLogExpenseAddBtn?.addEventListener("click", openExpenseInnerModal);
  taskLogExpenseInnerClose?.addEventListener("click", closeExpenseInnerModal);

  taskLogTodoInnerAdd?.addEventListener("click", () => {
    const todoName = (taskLogTodoInnerName?.value || "").trim();
    if (!todoName) return;
    const cat = TODO_CATEGORIES.find(
      (c) => c.id === taskLogTodoSelectedCategory,
    );
    const sectionLabel = cat?.label || "";
    if (addTodoToSection(taskLogTodoSelectedCategory, todoName)) {
      taskLogTodoAddedItems.push({ categoryLabel: sectionLabel, todoName });
      updateTodoPills();
      if (taskLogTodoInnerName) taskLogTodoInnerName.value = "";
      closeTodoInnerModal();
    } else {
      showToast("할 일 추가에 실패했습니다.", "warn");
    }
  });

  /** 소비 모달: 추가한 기록 (가계부와 연동, id로 삭제) */
  let taskLogExpenseAddedItems = [];

  function getExpenseModalDate() {
    const startRaw = (taskLogStartInput?.value || "").trim();
    const parsed = parseDateFromDateTime(startRaw) || startRaw.slice(0, 10);
    return (parsed || new Date().toISOString().slice(0, 10)).replace(
      /\//g,
      "-",
    );
  }

  /** 소비 기록을 방해기록·투두처럼 행 아래 태그(분류 | 가격)로만 표시. 모달 내 목록은 사용하지 않음 */
  function updateExpensePills() {
    if (!taskLogExpensePills) return;
    taskLogExpensePills.innerHTML = "";
    taskLogExpenseAddedItems.forEach((item, idx) => {
      const pill = document.createElement("span");
      pill.className = "time-task-log-expense-pill time-memo-tag-chip";
      const label =
        [item.classification || "", item.amountFormatted || ""]
          .filter(Boolean)
          .join(" | ") || "";
      pill.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(label)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="삭제">&times;</button>`;
      pill
        .querySelector(".time-memo-tag-chip-remove")
        ?.addEventListener("click", (ev) => {
          ev.preventDefault();
          if (item.id) {
            const rows = loadExpenseRows().filter((r) => r.id !== item.id);
            saveExpenseRows(rows);
            window.dispatchEvent(new CustomEvent("asset-expense-transactions-saved"));
          }
          taskLogExpenseAddedItems.splice(idx, 1);
          updateExpensePills();
        });
      taskLogExpensePills.appendChild(pill);
    });
  }

  function updateExpenseInnerList() {
    if (taskLogExpenseInnerList) taskLogExpenseInnerList.innerHTML = "";
    updateExpensePills();
  }

  function openExpenseInnerModal() {
    if (taskLogExpenseInnerModal) taskLogExpenseInnerModal.hidden = false;
    taskLogExpenseNameInput?.focus();
  }

  function closeExpenseInnerModal() {
    if (taskLogExpenseInnerModal) taskLogExpenseInnerModal.hidden = true;
  }

  taskLogExpenseInnerAdd?.addEventListener("click", () => {
    const name = (taskLogExpenseNameInput?.value || "").trim();
    const amountRaw = (taskLogExpenseAmountInput?.value || "")
      .trim()
      .replace(/,/g, "");
    const expenseClassification =
      expenseClassificationButtons._getValue?.() || "";
    const expensePayment =
      expenseClassificationButtons._getPaymentValue?.() || "";
    const classificationToCategory = getClassificationToCategoryMap();
    const expenseCategory = expenseClassification
      ? (classificationToCategory[expenseClassification] || "")
      : "";
    const missing = [];
    if (!expenseClassification) missing.push("소비 분류");
    if (!amountRaw || !parseFloat(amountRaw)) missing.push("금액");
    if (!expensePayment) missing.push("결제수단");
    if (missing.length > 0) {
      if (taskLogExpenseErrorEl) {
        taskLogExpenseErrorEl.textContent =
          "입력 필요: " + missing.join(", ");
        taskLogExpenseErrorEl.hidden = false;
      }
      return;
    }
    if (taskLogExpenseErrorEl) {
      taskLogExpenseErrorEl.textContent = "";
      taskLogExpenseErrorEl.hidden = true;
    }
    const raw = parseFloat(amountRaw) || 0;
    const signed = -Math.abs(raw);
    const amountFormatted = signed.toLocaleString("ko-KR");
    const dateForExpense = getExpenseModalDate();
    const id = newExpenseRowId();
    if (!id) {
      showToast("거래 ID를 만들 수 없습니다. 브라우저를 업데이트해 주세요.", "warn");
      return;
    }
    const row = {
      id,
      name: name || "",
      date: dateForExpense,
      flowType: "지출",
      category: expenseCategory,
      classification: expenseClassification,
      amount: amountFormatted,
      payment: expensePayment,
      memo: "",
    };
    taskLogExpenseAddedItems.push({
      id,
      name: name || "",
      classification: expenseClassification,
      amountFormatted,
    });
    const existingRows = loadExpenseRows();
    existingRows.push(row);
    saveExpenseRows(existingRows);
    lpSaveDebug("방해기록 소비 모달 → 가계부 메모리 추가", {
      expenseId: id,
      date: row.date,
      flowType: row.flowType,
      amount: row.amount,
      memTotal: existingRows.length,
    });
    window.dispatchEvent(new CustomEvent("asset-expense-transactions-saved"));
    updateExpenseInnerList();
    taskLogExpenseNameInput.value = "";
    taskLogExpenseAmountInput.value = "";
    expenseClassificationButtons._setValue?.("");
    expenseClassificationButtons._setFlowType?.();
    closeExpenseInnerModal();
  });

  taskLogExpenseAmountInput?.addEventListener("input", () => {
    const v = taskLogExpenseAmountInput.value;
    const digits = v.replace(/\D/g, "");
    const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (v !== formatted) {
      taskLogExpenseAmountInput.value = formatted;
      taskLogExpenseAmountInput.setSelectionRange(
        formatted.length,
        formatted.length,
      );
    }
  });

  /**
   * 신규 과제 기록 모달: 시작 시각 = 해당 날짜 저장본 중 가장 늦은 시각(종료 있으면 종료, 없으면 시작).
   * '마지막' 버튼과 동일 로직(getLatestLedgerHhMmForTaskLogDate + 디스크·캐시 병합).
   * 해당 날짜 기록이 없으면 그 날짜 기준 00:00.
   */
  function getDefaultStartTime() {
    const dateStr = pickYmdFromFilter(startDateInput.value, filterStartDate);
    const mergedRows = mergeLedgerRowsForDedupe(
      loadTimeRows(),
      Array.isArray(allRowsCache) ? allRowsCache : [],
    );
    const latestHhMm = getLatestLedgerHhMmForTaskLogDate(
      dateStr,
      null,
      mergedRows,
    );
    if (!latestHhMm) return `${dateStr}T00:00`;
    return `${dateStr}T${latestHhMm}`;
  }

  /** 과제설정 모달: 서버 과제 목록만 pull (업서트 없음). 시간 탭 진입 시에도 tabEnter 에서 pull. */
  async function pullTimeLedgerTasksWhenSetupModalOpens() {
    try {
      await pullTimeLedgerTasksFromSupabase();
    } catch (_) {}
    try {
      getFullTaskOptions();
      migrateTimeLogRowsTaskIds();
    } catch (_) {}
  }

  /**
   * 과제 기록/수정 모달: KPI 탭 미방문 상태에서도 매일 할일·식단 유형이 비지 않게 서버와 맞춤.
   * (로컬만 보던 `getKpiDailyRepeatInfoByKpiName` / `listWorkScheduleDietTypeNamesFromMem` 선행 조건)
   */
  async function ensureTaskLogModalCloudData() {
    await Promise.all([
      pullTimeLedgerTasksFromSupabase().catch(() => {}),
      pullKpiMapsForTaskLogModalOpen().catch(() => {}),
      pullWorkScheduleFromSupabase({ includeTypes: true }).catch(() => {}),
    ]);
    try {
      getFullTaskOptions();
      migrateTimeLogRowsTaskIds();
    } catch (_) {}
  }

  /** 기록 모달이 이미 열린 뒤 서버 과제 목록이 도착했을 때 드롭다운·KPI 연동만 맞춤(즉시 열기용). */
  function afterTaskListSyncForTaskLogAddModal() {
    if (!el.isConnected || taskLogModal?.hidden) return;
    const v = (taskLogTaskDropdown?._getValue?.() || "").trim();
    if (v) onTaskSelectedForLog(v);
    else {
      const mainTasks = getFullTaskOptions().filter(
        (t) => !(t.name || "").includes(" > "),
      );
      const first = mainTasks[0]?.name || "";
      if (first) {
        taskLogTaskDropdown?._setValue?.(first);
        onTaskSelectedForLog(first);
      }
    }
  }

  function openTaskLogModal(addContext) {
    /** pull 완료를 기다려 모달을 늦추면(느린망 ~1초) 체감 지연 → 먼저 열고 동기화는 비동기 */
    openTaskLogModalAfterPull(addContext);
    afterTaskListSyncForTaskLogAddModal();
    void ensureTaskLogModalCloudData()
      .catch(() => {})
      .then(() => {
        if (!el.isConnected || taskLogModal.hidden) return;
        afterTaskListSyncForTaskLogAddModal();
      });
  }

  function openTaskLogModalAfterPull(addContext) {
    taskLogAddContext = addContext;
    taskLogEditTr = null;
    taskLogEditExclude = null;
    pendingEditStartTime = "";
    taskLogTitleEl.textContent = "과제 기록";
    taskLogSubmitBtn.textContent = "기록";
    if (taskLogFooterEl) taskLogFooterEl.style.display = "";
    if (taskLogDeleteBtn) taskLogDeleteBtn.hidden = true;
    taskLogModal.hidden = false;
    taskLogModal.style.zIndex = "1002";
    document.body.style.overflow = "hidden";
    closeDateTimePicker();
    const bodyEl = taskLogModal.querySelector(".time-task-setup-body");
    if (bodyEl) bodyEl.scrollTop = 0;
    if (!taskLogTaskDropdown) {
      taskLogTaskDropdown = buildTaskDropdown();
      taskLogTaskWrap.innerHTML = "";
      taskLogTaskWrap.appendChild(taskLogTaskDropdown);
    }
    const taskDropdownPanel = taskLogTaskDropdown?.querySelector(
      ".time-task-log-task-dropdown-panel",
    );
    if (taskDropdownPanel) taskDropdownPanel.hidden = true;
    const mainTasks = getFullTaskOptions().filter(
      (t) => !(t.name || "").includes(" > "),
    );
    const firstTask = mainTasks[0]?.name || "";
    taskLogTaskDropdown._setValue?.(firstTask);
    const defaultStart = getDefaultStartTime();
    setEndFromDatetime("");
    setStartFromDatetime(defaultStart || "");
    requestAnimationFrame(() => {
      setStartFromDatetime(defaultStart || "");
    });
    updateEndTimeClearVisibility();
    if (taskLogFeedbackInput) taskLogFeedbackInput.value = "";
    if (taskLogMealDetailInput) taskLogMealDetailInput.value = "";
    taskLogMemoTags = [];
    renderTaskLogTagPills();
    taskLogExpenseNameInput.value = "";
    expenseClassificationButtons._setValue?.("");
    expenseClassificationButtons._setFlowType?.();
    taskLogExpenseAmountInput.value = "";
    if (taskLogExpenseErrorEl) {
      taskLogExpenseErrorEl.textContent = "";
      taskLogExpenseErrorEl.hidden = true;
    }
    taskLogModal
      .querySelectorAll(".time-task-log-accordion-item")
      .forEach((item) => {
        if (
          !item.classList.contains("time-task-log-accordion-expanded") ||
          item.dataset?.accordion === "expense"
        )
          return;
        item.classList.remove("time-task-log-accordion-expanded");
        const body = item.querySelector(".time-task-log-accordion-body");
        const chevron = item.querySelector(".time-task-log-accordion-chevron");
        const header = item.querySelector(".time-task-log-accordion-header");
        if (body) body.hidden = true;
        if (chevron) chevron.textContent = "▶";
        if (header) header.setAttribute("aria-expanded", "false");
      });
    if (taskLogTodoInnerName) taskLogTodoInnerName.value = "";
    taskLogTodoAddedItems = [];
    if (taskLogTodoPills) taskLogTodoPills.innerHTML = "";
    taskLogExpenseAddedItems = [];
    if (taskLogExpenseInnerList) taskLogExpenseInnerList.innerHTML = "";
    updateExpensePills();
    if (taskLogExpenseInnerModal) taskLogExpenseInnerModal.hidden = true;
    if (taskLogKpiTodosSection) taskLogKpiTodosSection.hidden = true;
    if (taskLogKpiTodosList) taskLogKpiTodosList.innerHTML = "";
    if (firstTask) onTaskSelectedForLog(firstTask);
    setTaskLogQuickAdjustActive(
      taskLogModal.querySelector(".time-task-log-time-adjust-last"),
    );
  }

  function openTaskLogModalForEdit(tr, rowData) {
    const data =
      tr?._rowData && typeof tr._rowData === "object" ? tr._rowData : rowData;
    let startTime = data.startTime || "";
    let endTime = data.endTime || "";
    const rowDateEl = tr?.querySelector(".time-display-date");
    const displayDateStr = (rowDateEl?.textContent || "").trim();
    const recordDate =
      normalizeDateForCompare(displayDateStr) ||
      normalizeDateForCompare(data.date || "");

    if (recordDate) {
      if (startTime) {
        const startDate = parseDateFromDateTime(startTime);
        if (!startDate || normalizeDateForCompare(startDate) !== recordDate) {
          const m = startTime.match(/[T\s](\d{1,2}):(\d{2})/);
          const [, h = "00", min = "00"] = m || [];
          startTime = `${recordDate}T${String(h).padStart(2, "0")}:${min}`;
        }
      } else {
        startTime = `${recordDate}T00:00`;
      }
      if (endTime) {
        const endDate = parseDateFromDateTime(endTime);
        const normEnd = normalizeDateForCompare(endDate);
        if (!normEnd || normEnd !== recordDate) {
          const m = endTime.match(/[T\s](\d{1,2}):(\d{2})/);
          const [, h = "00", min = "00"] = m || [];
          endTime = `${recordDate}T${String(h).padStart(2, "0")}:${min}`;
        }
      }
    }

    taskLogAddContext = null;
    taskLogEditTr = tr;
    const recKey =
      recordDate ||
      normalizeDateForCompare(data.date || "") ||
      String(data.date || "")
        .trim()
        .replace(/\//g, "-")
        .slice(0, 10);
    taskLogEditExclude = {
      id: String(data.id || "").trim(),
      composite: `${recKey}|${(data.taskName || "").trim()}|${(data.startTime || "").trim()}`,
    };
    pendingEditStartTime = startTime || "";
    taskLogTitleEl.textContent = "과제 수정";
    taskLogSubmitBtn.textContent = "수정";
    if (taskLogFooterEl) taskLogFooterEl.style.display = "";
    if (taskLogDeleteBtn) taskLogDeleteBtn.hidden = false;
    setTaskLogQuickAdjustActive(null);
    taskLogModal.hidden = false;
    taskLogModal.style.zIndex = "1002";
    document.body.style.overflow = "hidden";
    closeDateTimePicker();
    const bodyEl = taskLogModal.querySelector(".time-task-setup-body");
    if (bodyEl) bodyEl.scrollTop = 0;
    if (!taskLogTaskDropdown) {
      taskLogTaskDropdown = buildTaskDropdown();
      taskLogTaskWrap.innerHTML = "";
      taskLogTaskWrap.appendChild(taskLogTaskDropdown);
    }
    taskLogTaskDropdown._setValue?.(data.taskName || "");
    setStartFromDatetime(startTime || "");
    setEndFromDatetime(endTime || "");
    updateEndTimeClearVisibility();
    let mealDetailVal = String(data.mealDetail || "").trim();
    let feedbackRaw = String(data.feedback || "").trim();
    const tnForMemo = (data.taskName || "").trim();
    if (AUDIT_UNHEALTHY_MEAL_TASK_NAMES.has(tnForMemo)) {
      if (!mealDetailVal && feedbackRaw.startsWith("[식단] ")) {
        const sp = splitUnhealthyMealMemoFromDb(feedbackRaw);
        mealDetailVal = sp.mealDetail;
        feedbackRaw = sp.feedback;
      }
    }
    const memoOnly = feedbackRaw.replace(/#[^\s#]+/g, "").trim();
    if (taskLogMealDetailInput) taskLogMealDetailInput.value = mealDetailVal;
    if (taskLogFeedbackInput) taskLogFeedbackInput.value = memoOnly;
    const rawMemoTagsForEdit = Array.isArray(data.memoTags)
      ? [...data.memoTags]
      : parseTagsFromFeedback(feedbackRaw);
    const splitEdit = splitLedgerMemoTags(rawMemoTagsForEdit);
    const mealNamesFromRow = [];
    taskLogMemoTags = splitEdit.userTags.filter((t) => {
      const s = String(t ?? "").trim();
      if (isWorkScheduleDietLedgerMemoTag(s)) {
        const n = dietNameFromLedgerMemoTag(s);
        if (n) mealNamesFromRow.push(n);
        return false;
      }
      return true;
    });
    renderTaskLogTagPills();
    const fromLinkedField = Array.isArray(data.linkedExpenseIds) ? data.linkedExpenseIds : [];
    const mergedExpenseIds = [
      ...new Set([...splitEdit.expenseIds, ...fromLinkedField].map((id) => String(id || "").trim())),
    ].filter(Boolean);
    taskLogExpenseAddedItems = ledgerExpenseAddedItemsFromIds(mergedExpenseIds);
    updateExpensePills();
    taskLogTodoAddedItems = [];
    if (typeof updateTodoPills === "function") updateTodoPills();
    if (taskLogTagInput) taskLogTagInput.value = "";
    taskLogExpenseNameInput.value = "";
    expenseClassificationButtons._setValue?.("");
    expenseClassificationButtons._setFlowType?.();
    taskLogExpenseAmountInput.value = "";
    const ymdEdit = String(recKey || "")
      .trim()
      .replace(/\//g, "-")
      .slice(0, 10);
    const tnSync = (data.taskName || "").trim();
    if (isMealChecklistTaskName(tnSync) && ymdEdit.length >= 10) {
      const dietList = listWorkScheduleDietTypeNamesFromMem();
      const picked = new Set(mealNamesFromRow);
      for (const d of dietList) {
        setMealChecklistItem(ymdEdit, tnSync, d, picked.has(d));
      }
    }
    refreshKpiTodosInLogModal(tnSync);
    const lockedName = (data.taskName || "").trim();
    if (taskLogTaskDropdown && lockedName) {
      taskLogTaskDropdown._setValue?.(lockedName);
      refreshKpiTodosInLogModal(lockedName);
    }
    updateTaskLogMealDetailVisibility((data.taskName || "").trim());
    void ensureTaskLogModalCloudData()
      .catch(() => {})
      .then(() => {
        if (!el.isConnected || taskLogModal.hidden) return;
        try {
          getFullTaskOptions();
          migrateTimeLogRowsTaskIds();
        } catch (_) {}
        const tnPost = (data.taskName || "").trim();
        if (isMealChecklistTaskName(tnPost) && ymdEdit.length >= 10) {
          const dietList = listWorkScheduleDietTypeNamesFromMem();
          const picked = new Set(mealNamesFromRow);
          for (const d of dietList) {
            setMealChecklistItem(ymdEdit, tnPost, d, picked.has(d));
          }
        }
        refreshKpiTodosInLogModal(tnPost);
        if (taskLogTaskDropdown && tnPost) {
          taskLogTaskDropdown._setValue?.(tnPost);
          refreshKpiTodosInLogModal(tnPost);
        }
        updateTaskLogMealDetailVisibility(tnPost);
      });
  }

  function closeTaskLogModal() {
    taskLogModal.hidden = true;
    if (taskLogFooterEl) taskLogFooterEl.style.display = "none";
    closeDateTimePicker();
    const taskDropdownPanel = taskLogTaskDropdown?.querySelector(
      ".time-task-log-task-dropdown-panel",
    );
    if (taskDropdownPanel) taskDropdownPanel.hidden = true;
    taskLogModal.style.zIndex = "";
    document.body.style.overflow = "";
    taskLogAddContext = null;
    taskLogEditTr = null;
    taskLogEditExclude = null;
    pendingEditStartTime = "";
  }

  /** 기록 버튼: blur 없이 바로 누르면 숫자만 입력된 시각이 hidden에 반영되지 않을 수 있음 → blur와 동일 포맷 후 동기화 */
  function flushTaskLogTimeInputsBeforeSubmit() {
    if (taskLogTimeStart) {
      const raw = taskLogTimeStart.value || "";
      const preformatted = autoFormatDigitsToHhMm(raw) || raw;
      taskLogTimeStart.value = normalizeHhMm(preformatted) || preformatted;
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

  taskLogSubmitBtn.addEventListener("click", () => {
    flushTaskLogTimeInputsBeforeSubmit();
    console.log("[lp-task-log]", "submit_click", {
      mode: taskLogEditTr ? "edit" : taskLogAddContext ? "add" : "none",
    });

    const editTr = taskLogEditTr;
    const addCtx = taskLogAddContext;
    let addLedgerTr = null;
    let oldRowDataToRemove = null;
    /** 메인 폼에서 만든 지출 id → linkedExpenseIds에 합침 (memo_tags와 분리) */
    let mainFormExpenseId = null;
    let submittedLedgerRowForExpenseLink = null;
    let didAddMainFormExpense = false;

    const taskName = (taskLogTaskDropdown?._getValue?.() || "").trim();
    const startRaw = (taskLogStartInput.value || "").trim();
    let endRaw = (taskLogEndInput.value || "").trim();
    const endVisibleGuard =
      normalizeHhMm((taskLogTimeEnd?.value || "").trim()) || "";
    if (
      !endRaw &&
      endVisibleGuard &&
      /^\d{1,2}:\d{2}$/.test(endVisibleGuard)
    ) {
      syncEndToHidden();
      endRaw = (taskLogEndInput.value || "").trim();
    }
    if (!taskName || !startRaw) {
      console.warn("[lp-task-log]", "submit_abort", {
        reason: "missing_task_or_start",
        hasTaskName: Boolean(taskName),
        hasStartRaw: Boolean(startRaw),
      });
      alert("과제 선택과 시작 시간을 입력해 주세요.");
      return;
    }
    let startTime = formatDateTimeInput(startRaw) || startRaw;
    let endTime = formatDateTimeInput(endRaw) || endRaw;
    if (startTime && endTime) {
      endTime = mergeEndTimeWithStartDate(startTime, endTime) || endTime;
    }
    if (
      endVisibleGuard &&
      /^\d{1,2}:\d{2}$/.test(endVisibleGuard) &&
      !String(endTime || "").trim()
    ) {
      console.warn("[lp-task-log]", "submit_abort", {
        reason: "end_visible_not_in_hidden",
        endVisibleGuard,
        endRaw,
        endTime,
      });
      showToast(
        "마감 시간이 반영되지 않았습니다. 「지금」을 한 번 더 누른 뒤 저장해 주세요.",
        "warn",
      );
      return;
    }
    const feedbackBody = (taskLogFeedbackInput?.value || "").trim();
    const mealDetailForRow = AUDIT_UNHEALTHY_MEAL_TASK_NAMES.has(taskName)
      ? (taskLogMealDetailInput?.value || "").trim()
      : "";
    const feedback = feedbackBody;
    const todoTags = taskLogTodoAddedItems
      .map((t) => [t.categoryLabel, t.todoName].filter(Boolean).join(" | "))
      .filter(Boolean);
    const linkedFromModal = taskLogExpenseAddedItems
      .map((it) => String(it?.id || "").trim())
      .filter(Boolean);
    const userTagsNoMeal = (Array.isArray(taskLogMemoTags) ? taskLogMemoTags : [])
      .map((t) => String(t ?? "").trim())
      .filter((t) => t && !isWorkScheduleDietLedgerMemoTag(t));
    const mealMemoTags = [];
    if (isMealChecklistTaskName(taskName) && taskLogDailyTodosList) {
      taskLogDailyTodosList
        .querySelectorAll("label[data-meal-checklist='1']")
        .forEach((lab) => {
          const cb = lab.querySelector('input[type="checkbox"]');
          const span = lab.querySelector(".time-task-log-kpi-todo-text");
          const dietName = (span?.textContent || "").trim();
          if (cb?.checked && dietName) {
            const tag = makeWorkScheduleDietLedgerMemoTag(dietName);
            if (tag) mealMemoTags.push(tag);
          }
        });
    }
    const memoTags = buildLedgerMemoTagsForSubmit(
      [...userTagsNoMeal, ...mealMemoTags],
      todoTags,
    );
    const timeTracked = (() => {
      if (startTime && endTime) {
        const toIso = (str) => {
          const m = str.match(
            /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s]+(\d{1,2}):(\d{2})/,
          );
          if (m)
            return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00`;
          return str.replace(" ", "T") + ":00";
        };
        const s = new Date(toIso(startTime));
        const e = new Date(toIso(endTime));
        const diff = (e - s) / (1000 * 60 * 60);
        if (diff > 0) return formatHoursToHHMM(diff);
      }
      return "";
    })();
    const opt = taskName ? getTaskOptionByName(taskName) : null;
    let productivity =
      opt?.productivity || (addCtx?.productivity ?? "productive");
    let category = opt?.category || "";
    if (TTC.isNapBuiltinTaskName(taskName) && timeTracked) {
      const nap = getNapCategoryProductivity(timeTracked);
      category = nap.category;
      productivity = nap.productivity;
    }
    const dateStr = parseDateFromDateTime(startTime) || toDateStr(new Date());
    const expenseName = (taskLogExpenseNameInput.value || "").trim();
    const expenseAmount = (taskLogExpenseAmountInput.value || "")
      .trim()
      .replace(/,/g, "");
    const expenseClassification =
      expenseClassificationButtons._getValue?.() || "";
    const expensePayment =
      expenseClassificationButtons._getPaymentValue?.() || "";
    const classificationToCategory = getClassificationToCategoryMap();
    const expenseCategory = expenseClassification
      ? (classificationToCategory[expenseClassification] || "")
      : "";

    const focusValue = "";

    const hasExpenseContent =
      expenseName || expenseClassification || expenseAmount;
    if (hasExpenseContent) {
      const missing = [];
      if (!expenseClassification) missing.push("소비 분류");
      if (!expenseAmount || !parseFloat(expenseAmount)) missing.push("금액");
      if (!expensePayment) missing.push("결제수단");
      if (missing.length > 0) {
        console.warn("[lp-task-log]", "submit_abort", {
          reason: "expense_form_incomplete",
          missing,
        });
        if (taskLogExpenseErrorEl) {
          taskLogExpenseErrorEl.textContent =
            "입력 필요: " + missing.join(", ");
          taskLogExpenseErrorEl.hidden = false;
        }
        return;
      }
    }
    if (taskLogExpenseErrorEl) {
      taskLogExpenseErrorEl.textContent = "";
      taskLogExpenseErrorEl.hidden = true;
    }

    if (editTr) {
      oldRowDataToRemove = editTr._rowData ? { ...editTr._rowData } : null;
      const prevRow = editTr._rowData || {};
      const optTask = taskName ? getTaskOptionByName(taskName) : null;
      const tidRow = String((optTask?.id || prevRow.taskId || "").trim());
      const prevId = String(prevRow.id || "").trim();
      const newRowData = {
        id: isUuid(prevId)
          ? prevId
          : typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        taskId: isUuid(tidRow) ? tidRow : "",
        taskName,
        startTime,
        endTime,
        timeTracked,
        productivity,
        category,
        date: dateStr,
        feedback,
        mealDetail: mealDetailForRow,
        memoTags,
        linkedExpenseIds: [...linkedFromModal],
        focus: focusValue,
      };
      editTr._rowData = newRowData;
      submittedLedgerRowForExpenseLink = newRowData;
      const isMobileCard = editTr.classList?.contains(
        "time-ledger-mobile-card",
      );
      if (!isMobileCard) {
        editTr.querySelector(".time-display-task").textContent = taskName;
        const prodBarEl = editTr.querySelector(".time-task-prod-bar");
        if (prodBarEl) {
          prodBarEl.classList.remove(
            "time-task-prod-bar--productive",
            "time-task-prod-bar--nonproductive",
            "time-task-prod-bar--other",
          );
          prodBarEl.classList.add(
            productivity === "productive"
              ? "time-task-prod-bar--productive"
              : productivity === "nonproductive"
                ? "time-task-prod-bar--nonproductive"
                : "time-task-prod-bar--other",
          );
        }
        editTr.querySelector(".time-display-start").textContent = startTime
          ? toDisplayTimeOnly(startTime) || startTime
          : "";
        editTr.querySelector(".time-display-end").textContent =
          formatTimeLedgerEndCellDisplay(startTime, endTime);
        editTr.querySelector(".time-display-tracked").textContent = timeTracked;
        editTr.querySelector(".time-display-feedback").textContent = feedback;
        const memoTagCell = editTr.querySelector(
          ".time-cell-memo-tag .time-display-memo-tags",
        );
        if (memoTagCell) {
          memoTagCell.innerHTML = "";
          getMemoTagDisplayTextsForLedgerRow(newRowData).forEach((tag) => {
            const pill = document.createElement("span");
            pill.className = "time-memo-tag-pill";
            pill.textContent = tag;
            memoTagCell.appendChild(pill);
          });
        }
        editTr.querySelector(".time-cell-category .time-tag-pill").textContent =
          getCategoryLabel(category) || "—";
        editTr.querySelector(".time-cell-category .time-tag-pill").className =
          "time-tag-pill cat " + getCategoryColor(category);
        const prodOpt = PRODUCTIVITY_OPTIONS.find(
          (o) => o.value === productivity,
        );
        editTr.querySelector(
          ".time-cell-productivity .time-tag-pill",
        ).textContent = prodOpt ? prodOpt.label : "";
        editTr.querySelector(
          ".time-cell-productivity .time-tag-pill",
        ).className = "time-tag-pill prod " + (prodOpt ? prodOpt.color : "");
        editTr.querySelector(".time-display-date").textContent = dateStr
          ? formatDateDisplay(dateStr)
          : "";
        editTr._updatePrice?.();
      }
    } else if (addCtx) {
      const ctx = addCtx;
      const optAdd = taskName ? getTaskOptionByName(taskName) : null;
      const tidAdd = String((optAdd?.id || "").trim());
      const newRowData = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        taskId: isUuid(tidAdd) ? tidAdd : "",
        taskName,
        startTime,
        endTime,
        timeTracked,
        productivity: ctx.productivity || productivity,
        category,
        date: dateStr,
        feedback,
        mealDetail: mealDetailForRow,
        memoTags,
        linkedExpenseIds: [...linkedFromModal],
        focus: focusValue,
      };
      const tr = createRow(
        newRowData,
        ctx.onRowUpdate,
        ctx.viewEl,
        ctx.handleRowDelete,
        ctx.handleRowEdit,
      );
      addLedgerTr = tr;
      submittedLedgerRowForExpenseLink = tr._rowData;
      if (ctx.addRow) ctx.tbody.insertBefore(tr, ctx.addRow);
      else ctx.tbody.appendChild(tr);
      /* DOM과 동일 객체를 캐시에 둠(createRow가 정규화한 행 = 저장·서버 push 기준) */
      allRowsCache.push(tr._rowData);
      ctx.onRowUpdate?.();
    }

    if (
      expenseCategory &&
      expenseClassification &&
      expenseAmount &&
      parseFloat(expenseAmount) &&
      expensePayment
    ) {
      const raw = parseFloat(String(expenseAmount).replace(/,/g, "")) || 0;
      const signed = -Math.abs(raw);
      const amountFormatted = signed.toLocaleString("ko-KR");
      const existingRows = loadExpenseRows();
      const dateForExpense = (
        dateStr || new Date().toISOString().slice(0, 10)
      ).replace(/\//g, "-");
      const expId = newExpenseRowId();
      if (expId) {
        mainFormExpenseId = expId;
        existingRows.push({
          id: expId,
          name: expenseName || "",
          date: dateForExpense,
          flowType: "지출",
          category: expenseCategory,
          classification: expenseClassification,
          amount: amountFormatted,
          payment: expensePayment,
          memo: "",
        });
        saveExpenseRows(existingRows);
        lpSaveDebug("과제모달 메인폼 소비 → 가계부 메모리 추가", {
          expenseId: expId,
          date: dateForExpense,
          amount: amountFormatted,
          memTotal: existingRows.length,
        });
        didAddMainFormExpense = true;
      } else if (hasExpenseContent) {
        lpSaveDebug("메인폼 소비 스킵(expId 없음)", { hasExpenseContent, expId: expId || null });
      }
    }

    if (mainFormExpenseId && submittedLedgerRowForExpenseLink) {
      const cur = new Set(
        Array.isArray(submittedLedgerRowForExpenseLink.linkedExpenseIds)
          ? submittedLedgerRowForExpenseLink.linkedExpenseIds.map(String)
          : [],
      );
      cur.add(mainFormExpenseId);
      submittedLedgerRowForExpenseLink.linkedExpenseIds = [...cur];
      lpSaveDebug("시간행에 linkedExpenseIds 반영", {
        ids: submittedLedgerRowForExpenseLink.linkedExpenseIds,
        rowId: String(submittedLedgerRowForExpenseLink.id || "").slice(0, 8),
      });
      const syncTr = editTr || addLedgerTr;
      if (syncTr?._rowData) {
        syncTr._rowData.linkedExpenseIds =
          submittedLedgerRowForExpenseLink.linkedExpenseIds;
      }
      if (syncTr && !syncTr.classList?.contains("time-ledger-mobile-card")) {
        const memoTagCell = syncTr.querySelector(
          ".time-cell-memo-tag .time-display-memo-tags",
        );
        if (memoTagCell) {
          memoTagCell.innerHTML = "";
          getMemoTagDisplayTextsForLedgerRow(
            submittedLedgerRowForExpenseLink,
          ).forEach((tag) => {
            const pill = document.createElement("span");
            pill.className = "time-memo-tag-pill";
            pill.textContent = tag;
            memoTagCell.appendChild(pill);
          });
        }
      }
    }

    if (didAddMainFormExpense) {
      window.dispatchEvent(new CustomEvent("asset-expense-transactions-saved"));
    }

    /* 투두는 + 버튼 모달에서 카테고리 선택 후 추가 시 저장됨 */

    if (editTr || addCtx) {
      if (editTr && oldRowDataToRemove) {
        const { next } = removeTimeLedgerRowFromRows(
          allRowsCache,
          oldRowDataToRemove,
        );
        allRowsCache = next;
        const isMobileCardEdit = editTr.classList?.contains(
          "time-ledger-mobile-card",
        );
        if (isMobileCardEdit && editTr._rowData) {
          allRowsCache.push(editTr._rowData);
        }
      }
      const dailyInfoSubmit = getKpiDailyRepeatInfoByKpiName(taskName);
      if (
        dailyInfoSubmit?.needHabitTracker &&
        taskLogDailyTodosList &&
        ((timeTracked || "").trim() || taskLogDailyTodosList.querySelector(
          'label.time-task-log-daily-todo-row input[type="checkbox"]:checked',
        ))
      ) {
        const completed = [];
        taskLogDailyTodosList
          .querySelectorAll("label.time-task-log-daily-todo-row")
          .forEach((label) => {
            const cb = label.querySelector('input[type="checkbox"]');
            const span = label.querySelector(".time-task-log-kpi-todo-text");
            const id =
              cb && cb.dataset && cb.dataset.todoId ? cb.dataset.todoId : "";
            const text =
              span && span.textContent ? span.textContent.trim() : "";
            if (!id) return;
            if (cb && cb.checked) completed.push({ id, text });
          });
        const dateRawStr = (dateStr || "")
          .toString()
          .replace(/\//g, "-")
          .replace(/\s/g, "");
        const m = dateRawStr.match(
          /(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/,
        );
        const normalizedDateRaw = m
          ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
          : dateRawStr.slice(0, 10);
        if (normalizedDateRaw.length >= 10) {
          const habitLedgerId = String(
            (editTr?._rowData?.id || addLedgerTr?._rowData?.id || "").trim(),
          );
          upsertHabitTrackerLogWithDailyState(
            dailyInfoSubmit.storageKey,
            dailyInfoSubmit.kpiId,
            normalizedDateRaw,
            { completed },
            isUuid(habitLedgerId) ? habitLedgerId : undefined,
          );
        }
      }
      onFilterChange();
      saveTimeRows(getFullRowsForFilter(true));
    } else {
      console.warn("[lp-task-log]", "submit_no_row_context", {
        taskName: (taskName || "").slice(0, 80),
        note: "editTr·addCtx 없음 — 시간 행 저장·갱신 블록 스킵",
      });
    }
    console.log("[lp-task-log]", "submit_finished", {
      savedLedgerRow: Boolean(editTr || addCtx),
      taskName: (taskName || "").slice(0, 80),
    });
    closeTaskLogModal();
    el._updateTotal?.();
  });

  /* 배경 탭으로 닫지 않음 — 실수로 터치 시 저장 없이 닫혀 기록이 안 남는 문제 방지 (닫기는 ×·Esc만) */
  taskLogCloseBtn?.addEventListener("click", closeTaskLogModal);

  const taskLogDeleteBtn = taskLogModal.querySelector(
    ".time-task-log-delete-btn",
  );
  taskLogDeleteBtn?.addEventListener("click", () => {
    const tr = taskLogEditTr;
    if (!tr) return;
    const rowData = tr._rowData || collectRowFromTR(tr);
    if (tr._onRowDelete) tr._onRowDelete(tr, rowData);
    closeTaskLogModal();
  });

  const closeBtn = taskSetupModal.querySelector(".time-task-setup-close");
  const addTaskBtn = taskSetupModal.querySelector(".time-task-add-btn");
  const setupTabs = taskSetupModal.querySelectorAll(".time-task-setup-tab");
  const setupListAll = taskSetupModal.querySelector('[data-tab-content="all"]');
  const setupListProd = taskSetupModal.querySelector(
    '[data-tab-content="productive"]',
  );
  const setupListNonProd = taskSetupModal.querySelector(
    '[data-tab-content="nonproductive"]',
  );
  const setupListOther = taskSetupModal.querySelector(
    '[data-tab-content="other"]',
  );
  const setupSubcatBar = taskSetupModal.querySelector("[data-subcat-bar]");

  const addTaskCloseBtn = addTaskModal.querySelector(".time-task-setup-close");
  const addTaskNameInput = addTaskModal.querySelector(".time-add-task-name");
  const addTaskProdRadios = addTaskModal.querySelectorAll(
    'input[name="addProd"]',
  );
  const addTaskCatProd = addTaskModal.querySelector(
    '.time-add-task-categories[data-for="productive"]',
  );
  const addTaskCatNonProd = addTaskModal.querySelector(
    '.time-add-task-categories[data-for="nonproductive"]',
  );
  const addTaskSubmitBtn = addTaskModal.querySelector(".time-add-task-submit");
  const addTaskModalTitle = addTaskModal.querySelector(".time-task-setup-title");
  const addTaskDeleteBtn = addTaskModal.querySelector(".time-add-task-delete");

  function renderCategoryButtons(container, categories) {
    container.innerHTML = "";
    categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `time-add-task-cat-btn ${c.color || ""}`;
      btn.textContent = c.label;
      btn.dataset.value = c.value;
      container.appendChild(btn);
    });
  }
  renderCategoryButtons(addTaskCatProd, PRODUCTIVE_CATEGORIES);
  renderCategoryButtons(addTaskCatNonProd, NONPRODUCTIVE_CATEGORIES);

  const ALL_CATEGORIES = [
    ...PRODUCTIVE_CATEGORIES,
    ...NONPRODUCTIVE_CATEGORIES,
    { value: "work", label: "근무", color: "cat-work" },
    { value: "sleep", label: "수면", color: "cat-sleep" },
  ];

  let selectedSubcat = "";
  let activeSetupTab = "all";
  /** 과제 수정 모달이 열려 있을 때 리스트에서 강조할 과제명 */
  let setupListSelectedTaskName = "";

  function renderSubcatButtons(prodType) {
    if (!setupSubcatBar) return;
    if (prodType !== "productive" && prodType !== "nonproductive") {
      setupSubcatBar.style.display = "none";
      selectedSubcat = "";
      return;
    }
    selectedSubcat = "";
    const categories =
      prodType === "productive"
        ? [{ value: "", label: "전체" }, ...PRODUCTIVE_CATEGORIES]
        : [{ value: "", label: "전체" }, ...NONPRODUCTIVE_CATEGORIES];
    setupSubcatBar.innerHTML = "";
    categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "time-task-setup-subcat-btn" +
        (c.value === selectedSubcat ? " active" : "");
      btn.textContent = c.label;
      btn.dataset.subcat = c.value;
      if (c.color) btn.classList.add(c.color);
      btn.addEventListener("click", () => {
        selectedSubcat = c.value;
        setupSubcatBar
          .querySelectorAll(".time-task-setup-subcat-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderTaskSetupList();
      });
      setupSubcatBar.appendChild(btn);
    });
    setupSubcatBar.style.display = "flex";
  }

  function renderTaskSetupList() {
    const allTasks = getFullTaskOptions();
    const mainTasksOnly = allTasks.filter(
      (t) => !(t.name || "").includes(" > "),
    );
    let prodTasks = mainTasksOnly.filter(
      (t) => t.productivity === "productive",
    );
    let nonProdTasks = mainTasksOnly.filter(
      (t) => t.productivity === "nonproductive",
    );
    const otherTasks = mainTasksOnly.filter(
      (t) =>
        t.productivity === "other" ||
        !["productive", "nonproductive"].includes(t.productivity),
    );
    if (activeSetupTab === "productive" && selectedSubcat) {
      prodTasks = prodTasks.filter((t) => t.category === selectedSubcat);
    }
    if (activeSetupTab === "nonproductive" && selectedSubcat) {
      nonProdTasks = nonProdTasks.filter((t) => t.category === selectedSubcat);
    }
    const getCatLabel = (v) =>
      ALL_CATEGORIES.find((c) => c.value === v)?.label ||
      CATEGORY_OPTIONS.find((c) => c.value === v)?.label ||
      v ||
      "—";
    const lockedForDisplay = getLockedForSetupDisplay();
    function renderList(container, list) {
      container.innerHTML = "";
      list.forEach((t) => {
        const fromKpi = isTimeTaskKpiLinked(t);
        const isLocked = fromKpi || lockedForDisplay.has(t.name);
        const catLabel = getCatLabel(t.category);
        const row = document.createElement("div");
        const isRowSelected =
          Boolean(setupListSelectedTaskName) &&
          setupListSelectedTaskName === t.name;
        row.className =
          "time-task-setup-item" +
          (isLocked
            ? " time-task-setup-item--locked"
            : " time-task-setup-item--editable") +
          (isRowSelected ? " time-task-setup-item--selected" : "");
        const nameEsc = (t.name || "").replace(/</g, "&lt;");
        const builtinBadge = isTimeTaskBuiltinTemplate(t)
          ? `<span class="time-task-builtin-badge" title="앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.">기본</span>`
          : "";
        const kpiBadge = fromKpi
          ? `<span class="time-task-kpi-badge" title="KPI(맵)에서 연결된 과제입니다">KPI</span>`
          : "";
        row.innerHTML = `
          <span class="time-task-setup-item-title">
            <span class="time-task-setup-item-name">${nameEsc}</span>
            ${builtinBadge}${kpiBadge}
          </span>
          <span class="time-task-setup-item-cat">${catLabel}</span>
        `;
        if (!isLocked) {
          row.setAttribute("role", "button");
          row.tabIndex = 0;
          row.addEventListener("click", () => {
            if (getLockedTaskNames().has(t.name) || isTimeTaskKpiLinked(t)) {
              alert(MSG_TIME_TASK_KPI_LINKED);
              return;
            }
            void openAddTaskModal(t);
          });
          row.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              row.click();
            }
          });
        }
        container.appendChild(row);
      });
      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "time-task-setup-empty";
        empty.textContent = "등록된 과제가 없습니다";
        container.appendChild(empty);
      }
    }
    renderList(setupListAll, mainTasksOnly);
    renderList(setupListProd, prodTasks);
    renderList(setupListNonProd, nonProdTasks);
    renderList(setupListOther, otherTasks);
  }

  let selectedCategory = "";
  function syncAddTaskSubmitState() {
    const name = (addTaskNameInput.value || "").trim();
    addTaskSubmitBtn.disabled = !(name && selectedCategory);
  }
  function openAddTaskModal(editTask) {
    if (!el.isConnected) return;
    addTaskModal.hidden = false;
    addTaskModal.style.zIndex = "1001";
    setupListSelectedTaskName = editTask ? editTask.name : "";
    const isEdit = Boolean(editTask);
    if (addTaskModalTitle) {
      addTaskModalTitle.textContent = isEdit ? "과제 수정" : "과제 추가";
    }
    addTaskSubmitBtn.textContent = isEdit ? "저장" : "추가";
    if (addTaskDeleteBtn) {
      const lockedEdit =
        editTask &&
        (getLockedTaskNames().has((editTask.name || "").trim()) ||
          isTimeTaskKpiLinked(editTask));
      addTaskDeleteBtn.hidden = !isEdit || lockedEdit;
    }
    addTaskNameInput.value = editTask ? editTask.name : "";
    addTaskNameInput.dataset.editName = editTask ? editTask.name : "";
    const prod =
      editTask &&
      (editTask.productivity === "productive" ||
        editTask.productivity === "nonproductive")
        ? editTask.productivity
        : "productive";
    addTaskModal.querySelector(
      `input[name="addProd"][value="${prod}"]`,
    ).checked = true;
    selectedCategory = editTask ? editTask.category : "";
    addTaskCatProd.style.display = prod === "productive" ? "flex" : "none";
    addTaskCatNonProd.style.display =
      prod === "nonproductive" ? "flex" : "none";
    addTaskCatProd
      .querySelectorAll(".time-add-task-cat-btn")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.value === selectedCategory),
      );
    addTaskCatNonProd
      .querySelectorAll(".time-add-task-cat-btn")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.value === selectedCategory),
      );
    syncAddTaskSubmitState();
    renderTaskSetupList();
    addTaskNameInput.focus();
  }

  function closeAddTaskModal() {
    addTaskModal.hidden = true;
    addTaskModal.style.zIndex = "";
    setupListSelectedTaskName = "";
    renderTaskSetupList();
  }

  addTaskNameInput.addEventListener("input", syncAddTaskSubmitState);

  addTaskProdRadios.forEach((r) => {
    r.addEventListener("change", () => {
      const prod = r.value;
      addTaskCatProd.style.display = prod === "productive" ? "flex" : "none";
      addTaskCatNonProd.style.display =
        prod === "nonproductive" ? "flex" : "none";
      selectedCategory = "";
      addTaskCatProd
        .querySelectorAll(".time-add-task-cat-btn")
        .forEach((b) => b.classList.remove("active"));
      addTaskCatNonProd
        .querySelectorAll(".time-add-task-cat-btn")
        .forEach((b) => b.classList.remove("active"));
      syncAddTaskSubmitState();
    });
  });
  addTaskCatProd.querySelectorAll(".time-add-task-cat-btn").forEach((b) => {
    b.addEventListener("click", () => {
      addTaskCatProd
        .querySelectorAll(".time-add-task-cat-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      selectedCategory = b.dataset.value;
      syncAddTaskSubmitState();
    });
  });
  addTaskCatNonProd.querySelectorAll(".time-add-task-cat-btn").forEach((b) => {
    b.addEventListener("click", () => {
      addTaskCatNonProd
        .querySelectorAll(".time-add-task-cat-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      selectedCategory = b.dataset.value;
      syncAddTaskSubmitState();
    });
  });

  addTaskSubmitBtn.addEventListener("click", () => {
    const name = (addTaskNameInput.value || "").trim();
    if (!name || !selectedCategory) {
      return;
    }
    const prod =
      addTaskModal.querySelector('input[name="addProd"]:checked')?.value ||
      "productive";
    const editName = addTaskNameInput.dataset.editName || "";
    if (editName) {
      updateTaskOption(editName, {
        name,
        category: selectedCategory,
        productivity: prod,
        memo: "",
      });
    } else {
      addTaskOptionFull({
        name,
        category: selectedCategory,
        productivity: prod,
        memo: "",
      });
    }
    closeAddTaskModal();
  });

  addTaskDeleteBtn?.addEventListener("click", async () => {
    const editName = (addTaskNameInput.dataset.editName || "").trim();
    if (!editName) {
      return;
    }
    if (getLockedTaskNames().has(editName)) {
      alert(MSG_TIME_TASK_KPI_LINKED);
      return;
    }
    if (!(await removeTaskOption(editName))) {
      alert(MSG_TIME_TASK_KPI_LINKED);
      return;
    }
    closeAddTaskModal();
  });

  syncAddTaskSubmitState();

  addTaskBtn?.addEventListener("click", () => void openAddTaskModal(null));
  /* 과제 추가/수정 모달도 배경 탭으로 닫지 않음(저장 전 이탈 방지) */
  addTaskCloseBtn?.addEventListener("click", closeAddTaskModal);

  setupTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setupTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.tab;
      activeSetupTab = which;
      setupListAll.style.display = which === "all" ? "" : "none";
      setupListProd.style.display = which === "productive" ? "" : "none";
      setupListNonProd.style.display = which === "nonproductive" ? "" : "none";
      setupListOther.style.display = which === "other" ? "" : "none";
      renderSubcatButtons(which);
      renderTaskSetupList();
    });
  });

  taskSetupBtn?.addEventListener("click", () => {
    void (async () => {
      await pullTimeLedgerTasksWhenSetupModalOpens();
      if (!el.isConnected) return;
      taskSetupModal.hidden = false;
      document.body.style.overflow = "hidden";
      activeSetupTab =
        taskSetupModal.querySelector(".time-task-setup-tab.active")?.dataset
          ?.tab || "all";
      selectedSubcat = "";
      renderSubcatButtons(activeSetupTab);
      renderTaskSetupList();
    })();
  });
  function closeTaskSetupModal() {
    taskSetupModal.hidden = true;
    document.body.style.overflow = "";
    closeAddTaskModal();
  }
  /* 과제 설정 모달: 배경 탭으로 닫지 않음 */
  closeBtn?.addEventListener("click", closeTaskSetupModal);
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      if (!taskLogPickerWrap.hidden) {
        closeDateTimePicker();
        e.preventDefault();
        return;
      }
      /* 과제 기록 모달 안 중첩 UI가 열려 있으면 Esc/백키로 메인까지 닫지 않고 해당 레이어만 닫음 */
      if (!taskLogModal.hidden) {
        if (taskLogExpenseInnerModal && !taskLogExpenseInnerModal.hidden) {
          closeExpenseInnerModal();
          e.preventDefault();
          return;
        }
        if (focusModal && !focusModal.hidden) {
          closeFocusModal();
          e.preventDefault();
          return;
        }
        if (taskLogTodoInnerModal && !taskLogTodoInnerModal.hidden) {
          closeTodoInnerModal();
          e.preventDefault();
          return;
        }
        if (taskLogMemoInnerModal && !taskLogMemoInnerModal.hidden) {
          closeMemoInnerModal();
          e.preventDefault();
          return;
        }
        closeTaskLogModal();
        e.preventDefault();
        return;
      }
      if (!addTaskModal.hidden) {
        closeAddTaskModal();
        e.preventDefault();
        return;
      }
      if (!taskSetupModal.hidden) {
        closeTaskSetupModal();
        e.preventDefault();
      }
    },
    { signal },
  );

  const contentWrap = document.createElement("div");
  contentWrap.className = "time-view-content-wrap";
  el.appendChild(contentWrap);

  let allRowsCache = loadTimeRows();
  let cachedRows = [];

  logTabSync("time_tab_hydrate", {});
  void Promise.all([hydrateAssetExpenseTransactionsFromCloud()]).then(() => {
    if (!el.isConnected) return;
    try {
      _pickerRangeKeyAtLastPullIntent = computePickerRangeKeyForPull();
    } catch (_) {}
    allRowsCache = loadTimeRows();
    cachedRows = getFullRowsForFilter(true);
    const active =
      viewTabs.querySelector(".time-view-tab.active")?.dataset?.view || "all";
    switchView(active);
    refreshMobileTimeCardExpenseSnippetsIn(contentWrap);
  });

  function mergeRowsIntoCache() {
    const fromDom = collectRowsFromDOM(contentWrap);
    const seen = new Set();
    fromDom.forEach((r) => {
      if (isEmptyTimeRow(r)) return;
      const k = `${r.date}|${r.taskName}|${r.startTime}`;
      const idx = allRowsCache.findIndex(
        (c) => `${c.date}|${c.taskName}|${c.startTime}` === k,
      );
      if (idx >= 0) allRowsCache[idx] = r;
      else if (!seen.has(k)) {
        seen.add(k);
        allRowsCache.push(r);
      }
    });
  }

  function getFullRowsForFilter(skipMerge = false) {
    if (!skipMerge) mergeRowsIntoCache();
    return [...allRowsCache];
  }

  function updateTotal() {
    updateHourlyHint();

    /** 요약 칸: 시 숫자·분 숫자는 크게, H·M 글자만 단위(작게) */
    function fillTimeSummaryHM(valueEl, hours, kind) {
      if (!valueEl) return;
      const role =
        kind === "productive"
          ? "time-ledger-summary-productive"
          : "time-ledger-summary-tracked";
      const num = (n) =>
        `<span class="time-ledger-summary-num ${role}">${n}</span>`;
      const u = (s) => `<span class="time-ledger-summary-unit">${s}</span>`;
      if (hours <= 0 || !isFinite(hours)) {
        valueEl.innerHTML = `${num("0")}${u("h")}${num("0")}${u("m")}`;
        return;
      }
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      if (m === 0) {
        valueEl.innerHTML = `${num(String(h))}${u("h")}`;
        return;
      }
      valueEl.innerHTML = `${num(String(h))}${u("h")}${num(String(m))}${u("m")}`;
    }

    /* 1. 시간기록하기: 요약 패널 + 테이블 행 또는 카드 목록 */
    const allTable = contentWrap.querySelector(
      ".time-ledger-container .time-ledger-table",
    );
    const summaryPanelEl = contentWrap.querySelector(
      ".time-ledger-summary-panel",
    );
    const allTfoot = allTable?.querySelector("tfoot");
    const cardNodes = contentWrap.querySelectorAll(".time-ledger-mobile-card");
    const useCardTotals = summaryPanelEl && !allTable;

    if (summaryPanelEl && (allTable || useCardTotals)) {
      const hourlyRate =
        parseFloat(
          String(el.querySelector(".time-hourly-input")?.value || "0").replace(
            /,/g,
            "",
          ),
        ) || 0;
      let totalHrs = 0;
      let productiveHrs = 0;
      let investedPrice = 0;
      let wastedValue = 0;

      if (allTable) {
        const tbody = allTable.querySelector("tbody");
        tbody?.querySelectorAll(".time-row").forEach((tr) => {
          const timeEl =
            tr.querySelector(".time-input-tracked") ||
            tr.querySelector(".time-display-tracked");
          const val = (timeEl?.value ?? timeEl?.textContent ?? "").trim();
          const hrs = parseTimeToHours(val) || 0;
          totalHrs += hrs;
          const pv = (tr._rowData?.productivity || "").trim();
          if (pv === "productive") {
            productiveHrs += hrs;
            investedPrice += hrs * hourlyRate;
          }
          if (pv === "nonproductive") {
            wastedValue += hrs * hourlyRate;
          }
        });
      } else {
        cardNodes.forEach((card) => {
          const rd = card._rowData;
          if (!rd || isEmptyTimeRow(rd)) return;
          const hrs = getMobileCardEffectiveHoursForPrice(rd);
          totalHrs += hrs;
          const pv = (
            rd.productivity ||
            getProductivityFromCategory(rd.category) ||
            ""
          ).trim();
          if (pv === "productive") {
            productiveHrs += hrs;
            investedPrice += hrs * hourlyRate;
          }
          if (pv === "nonproductive") {
            wastedValue += hrs * hourlyRate;
          }
        });
      }

      const trackedValueEl = summaryPanelEl.querySelector(
        ".time-ledger-summary-cell:nth-child(1) .time-ledger-summary-value",
      );
      fillTimeSummaryHM(trackedValueEl, totalHrs, "tracked");
      const productiveValueEl = summaryPanelEl.querySelector(
        ".time-ledger-summary-cell:nth-child(2) .time-ledger-summary-value",
      );
      fillTimeSummaryHM(productiveValueEl, productiveHrs, "productive");
      const investedNum = summaryPanelEl.querySelector(
        ".time-ledger-summary-invested",
      );
      const investedUnit = investedNum?.nextElementSibling;
      if (investedNum) investedNum.textContent = `+${formatPrice(investedPrice)}`;
      if (investedUnit) investedUnit.textContent = "원";
      const spentNum = summaryPanelEl.querySelector(
        ".time-ledger-summary-spent",
      );
      const spentUnit = spentNum?.nextElementSibling;
      if (spentNum) spentNum.textContent = `-${formatPrice(wastedValue)}`;
      if (spentUnit) spentUnit.textContent = "원";
      const dayNet = investedPrice - wastedValue;
      const dayNetNum = summaryPanelEl.querySelector(".time-ledger-summary-day-net");
      const dayNetUnit = dayNetNum?.nextElementSibling;
      if (dayNetNum) {
        if (dayNet > 0) dayNetNum.textContent = `+${formatPrice(dayNet)}`;
        else if (dayNet < 0)
          dayNetNum.textContent = `-${formatPrice(Math.abs(dayNet))}`;
        else dayNetNum.textContent = `+${formatPrice(0)}`;
      }
      if (dayNetUnit) dayNetUnit.textContent = "원";
      const overHrs = totalHrs > 24 ? totalHrs - 24 : 0;
      if (allTable && allTfoot) {
        const overRow = allTfoot.querySelector(".time-ledger-over-row");
        if (overRow)
          overRow.classList.toggle(
            "time-ledger-over-row-visible",
            overHrs > 0,
          );
        const totalOverEl = allTfoot.querySelector(".time-ledger-total-over");
        if (totalOverEl) {
          totalOverEl.textContent =
            overHrs > 0 ? formatHoursDisplay(overHrs) : "";
          totalOverEl.classList.toggle("has-over", overHrs > 0);
        }
      }
    }

    contentWrap.querySelectorAll(".time-section").forEach((section) => {
      const tbody = section.querySelector("tbody");
      const tfoot = section.querySelector("tfoot");
      const summaryTracked = tfoot?.querySelector(
        ".time-section-summary-tracked",
      );
      const summaryPrice = tfoot?.querySelector(".time-section-summary-price");
      if (!tbody || !summaryTracked || !summaryPrice) return;
      const prod = section.dataset.productivity || "";
      const hourlyRate =
        parseFloat(
          String(el.querySelector(".time-hourly-input")?.value || "0").replace(
            /,/g,
            "",
          ),
        ) || 0;
      let totalHrs = 0;
      let totalPrice = 0;
      tbody.querySelectorAll(".time-row").forEach((tr) => {
        const timeEl =
          tr.querySelector(".time-input-tracked") ||
          tr.querySelector(".time-display-tracked");
        const val = (timeEl?.value ?? timeEl?.textContent ?? "").trim();
        const hrs = parseTimeToHours(val) || 0;
        totalHrs += hrs;
        const pv = (tr._rowData?.productivity || prod || "").trim();
        let price = hrs * hourlyRate;
        if (pv === "nonproductive") price *= -1;
        else if (pv === "other" || pv === "그 외" || !pv) price = 0;
        totalPrice += price;
      });
      summaryTracked.textContent =
        totalHrs > 0 ? formatHoursDisplay(totalHrs) : "";
      summaryPrice.textContent = formatPrice(totalPrice);
      summaryPrice.className =
        "time-section-summary-price" +
        (totalPrice < 0
          ? " is-negative"
          : totalPrice > 0
            ? " is-positive"
            : "");
    });

    const mobileRow = el.querySelector(".time-ledger-mobile-filter-total");
    const mobileVal = mobileRow?.querySelector(
      ".time-ledger-mobile-filter-total-value",
    );
    if (mobileRow && mobileVal) {
      const viewOk = (el.dataset.timeContentView || "all") === "all";
      const narrow = window.matchMedia(MQ_TIME_LEDGER_MAX_MOBILE).matches;
      const cardsHost = contentWrap.querySelector(".time-ledger-mobile-cards");
      const show = narrow && viewOk && !!cardsHost;
      mobileRow.toggleAttribute("hidden", !show);
      if (show) {
        let totalHrsMob = 0;
        contentWrap.querySelectorAll(".time-ledger-mobile-card").forEach((card) => {
          const rd = card._rowData;
          if (!rd || isEmptyTimeRow(rd)) return;
          totalHrsMob += getMobileCardEffectiveHoursForPrice(rd);
        });
        mobileVal.textContent = formatTotalRecordedHoursAsHhMm(totalHrsMob);
      }
    }
  }
  el._updateTotal = updateTotal;

  const tableWrap = document.createElement("div");
  tableWrap.className = "time-ledger-table-wrap";

  const table = document.createElement("table");
  table.className = "time-ledger-table";
  table.innerHTML = createTableHTML();

  const taskTh = table.querySelector(".time-th-task");
  const taskCol = table.querySelector(".time-col-task");

  if (taskTh && taskCol) {
    const resizer = document.createElement("div");
    resizer.className = "time-col-resizer";
    resizer.title = "드래그하여 너비 조절";
    taskTh.appendChild(resizer);

    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = taskTh.getBoundingClientRect().width;
      const onMove = (moveE) => {
        const dx = moveE.clientX - startX;
        const newWidth = Math.max(80, Math.min(500, startWidth + dx));
        taskCol.style.width = `${newWidth}px`;
        taskCol.style.minWidth = `${newWidth}px`;
        updateStickyLefts(table);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        updateStickyLefts(table);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });
    requestAnimationFrame(() => updateStickyLefts(table));
  }

  updateTotal();

  /** 모바일 툴바에 붙였던 날짜·네비·필터 묶음을 비우기 전 filterBar로 되돌림 (DOM 유실 방지) */
  function rescueTimeFilterControlsToFilterBar() {
    if (filterNavCluster && !filterBar.contains(filterNavCluster)) {
      filterBar.appendChild(filterNavCluster);
    }
  }

  /** 시간 기록(전체) 카드 목록: 행 기준일 YYYY-MM-DD */
  function timeLedgerRowYmd(r) {
    const y = normalizeDateForCompare(r?.date || "");
    if (y) return y;
    const raw = String(r?.date || "")
      .trim()
      .replace(/\//g, "-")
      .slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }

  function timeLedgerFilterSpansMultipleDays() {
    const a = pickYmdFromFilter(startDateInput.value, filterStartDate);
    const b = pickYmdFromFilter(endDateInput.value, filterEndDate);
    return !!(a && b && a !== b);
  }

  /** 날짜 구간이 이틀 이상이거나, 화면에 실제로 이틀 이상의 기록이 있을 때 일자 헤더 표시 */
  function timeLedgerShouldShowDayGroups(rows) {
    if (!rows.length) return false;
    if (timeLedgerFilterSpansMultipleDays()) return true;
    const set = new Set();
    for (const r of rows) {
      const y = timeLedgerRowYmd(r);
      if (y) set.add(y);
    }
    return set.size > 1;
  }

  function timeLedgerGroupRowsByDay(sortedRows) {
    const groups = [];
    for (const r of sortedRows) {
      const key = timeLedgerRowYmd(r) || "_nodate";
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else groups.push({ key, rows: [r] });
    }
    return groups;
  }

  function sumTimeLedgerDayHours(dayRows) {
    let s = 0;
    for (const r of dayRows) {
      s += getMobileCardEffectiveHoursForPrice(r);
    }
    return s;
  }

  function renderAll(rows = []) {
    clearTimeLedgerMobileElapsedTimer(el);
    rescueTimeFilterControlsToFilterBar();
    contentWrap.innerHTML = "";
    const isMobile = window.matchMedia(MQ_TIME_LEDGER_MAX_MOBILE).matches;

    const handleCardDelete = (card, rowData) => {
      card.remove();
      updateTotal();
      if (!rowData) return;
      const entryId = String(rowData?.id || "").trim();
      void (async () => {
        if (entryId) {
          removeKpiHabitLogsForTimeLedgerEntry(entryId);
          timeLedgerSyncLog("ui_time_row_delete", {
            idPreview: `${entryId.slice(0, 8)}…`,
          });
          await deleteTimeLedgerEntryFromSupabase(entryId);
        }
        const { next } = removeTimeLedgerRowFromRows(allRowsCache, rowData);
        allRowsCache = next;
        saveTimeRows(allRowsCache);
      })();
    };
    const handleCardEdit = (card, rowData) => {
      openTaskLogModalForEdit(card, rowData);
    };

    const hiddenTableWrap = document.createElement("div");
    hiddenTableWrap.className = "time-ledger-mobile-hidden-table";
    hiddenTableWrap.style.cssText =
      "position:absolute;left:-62.5rem;width:0.0625rem;height:0.0625rem;overflow:hidden;";
    const hiddenTable = document.createElement("table");
    hiddenTable.className = "time-ledger-table";
    hiddenTable.innerHTML = createTableHTML();
    const hiddenTbody = hiddenTable.querySelector("tbody");
    hiddenTableWrap.appendChild(hiddenTable);
    contentWrap.appendChild(hiddenTableWrap);

    if (isMobile) {
      const summaryPanelForTotals = document.createElement("div");
      summaryPanelForTotals.className = "time-ledger-summary-panel";
      summaryPanelForTotals.setAttribute("aria-hidden", "true");
      summaryPanelForTotals.innerHTML = TIME_LEDGER_SUMMARY_FIVE_CELLS_HTML;
      contentWrap.appendChild(summaryPanelForTotals);
    }

    const cardsWrap = document.createElement("div");
    cardsWrap.className = isMobile
      ? "time-ledger-mobile-cards"
      : "time-ledger-mobile-cards time-ledger-desktop-cards";

    const showDayGroups = timeLedgerShouldShowDayGroups(rows);
    const appendCardTo = (parent, d) => {
      const card = createMobileTimeCard(
        d,
        handleCardEdit,
        handleCardDelete,
        el,
      );
      card._onRowDelete = handleCardDelete;
      parent.appendChild(card);
    };

    /** 새 카드는 마지막 일별 스택에 붙임 (모바일·데스크톱 동일) */
    function appendNewCardToLedgerCardsWrap(card) {
      let stack = cardsWrap.querySelector(
        ".time-ledger-day-card-stack:last-of-type",
      );
      if (!stack) {
        stack = document.createElement("div");
        stack.className = "time-ledger-day-card-stack";
        cardsWrap.appendChild(stack);
      }
      stack.appendChild(card);
    }

    if (showDayGroups) {
      const groups = timeLedgerGroupRowsByDay(rows);
      for (const g of groups) {
        if (g.key !== "_nodate") {
          const header = document.createElement("div");
          header.className = "time-ledger-day-group-header";
          header.setAttribute("role", "presentation");
          const label = document.createElement("span");
          label.className = "time-ledger-day-group-date";
          label.textContent = formatTimeFilterDateDotsWithWeekday(g.key);
          const totalEl = document.createElement("span");
          totalEl.className = "time-ledger-day-group-total";
          totalEl.textContent = formatHoursDisplay(
            sumTimeLedgerDayHours(g.rows),
          );
          header.appendChild(label);
          header.appendChild(totalEl);
          cardsWrap.appendChild(header);
        }
        const cardParent =
          g.rows.length > 0
            ? (() => {
                const stack = document.createElement("div");
                stack.className = "time-ledger-day-card-stack";
                cardsWrap.appendChild(stack);
                return stack;
              })()
            : cardsWrap;
        for (const d of g.rows) appendCardTo(cardParent, d);
      }
    } else {
      const cardParent =
        rows.length > 0
          ? (() => {
              const stack = document.createElement("div");
              stack.className = "time-ledger-day-card-stack";
              cardsWrap.appendChild(stack);
              return stack;
            })()
          : cardsWrap;
      rows.forEach((d) => appendCardTo(cardParent, d));
    }

    const openAdd = () => {
      if (openTaskLogModal) {
        openTaskLogModal({
          productivity: null,
          tbody: hiddenTbody,
          addRow: null,
          onRowUpdate: () => {
            updateTotal();
            onFilterChange();
          },
          viewEl: el,
          createRow,
          handleRowDelete: handleCardDelete,
          handleRowEdit: handleCardEdit,
        });
      } else {
        const dateStr = startDateInput.value || filterStartDate;
        const card = createMobileTimeCard(
          { date: dateStr },
          handleCardEdit,
          handleCardDelete,
          el,
        );
        card._onRowDelete = handleCardDelete;
        appendNewCardToLedgerCardsWrap(card);
        updateTotal();
      }
    };

    if (isMobile) {
      contentWrap.appendChild(cardsWrap);
    } else {
      const summaryPanel = document.createElement("div");
      summaryPanel.className = "time-ledger-summary-panel";
      summaryPanel.innerHTML = TIME_LEDGER_SUMMARY_FIVE_CELLS_HTML;

      const ledgerContainer = document.createElement("div");
      ledgerContainer.className = "time-ledger-container";
      ledgerContainer.appendChild(summaryPanel);
      ledgerContainer.appendChild(cardsWrap);
      contentWrap.appendChild(ledgerContainer);
    }

    {
      const hourlyAddSlotEl = el.querySelector(".time-hourly-add-slot");
      if (hourlyAddSlotEl) {
        hourlyAddSlotEl.innerHTML = "";
        const addInner = document.createElement("div");
        addInner.className =
          "time-hourly-add-inner time-ledger-add-inner--icon-only";
        const addBtnEl = document.createElement("button");
        addBtnEl.type = "button";
        addBtnEl.className = "todo-add-btn time-ledger-add-plus-btn";
        addBtnEl.title = "과제 기록";
        addBtnEl.setAttribute("aria-label", "과제 기록");
        addBtnEl.innerHTML = TIME_LEDGER_ADD_PLUS_ICON_SVG;
        addInner.appendChild(addBtnEl);
        hourlyAddSlotEl.appendChild(addInner);
        addInner.addEventListener("click", openAdd);
      }
    }

    const refreshCardLiveFields = () => {
      cardsWrap
        .querySelectorAll(".time-ledger-mobile-card")
        .forEach(updateMobileTimeCardLiveFields);
      updateTotal();
    };
    if (rows.some((d) => mobileCardNeedsLiveClock(d))) {
      refreshCardLiveFields();
      el._timeLedgerMobileElapsedIntervalId = setInterval(
        refreshCardLiveFields,
        10000,
      );
    }
    updateTotal();
  }

  const mqTimeLedgerLayout = window.matchMedia(MQ_TIME_LEDGER_MAX_MOBILE);
  function refreshTimeLedgerLayoutIfAllView() {
    if (!el.isConnected) return;
    syncHourlyAddSlotPlacement();
    const view =
      viewTabs.querySelector(".time-view-tab.active")?.dataset?.view || "all";
    mergeRowsIntoCache();
    cachedRows = getFullRowsForFilter(true);
    const filtered = getFilteredRows(cachedRows);
    if (view === "all") {
      renderAll(filtered);
    } else if (view === "audit") {
      renderAudit(filtered);
    } else if (view === "retrospect") {
      renderRetrospect(filtered);
    }
    syncTimeFilterDateLabels();
  }
  mqTimeLedgerLayout.addEventListener("change", refreshTimeLedgerLayoutIfAllView, {
    signal,
  });

  function renderByProductivity(rows = []) {
    clearTimeLedgerMobileElapsedTimer(el);
    rescueTimeFilterControlsToFilterBar();
    contentWrap.innerHTML = "";
    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    const periodLabel = getFilterPeriodLabel(type, y, m, start, end);
    const { productive, nonproductive } = aggregateHoursByProductivity(rows);
    const totalProdNonProd = productive + nonproductive || 1;
    const prodPct =
      totalProdNonProd > 0 ? (productive / totalProdNonProd) * 100 : 0;
    const nonProdPct =
      totalProdNonProd > 0 ? (nonproductive / totalProdNonProd) * 100 : 0;
    const circ = 2 * Math.PI * 40;
    const offset = circ / 4;
    const prodLen = (prodPct / 100) * circ;
    const nonProdLen = (nonProdPct / 100) * circ;
    const nonProdRows = rows.filter((r) => {
      const p = r.productivity || getProductivityFromCategory(r.category);
      return p === "nonproductive";
    });
    const nonProdByTask = aggregateHoursByTask(nonProdRows);
    const top3NonProd = Object.entries(nonProdByTask)
      .filter(([, hrs]) => hrs > 0)
      .map(([task, hrs]) => ({ task: String(task || ""), hrs }))
      .sort((a, b) => b.hrs - a.hrs)
      .slice(0, 3);
    const maxNonProdHrs = top3NonProd.length
      ? Math.max(...top3NonProd.map((x) => x.hrs))
      : 1;
    const TOP3_COLORS = ["#3b82f6", "#2563eb", "#1d4ed8"];
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const top3Html =
      top3NonProd.length > 0
        ? top3NonProd
            .map(
              (x, i) =>
                `<div class="time-dash-top7-row">
  <span class="time-dash-top7-num">${String(i + 1).padStart(2, "0")}</span>
  <span class="time-dash-top7-task" title="${esc(x.task)}">${esc(x.task)}</span>
  <div class="time-dash-top7-track">
    <div class="time-dash-top7-fill" style="width:${(x.hrs / maxNonProdHrs) * 100}%;background:${TOP3_COLORS[i % 3]}"></div>
  </div>
  <span class="time-dash-top7-value">${formatHoursDisplay(x.hrs)}</span>
</div>`,
            )
            .join("")
        : '<div class="time-productivity-top3-empty">비생산적 기록이 없습니다</div>';
    const miniDash = document.createElement("div");
    miniDash.className = "time-productivity-mini-dashboard";
    miniDash.innerHTML = `
      <div class="time-productivity-mini-title">${periodLabel} 생산성 요약</div>
      <div class="time-productivity-mini-row">
        <div class="time-productivity-mini-chart time-productivity-top3-widget">
          <div class="time-productivity-mini-chart-label">비생산적 과제 TOP 3</div>
          <div class="time-dash-top7-list">${top3Html}</div>
        </div>
        <div class="time-productivity-mini-chart">
          <div class="time-productivity-mini-chart-label">생산적 vs 비생산적</div>
          <div class="time-productivity-mini-donut-wrap">
            <svg class="time-dash-donut" viewBox="0 0 100 100">
              <circle class="time-dash-donut-bg" cx="50" cy="50" r="40"/>
              <circle class="time-dash-donut-seg prod-pink" cx="50" cy="50" r="40" stroke-dasharray="${prodLen} ${circ - prodLen}" stroke-dashoffset="${-offset}"/>
              <circle class="time-dash-donut-seg prod-blue" cx="50" cy="50" r="40" stroke-dasharray="${nonProdLen} ${circ - nonProdLen}" stroke-dashoffset="${-offset - prodLen}"/>
            </svg>
            <div class="time-dash-donut-center">
              <span class="time-dash-donut-total">${formatHoursDisplay(totalProdNonProd === 1 && productive === 0 && nonproductive === 0 ? 0 : totalProdNonProd)}</span>
              <span class="time-dash-donut-label">Total</span>
            </div>
          </div>
          <div class="time-productivity-mini-legend">
            <span class="time-dash-legend-item"><i class="prod-pink"></i>생산적 ${formatHoursDisplay(productive)} (${prodPct.toFixed(1)}%)</span>
            <span class="time-dash-legend-item"><i class="prod-blue"></i>비생산적 ${formatHoursDisplay(nonproductive)} (${nonProdPct.toFixed(1)}%)</span>
          </div>
        </div>
        <div class="time-productivity-mini-pct">
          <div class="time-productivity-mini-chart-label">생산성</div>
          <div class="time-productivity-mini-pct-value-wrap">
            <span class="time-productivity-mini-pct-value">${totalProdNonProd > 0 ? prodPct.toFixed(1) : "—"}%</span>
          </div>
        </div>
      </div>
    `;
    contentWrap.appendChild(miniDash);
    const hourlyRate =
      parseFloat(
        String(el.querySelector(".time-hourly-input")?.value || "0").replace(
          /,/g,
          "",
        ),
      ) || 0;
    const { start: rangeStart, end: rangeEnd } = getDateRangeForFilterType(
      type,
      y,
      m,
      start,
      end,
    );
    if (type !== "day" && rangeStart && rangeEnd) {
      const filteredForChart = filterRowsByFilterType(
        rows,
        type,
        y,
        m,
        start,
        end,
      );
      const widgetDailyRev = createDailyRevenueWidget(
        periodLabel,
        filteredForChart,
        hourlyRate,
        rangeStart,
        rangeEnd,
      );
      if (widgetDailyRev) {
        const revWrap = document.createElement("div");
        revWrap.className = "time-productivity-daily-revenue-wrap";
        revWrap.appendChild(widgetDailyRev);
        contentWrap.appendChild(revWrap);
      }
    }
    const handleRowDelete = (tr, rowData) => {
      tr.remove();
      updateTotal();
      if (!rowData) return;
      const entryId = String(rowData?.id || "").trim();
      void (async () => {
        if (entryId) {
          removeKpiHabitLogsForTimeLedgerEntry(entryId);
          timeLedgerSyncLog("ui_time_row_delete", {
            idPreview: `${entryId.slice(0, 8)}…`,
          });
          await deleteTimeLedgerEntryFromSupabase(entryId);
        }
        const { next } = removeTimeLedgerRowFromRows(allRowsCache, rowData);
        allRowsCache = next;
        saveTimeRows(allRowsCache);
      })();
    };
    PRODUCTIVITY_VIEW_ORDER.forEach((prod) => {
      const sectionRows = rows.filter((r) => r.productivity === prod.value);
      contentWrap.appendChild(
        createProductivitySection(
          prod,
          sectionRows,
          el,
          updateTotal,
          handleRowDelete,
          openTaskLogModal,
          openTaskLogModalForEdit,
        ),
      );
    });
    const refreshProductivityLiveRows = () => {
      contentWrap.querySelectorAll("tr.time-row").forEach((rowEl) => {
        if (mobileCardNeedsLiveClock(rowEl._rowData)) rowEl._updatePrice?.();
      });
    };
    if (rows.some((d) => mobileCardNeedsLiveClock(d))) {
      refreshProductivityLiveRows();
      el._timeLedgerMobileElapsedIntervalId = setInterval(
        refreshProductivityLiveRows,
        10000,
      );
    }
    updateTotal();
  }

  function renderImprove(rows = []) {
    clearTimeLedgerMobileElapsedTimer(el);
    rescueTimeFilterControlsToFilterBar();
    contentWrap.innerHTML = "";
    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    const periodLabel = getFilterPeriodLabel(type, y, m, start, end);
    const filtered = filterRowsByFilterType(rows, type, y, m, start, end);
    const defaultTimeFromStart = (st) => {
      const match = (st || "").match(/[T\s](\d{1,2}):(\d{2})/);
      return match ? `${String(match[1]).padStart(2, "0")}:${match[2]}` : "";
    };
    const timeStrToHours = (t) => {
      if (!t || typeof t !== "string") return null;
      const m = t.trim().match(/^(\d{1,2}):?(\d{2})?/);
      if (!m) return null;
      return parseInt(m[1], 10) + (parseInt(m[2], 10) || 0) / 60;
    };

    const allEvents = [];
    filtered.forEach((row) => {
      const dateStr =
        normalizeDateForCompare(row.date || "") || (row.date || "").trim();
      if (!dateStr) return;
      const defTime = defaultTimeFromStart(row.startTime);
      const events = parseFocusEvents(row.focus, defTime);
      const taskName = (row.taskName || "").trim() || "—";
      events.forEach((e) => {
        const timeStr = (e.time || "").trim() || defTime;
        const hours = timeStr ? timeStrToHours(timeStr) : null;
        allEvents.push({
          dateStr,
          timeStr,
          hours: hours != null ? hours : 0,
          type: (e.type || "").trim() || "—",
          taskName,
        });
      });
    });
    allEvents.sort(
      (a, b) => a.dateStr.localeCompare(b.dateStr) || a.hours - b.hours,
    );

    const wrap = document.createElement("div");
    wrap.className = "time-improve-view";
    const dateKey = start.slice(0, 10) || start;
    const savedNotes = getStoredImproveNotes(dateKey);
    const esc = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const GAP_MIN_MINUTES = 15;
    const dateStr = dateKey;
    const storedGoals = getBudgetGoals(dateStr);
    const excluded = getBudgetExcluded(dateStr);
    const dateRows = filtered.filter(
      (r) =>
        (normalizeDateForCompare(r.date || "") || r.date || "").trim() ===
        dateStr,
    );
    const actualByTask = aggregateHoursByTask(dateRows);
    const BASIC_TASKS_GAP = ["수면하기", "근무하기"];
    const scheduleRowsGap = [];
    Object.entries(storedGoals).forEach(([task, data]) => {
      if (excluded.has(task) || isBudgetPlaceholder(task)) return;
      const isBasic = BASIC_TASKS_GAP.includes(task);
      const isInvest = data?.isInvest === true;
      const isConsume = data?.isInvest === false;
      if (!isBasic && !isInvest && !isConsume) return;
      const goalTime = data?.goalTime || "";
      if (!goalTime.trim()) return;
      const actualHrs = actualByTask[task] || 0;
      const goalHrs = parseTimeToHours(goalTime);
      const diff = actualHrs - goalHrs;
      const absDiff = Math.abs(diff);
      if (absDiff < GAP_MIN_MINUTES / 60) return;
      scheduleRowsGap.push({ task, goalTime, actualHrs, goalHrs, diff });
    });
    const fmtGapReality = (goalTime, actualHrs) => {
      if (!goalTime?.trim() || (actualHrs <= 0 && !goalTime?.trim()))
        return "—";
      const goalHrs = parseTimeToHours(goalTime);
      const d = actualHrs - goalHrs;
      if (Math.abs(d) < 1 / 60) return "0";
      const sign = d > 0 ? "+" : "-";
      const absH = Math.abs(d);
      const h = Math.floor(absH);
      const m = Math.round((absH - h) * 60);
      if (h === 0) return `${sign}${m}m`;
      if (m === 0) return `${sign}${h}h`;
      return `${sign}${h}h ${m}m`;
    };
    const gapTableHtml =
      scheduleRowsGap.length === 0
        ? '<p class="time-improve-gap-empty">시간 갭 15분 이상인 과제가 없습니다.</p>'
        : `<div class="time-improve-gap-table-wrap"><table class="time-improve-gap-table time-audit-schedule-table"><thead><tr><th>과제명</th><th>목표 시간</th><th>실제시간</th><th>시간 갭</th></tr></thead><tbody>${scheduleRowsGap
            .map(
              (r) =>
                `<tr><td class="time-audit-schedule-task">${esc(r.task)}</td><td class="time-audit-schedule-goal">${r.goalTime || "—"}</td><td class="time-audit-schedule-actual">${r.actualHrs > 0 ? formatHoursToHHMM(r.actualHrs) : "—"}</td><td class="time-audit-schedule-gap">${fmtGapReality(r.goalTime, r.actualHrs)}</td></tr>`,
            )
            .join("")}</tbody></table></div>`;

    const tasksForImportant = getTasksForAuditDate(dateKey);
    const EISENHOWER_LABELS = {
      "urgent-important": "긴급+중요",
      "important-not-urgent": "중요+여유",
      "urgent-not-important": "긴급+덜 중요",
      "not-urgent-not-important": "여유+안 중요",
    };
    const dateRowsForKpi = filtered.filter(
      (r) =>
        (normalizeDateForCompare(r.date || "") || (r.date || "").trim()) ===
        dateKey,
    );
    const actualByTaskKpi = aggregateHoursByTask(dateRowsForKpi);
    const kpiHoursMap = {};
    Object.entries(actualByTaskKpi).forEach(([timeTaskName, hours]) => {
      if (!timeTaskName || hours <= 0) return;
      const tn = String(timeTaskName).trim();
      const matched = tasksForImportant.find(
        (t) =>
          (t.name || "").trim() === tn ||
          (t.name || "").trim().startsWith(tn + " ") ||
          tn.startsWith((t.name || "").trim() + " "),
      );
      if (matched) {
        const kpi = (matched.classification || "").trim() || "(없음)";
        kpiHoursMap[kpi] = (kpiHoursMap[kpi] || 0) + hours;
      }
    });
    const kpiGroups = {};
    tasksForImportant.forEach((t) => {
      const kpi = (t.classification || "").trim() || "(없음)";
      if (!kpiGroups[kpi]) kpiGroups[kpi] = [];
      kpiGroups[kpi].push(t);
    });
    const kpiOrder = Object.keys(kpiGroups).sort(
      (a, b) => (kpiHoursMap[b] || 0) - (kpiHoursMap[a] || 0),
    );
    const kpiCombinedRows = [];
    kpiOrder.forEach((kpi) => {
      const tasks = kpiGroups[kpi] || [];
      if (tasks.length === 0) return;
      const timeStr =
        kpiHoursMap[kpi] > 0 ? formatHoursToHHMM(kpiHoursMap[kpi]) : "—";
      const rowspan = tasks.length;
      tasks.forEach((t, i) => {
        const label = (t.name || "").trim() || "—";
        const priority = (t.eisenhower || "").trim()
          ? EISENHOWER_LABELS[(t.eisenhower || "").trim()] ||
            (t.eisenhower || "").trim()
          : "—";
        const check = t.done ? "☑" : "☐";
        if (i === 0) {
          kpiCombinedRows.push(
            `<tr><td rowspan="${rowspan}" class="time-improve-kpi-name">${esc(kpi)}</td><td rowspan="${rowspan}" class="time-improve-kpi-hours">${timeStr}</td><td class="time-improve-kpi-todo">${check} ${esc(label)}</td><td class="time-improve-kpi-priority">${esc(priority)}</td></tr>`,
          );
        } else {
          kpiCombinedRows.push(
            `<tr><td class="time-improve-kpi-todo">${check} ${esc(label)}</td><td class="time-improve-kpi-priority">${esc(priority)}</td></tr>`,
          );
        }
      });
    });
    const priorityTableImportantHtml =
      tasksForImportant.length === 0
        ? '<p class="time-improve-important-empty">해당 날짜 할일이 없습니다.</p>'
        : `<div class="time-improve-important-table-wrap"><table class="time-improve-important-table time-improve-kpi-combined-table"><thead><tr><th>KPI</th><th>KPI 시간사용시간</th><th>KPI 할일</th><th>우선순위</th></tr></thead><tbody>${kpiCombinedRows.join("")}</tbody></table></div>`;

    const viewRoot = contentWrap.parentElement;
    const hourlyRateImprove =
      parseFloat(
        String(
          viewRoot?.querySelector(".time-hourly-input")?.value || "0",
        ).replace(/,/g, ""),
      ) || 0;
    const dateRowsThief = filtered.filter(
      (r) =>
        (normalizeDateForCompare(r.date || "") || (r.date || "").trim()) ===
        dateKey,
    );
    const nonproductiveRows = dateRowsThief.filter(
      (r) => String(r.productivity || "").trim() === "nonproductive",
    );
    const byTaskThief = {};
    nonproductiveRows.forEach((r) => {
      const name = (r.taskName || "").trim() || "—";
      const hrs = parseTimeToHours(r.timeTracked) || 0;
      const price = hrs * hourlyRateImprove * -1;
      if (!byTaskThief[name])
        byTaskThief[name] = { taskName: name, hours: 0, price: 0 };
      byTaskThief[name].hours += hrs;
      byTaskThief[name].price += price;
    });
    const thiefTableRows = Object.values(byTaskThief).sort(
      (a, b) => b.hours - a.hours,
    );
    const totalThiefHours = thiefTableRows.reduce((s, r) => s + r.hours, 0);
    const totalThiefPrice = thiefTableRows.reduce((s, r) => s + r.price, 0);
    const thiefTableHtml =
      thiefTableRows.length > 0
        ? `<div class="time-improve-thief-table-wrap"><table class="time-improve-important-table time-audit-thief-table"><thead><tr><th>과제명</th><th>실제 보낸 시간</th><th>시간의 가치</th></tr></thead><tbody>${thiefTableRows
            .map(
              (r) =>
                `<tr><td class="time-audit-thief-task">${esc(r.taskName)}</td><td class="time-audit-thief-time">${formatHoursToHHMM(r.hours)}</td><td class="time-audit-thief-value">${formatPrice(r.price)}</td></tr>`,
            )
            .join("")}</tbody></table></div>`
        : '<p class="time-improve-important-empty">해당 날짜 비생산적 기록 없음</p>';
    const investSummaryHtml = `<div class="time-improve-invest-summary">
        <div class="time-improve-invest-summary-row"><span class="time-improve-invest-summary-label">실제 보낸 시간 합계</span><span class="time-improve-invest-summary-value">${formatHoursToHHMM(totalThiefHours)}</span></div>
        <div class="time-improve-invest-summary-row"><span class="time-improve-invest-summary-label">시간의 가치 합계</span><span class="time-improve-invest-summary-value time-improve-invest-summary-value-bold">${formatPrice(totalThiefPrice)}</span></div>
      </div>`;
    const investMentText = `이 <strong>${formatPrice(Math.abs(totalThiefPrice))}원</strong> 만큼의 돈을 내고 쓸만큼 가치있는 활동들이었나요?`;

    const eventsListHtml =
      allEvents.length === 0
        ? '<p class="time-improve-events-empty">해당 기간 방해기록이 없습니다.</p>'
        : `<ul class="time-improve-events-list">${allEvents
            .map(
              (e) =>
                `<li><span class="time-improve-event-date">${esc(e.dateStr)}</span> <span class="time-improve-event-time">${esc(e.timeStr)}</span> <span class="time-improve-event-type">${esc(e.type)}</span>${e.taskName !== "—" ? ` <span class="time-improve-event-task">(${esc(e.taskName)})</span>` : ""}</li>`,
            )
            .join("")}</ul>`;

    wrap.innerHTML = `
      <div class="time-improve-quadrants">
        <div class="time-improve-quadrant time-improve-quadrant-focus">
          <div class="time-improve-section-header">
            <span class="time-improve-section-num">01</span>
            <h3 class="time-improve-section-title">집중력을 높이기</h3>
          </div>
          <p class="time-improve-period">${periodLabel}</p>
          <div class="time-improve-events-wrap">
            <h4 class="time-improve-events-heading">방해기록</h4>
            <div class="time-improve-events-scroll">${eventsListHtml}</div>
          </div>
          <div class="time-improve-input-block">
            <h4 class="time-improve-input-label">1. 근본 원인</h4>
            <div class="time-improve-answer-scroll">
              <textarea class="time-improve-answer time-improve-root-cause" placeholder="누가 혹은 무엇이 내게서 시간을 훔쳐가고 있나?"></textarea>
            </div>
          </div>
          <div class="time-improve-input-block">
            <h4 class="time-improve-input-label">2. 방해요소 차단할 계획</h4>
            <div class="time-improve-answer-scroll">
              <textarea class="time-improve-answer time-improve-countermeasures" placeholder="예) 차단 시간 만들기, 휴대폰 끄기, 업무 외 인터넷창 끄기, 멀티태스킹금지 등"></textarea>
            </div>
          </div>
        </div>
        <div class="time-improve-quadrant time-improve-quadrant-reality">
          <div class="time-improve-section-header">
            <span class="time-improve-section-num">02</span>
            <h3 class="time-improve-section-title">계획의 현실성 높이기</h3>
          </div>
          <p class="time-improve-period">${periodLabel}</p>
          <div class="time-improve-reality-gap-wrap">
            <h4 class="time-improve-events-heading">시간 갭</h4>
            <div class="time-improve-gap-section">${gapTableHtml}</div>
          </div>
          <div class="time-improve-input-block">
            <h4 class="time-improve-input-label">1. 반성 및 개선점</h4>
            <div class="time-improve-answer-scroll">
              <textarea class="time-improve-answer time-improve-plan-reality" placeholder="반성할 점과 다음에 개선할 내용을 적어보세요."></textarea>
            </div>
          </div>
        </div>
        <div class="time-improve-quadrant time-improve-quadrant-important">
          <div class="time-improve-section-header">
            <span class="time-improve-section-num">03</span>
            <h3 class="time-improve-section-title">중요한일에 더 많은 시간 쓰기</h3>
          </div>
          <p class="time-improve-period">${periodLabel}</p>
          <div class="time-improve-important-data-wrap">
            <h4 class="time-improve-events-heading">KPI · 우선순위</h4>
            <div class="time-improve-important-data-scroll">${priorityTableImportantHtml}</div>
          </div>
          <div class="time-improve-input-block">
            <h4 class="time-improve-input-label">당신은 오늘 중요한 일에 시간을 더 많이 썼나요?</h4>
            <div class="time-improve-answer-scroll">
              <textarea class="time-improve-answer time-improve-important-invest-input" rows="3"></textarea>
            </div>
          </div>
        </div>
        <div class="time-improve-quadrant time-improve-quadrant-invest">
          <div class="time-improve-section-header">
            <span class="time-improve-section-num">04</span>
            <h3 class="time-improve-section-title">비생산적 시간 아껴서 투자하기</h3>
          </div>
          <p class="time-improve-period">${periodLabel}</p>
          <div class="time-improve-invest-data-wrap">
            <h4 class="time-improve-events-heading">비생산적 시간 현황</h4>
            <div class="time-improve-invest-data-scroll">
              <div class="time-improve-thief-inner">${thiefTableHtml}</div>
              ${investSummaryHtml}
              <p class="time-improve-invest-ment-text">${investMentText}</p>
            </div>
          </div>
          <div class="time-improve-input-block">
            <h4 class="time-improve-input-label">비생산적 시간을 줄이기 위한 방법을 적어보세요.</h4>
            <div class="time-improve-answer-scroll">
              <textarea class="time-improve-answer time-improve-invest-reduce-input" placeholder="예) 불필요한 SNS 시간 줄이기, 업무 시간 집중하기 등" rows="3"></textarea>
            </div>
          </div>
        </div>
      </div>
    `;

    const rootCauseEl = wrap.querySelector(".time-improve-root-cause");
    const countermeasuresEl = wrap.querySelector(
      ".time-improve-countermeasures",
    );
    if (rootCauseEl) {
      rootCauseEl.value = savedNotes.rootCause;
      rootCauseEl.addEventListener("input", () =>
        setStoredImproveNote(dateKey, "rootCause", rootCauseEl.value),
      );
      rootCauseEl.addEventListener("blur", () =>
        setStoredImproveNote(dateKey, "rootCause", rootCauseEl.value),
      );
    }
    if (countermeasuresEl) {
      countermeasuresEl.value = savedNotes.countermeasures;
      countermeasuresEl.addEventListener("input", () =>
        setStoredImproveNote(
          dateKey,
          "countermeasures",
          countermeasuresEl.value,
        ),
      );
      countermeasuresEl.addEventListener("blur", () =>
        setStoredImproveNote(
          dateKey,
          "countermeasures",
          countermeasuresEl.value,
        ),
      );
    }
    const planRealityEl = wrap.querySelector(".time-improve-plan-reality");
    if (planRealityEl) {
      planRealityEl.value = savedNotes.planReality;
      planRealityEl.addEventListener("input", () =>
        setStoredImproveNote(dateKey, "planReality", planRealityEl.value),
      );
      planRealityEl.addEventListener("blur", () =>
        setStoredImproveNote(dateKey, "planReality", planRealityEl.value),
      );
    }
    const importantInvestEl = wrap.querySelector(
      ".time-improve-important-invest-input",
    );
    if (importantInvestEl) {
      importantInvestEl.value = savedNotes.importantInvest;
      importantInvestEl.addEventListener("input", () =>
        setStoredImproveNote(
          dateKey,
          "importantInvest",
          importantInvestEl.value,
        ),
      );
      importantInvestEl.addEventListener("blur", () =>
        setStoredImproveNote(
          dateKey,
          "importantInvest",
          importantInvestEl.value,
        ),
      );
    }
    const investReduceEl = wrap.querySelector(
      ".time-improve-invest-reduce-input",
    );
    if (investReduceEl) {
      investReduceEl.value = savedNotes.investReduce;
      investReduceEl.addEventListener("input", () =>
        setStoredImproveNote(dateKey, "investReduce", investReduceEl.value),
      );
      investReduceEl.addEventListener("blur", () =>
        setStoredImproveNote(dateKey, "investReduce", investReduceEl.value),
      );
    }
    contentWrap.appendChild(wrap);
  }

  function renderRetrospect(_rows = []) {
    clearTimeLedgerMobileElapsedTimer(el);
    rescueTimeFilterControlsToFilterBar();
    contentWrap.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "time-retrospect-view";
    const inner = document.createElement("div");
    inner.className = "time-retrospect-inner";

    let normStart =
      normalizeDateForCompare(
        pickYmdFromFilter(startDateInput.value, filterStartDate),
      ) || pickYmdFromFilter(startDateInput.value, filterStartDate);
    let normEnd =
      normalizeDateForCompare(
        pickYmdFromFilter(endDateInput.value, filterEndDate),
      ) || pickYmdFromFilter(endDateInput.value, filterEndDate);
    if (normStart && normEnd && normStart > normEnd) {
      const t = normStart;
      normStart = normEnd;
      normEnd = t;
    }

    const rowSource = Array.isArray(_rows) ? _rows : [];
    const byYmd = new Map();
    for (const r of rowSource) {
      const d = retrospectRowDateKey(r);
      if (!d) continue;
      if (!byYmd.has(d)) byYmd.set(d, []);
      byYmd.get(d).push(r);
    }

    const retroRows = [
      { kind: "metric", label: "수면", key: "sleep" },
      { kind: "metric", label: "업무", key: "work" },
      { kind: "metric", label: "가용시간", key: "available" },
      { kind: "metric", label: "미디어 시청", key: "media" },
      { kind: "metric", label: "식단", key: "diet" },
      { kind: "metric", label: "지출", key: "expense" },
      ...getRetrospectKpiSectionedRows(),
    ];

    const weeksRoot = document.createElement("div");
    weeksRoot.className = "time-retrospect-weeks";

    if (normStart && normEnd && normStart <= normEnd) {
      /** 회고는 표를 하나만 쓰고, 시작일이 속한 주(월~일) 7열만 표시(필터 밖 날은 흐리게). */
      const weekStart = startOfWeekMondayYmd(normStart);
      const weekBlock = document.createElement("section");
      weekBlock.className = "time-retrospect-week";
      const tableWrap = document.createElement("div");
      tableWrap.className = "time-retrospect-table-wrap";
      const table = document.createElement("table");
      table.className =
        "time-retrospect-table time-retrospect-table--week-cols";
      const thead = document.createElement("thead");
      const headTr = document.createElement("tr");
      const tbody = document.createElement("tbody");

      const cornerTh = document.createElement("th");
      cornerTh.className = "time-retrospect-th-corner";
      cornerTh.scope = "col";
      headTr.appendChild(cornerTh);

      for (let i = 0; i < 7; i++) {
        const ymd = addDaysToYmd(weekStart, i);
        const inRange = ymd >= normStart && ymd <= normEnd;

        const th = document.createElement("th");
        th.className = "time-retrospect-th-day";
        th.scope = "col";
        fillRetrospectTableHeaderTh(th, ymd);
        if (!inRange) th.classList.add("time-retrospect-th--out");
        headTr.appendChild(th);
      }

      for (const rowDef of retroRows) {
        if (rowDef.kind === "kpiSection") {
          const secTr = document.createElement("tr");
          secTr.className = "time-retrospect-tr-kpi-domain";
          const domainTh = document.createElement("th");
          domainTh.className = "time-retrospect-th-kpi-domain";
          domainTh.scope = "colgroup";
          domainTh.colSpan = 8;
          const iconSrc = String(rowDef.icon || "").trim();
          const wrap = document.createElement("span");
          wrap.className = "time-retrospect-kpi-domain-label";
          if (iconSrc.endsWith(".svg")) {
            const img = document.createElement("img");
            img.className = "time-retrospect-kpi-domain-icon";
            img.src = iconSrc;
            img.alt = "";
            img.decoding = "async";
            img.setAttribute("aria-hidden", "true");
            wrap.appendChild(img);
          } else if (iconSrc) {
            wrap.appendChild(document.createTextNode(`${iconSrc} `));
          }
          const titleEl = document.createElement("span");
          titleEl.className = "time-retrospect-kpi-domain-title";
          titleEl.textContent = rowDef.title;
          wrap.appendChild(titleEl);
          domainTh.appendChild(wrap);
          domainTh.setAttribute(
            "aria-label",
            `KPI 구역 ${rowDef.title}`,
          );
          secTr.appendChild(domainTh);
          tbody.appendChild(secTr);
          continue;
        }

        const bodyTr = document.createElement("tr");
        const rowLabelTh = document.createElement("th");
        rowLabelTh.className = "time-retrospect-th-row-label";
        rowLabelTh.scope = "row";
        if (
          rowDef.kind === "kpi" &&
          rowDef.kpiDef &&
          rowDef.kpiDef.needHabitTracker
        ) {
          const wrap = document.createElement("span");
          wrap.className = "time-retrospect-kpi-row-label-inner";
          wrap.appendChild(createRetrospectKpiDailyRepeatIconSvg());
          const name = document.createElement("span");
          name.textContent = rowDef.label;
          wrap.appendChild(name);
          rowLabelTh.appendChild(wrap);
        } else {
          rowLabelTh.textContent = rowDef.label;
        }
        bodyTr.appendChild(rowLabelTh);

        for (let i = 0; i < 7; i++) {
          const ymd = addDaysToYmd(weekStart, i);
          const inRange = ymd >= normStart && ymd <= normEnd;

          const td = document.createElement("td");
          td.className = "time-retrospect-td-day-cell";
          if (!inRange) td.classList.add("time-retrospect-td--out");
          else {
            const dayRows = byYmd.get(ymd) || [];
            const m = computeRetrospectDayMetrics(dayRows);
            if (rowDef.key === "diet") {
              td.classList.add("time-retrospect-td--diet");
              const dietHtml = formatRetrospectDietDayCellHtml(dayRows);
              if (dietHtml) td.innerHTML = dietHtml;
              else td.textContent = "—";
            } else if (rowDef.key === "expense") {
              td.classList.add("time-retrospect-td--expense");
              td.textContent = formatRetrospectExpenseDayCell(ymd);
            } else if (rowDef.key === "media") {
              td.classList.add("time-retrospect-td--media");
              fillRetrospectMediaDayCell(td, m);
            } else if (rowDef.kind === "kpi" && rowDef.kpiDef) {
              td.classList.add("time-retrospect-td--kpi");
              const habitState = getRetrospectKpiHabitMarkState(
                rowDef.kpiDef,
                ymd,
              );
              if (habitState !== null) {
                td.classList.add("time-retrospect-td--kpi-habit");
                const habitWrap = document.createElement("div");
                habitWrap.className = "time-retrospect-habit-cellwrap";
                const mark = document.createElement("span");
                if (habitState === "done") {
                  mark.className =
                    "time-retrospect-habit-ox time-retrospect-habit-ox--o";
                  mark.textContent = "O";
                  mark.setAttribute("aria-label", "완료");
                } else if (habitState === "miss") {
                  mark.className =
                    "time-retrospect-habit-ox time-retrospect-habit-ox--x";
                  mark.textContent = "X";
                  mark.setAttribute("aria-label", "미완료");
                } else {
                  mark.className =
                    "time-retrospect-habit-ox time-retrospect-habit-ox--dash";
                  mark.textContent = "—";
                  mark.setAttribute("aria-label", "해당 없음");
                }
                habitWrap.appendChild(mark);
                if (habitState === "done") {
                  const completed = getHabitTrackerDailyCompletedForDate(
                    rowDef.kpiDef.storageKey,
                    rowDef.kpiDef.kpiId,
                    ymd,
                  );
                  if (completed.length > 0) {
                    const detail = document.createElement("div");
                    detail.className = "time-retrospect-habit-done-detail";
                    detail.setAttribute("aria-hidden", "true");
                    for (const item of completed) {
                      const line = document.createElement("div");
                      line.className = "time-retrospect-habit-done-line";
                      const t = String(item.text || "").trim();
                      line.textContent = t || "·";
                      detail.appendChild(line);
                    }
                    habitWrap.appendChild(detail);
                  }
                }
                td.appendChild(habitWrap);
              } else {
                td.textContent = formatRetrospectKpiDayCell(
                  rowDef.kpiDef,
                  ymd,
                );
              }
            } else {
              td.textContent = formatHoursToShortHm(m[rowDef.key]);
            }
          }
          bodyTr.appendChild(td);
        }
        tbody.appendChild(bodyTr);
      }

      thead.appendChild(headTr);
      table.appendChild(thead);
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      weekBlock.appendChild(tableWrap);
      weeksRoot.appendChild(weekBlock);
    } else {
      const empty = document.createElement("p");
      empty.className = "time-retrospect-empty";
      empty.textContent = "날짜를 선택해 주세요.";
      weeksRoot.appendChild(empty);
    }

    inner.appendChild(weeksRoot);
    wrap.appendChild(inner);
    contentWrap.appendChild(wrap);
  }

  function renderAudit(rows = []) {
    clearTimeLedgerMobileElapsedTimer(el);
    rescueTimeFilterControlsToFilterBar();
    contentWrap.innerHTML = "";
    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    const periodLabel = getFilterPeriodLabel(type, y, m, start, end);
    const filtered = filterRowsByFilterType(rows, type, y, m, start, end);

    const wrap = document.createElement("div");
    wrap.className = "time-audit-view";

    if (filtered.length === 0) {
      wrap.innerHTML = `
        <div class="time-audit-empty">
          <div class="time-audit-empty-title">${periodLabel} 시간기록이 없습니다</div>
          <div class="time-audit-empty-desc">해당 날짜의 시간기록을 입력하면 오딧에 표시됩니다.</div>
        </div>
      `;
      contentWrap.appendChild(wrap);
      return;
    }

    const { start: rangeRawStart, end: rangeRawEnd } = getDateRangeForFilterType(
      type,
      y,
      m,
      start,
      end,
    );
    const normStart =
      normalizeDateForCompare(rangeRawStart || "") || rangeRawStart || "";
    const normEnd =
      normalizeDateForCompare(rangeRawEnd || "") || rangeRawEnd || "";
    const isPeriodSummary = Boolean(
      normStart && normEnd && String(normStart) < String(normEnd),
    );

    const auditDayKey = isPeriodSummary ? null : normStart;

    const block = document.createElement("div");
    block.className = "time-audit-block time-audit-block-integrated";
    block.innerHTML = `
          <div class="time-audit-region time-audit-region-available">
            <div class="time-audit-region-title">1. 가용시간</div>
          ${(() => {
            const hourlyRate =
              parseFloat(
                String(
                  el.querySelector(".time-hourly-input")?.value || "0",
                ).replace(/,/g, ""),
              ) || 0;
            return getAuditAvailableTimeHtml(
              auditDayKey,
              filtered,
              hourlyRate,
              isPeriodSummary,
            );
          })()}
          </div>
          <div class="time-audit-region time-audit-region-time-thief">
            <div class="time-audit-region-title">2. 시간낭비내역</div>
          ${(() => {
            const hourlyRate =
              parseFloat(
                String(
                  el.querySelector(".time-hourly-input")?.value || "0",
                ).replace(/,/g, ""),
              ) || 0;
            return getAuditTimeThiefHtml(
              auditDayKey,
              filtered,
              hourlyRate,
              isPeriodSummary,
            );
          })()}
          </div>
          <div class="time-audit-region time-audit-region-time-investment">
            <div class="time-audit-region-title">3. 시간 투자 내역</div>
          ${(() => {
            const hourlyRate =
              parseFloat(
                String(
                  el.querySelector(".time-hourly-input")?.value || "0",
                ).replace(/,/g, ""),
              ) || 0;
            return getAuditTimeInvestmentHtml(
              auditDayKey,
              filtered,
              hourlyRate,
              isPeriodSummary,
            );
          })()}
          </div>
          <div class="time-audit-region time-audit-region-achievement">
            <div class="time-audit-region-title">4. 건강 카테고리</div>
            <div class="time-audit-health-category-inner">
              <div class="time-audit-achievement-content">
                ${getAuditHealthDietTimelineHtml(filtered, normStart, normEnd)}
              </div>
            </div>
          </div>
          <div class="time-audit-region time-audit-region-media-watch">
            <div class="time-audit-region-title">5. 미디어 시청시간</div>
            <div class="time-audit-media-watch-inner">
              ${getAuditMediaWatchHoursHtml(filtered)}
            </div>
          </div>
          <div class="time-audit-region time-audit-region-kpi-status">
            <div class="time-audit-region-title">6. KPI 별 현황</div>
            ${getAuditKpiStatusHtml(filtered)}
          </div>
        `;
    wrap.appendChild(block);

    contentWrap.appendChild(wrap);
  }

  function renderDashboard(rows = []) {
    clearTimeLedgerMobileElapsedTimer(el);
    rescueTimeFilterControlsToFilterBar();
    contentWrap.innerHTML = "";
    const dash = document.createElement("div");
    dash.className = "time-dashboard-view";

    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    const periodLabel = getFilterPeriodLabel(type, y, m, start, end);
    const filtered = filterRowsByFilterType(rows, type, y, m, start, end);
    const hourlyRate =
      parseFloat(
        String(el.querySelector(".time-hourly-input")?.value || "0").replace(
          /,/g,
          "",
        ),
      ) || 0;

    // 1. 하루 평균 가용시간
    const widgetAvailable = document.createElement("div");
    widgetAvailable.className =
      "time-dashboard-widget time-dashboard-widget-available";
    const avg = calcAvgAvailableHoursFromFiltered(filtered);
    widgetAvailable.innerHTML = `
      <div class="time-dashboard-widget-title">하루 평균 가용시간</div>
      <div class="time-dashboard-widget-value">${avg != null ? formatHoursDisplay(avg) : "—"}</div>
      <div class="time-dashboard-widget-desc">${avg != null ? `${periodLabel} 기준 · 24시간 - 근무 - 수면` : `${periodLabel}에 근무/수면 기록이 없습니다`}</div>
    `;

    // 4. 하루의 가치 (먼저 생성 - 최근 7일일 때 가용시간 옆에 배치)
    const dayValue = calcPeriodValueFromFiltered(filtered, hourlyRate);
    const widgetValue = document.createElement("div");
    widgetValue.className =
      "time-dashboard-widget time-dashboard-widget-day-value";
    widgetValue.innerHTML = `
      <div class="time-dashboard-widget-title">${periodLabel} 하루의 가치</div>
      <div class="time-dashboard-widget-value ${dayValue < 0 ? "is-negative" : dayValue > 0 ? "is-positive" : ""}">${formatPrice(dayValue)}원</div>
    `;

    let widgetTop7;
    try {
      const filteredExcludingWorkSleep = filtered.filter(
        (r) =>
          (r.category || "").trim() !== "work" &&
          (r.category || "").trim() !== "sleep",
      );
      const byTask = aggregateHoursByTask(filteredExcludingWorkSleep);
      const top7Tasks = Object.entries(byTask)
        .map(([task, hrs]) => ({ task: String(task || ""), hrs }))
        .sort((a, b) => b.hrs - a.hrs)
        .slice(0, 3);
      const maxTaskHrs = top7Tasks.length
        ? Math.max(...top7Tasks.map((x) => x.hrs))
        : 1;
      const TOP7_COLORS = [
        "#e8a4b8",
        "#a78bfa",
        "#60a5fa",
        "#7eb8da",
        "#34d399",
        "#fbbf24",
        "#94a3b8",
      ];
      const esc = (s) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      widgetTop7 = document.createElement("div");
      widgetTop7.className = "time-dashboard-widget time-dashboard-widget-top7";
      const top7Html =
        top7Tasks.length > 0
          ? top7Tasks
              .map(
                (x, i) =>
                  `<div class="time-dash-top7-row">
  <span class="time-dash-top7-num">${String(i + 1).padStart(2, "0")}</span>
  <span class="time-dash-top7-task">${esc(x.task)}</span>
  <div class="time-dash-top7-track">
    <div class="time-dash-top7-fill" style="width:${(x.hrs / maxTaskHrs) * 100}%;background:${TOP7_COLORS[i % 7]}"></div>
  </div>
  <span class="time-dash-top7-value">${formatHoursDisplay(x.hrs)}</span>
</div>`,
              )
              .join("")
          : '<div class="time-dash-empty">기록이 없습니다</div>';
      widgetTop7.innerHTML = `<div class="time-dashboard-widget-title">시간 TOP 3 활동</div><div class="time-dash-top7-exclude">근무/수면 제외</div><div class="time-dash-top7-list">${top7Html}</div>`;
    } catch (_) {
      widgetTop7 = document.createElement("div");
      widgetTop7.className = "time-dashboard-widget time-dashboard-widget-top7";
      widgetTop7.innerHTML =
        '<div class="time-dashboard-widget-title">시간 TOP 3 활동</div><div class="time-dash-top7-exclude">근무/수면 제외</div><div class="time-dash-empty">표시할 수 없습니다</div>';
    }

    const rowTop = document.createElement("div");
    rowTop.className = "time-dashboard-row-top";
    rowTop.appendChild(widgetAvailable);
    rowTop.appendChild(widgetValue);
    rowTop.appendChild(widgetTop7);
    dash.appendChild(rowTop);

    // 2. 전일 카테고리별 시간 사용 현황 (세로 막대)
    const byCategory = aggregateHoursByCategory(filtered);
    const catEntries = Object.entries(byCategory)
      .map(([k, v]) => ({
        cat: k,
        label: getCategoryLabel(k),
        hrs: v,
        color: getCategoryColor(k),
      }))
      .sort((a, b) => b.hrs - a.hrs);
    const maxCatHrs = Math.max(...catEntries.map((x) => x.hrs), 0.01);

    const widgetCategoryBar = document.createElement("div");
    widgetCategoryBar.className =
      "time-dashboard-widget time-dashboard-widget-category-bar";
    const catBarHtml = catEntries
      .map(
        (x) => `
      <div class="time-dash-bar-row">
        <span class="time-dash-bar-label">${x.label}</span>
        <div class="time-dash-bar-track">
          <div class="time-dash-bar-fill ${x.color}" style="width:${(x.hrs / maxCatHrs) * 100}%"></div>
        </div>
        <span class="time-dash-bar-value">${formatHoursDisplay(x.hrs)}</span>
      </div>
    `,
      )
      .join("");
    widgetCategoryBar.innerHTML = `
      <div class="time-dashboard-widget-title">${periodLabel} 카테고리별 시간 사용 현황</div>
      <div class="time-dash-bar-list">${catEntries.length ? catBarHtml : '<div class="time-dash-empty">기록이 없습니다</div>'}</div>
    `;
    dash.appendChild(widgetCategoryBar);

    // 3. 생산성 (도넛)
    const { productive, nonproductive } =
      aggregateHoursByProductivity(filtered);
    const totalProd = productive + nonproductive || 1;
    const prodPct = totalProd > 0 ? (productive / totalProd) * 100 : 0;
    const nonProdPct = totalProd > 0 ? (nonproductive / totalProd) * 100 : 0;
    const circ = 2 * Math.PI * 40;
    const offset = circ / 4;
    const prodLen = (prodPct / 100) * circ;
    const nonProdLen = (nonProdPct / 100) * circ;

    const widgetProductivity = document.createElement("div");
    widgetProductivity.className =
      "time-dashboard-widget time-dashboard-widget-productivity";
    widgetProductivity.innerHTML = `
      <div class="time-dashboard-widget-title">${periodLabel} 생산성</div>
      <div class="time-dash-donut-wrap">
        <svg class="time-dash-donut" viewBox="0 0 100 100">
          <circle class="time-dash-donut-bg" cx="50" cy="50" r="40"/>
          <circle class="time-dash-donut-seg prod-pink" cx="50" cy="50" r="40" stroke-dasharray="${prodLen} ${circ - prodLen}" stroke-dashoffset="${-offset}"/>
          <circle class="time-dash-donut-seg prod-blue" cx="50" cy="50" r="40" stroke-dasharray="${nonProdLen} ${circ - nonProdLen}" stroke-dashoffset="${-offset - prodLen}"/>
        </svg>
        <div class="time-dash-donut-center">
          <span class="time-dash-donut-total">${formatHoursDisplay(totalProd === 1 && productive === 0 && nonproductive === 0 ? 0 : totalProd)}</span>
          <span class="time-dash-donut-label">Total</span>
        </div>
      </div>
      <div class="time-dash-legend">
        <span class="time-dash-legend-item"><i class="prod-pink"></i>생산적 ${prodPct.toFixed(1)}%</span>
        <span class="time-dash-legend-item"><i class="prod-blue"></i>비생산적 ${nonProdPct.toFixed(1)}%</span>
      </div>
    `;
    dash.appendChild(widgetProductivity);

    // 5. 전일 비생산적 시간 사용 현황 (도넛 - 활동명/태스크별)
    const nonProdRows = filtered.filter((r) => {
      const p = r.productivity || getProductivityFromCategory(r.category);
      return p === "nonproductive";
    });
    const nonProdByTask = aggregateHoursByTask(nonProdRows);
    const nonProdEntries = Object.entries(nonProdByTask)
      .filter(([, v]) => v > 0)
      .map(([task, hrs]) => ({
        label: task,
        hrs,
        stroke: getCategoryColorForReport(getDominantCategoryForTask(nonProdRows, task)),
      }))
      .sort((a, b) => b.hrs - a.hrs);
    const nonProdTotal = nonProdEntries.reduce((s, x) => s + x.hrs, 0);
    const nonProdCirc = 2 * Math.PI * 40;
    const nonProdOffset = nonProdCirc / 4;
    let nonProdCum = 0;
    const nonProdSegs = nonProdEntries.map((x) => {
      const len = nonProdTotal > 0 ? (x.hrs / nonProdTotal) * nonProdCirc : 0;
      const seg = { ...x, len, dashOffset: -nonProdOffset - nonProdCum };
      nonProdCum += len;
      return seg;
    });

    const widgetNonProd = document.createElement("div");
    widgetNonProd.className =
      "time-dashboard-widget time-dashboard-widget-time-bar time-dashboard-widget-donut";
    widgetNonProd.innerHTML = nonProdEntries.length
      ? `
      <div class="time-dashboard-widget-title">${periodLabel} 비생산적 시간 사용 현황</div>
      <div class="time-dash-donut-wrap">
        <svg class="time-dash-donut" viewBox="0 0 100 100">
          <circle class="time-dash-donut-bg" cx="50" cy="50" r="40"/>
          ${nonProdSegs.map((s) => `<circle class="time-dash-donut-seg" cx="50" cy="50" r="40" stroke="${s.stroke}" stroke-dasharray="${s.len} ${nonProdCirc - s.len}" stroke-dashoffset="${s.dashOffset}"/>`).join("")}
        </svg>
        <div class="time-dash-donut-center">
          <span class="time-dash-donut-total">${formatHoursDisplay(nonProdTotal)}</span>
          <span class="time-dash-donut-label">Total</span>
        </div>
      </div>
      <div class="time-dash-legend">
        ${nonProdEntries
          .map((x) => {
            const pct =
              nonProdTotal > 0 ? ((x.hrs / nonProdTotal) * 100).toFixed(1) : 0;
            return `<span class="time-dash-legend-item"><i style="background:${x.stroke}"></i>${x.label} ${formatHoursDisplay(x.hrs)} (${pct}%)</span>`;
          })
          .join("")}
      </div>
    `
      : `
      <div class="time-dashboard-widget-title">${periodLabel} 비생산적 시간 사용 현황</div>
      <div class="time-dash-empty">기록이 없습니다</div>
    `;

    // 6. 전일 생산적 시간 사용 현황 (도넛 - 활동명/태스크별)
    const prodRows = filtered.filter((r) => {
      const p = r.productivity || getProductivityFromCategory(r.category);
      return p === "productive";
    });
    const prodByTask = aggregateHoursByTask(prodRows);
    const prodEntries = Object.entries(prodByTask)
      .filter(([, v]) => v > 0)
      .map(([task, hrs]) => ({
        label: task,
        hrs,
        stroke: getCategoryColorForReport(getDominantCategoryForTask(prodRows, task)),
      }))
      .sort((a, b) => b.hrs - a.hrs);
    const prodTotal = prodEntries.reduce((s, x) => s + x.hrs, 0);
    const prodCirc = 2 * Math.PI * 40;
    const prodOffset = prodCirc / 4;
    let prodCum = 0;
    const prodSegs = prodEntries.map((x) => {
      const len = prodTotal > 0 ? (x.hrs / prodTotal) * prodCirc : 0;
      const seg = { ...x, len, dashOffset: -prodOffset - prodCum };
      prodCum += len;
      return seg;
    });

    const widgetProd = document.createElement("div");
    widgetProd.className =
      "time-dashboard-widget time-dashboard-widget-time-bar time-dashboard-widget-donut";
    widgetProd.innerHTML = prodEntries.length
      ? `
      <div class="time-dashboard-widget-title">${periodLabel} 생산적 시간 사용 현황</div>
      <div class="time-dash-donut-wrap">
        <svg class="time-dash-donut" viewBox="0 0 100 100">
          <circle class="time-dash-donut-bg" cx="50" cy="50" r="40"/>
          ${prodSegs.map((s) => `<circle class="time-dash-donut-seg" cx="50" cy="50" r="40" stroke="${s.stroke}" stroke-dasharray="${s.len} ${prodCirc - s.len}" stroke-dashoffset="${s.dashOffset}"/>`).join("")}
        </svg>
        <div class="time-dash-donut-center">
          <span class="time-dash-donut-total">${formatHoursDisplay(prodTotal)}</span>
          <span class="time-dash-donut-label">Total</span>
        </div>
      </div>
      <div class="time-dash-legend">
        ${prodEntries
          .map((x) => {
            const pct =
              prodTotal > 0 ? ((x.hrs / prodTotal) * 100).toFixed(1) : 0;
            return `<span class="time-dash-legend-item"><i style="background:${x.stroke}"></i>${x.label} ${formatHoursDisplay(x.hrs)} (${pct}%)</span>`;
          })
          .join("")}
      </div>
    `
      : `
      <div class="time-dashboard-widget-title">${periodLabel} 생산적 시간 사용 현황</div>
      <div class="time-dash-empty">기록이 없습니다</div>
    `;

    dash.appendChild(widgetProd);
    dash.appendChild(widgetNonProd);

    // 7. 과제별 시간 사용 현황 (가로 막대 차트)
    const byTask = aggregateHoursByTask(filtered);
    const taskEntries = Object.entries(byTask)
      .map(([task, hrs]) => ({
        task,
        hrs,
        color: getCategoryColorForReport(getDominantCategoryForTask(filtered, task)),
      }))
      .sort((a, b) => b.hrs - a.hrs);
    const maxTaskHrs = Math.max(...taskEntries.map((x) => x.hrs), 0.01);
    const totalTaskHrs = taskEntries.reduce((s, x) => s + x.hrs, 0);

    const widgetTaskBar = document.createElement("div");
    widgetTaskBar.className =
      "time-dashboard-widget time-dashboard-widget-task-bar";
    const taskBarHtml = taskEntries
      .map(
        (x) => `
      <div class="time-dash-bar-row">
        <span class="time-dash-bar-label">${x.task}</span>
        <div class="time-dash-bar-track">
          <div class="time-dash-bar-fill time-dash-task-fill" style="width:${(x.hrs / maxTaskHrs) * 100}%; background:${x.color}"></div>
        </div>
        <span class="time-dash-bar-value">${formatHoursDisplay(x.hrs)}</span>
      </div>
    `,
      )
      .join("");
    widgetTaskBar.innerHTML = `
      <div class="time-dashboard-widget-title">${periodLabel} 과제별 시간 사용 현황</div>
      <div class="time-dash-bar-total">총 ${formatHoursDisplay(totalTaskHrs)}</div>
      <div class="time-dash-bar-subtitle">Time Tracked</div>
      <div class="time-dash-bar-list time-dash-task-bar-list">${taskEntries.length ? taskBarHtml : '<div class="time-dash-empty">기록이 없습니다</div>'}</div>
    `;
    dash.appendChild(widgetTaskBar);

    // 방해 빈도 곡선 (0~24시, 부드러운 곡선, Y축 눈금)
    const focusByHour = aggregateFocusByHour(filtered);
    const focusData = [];
    for (let h = 0; h <= 23; h++)
      focusData.push({ hour: h, value: focusByHour[h] || 0 });
    const totalFocus = focusData.reduce((s, x) => s + x.value, 0);
    const maxFocus = Math.max(...focusData.map((x) => x.value), 1);
    const chartH = 220;
    const chartW = 900;
    const padLeft = 48;
    const padRight = 16;
    const padTop = 32;
    const padBottom = 56;
    const plotH = chartH - padTop - padBottom;
    const plotW = chartW - padLeft - padRight;
    const hours = focusData.map((x) => x.hour);
    const values = focusData.map((x) => x.value);
    const linePoints = values.map((v, i) => {
      const x = padLeft + (i / Math.max(1, hours.length - 1)) * plotW;
      const y = padTop + plotH - (v / maxFocus) * plotH;
      return { x, y };
    });
    /** Catmull-Rom 스플라인 → 부드러운 베지어 곡선 path 생성 */
    function pointsToSmoothCurve(pts, tension = 1) {
      if (pts.length < 2) return "";
      const t = tension;
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const cp1x = p1.x + ((p2.x - p0.x) / 6) * t;
        const cp1y = p1.y + ((p2.y - p0.y) / 6) * t;
        const cp2x = p2.x - ((p3.x - p1.x) / 6) * t;
        const cp2y = p2.y - ((p3.y - p1.y) / 6) * t;
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
      }
      return d;
    }
    const linePathD =
      linePoints.length >= 2
        ? pointsToSmoothCurve(linePoints)
        : linePoints.length === 1
          ? `M ${linePoints[0].x} ${linePoints[0].y}`
          : "";
    const widgetFocusCurve = document.createElement("div");
    widgetFocusCurve.className =
      "time-dashboard-widget time-dashboard-widget-focus-curve";
    const gridIndices = hours
      .map((_, i) => i)
      .filter((i) => i % 3 === 0 || i === hours.length - 1);
    const gridLines = gridIndices
      .map((i) => {
        const x = padLeft + (i / Math.max(1, hours.length - 1)) * plotW;
        return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotH}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2"/>`;
      })
      .join("");
    const hGridLines = [0.25, 0.5, 0.75, 1]
      .map((rat) => {
        const y = padTop + plotH - rat * plotH;
        return `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2"/>`;
      })
      .join("");
    const yTickCount = 5;
    const yTicks = [];
    for (let i = 0; i <= yTickCount; i++) {
      const rat = i / yTickCount;
      const val = Math.round(rat * maxFocus);
      if (i > 0 && val === yTicks[yTicks.length - 1]?.val) continue;
      yTicks.push({ val, y: padTop + plotH - rat * plotH });
    }
    const yLabels = yTicks
      .map(
        (t) =>
          `<text x="${padLeft - 8}" y="${t.y + 4}" text-anchor="end" font-size="10" fill="#6b7280">${t.val}</text>`,
      )
      .join("");
    const xNumY = chartH - 24;
    const xTitleY = chartH - 4;
    const xLabels = gridIndices
      .map((i) => {
        const x = padLeft + (i / Math.max(1, hours.length - 1)) * plotW;
        return `<text x="${x}" y="${xNumY}" text-anchor="middle" font-size="10" fill="#6b7280">${hours[i]}</text>`;
      })
      .join("");
    widgetFocusCurve.innerHTML =
      totalFocus > 0
        ? `
      <div class="time-dashboard-widget-title">방해 빈도 곡선</div>
      <div class="time-dash-focus-curve-desc">${periodLabel} · 시각별 방해횟수</div>
      <div class="time-dash-focus-curve-svg-wrap">
        <svg class="time-dash-focus-curve-svg" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet">
          <text x="${padLeft - 4}" y="14" text-anchor="end" font-size="9" fill="#9ca3af">방해 빈도</text>
          ${yLabels}
          ${gridLines}
          ${hGridLines}
          <path d="${linePathD}" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          ${xLabels}
          <text x="${padLeft + plotW / 2}" y="${xTitleY}" text-anchor="middle" font-size="9" fill="#9ca3af">시각</text>
        </svg>
      </div>
    `
        : `
      <div class="time-dashboard-widget-title">방해 빈도 곡선</div>
      <div class="time-dash-focus-curve-desc">${periodLabel} · 시각별 방해횟수</div>
      <div class="time-dash-empty">방해 기록이 없습니다</div>
    `;
    dash.appendChild(widgetFocusCurve);

    // 성취능력 곡선 (방해 빈도와 동일한 방식, Y축 -50~+50%)
    const energyByHour = aggregateEnergyByHour(filtered);
    const energyData = [];
    for (let h = 0; h <= 23; h++) {
      const v = energyByHour[h];
      energyData.push({ hour: h, value: v != null ? v : 0 });
    }
    const hasEnergyData = filtered.some(
      (r) => parseEnergyToNumber(r.energy) != null,
    );
    const energyLinePoints = energyData.map((v, i) => {
      const x = padLeft + (i / Math.max(1, energyData.length - 1)) * plotW;
      const yVal = Math.max(-50, Math.min(50, v.value));
      const y = padTop + plotH - ((yVal + 50) / 100) * plotH;
      return { x, y };
    });
    const energyPathD =
      energyLinePoints.length >= 2
        ? pointsToSmoothCurve(energyLinePoints)
        : energyLinePoints.length === 1
          ? `M ${energyLinePoints[0].x} ${energyLinePoints[0].y}`
          : "";
    const energyYTicks = [-50, -25, 0, 25, 50].map((val) => ({
      val: val > 0 ? `+${val}` : String(val),
      y: padTop + plotH - ((val + 50) / 100) * plotH,
    }));
    const energyYLabels = energyYTicks
      .map(
        (t) =>
          `<text x="${padLeft - 8}" y="${t.y + 4}" text-anchor="end" font-size="10" fill="#6b7280">${t.val}%</text>`,
      )
      .join("");
    const energyHGridLines = energyYTicks
      .map((t) => {
        const y = t.y;
        return `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2"/>`;
      })
      .join("");
    const widgetEnergyCurve = document.createElement("div");
    widgetEnergyCurve.className =
      "time-dashboard-widget time-dashboard-widget-focus-curve time-dashboard-widget-energy-curve";
    widgetEnergyCurve.innerHTML = hasEnergyData
      ? `
      <div class="time-dashboard-widget-title">성취능력 곡선</div>
      <div class="time-dash-focus-curve-desc">${periodLabel} · 시각별 성취능력 평균</div>
      <div class="time-dash-focus-curve-svg-wrap">
        <svg class="time-dash-focus-curve-svg" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet">
          <text x="${padLeft - 4}" y="14" text-anchor="end" font-size="9" fill="#9ca3af">성취능력</text>
          ${energyYLabels}
          ${gridLines}
          ${energyHGridLines}
          <line x1="${padLeft}" y1="${padTop + plotH / 2}" x2="${padLeft + plotW}" y2="${padTop + plotH / 2}" stroke="#d1d5db" stroke-width="0.5" stroke-dasharray="4,2"/>
          <path d="${energyPathD}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          ${xLabels}
          <text x="${padLeft + plotW / 2}" y="${xTitleY}" text-anchor="middle" font-size="9" fill="#9ca3af">시각</text>
        </svg>
      </div>
    `
      : `
      <div class="time-dashboard-widget-title">성취능력 곡선</div>
      <div class="time-dash-focus-curve-desc">${periodLabel} · 시각별 성취능력 평균</div>
      <div class="time-dash-empty">성취능력 기록이 없습니다</div>
    `;
    dash.appendChild(widgetEnergyCurve);

    contentWrap.appendChild(dash);
  }

  function renderDailyTimeBudget(container, rows, viewEl, dateStr) {
    container.innerHTML = "";
    const targetDateStr = dateStr || toDateStr(new Date());
    const todayRows = rows.filter(
      (r) => (r.date || "").trim() === targetDateStr,
    );
    const wrap = document.createElement("div");
    wrap.className = "time-daily-budget";
    wrap.innerHTML = `
      <div class="time-daily-budget-header time-dashboard-view">
        <div class="time-dashboard-row-top time-daily-budget-row-top">
          <div class="time-dashboard-widget time-daily-budget-widget-remaining">
            <div class="time-dashboard-widget-title">남은시간</div>
            <div class="time-dashboard-widget-value time-daily-budget-remaining-scheduled">00:00</div>
          </div>
          <div class="time-dashboard-widget time-daily-budget-widget-productivity">
            <div class="time-dashboard-widget-title">투자/소비 시간 (예정 vs 실제)</div>
            <table class="time-daily-budget-compare-table">
              <thead>
                <tr>
                  <th></th>
                  <th>예정</th>
                  <th>실제</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="time-budget-compare-label">생산적(투자)</td>
                  <td class="time-budget-compare-planned time-daily-budget-prod-planned">—</td>
                  <td class="time-budget-compare-actual time-daily-budget-prod-actual">—</td>
                </tr>
                <tr>
                  <td class="time-budget-compare-label">비생산적(소비)</td>
                  <td class="time-budget-compare-planned time-daily-budget-nonprod-planned">—</td>
                  <td class="time-budget-compare-actual time-daily-budget-nonprod-actual">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    container.appendChild(wrap);

    const fullTaskOpts = getFullTaskOptions();
    const tasksFromToday = getTasksFromTodayRows();
    const emptyOpt = { value: "", label: "—", color: "cat-empty" };
    /** 투자내역: 생산적 태그 과제만 + 카테고리 컬러 */
    const investTaskDropdownOptions = sortDailyBudgetTaskDropdownOptions([
      emptyOpt,
      ...fullTaskOpts
        .filter((o) => (o.productivity || "").toLowerCase() === "productive")
        .map((o) => ({
          value: o.name,
          label: o.name,
          color: getTaskColorForDropdown(o, true),
        })),
    ]);
    /** 소비내역: 비생산적 태그 과제만 + 카테고리 컬러 */
    const consumeTaskDropdownOptions = sortDailyBudgetTaskDropdownOptions([
      emptyOpt,
      ...fullTaskOpts
        .filter((o) => (o.productivity || "").toLowerCase() === "nonproductive")
        .map((o) => ({
          value: o.name,
          label: o.name,
          color: getTaskColorForDropdown(o, false),
        })),
    ]);
    function ensureTaskInOptions(opts, taskName, isInvest) {
      if (!(taskName || "").trim()) return opts;
      const name = String(taskName).trim();
      if (opts.some((o) => o.value === name)) return opts;
      const taskOpt = getTaskOptionByName(name);
      const color = getTaskColorForDropdown(taskOpt, isInvest);
      return sortDailyBudgetTaskDropdownOptions([
        ...opts,
        { value: name, label: name, color },
      ]);
    }

    /** 해당 날짜·과제명에 해당하는 전체 탭 실제 사용시간 합계 */
    function getActualTimeForTask(taskName) {
      if (!(taskName || "").trim()) return 0;
      const name = String(taskName).trim();
      return todayRows
        .filter((r) => (r.taskName || "").trim() === name)
        .reduce((sum, r) => sum + parseTimeToHours(r.timeTracked), 0);
    }

    /** 전체 탭 데이터에서 과제별 집계 (과제명, 총시간, 비생산적 여부) - 비생산적이면 소비, 그외 투자 */
    function getTasksFromTodayRows() {
      const byTask = {};
      todayRows.forEach((r) => {
        const task = (r.taskName || "").trim();
        if (!task) return;
        const p = r.productivity || getProductivityFromCategory(r.category);
        const hrs = parseTimeToHours(r.timeTracked);
        if (hrs <= 0) return;
        if (!byTask[task])
          byTask[task] = { task, hrs: 0, isNonproductive: false };
        byTask[task].hrs += hrs;
        if (p === "nonproductive") byTask[task].isNonproductive = true;
      });
      return Object.values(byTask);
    }

    function createBudgetTimeInput() {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "time-budget-time-input";
      input.placeholder = "hh:mm";
      input.maxLength = 5;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          input.blur();
          return;
        }
        if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
      });
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "");
      });
      input.addEventListener("blur", () => {
        const digits = input.value.replace(/\D/g, "");
        if (digits.length === 0 || digits.length === 1) {
          input.value = "";
          return;
        }
        const pad = (s) => String(s || "").padStart(2, "0");
        const h = Math.min(23, parseInt(digits.slice(0, 2), 10) || 0);
        const m = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
        input.value = `${pad(h)}:${pad(m)}`;
      });
      return input;
    }

    const storedGoals = getBudgetGoals(targetDateStr);
    const onHeaderUpdateRef = { current: null };

    function createBudgetTableRow(
      taskName,
      actualHours,
      initialGoalTime,
      isInvest,
    ) {
      const tr = document.createElement("tr");
      const taskTd = document.createElement("td");
      const actualTimeSpan = document.createElement("span");
      actualTimeSpan.className = "time-budget-actual-display";

      const goalInput = createBudgetTimeInput();
      if (initialGoalTime) goalInput.value = initialGoalTime;

      const evalDisplay = document.createElement("span");
      evalDisplay.className = "time-budget-eval-display";

      function updateEvalDisplay() {
        const name = taskDropdown.getValue();
        const goalHrs = parseTimeToHours(goalInput.value);
        const actualHrs = getActualTimeForTask(name);
        if (!name || goalHrs <= 0) {
          evalDisplay.textContent = "";
          evalDisplay.className = "time-budget-eval-display";
          return;
        }
        if (isInvest) {
          if (actualHrs >= goalHrs) {
            evalDisplay.textContent = "시간 투자 성공!";
            evalDisplay.className =
              "time-budget-eval-display time-budget-eval-success";
          } else {
            const diff = goalHrs - actualHrs;
            evalDisplay.textContent = `${formatHoursToReadable(diff)}을 더 투자하지 못한 이유가 뭘까요?`;
            evalDisplay.className =
              "time-budget-eval-display time-budget-eval-fail";
          }
        } else {
          if (actualHrs <= goalHrs) {
            evalDisplay.textContent = "시간 아끼기 성공";
            evalDisplay.className =
              "time-budget-eval-display time-budget-eval-success";
          } else {
            const diff = actualHrs - goalHrs;
            evalDisplay.textContent = `${formatHoursToReadable(diff)}만큼 시간을 낭비한 이유가 뭘까요?`;
            evalDisplay.className =
              "time-budget-eval-display time-budget-eval-fail";
          }
        }
      }

      function updateActualTimeDisplay() {
        const name = taskDropdown.getValue();
        const hrs = getActualTimeForTask(name);
        actualTimeSpan.textContent = hrs > 0 ? formatHoursToHHMM(hrs) : "";
        updateEvalDisplay();
      }
      function saveCurrentGoal() {
        const name = taskDropdown.getValue();
        if (name)
          saveBudgetGoal(targetDateStr, name, goalInput.value, isInvest);
      }

      goalInput.addEventListener("input", () => {
        saveCurrentGoal();
        updateEvalDisplay();
      });
      goalInput.addEventListener("blur", saveCurrentGoal);

      const opts = ensureTaskInOptions(
        isInvest ? investTaskDropdownOptions : consumeTaskDropdownOptions,
        taskName,
        isInvest,
      );
      const taskDropdown = createTagDropdown(
        opts,
        taskName || "",
        "cat",
        () => {
          updateActualTimeDisplay();
          saveCurrentGoal();
          onHeaderUpdateRef.current?.();
        },
        signal,
        true,
      );
      taskTd.appendChild(taskDropdown.wrap);
      tr.appendChild(taskTd);

      const goalTimeTd = document.createElement("td");
      goalTimeTd.appendChild(goalInput);
      tr.appendChild(goalTimeTd);
      const actualTimeTd = document.createElement("td");
      actualTimeSpan.textContent =
        actualHours > 0 ? formatHoursToHHMM(actualHours) : "";
      actualTimeTd.appendChild(actualTimeSpan);
      tr.appendChild(actualTimeTd);
      const evalTd = document.createElement("td");
      evalTd.className = "time-budget-eval-cell";
      evalTd.appendChild(evalDisplay);
      tr.appendChild(evalTd);

      updateEvalDisplay();
      return tr;
    }

    /** todayRows + 저장된 목표(실제 기록 없는 과제) 병합 */
    const investTasks = [];
    const consumeTasks = [];
    const seenInvest = new Set();
    const seenConsume = new Set();
    tasksFromToday.forEach((t) => {
      if (t.isNonproductive) {
        consumeTasks.push(t);
        seenConsume.add(t.task);
      } else {
        investTasks.push(t);
        seenInvest.add(t.task);
      }
    });
    Object.entries(storedGoals).forEach(([task, data]) => {
      if (data.isInvest && !seenInvest.has(task)) {
        investTasks.push({ task, hrs: 0, isNonproductive: false });
        seenInvest.add(task);
      } else if (!data.isInvest && !seenConsume.has(task)) {
        consumeTasks.push({ task, hrs: 0, isNonproductive: true });
        seenConsume.add(task);
      }
    });

    const tablesWrap = document.createElement("div");
    tablesWrap.className = "time-daily-budget-tables-wrap";

    const investBlock = document.createElement("div");
    investBlock.className = "time-daily-budget-table-block";
    investBlock.innerHTML = `<div class="time-daily-budget-table-title">시간 투자 내역</div>`;
    const investTable = document.createElement("table");
    investTable.className = "time-daily-budget-table";
    investTable.innerHTML = `
      <thead>
        <tr>
          <th>과제명</th>
          <th class="time-budget-col-goal">목표 시간</th>
          <th>실제 보낸 시간</th>
          <th>시간평가</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const investAddRow = document.createElement("tr");
    investAddRow.className = "time-row-add";
    const investAddCell = document.createElement("td");
    investAddCell.colSpan = 4;
    investAddCell.className = "time-cell-add";
    const investAddBtn = document.createElement("button");
    investAddBtn.type = "button";
    investAddBtn.className = "time-btn-add";
    investAddBtn.innerHTML = "+";
    investAddCell.appendChild(investAddBtn);
    investAddRow.appendChild(investAddCell);

    const investTbody = investTable.querySelector("tbody");
    investTasks.forEach((t) => {
      const goal = storedGoals[t.task];
      const goalTime = goal?.goalTime || "";
      investTbody.appendChild(
        createBudgetTableRow(t.task, t.hrs, goalTime, true),
      );
    });
    investTbody.appendChild(investAddRow);
    investAddBtn.addEventListener("click", () => {
      const tr = createBudgetTableRow("", 0, "", true);
      investTbody.insertBefore(tr, investAddRow);
    });
    investBlock.appendChild(investTable);
    tablesWrap.appendChild(investBlock);

    const consumeAddRow = document.createElement("tr");
    consumeAddRow.className = "time-row-add";
    const consumeAddCell = document.createElement("td");
    consumeAddCell.colSpan = 4;
    consumeAddCell.className = "time-cell-add";
    const consumeAddBtn = document.createElement("button");
    consumeAddBtn.type = "button";
    consumeAddBtn.className = "time-btn-add";
    consumeAddBtn.innerHTML = "+";
    consumeAddCell.appendChild(consumeAddBtn);
    consumeAddRow.appendChild(consumeAddCell);

    const consumeBlock = document.createElement("div");
    consumeBlock.className = "time-daily-budget-table-block";
    consumeBlock.innerHTML = `<div class="time-daily-budget-table-title">시간 소비 내역</div>`;
    const consumeTable = document.createElement("table");
    consumeTable.className = "time-daily-budget-table";
    consumeTable.innerHTML = `
      <thead>
        <tr>
          <th>과제명</th>
          <th class="time-budget-col-goal">목표 시간</th>
          <th>실제 보낸 시간</th>
          <th>시간평가</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const consumeTbody = consumeTable.querySelector("tbody");
    consumeTasks.forEach((t) => {
      const goal = storedGoals[t.task];
      const goalTime = goal?.goalTime || "";
      consumeTbody.appendChild(
        createBudgetTableRow(t.task, t.hrs, goalTime, false),
      );
    });
    consumeTbody.appendChild(consumeAddRow);
    consumeAddBtn.addEventListener("click", () => {
      const tr = createBudgetTableRow("", 0, "", false);
      consumeTbody.insertBefore(tr, consumeAddRow);
    });
    consumeBlock.appendChild(consumeTable);
    tablesWrap.appendChild(consumeBlock);

    const remainingScheduledEl = wrap.querySelector(
      ".time-daily-budget-remaining-scheduled",
    );
    const prodPlannedEl = wrap.querySelector(".time-daily-budget-prod-planned");
    const nonprodPlannedEl = wrap.querySelector(
      ".time-daily-budget-nonprod-planned",
    );

    /** 테이블 행에서 실제 보낸 시간 합계 (과제별 중복 제거 후 합산) */
    function sumActualFromTable(block) {
      const seen = new Set();
      let sum = 0;
      block.querySelectorAll("tbody tr:not(.time-row-add)").forEach((tr) => {
        const dropdownWrap = tr.querySelector(".time-tag-dropdown-wrap");
        if (!dropdownWrap?._getValue) return;
        const task = String(dropdownWrap._getValue() || "").trim();
        if (task && !seen.has(task)) {
          seen.add(task);
          sum += getActualTimeForTask(task);
        }
      });
      return sum;
    }

    function updateRemainingScheduled() {
      let investGoalSum = 0;
      let consumeGoalSum = 0;
      investBlock.querySelectorAll(".time-budget-time-input").forEach((inp) => {
        investGoalSum += parseTimeToHours(inp.value);
      });
      consumeBlock
        .querySelectorAll(".time-budget-time-input")
        .forEach((inp) => {
          consumeGoalSum += parseTimeToHours(inp.value);
        });
      const investActualSum = sumActualFromTable(investBlock);
      const consumeActualSum = sumActualFromTable(consumeBlock);

      const goalSum = investGoalSum + consumeGoalSum;
      const remaining = Math.max(0, 24 - goalSum);
      if (remainingScheduledEl)
        remainingScheduledEl.textContent = formatHoursToHHMM(remaining);
      if (prodPlannedEl)
        prodPlannedEl.textContent =
          investGoalSum > 0 ? formatHoursToHHMM(investGoalSum) : "—";
      if (nonprodPlannedEl)
        nonprodPlannedEl.textContent =
          consumeGoalSum > 0 ? formatHoursToHHMM(consumeGoalSum) : "—";
      const prodActualEl = wrap.querySelector(".time-daily-budget-prod-actual");
      const nonprodActualEl = wrap.querySelector(
        ".time-daily-budget-nonprod-actual",
      );
      if (prodActualEl)
        prodActualEl.textContent =
          investActualSum > 0 ? formatHoursToHHMM(investActualSum) : "—";
      if (nonprodActualEl)
        nonprodActualEl.textContent =
          consumeActualSum > 0 ? formatHoursToHHMM(consumeActualSum) : "—";
    }

    onHeaderUpdateRef.current = updateRemainingScheduled;
    updateRemainingScheduled();
    const onGoalTimeChange = (e) => {
      if (e.target.classList.contains("time-budget-time-input"))
        updateRemainingScheduled();
    };
    container.addEventListener("input", onGoalTimeChange);
    container.addEventListener("blur", onGoalTimeChange);

    container.appendChild(tablesWrap);
  }

  function updateFilterBarVisibility(view) {
    /* 모바일에서 navCluster가 contentWrap 툴바로 붙으면 버튼이 filterBar 밖에 있음 */
    const taskSelectBtn = el.querySelector("#time-task-select-btn");
    if (isTimeLedgerAuditLikeView(view)) {
      if (filterNavCluster) filterNavCluster.style.display = "";
      if (taskSetupBtn) taskSetupBtn.style.display = "none";
      if (taskSelectBtn) {
        taskSelectBtn.style.display = "none";
        taskSelectBtn.classList.remove("is-active");
      }
      selectedTaskNamesForFilter = null;
      filterBar.querySelectorAll("[data-audit-range-hidden]").forEach((el) => {
        el.style.display = "";
      });
      if (startDateInput) startDateInput.dataset.hideDeleteBtn = "true";
      persistActiveViewTimeFilterToSession();
    } else if (view === "blank") {
      if (filterNavCluster) filterNavCluster.style.display = "none";
      if (taskSetupBtn) taskSetupBtn.style.display = "none";
      if (taskSelectBtn) taskSelectBtn.style.display = "none";
    } else {
      if (filterNavCluster) filterNavCluster.style.display = "";
      if (taskSetupBtn)
        taskSetupBtn.style.display = view === "all" ? "" : "none";
      if (taskSelectBtn) taskSelectBtn.style.display = "";
      filterBar.querySelectorAll("[data-audit-range-hidden]").forEach((el) => {
        el.style.display = "";
      });
      if (startDateInput) delete startDateInput.dataset.hideDeleteBtn;
    }
    syncTimeFilterDateLabels();
  }

  function getFilteredRows(rows) {
    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    return filterRowsByFilterType(rows, type, y, m, start, end);
  }

  function switchView(view, opts = {}) {
    const userSubTabClick = !!opts.userSubTabClick;
    if (!TIME_LEDGER_SHOW_IMPROVE_TAB && view === "improve") view = "all";
    el.dataset.timeContentView = view;
    const hourlyAddSlotRoot = el.querySelector(".time-hourly-add-slot");
    if (
      hourlyAddSlotRoot &&
      !window.matchMedia(MQ_TIME_LEDGER_MAX_MOBILE).matches &&
      view !== "all"
    ) {
      hourlyAddSlotRoot.innerHTML = "";
    }
    const currentView = viewTabs.querySelector(".time-view-tab.active")?.dataset
      ?.view;
    if (view === "audit" && currentView !== "audit") {
      const { rangeStart, rangeEnd } =
        readTimeLedgerAuditSessionFilterRangeYmd();
      filterStartDate = rangeStart;
      filterEndDate = rangeEnd;
      if (startDateInput) {
        startDateInput.value = rangeStart;
        endDateInput.value = rangeEnd;
      }
    } else if (view === "retrospect" && currentView !== "retrospect") {
      const { rangeStart, rangeEnd } =
        readTimeLedgerRetrospectSessionFilterRangeYmd();
      filterStartDate = rangeStart;
      filterEndDate = rangeEnd;
      if (startDateInput) {
        startDateInput.value = rangeStart;
        endDateInput.value = rangeEnd;
      }
    } else if (
      isTimeLedgerAuditLikeView(currentView) &&
      !isTimeLedgerAuditLikeView(view)
    ) {
      const { rangeStart, rangeEnd } = readTimeLedgerSessionFilterRangeYmd();
      filterStartDate = rangeStart;
      filterEndDate = rangeEnd;
      if (startDateInput) {
        startDateInput.value = rangeStart;
        endDateInput.value = rangeEnd;
      }
    }
    if (currentView === "all") {
      mergeRowsIntoCache();
      cachedRows = getFullRowsForFilter(true);
    }
    const rowsToUse =
      view === "blank" ||
      isTimeLedgerAuditLikeView(view) ||
      (view === "improve" && TIME_LEDGER_SHOW_IMPROVE_TAB)
        ? cachedRows
        : getFilteredRows(cachedRows);
    viewTabs.querySelectorAll(".time-view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    syncTimeLedgerSegmentThumb();
    updateFilterBarVisibility(view);
    if (view === "all") {
      renderAll(rowsToUse);
    } else if (view === "blank") {
      clearTimeLedgerMobileElapsedTimer(el);
      rescueTimeFilterControlsToFilterBar();
      contentWrap.innerHTML = "";
    } else if (view === "audit") {
      renderAudit(getFilteredRows(cachedRows));
    } else if (view === "retrospect") {
      renderRetrospect(getFilteredRows(cachedRows));
    } else if (view === "improve" && TIME_LEDGER_SHOW_IMPROVE_TAB) {
      renderImprove(getFilteredRows(cachedRows));
    }
    updateTotal();
    syncTimeFilterDateLabels();
    /* 상위 시간가계부 탭은 App에서 기록·예산 pull + 과제 목록 pull. 내부「시간 기록」「보고서」는 기록·예산·노트만(과제 pull 없음). */
    if (
      userSubTabClick &&
      (view === "all" || view === "audit" || view === "retrospect")
    ) {
      const gen = (el._lpTimeSubTabPullGen =
        (el._lpTimeSubTabPullGen || 0) + 1);
      void (async () => {
        try {
          await pullTimeLedgerTabEnterFromCloud();
        } catch (_) {}
        if (!el.isConnected || gen !== el._lpTimeSubTabPullGen) return;
        refreshTimeLedgerFromRemotePull();
      })();
    }
  }

  viewTabs.querySelectorAll(".time-view-tab").forEach((btn) => {
    btn.addEventListener("click", () =>
      switchView(btn.dataset.view, { userSubTabClick: true }),
    );
  });

  tableWrap.appendChild(table);
  const ledgerContainer = document.createElement("div");
  ledgerContainer.className = "time-ledger-container";
  ledgerContainer.appendChild(tableWrap);
  contentWrap.appendChild(ledgerContainer);

  onFilterChange(true);

  function refreshTimeLedgerFromRemotePull() {
    if (!el.isConnected) return;
    /* App 탭 진입 pull 직후 session 만 오늘 등으로 바뀌고 DOM 날짜는 옛값일 수 있음 → 통째로 renderMain 하지 않고 갱신할 때 맞춤 */
    try {
      let activeView =
        viewTabs.querySelector(".time-view-tab.active")?.dataset?.view || "all";
      if (!TIME_LEDGER_SHOW_IMPROVE_TAB && activeView === "improve") {
        activeView = "all";
      }
      const { rangeStart, rangeEnd } =
        activeView === "audit"
          ? readTimeLedgerAuditSessionFilterRangeYmd()
          : activeView === "retrospect"
            ? readTimeLedgerRetrospectSessionFilterRangeYmd()
            : readTimeLedgerSessionFilterRangeYmd();
      filterStartDate = rangeStart;
      filterEndDate = rangeEnd;
      if (startDateInput) startDateInput.value = rangeStart;
      if (endDateInput) endDateInput.value = rangeEnd;
      syncTimeFilterDateLabels();
      _pickerRangeKeyAtLastPullIntent = computePickerRangeKeyForPull();
    } catch (_) {}
    allRowsCache = loadTimeRows();
    cachedRows = getFullRowsForFilter(true);
    const active =
      viewTabs.querySelector(".time-view-tab.active")?.dataset?.view || "all";
    switchView(active);
  }

  /** App.setActiveTab 에서 pull 후 두 번째 renderMain 대신 호출 — 패널 통째 교체 없이 위 갱신만 */
  window.__lpTimeLedgerSoftRefresh = refreshTimeLedgerFromRemotePull;
  signal.addEventListener(
    "abort",
    () => {
      if (window.__lpTimeLedgerSoftRefresh === refreshTimeLedgerFromRemotePull) {
        delete window.__lpTimeLedgerSoftRefresh;
      }
    },
    { once: true },
  );

  document.addEventListener(
    "lp-time-ledger-remote-updated",
    refreshTimeLedgerFromRemotePull,
    { signal },
  );

  /* 가계부 지출 메모리가 늦게 채워져도 모바일 카드 소비 줄이 실제 명·금액으로 갱신되게 */
  function scheduleRefreshMobileExpenseSnippets() {
    queueMicrotask(() => {
      if (!el.isConnected) return;
      refreshMobileTimeCardExpenseSnippetsIn(contentWrap);
    });
  }
  window.addEventListener("asset-expense-transactions-saved", scheduleRefreshMobileExpenseSnippets, {
    signal,
  });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") scheduleRefreshMobileExpenseSnippets();
    },
    { signal },
  );

  return el;
}

/** 캘린더 1일뷰용: 시간 투자/소비 내역 테이블만 렌더 (일간시간예산에서 사용). topBarLeft 있으면 남은시간을 그쪽에 넣고 상단 한 줄로 축소 */
export function renderTimeBudgetTablesForCalendar(
  container,
  dateStr,
  todoSectionEl,
  onScheduledUpdate,
  onOverlapCleared,
  topBarLeft,
  skipBudgetTaskNamesSet,
  budgetAddButtonMount = null,
) {
  const targetDateStr = dateStr || toDateStr(new Date());
  /* 오늘 할일과 동명 과제는 왼쪽 투자·소비 표에서만 숨김 — localStorage는 지우지 않음(예상 타임라인용) */
  const skipBudgetTableForTasks = new Set();
  if (skipBudgetTaskNamesSet instanceof Set) {
    skipBudgetTaskNamesSet.forEach((name) => {
      const n = String(name || "").trim();
      if (n) skipBudgetTableForTasks.add(n);
    });
  } else if (todoSectionEl) {
    todoSectionEl
      .querySelectorAll(".calendar-1day-todo-table tbody tr")
      .forEach((r) => {
        const n = (r.dataset.taskName || "").trim();
        if (n) skipBudgetTableForTasks.add(n);
      });
  }
  /* 캘린더 1일 오늘 해치우기: 시간기록으로 행을 채우지 않음 — 저장된 예산(storedGoals) + 사용자 추가 행만 */
  const fullTaskOpts = getFullTaskOptions();
  const storedGoals = getBudgetGoals(targetDateStr);
  /* 캘린더 1일뷰: 과제설정 목록만 표시, 여기서 추가 불가 */
  const emptyOpt = { value: "", label: "—", color: "cat-empty" };
  /** 투자내역: 생산적 태그 과제만 + 카테고리 컬러 */
  const investTaskDropdownOptions = sortDailyBudgetTaskDropdownOptions([
    emptyOpt,
    ...fullTaskOpts
      .filter((o) => (o.productivity || "").toLowerCase() === "productive")
      .map((o) => ({
        value: o.name,
        label: o.name,
        color: getTaskColorForDropdown(o, true),
      })),
  ]);
  /** 소비내역: 비생산적 태그 과제만 + 카테고리 컬러 */
  const consumeTaskDropdownOptions = sortDailyBudgetTaskDropdownOptions([
    emptyOpt,
    ...fullTaskOpts
      .filter((o) => (o.productivity || "").toLowerCase() === "nonproductive")
      .map((o) => ({
        value: o.name,
        label: o.name,
        color: getTaskColorForDropdown(o, false),
      })),
  ]);
  /** 목표 시간 - 문자만 막고, 숫자+백스페이스 자유, Enter로 입력완료 */
  function createBudgetTimeInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "time-budget-time-input";
    input.placeholder = "hh:mm";
    input.maxLength = 5;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
        return;
      }
      if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
    });
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
    });
    input.addEventListener("blur", () => {
      const digits = input.value.replace(/\D/g, "");
      if (digits.length === 0 || digits.length === 1) {
        input.value = "";
        return;
      }
      const pad = (s) => String(s || "").padStart(2, "0");
      const h = Math.min(23, parseInt(digits.slice(0, 2), 10) || 0);
      const m = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
      input.value = `${pad(h)}:${pad(m)}`;
    });
    return input;
  }

  function parseScheduledTime(scheduledTime) {
    if (!scheduledTime || !scheduledTime.trim()) return { start: "", end: "" };
    const s = String(scheduledTime).trim();
    const m = s.match(/^(\d{1,2}:\d{0,2})-(\d{1,2}:\d{0,2})$/);
    if (m) return { start: m[1], end: m[2] };
    const single = s.match(/^(\d{1,2}:\d{0,2})$/);
    if (single) return { start: single[1], end: "" };
    return { start: "", end: "" };
  }
  function isValidStartEnd(start, end) {
    if (!start || !end) return true;
    return parseTimeToHours(end) > parseTimeToHours(start);
  }

  /** 시작~마감 차이를 「N시간 M분」표기(표시만, 서버 미저장 · 자정 넘김은 +24h) */
  function formatBudgetSlotDurationHhMm(start, end) {
    const s = (start || "").trim();
    const e = (end || "").trim();
    const hhmmRe = /^\d{1,2}:\d{2}$/;
    if (!hhmmRe.test(s) || !hhmmRe.test(e)) return "";
    if (!isValidStartEnd(s, e)) return "";
    let startH = parseTimeToHours(s);
    let endH = parseTimeToHours(e);
    if (endH <= startH) endH += 24;
    const totalMins = Math.round((endH - startH) * 60);
    if (totalMins <= 0) return "";
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m}분`;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
  }

  function updateBudgetRowDurationCell(tr) {
    if (!tr || tr.classList.contains("time-row-add")) return;
    const el = tr.querySelector(".time-budget-duration-value");
    if (!el) return;
    const inputs = tr.querySelectorAll(".time-budget-scheduled-input");
    const start =
      inputs.length >= 1
        ? (inputs[0]?.value || "").trim()
        : (tr.dataset.scheduledStart || "").trim();
    const end =
      inputs.length >= 2
        ? (inputs[1]?.value || "").trim()
        : (tr.dataset.scheduledEnd || "").trim();
    el.textContent = formatBudgetSlotDurationHhMm(start, end);
  }

  /* 예상 타임테이블 색상 규칙과 통일: 기타=prod-green, 생산성=prod-pink, 비생산=prod-blue */
  const basicTaskDropdownOptions = [
    { value: "수면하기", label: "수면하기", color: "prod-green" },
    { value: "근무하기", label: "근무하기", color: "prod-green" },
  ];

  const allCalendarBudgetAddOptions = sortDailyBudgetTaskDropdownOptions([
    emptyOpt,
    ...basicTaskDropdownOptions,
    ...investTaskDropdownOptions.filter((o) => String(o.value || "").trim()),
    ...consumeTaskDropdownOptions.filter((o) => String(o.value || "").trim()),
  ]);

  /** 과제 입장(추가) 모달: 섹션별로 이 목록만 드롭다운에 표시 */
  const calendarBudgetModalOptionsBasic = sortDailyBudgetTaskDropdownOptions([
    emptyOpt,
    ...basicTaskDropdownOptions,
  ]);
  const calendarBudgetModalOptionsProductive = investTaskDropdownOptions;
  const calendarBudgetModalOptionsNonproductive = consumeTaskDropdownOptions;

  function productiveBudgetPickerBucket(taskLike) {
    const t =
      taskLike && typeof taskLike === "object" ? taskLike : { name: taskLike };
    const n = String(t.name ?? "").trim();
    if (!n) return null;
    const cat = String(t.category ?? "")
      .trim()
      .toLowerCase();
    if (
      cat === "dream" ||
      cat === "happiness" ||
      cat === "sideincome" ||
      cat === "health"
    ) {
      return cat;
    }
    return null;
  }

  function dispatchBudgetRebuild() {
    document.dispatchEvent(
      new CustomEvent("calendar-budget-scheduled-updated", {
        detail: { dateStr: targetDateStr, rebuildBudgetTables: true },
      }),
    );
  }

  /** 과제 기록 모달 `buildTaskDropdown`과 동일한 마크업·클래스 — 옵션 목록만 예산 추가용으로 한정.
   * 기본/KPI 배지 표시 정책도 과제 기록 드롭다운과 동일합니다.
   * @param {{ productivePicker?: boolean; productiveCategoryBuckets?: string[] }} [dropdownOpts] —
   *   `productiveCategoryBuckets`: 예) `['happiness']` 또는 `['dream','sideincome']` 로 구역만 필터 · 다중이면 해당 칩만 표시 */

  function buildCalendarBudgetTaskLogDropdown(
    addOptionsSource,
    abortSignal,
    dropdownOpts = {},
  ) {
    const categoryBucketFilter =
      Array.isArray(dropdownOpts.productiveCategoryBuckets) &&
      dropdownOpts.productiveCategoryBuckets.length > 0
        ? dropdownOpts.productiveCategoryBuckets
            .map((id) => String(id || "").trim().toLowerCase())
            .filter(Boolean)
        : null;
    const productivePickerLegacy =
      !!dropdownOpts.productivePicker && !categoryBucketFilter;
    const useBucketChrome =
      productivePickerLegacy ||
      !!(categoryBucketFilter && categoryBucketFilter.length > 1);
    const wrap = document.createElement("div");
    wrap.className = "time-task-log-task-dropdown";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "time-task-log-task-dropdown-trigger";
    trigger.textContent = "과제를 선택하세요";
    const panel = document.createElement("div");
    panel.className = "time-task-log-task-dropdown-panel";
    if (useBucketChrome) {
      panel.classList.add(
        "time-task-log-task-dropdown-panel--productive-buckets",
      );
    }
    panel.hidden = true;
    let value = "";
    let searchQuery = "";
    let pickerBucket = productivePickerLegacy
      ? "dream"
      : categoryBucketFilter?.[0] || "dream";

    const PRODUCTIVE_BUCKET_CHIPS = [
      { id: "dream", label: "꿈" },
      { id: "happiness", label: "행복" },
      { id: "sideincome", label: "부수입" },
      { id: "health", label: "건강" },
    ];

    function resolveRows() {
      const seen = new Set();
      const rows = [];
      for (const o of addOptionsSource || []) {
        const name = String(o.value ?? o.label ?? "").trim();
        if (!name) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        const full = getTaskOptionByName(name);
        rows.push({
          name,
          full: full || { name },
        });
      }
      return rows;
    }

    function renderOptions(container, filter) {
      container.innerHTML = "";
      const q = (filter || "").trim().toLowerCase();

      let tasks = resolveRows();
      if (categoryBucketFilter && !q) {
        tasks = tasks.filter((t) => {
          const b = productiveBudgetPickerBucket(t.full);
          return b && categoryBucketFilter.includes(b);
        });
      } else if (productivePickerLegacy && !q) {
        tasks = tasks.filter(
          (t) => productiveBudgetPickerBucket(t.full) === pickerBucket,
        );
      }
      if (q) {
        tasks = tasks.filter((t) => t.name.toLowerCase().includes(q));
      }
      tasks.sort((a, b) => a.name.localeCompare(b.name, "ko"));
      tasks.forEach((t) => {
        const row = document.createElement("div");
        row.className = "time-task-log-task-dropdown-option";
        const prod = (
          t.full?.productivity ||
          getProductivityFromCategory(t.full?.category) ||
          "productive"
        )
          .toString()
          .toLowerCase()
          .trim();
        const barClass =
          prod === "nonproductive"
            ? "time-task-prod-bar time-task-prod-bar--nonproductive"
            : prod === "productive"
              ? "time-task-prod-bar time-task-prod-bar--productive"
              : "time-task-prod-bar time-task-prod-bar--other";
        const bar = document.createElement("span");
        bar.className = barClass;
        bar.setAttribute("aria-hidden", "true");
        const textWrap = document.createElement("span");
        textWrap.className = "time-task-log-task-dropdown-option-text";
        const label = document.createElement("span");
        label.className = "time-task-log-task-dropdown-option-label";
        label.textContent = t.name;
        textWrap.appendChild(label);
        appendTaskDropdownBadges(textWrap, t.full);
        row.appendChild(bar);
        row.appendChild(textWrap);
        const closePanelAndSelect = () => {
          value = t.name;
          trigger.textContent = value || "과제를 선택하세요";
          panel.hidden = true;
        };
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          closePanelAndSelect();
        });
        row.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          closePanelAndSelect();
        });
        container.appendChild(row);
      });
    }

    function renderPanel() {
      panel.innerHTML = "";
      let optionsContainer = null;

      const searchWrap = document.createElement("div");
      searchWrap.className = "time-task-log-task-dropdown-search-wrap";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "과제 검색...";
      searchInput.className = "time-task-log-task-dropdown-search";
      searchInput.value = searchQuery;
      searchInput.setAttribute("autocomplete", "off");
      searchWrap.appendChild(searchInput);
      panel.appendChild(searchWrap);

      if (productivePickerLegacy) {
        const chipsWrap = document.createElement("div");
        chipsWrap.className = "time-task-log-task-dropdown-buckets";
        chipsWrap.setAttribute("role", "tablist");
        chipsWrap.setAttribute("aria-label", "생산적 과제 구역");
        PRODUCTIVE_BUCKET_CHIPS.forEach(({ id, label }) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "time-task-log-task-dropdown-bucket";
          b.dataset.bucket = id;
          b.textContent = label;
          b.setAttribute("role", "tab");
          b.setAttribute("aria-selected", id === pickerBucket ? "true" : "false");
          if (id === pickerBucket) b.classList.add("is-active");
          b.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            pickerBucket = id;
            chipsWrap.querySelectorAll(".time-task-log-task-dropdown-bucket").forEach((x) => {
              const on = x.dataset.bucket === id;
              x.classList.toggle("is-active", on);
              x.setAttribute("aria-selected", on ? "true" : "false");
            });
            if (optionsContainer) {
              renderOptions(optionsContainer, searchQuery);
            }
          });
          chipsWrap.appendChild(b);
        });
        panel.appendChild(chipsWrap);
      } else if (categoryBucketFilter && categoryBucketFilter.length > 1) {
        const chipsWrap = document.createElement("div");
        chipsWrap.className = "time-task-log-task-dropdown-buckets";
        chipsWrap.setAttribute("role", "tablist");
        const ariaBucket =
          categoryBucketFilter.includes("dream") &&
          categoryBucketFilter.includes("sideincome")
            ? "꿈·부수입 과제 구역"
            : categoryBucketFilter.includes("happiness") &&
                categoryBucketFilter.includes("health")
              ? "행복·건강 과제 구역"
              : "과제 구역";
        chipsWrap.setAttribute("aria-label", ariaBucket);
        const subsetChips = PRODUCTIVE_BUCKET_CHIPS.filter((c) =>
          categoryBucketFilter.includes(c.id),
        );
        subsetChips.forEach(({ id, label }) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "time-task-log-task-dropdown-bucket";
          b.dataset.bucket = id;
          b.textContent = label;
          b.setAttribute("role", "tab");
          b.setAttribute("aria-selected", id === pickerBucket ? "true" : "false");
          if (id === pickerBucket) b.classList.add("is-active");
          b.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            pickerBucket = id;
            chipsWrap.querySelectorAll(".time-task-log-task-dropdown-bucket").forEach((x) => {
              const on = x.dataset.bucket === id;
              x.classList.toggle("is-active", on);
              x.setAttribute("aria-selected", on ? "true" : "false");
            });
            if (optionsContainer) {
              renderOptions(optionsContainer, searchQuery);
            }
          });
          chipsWrap.appendChild(b);
        });
        panel.appendChild(chipsWrap);
      }

      optionsContainer = document.createElement("div");
      optionsContainer.className = "time-task-log-task-dropdown-options";
      panel.appendChild(optionsContainer);
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value.trim();
        renderOptions(optionsContainer, searchQuery);
      });
      searchInput.addEventListener("click", (e) => e.stopPropagation());
      searchInput.addEventListener("keydown", (e) => e.stopPropagation());
      renderOptions(optionsContainer, searchQuery);
    }

    trigger.addEventListener("click", () => {
      searchQuery = "";
      if (productivePickerLegacy) pickerBucket = "dream";
      else if (categoryBucketFilter?.length) {
        pickerBucket = categoryBucketFilter.includes(pickerBucket)
          ? pickerBucket
          : categoryBucketFilter[0];
      }
      renderPanel();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        requestAnimationFrame(() =>
          panel.querySelector(".time-task-log-task-dropdown-search")?.focus(),
        );
      }
    });

    const closePanelOnOutside = (e) => {
      if (!wrap.contains(e.target) && !panel.contains(e.target)) {
        panel.hidden = true;
      }
    };
    document.addEventListener("mousedown", closePanelOnOutside, {
      capture: true,
      signal: abortSignal,
    });
    document.addEventListener("touchstart", closePanelOnOutside, {
      capture: true,
      signal: abortSignal,
    });

    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    wrap._getValue = () => value;
    wrap._setValue = (v) => {
      value = v != null ? String(v).trim() : "";
      trigger.textContent = value || "과제를 선택하세요";
    };
    return wrap;
  }

  function showCalendarBudgetTaskModal(modalOpts) {
    const dismissAc = new AbortController();
    const { signal: modalTaskUiSignal } = dismissAc;
    const mode = modalOpts?.mode || "add";
    const initialTask = String(modalOpts?.taskName || "").trim();
    const slotIndexRaw = modalOpts?.slotIndex;
    const initialStart = String(modalOpts?.start || "").trim();
    const initialEnd = String(modalOpts?.end || "").trim();
    const initialMemo = String(modalOpts?.memo ?? "").trim();
    const titleText = mode === "add" ? "과제 입장" : "과제 수정";
    const submitLabel = mode === "add" ? "추가" : "수정";

    const formatYmdOverlay = (isoTen) => {
      const m = String(isoTen || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return "";
      return `${m[1]}.${m[2]}.${m[3]}`;
    };

    const normHhMm = (val) => {
      if (!val || typeof val !== "string") return "";
      const m = val.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return val.trim();
      const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
      const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    };

    const autoFmtDigits = (val) => {
      const digits = (val || "").trim().replace(/\D/g, "");
      if (digits.length >= 4) {
        const h = Math.min(23, Math.max(0, parseInt(digits.slice(0, 2), 10)));
        const min = Math.min(59, Math.max(0, parseInt(digits.slice(2, 4), 10)));
        return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      }
      return "";
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
          autoFmtDigits(input.value) || normHhMm(input.value);
        input.value = formatted;
        input.blur();
        return;
      }
      if (e.key === ":" && e.target.value.includes(":")) {
        e.preventDefault();
        return;
      }
      if (!/^[\d:]$/.test(e.key)) e.preventDefault();
    };

    const filterPastedTime = (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData?.getData("text") || "").replace(
        /[^\d:]/g,
        "",
      );
      const input = e.target;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const current = input.value;
      const newVal = current.slice(0, start) + pasted + current.slice(end);
      input.value = newVal;
      input.setSelectionRange(start + pasted.length, start + pasted.length);
    };

    const modal = document.createElement("div");
    modal.className =
      "time-task-setup-modal time-task-log-modal calendar-budget-schedule-modal";
    modal.innerHTML = `
      <div class="time-task-setup-backdrop"></div>
      <div class="time-task-setup-panel time-task-log-panel">
        <div class="time-task-setup-header time-task-log-header">
          <h3 class="time-task-setup-title"></h3>
          <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
        </div>
        <div class="time-task-setup-body time-task-log-body">
          <div class="time-task-log-scroll-area">
            <div class="time-task-log-datetime-fields-wrap">
              <div class="time-task-log-field">
                <label>이 시간에 할 행동</label>
                <div class="time-task-log-task-wrap calendar-budget-task-modal-task-wrap"></div>
              </div>
              <div class="time-task-log-field time-task-log-datetime-onerow">
                <span class="time-task-log-section-label">시간</span>
                <div class="time-task-log-datetime-card">
                  <div class="time-task-log-datetime-input-row">
                    <div class="time-task-log-date-native-wrap">
                      <input type="date" class="time-task-log-date-start calendar-budget-schedule-modal-date" data-hide-delete-btn="true" data-use-native-mobile="true" />
                      <span class="time-task-log-date-overlay" aria-hidden="true"></span>
                    </div>
                    <span class="time-task-log-datetime-sep">-</span>
                    <input type="text" class="time-task-log-time-start" name="calendar-budget-time-start" placeholder="hh:mm" maxlength="5" />
                    <span class="time-task-log-datetime-sep">-</span>
                    <input type="text" class="time-task-log-time-end" name="calendar-budget-time-end" placeholder="hh:mm" maxlength="5" />
                  </div>
                </div>
                <span class="time-task-log-section-label time-task-log-quick-section-label">빠른 선택</span>
                <div class="time-task-log-time-adjust-btns">
                  <button type="button" class="time-task-log-time-adjust-btn time-task-log-time-adjust-now" data-now="true">지금</button>
                  <button type="button" class="time-task-log-time-adjust-btn time-task-log-time-adjust-last" data-last="true">마지막</button>
                  <button type="button" class="time-task-log-time-adjust-btn" data-delta="-30">−30</button>
                  <button type="button" class="time-task-log-time-adjust-btn" data-delta="-15">−15</button>
                  <button type="button" class="time-task-log-time-adjust-btn" data-delta="15">+15</button>
                  <button type="button" class="time-task-log-time-adjust-btn" data-delta="30">+30</button>
                  <button type="button" class="time-task-log-time-adjust-btn" data-day-end="true">하루끝</button>
                </div>
              </div>
            </div>
            <div class="time-task-log-memo-section">
              <span class="time-task-log-section-label time-task-log-memo-section-label">메모</span>
              <div class="time-task-log-memo-fields">
                <div class="time-task-log-field">
                  <textarea class="time-task-log-feedback time-task-log-memo-input" rows="3" placeholder="메모를 입력하세요"></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="time-task-log-footer" data-calendar-budget-footer>
          <button type="button" class="time-task-log-submit calendar-budget-task-modal-submit"></button>
          <button type="button" class="time-task-log-delete-btn calendar-budget-task-modal-delete">삭제</button>
        </div>
      </div>
    `;

    const titleEl = modal.querySelector(".time-task-setup-title");
    if (titleEl) titleEl.textContent = titleText;
    const submitBtn = modal.querySelector(".calendar-budget-task-modal-submit");
    if (submitBtn) submitBtn.textContent = submitLabel;
    const delBtn = modal.querySelector(".calendar-budget-task-modal-delete");
    if (delBtn) delBtn.hidden = mode !== "edit";

    const backdrop = modal.querySelector(".time-task-setup-backdrop");
    const closeBtn = modal.querySelector(".time-task-setup-close");
    const taskWrap = modal.querySelector(".calendar-budget-task-modal-task-wrap");
    const dateInp = modal.querySelector(".calendar-budget-schedule-modal-date");
    const timeStart = modal.querySelector(".time-task-log-time-start");
    const timeEnd = modal.querySelector(".time-task-log-time-end");
    const memoTa = modal.querySelector("textarea.time-task-log-feedback");

    const ymd = String(targetDateStr || "").trim().slice(0, 10);
    if (dateInp && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      dateInp.value = ymd;
      dateInp.readOnly = true;
    }
    if (timeStart && initialStart) timeStart.value = initialStart;
    if (timeEnd && initialEnd) timeEnd.value = initialEnd;
    if (memoTa) memoTa.value = initialMemo;

    function syncDateOverlay() {
      if (!dateInp) return;
      const v = (dateInp.value || "").trim().slice(0, 10);
      const has = /^\d{4}-\d{2}-\d{2}$/.test(v);
      dateInp.classList.toggle("time-task-log-date-has-value", has);
      const wrap = dateInp.closest(".time-task-log-date-native-wrap");
      wrap?.classList.toggle("time-task-log-date-native-wrap--has-value", has);
      const ov = wrap?.querySelector?.(".time-task-log-date-overlay");
      if (ov) ov.textContent = has ? formatYmdOverlay(v) : "";
    }
    syncDateOverlay();
    dateInp?.addEventListener("input", syncDateOverlay);

    let calendarBudgetTaskDropdownWrap = null;
    if (mode === "add" && taskWrap) {
      const sourceOpts =
        Array.isArray(modalOpts?.addTaskOptions) &&
        modalOpts.addTaskOptions.length > 0
          ? modalOpts.addTaskOptions
          : allCalendarBudgetAddOptions;
      const prodBuckets = modalOpts?.calendarBudgetProductiveBuckets;
      const hasProdBuckets =
        Array.isArray(prodBuckets) && prodBuckets.length > 0;
      calendarBudgetTaskDropdownWrap = buildCalendarBudgetTaskLogDropdown(
        sourceOpts,
        modalTaskUiSignal,
        hasProdBuckets
          ? { productiveCategoryBuckets: prodBuckets }
          : {
              productivePicker:
                !!modalOpts?.calendarBudgetProductivePicker,
            },
      );
      taskWrap.appendChild(calendarBudgetTaskDropdownWrap);
    } else if (taskWrap) {
      const opt = getTaskOptionByName(initialTask);
      const productivity = String(opt?.productivity || "")
        .toLowerCase()
        .trim();
      const ro = document.createElement("div");
      ro.className = "time-task-log-task-dropdown-trigger";
      ro.setAttribute("aria-readonly", "true");
      Object.assign(ro.style, {
        cursor: "default",
        display: "flex",
        alignItems: "center",
        gap: "0.45rem",
        pointerEvents: "none",
      });
      const bar = document.createElement("span");
      bar.className = "time-task-prod-bar";
      bar.classList.add(
        productivity === "nonproductive"
          ? "time-task-prod-bar--nonproductive"
          : productivity === "productive"
            ? "time-task-prod-bar--productive"
            : "time-task-prod-bar--other",
      );
      bar.setAttribute("aria-hidden", "true");
      const lbl = document.createElement("span");
      lbl.textContent = initialTask || "—";
      ro.appendChild(bar);
      ro.appendChild(lbl);
      taskWrap.appendChild(ro);
    }

    let lastFocusedTimeField = "end";
    timeStart?.addEventListener("focus", () => {
      lastFocusedTimeField = "start";
    });
    dateInp?.addEventListener("focus", () => {
      lastFocusedTimeField = "start";
    });
    timeEnd?.addEventListener("focus", () => {
      lastFocusedTimeField = "end";
    });

    const focusOutIsAdj = (ev) =>
      !!ev.relatedTarget?.closest?.(".time-task-log-time-adjust-btns");

    function setQuickActive(btn) {
      modal.querySelectorAll(".time-task-log-time-adjust-btn").forEach((b) => {
        b.classList.toggle(
          "time-task-log-time-adjust-active",
          !!(btn && b === btn),
        );
      });
    }

    [timeStart, timeEnd].forEach((el) => {
      if (!el) return;
      el.addEventListener("focusout", (ev) => {
        if (focusOutIsAdj(ev)) return;
        const pre = autoFmtDigits(el.value) || el.value;
        el.value = normHhMm(pre) || pre;
      });
      el.addEventListener("keydown", restrictToTimeChars);
      el.addEventListener("paste", filterPastedTime);
    });

    modal.querySelectorAll(".time-task-log-time-adjust-btn").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        if (e.button === 0) e.preventDefault();
      });
      btn.addEventListener("click", () => {
        const endVal = (timeEnd?.value || "").trim();
        const endHasTime = endVal && endVal.match(/\d{1,2}:\d{2}/);
        const targetIsStart = lastFocusedTimeField === "start" && endHasTime;
        const startTimeVal = normHhMm((timeStart?.value || "").trim());
        const startHasTime = startTimeVal && startTimeVal.match(/\d{1,2}:\d{2}/);
        const fallbackTime = startHasTime
          ? startTimeVal
          : `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;

        if (btn.dataset.last === "true") {
          const merged = mergeLedgerRowsForDedupe(loadTimeRows(), []);
          const latest = getLatestLedgerHhMmForTaskLogDate(
            dateInp?.value || ymd,
            null,
            merged,
          );
          if (!latest) {
            showToast("해당 날짜에 참고할 기록이 없습니다.");
            return;
          }
          if (targetIsStart) {
            if (timeStart) timeStart.value = latest;
          } else if (timeEnd) {
            timeEnd.value = latest;
          }
          setQuickActive(btn);
          return;
        }

        if (btn.dataset.dayEnd === "true") {
          if (timeEnd) timeEnd.value = "23:59";
          setQuickActive(btn);
          return;
        }

        if (btn.dataset.now === "true") {
          const newTime = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
          if (targetIsStart) {
            if (timeStart) timeStart.value = newTime;
          } else if (timeEnd) {
            timeEnd.value = newTime;
          }
          setQuickActive(btn);
        } else {
          const delta = parseInt(btn.dataset.delta || "0", 10);
          const baseTime = targetIsStart
            ? startHasTime
              ? startTimeVal
              : fallbackTime
            : endHasTime
              ? normHhMm(endVal)
              : startHasTime
                ? startTimeVal
                : fallbackTime;
          const normalized = normHhMm(baseTime) || fallbackTime;
          const [h, min] = normalized
            .split(":")
            .map((n) => parseInt(n, 10) || 0);
          let totalMin = h * 60 + min + delta;
          totalMin = ((totalMin % 1440) + 1440) % 1440;
          const nh = Math.floor(totalMin / 60) % 24;
          const nmin = totalMin % 60;
          const newTime = `${String(nh).padStart(2, "0")}:${String(nmin).padStart(2, "0")}`;
          if (targetIsStart) {
            if (timeStart) timeStart.value = newTime;
          } else if (timeEnd) {
            timeEnd.value = newTime;
          }
          setQuickActive(btn);
        }
      });
    });

    function close() {
      dismissAc.abort();
      modal.remove();
    }
    closeBtn?.addEventListener("click", close);
    backdrop?.addEventListener("click", close);

    delBtn?.addEventListener("click", () => {
      if (
        !deleteCalendarBudgetScheduleSlot(
              targetDateStr,
          initialTask,
          slotIndexRaw,
        )
      )
        return;
      dismissAc.abort();
      modal.remove();
      dispatchBudgetRebuild();
    });

    submitBtn?.addEventListener("click", () => {
      const name =
        mode === "add"
          ? (calendarBudgetTaskDropdownWrap?._getValue?.() || "").trim()
          : initialTask;
      if (!name) {
        showToast("과제를 선택해 주세요.");
        return;
      }
      const rawStart = (timeStart?.value || "").trim();
      const rawEnd = (timeEnd?.value || "").trim();
      const start = normHhMm(rawStart) || rawStart;
      const end = normHhMm(rawEnd) || rawEnd;
      if (!calendarBudgetTimesValid(start, end)) {
        showToast(
          "시작·마감 시간을 hh:mm 형식으로, 마감이 시작보다 뒤에 오게 입력해 주세요.",
        );
        return;
      }
      const ok = commitCalendarBudgetTaskModal(targetDateStr, {
        taskName: name,
        slotIndex: mode === "edit" ? slotIndexRaw : null,
        start,
        end,
        memo: memoTa?.value ?? "",
        isInvest: resolveCalendarBudgetIsInvest(name),
      });
      if (ok) {
        dismissAc.abort();
        modal.remove();
        dispatchBudgetRebuild();
      }
    });

    const appMount = document.getElementById("app");
    if (appMount) appMount.appendChild(modal);
    else document.body.appendChild(modal);
  }

  function createBudgetTableRow(
    taskName,
    _initialGoalTime,
    initialScheduledTime,
              isInvest,
    tbodyAndAddRow,
    _dropdownOptionsOverride,
    slotIndex,
    rowMemo,
  ) {
    const tr = document.createElement("tr");
    tr.className =
      "time-budget-calendar-row time-budget-calendar-row--readonly";
    void tbodyAndAddRow;

    const { start: initialStart, end: initialEnd } =
      parseScheduledTime(initialScheduledTime);

    const taskTd = document.createElement("td");
    const taskInner = document.createElement("div");
    taskInner.className = "time-budget-calendar-task-cell";
    const bar = document.createElement("span");
    bar.className = "time-task-prod-bar";
    const taskOpt = getTaskOptionByName((taskName || "").trim());
    const productivity = String(taskOpt?.productivity || "")
      .toLowerCase()
      .trim();
    bar.classList.add(
      productivity === "nonproductive"
        ? "time-task-prod-bar--nonproductive"
        : productivity === "productive"
          ? "time-task-prod-bar--productive"
          : "time-task-prod-bar--other",
    );
    const nameSpan = document.createElement("span");
    nameSpan.className = "time-budget-calendar-task-name";
    nameSpan.textContent = (taskName || "").trim();
    taskInner.appendChild(bar);
    taskInner.appendChild(nameSpan);
    taskTd.appendChild(taskInner);
    tr.appendChild(taskTd);

    tr.dataset.taskName = (taskName || "").trim();
    tr.dataset.scheduledStart = initialStart || "";
    tr.dataset.scheduledEnd = initialEnd || "";
    tr.dataset.slotIndex = String(slotIndex ?? 0);
    tr.dataset.scheduleMemo = (rowMemo || "").trim();

    const startTimeTd = document.createElement("td");
    startTimeTd.className = "time-budget-calendar-time-display";
    startTimeTd.textContent = initialStart ? initialStart : "—";
    tr.appendChild(startTimeTd);

    const endTimeTd = document.createElement("td");
    endTimeTd.className = "time-budget-calendar-time-display";
    endTimeTd.textContent = initialEnd ? initialEnd : "—";
    tr.appendChild(endTimeTd);

    const durationTd = document.createElement("td");
    durationTd.className = "time-budget-cell-duration";
    const durationSpan = document.createElement("span");
    durationSpan.className = "time-budget-duration-value";
    durationTd.appendChild(durationSpan);
    tr.appendChild(durationTd);
    updateBudgetRowDurationCell(tr);

    tr.addEventListener("click", () => {
      showCalendarBudgetTaskModal({
        mode: "edit",
        taskName: (taskName || "").trim(),
        slotIndex: Number(tr.dataset.slotIndex) || 0,
        start: (tr.dataset.scheduledStart || "").trim(),
        end: (tr.dataset.scheduledEnd || "").trim(),
        memo: tr.dataset.scheduleMemo || "",
      });
    });

    return tr;
  }

  function expandByScheduledTimes(task, data, isInvest, hrs = 0) {
    void hrs;
    const times = getScheduledTimesArray(data);
    const memos = getScheduleMemosArray(data);
    const entries = times.length > 0 ? times : [""];
    return entries.map((scheduledTime, idx) => ({
      task,
      hrs: 0,
      isNonproductive: !isInvest,
      scheduledTime,
      slotIndex: idx,
      rowMemo: String(memos[idx] || "").trim(),
    }));
  }

  const BASIC_TASKS = ["수면하기", "근무하기"];
  const isBasicTask = (task) => BASIC_TASKS.includes((task || "").trim());

  function calendarBudgetInvestDisplaySection(taskName) {
    const n = String(taskName || "").trim();
    const opt = getTaskOptionByName(n);
    const cat = String(opt?.category ?? "").trim().toLowerCase();
    if (cat === "happiness" || cat === "health") return "happiness_health";
    if (cat === "dream" || cat === "sideincome") return "dream_side";
    if (String(opt?.productivity ?? "").trim().toLowerCase() === "productive")
      return "dream_side";
    return "dream_side";
  }

  const excluded = getBudgetExcluded(targetDateStr);
  const investHappinessHealthTasks = [];
  const investDreamSideTasks = [];
  const consumeTasks = [];
  const seenInvest = new Set();
  const seenConsume = new Set();

  Object.entries(storedGoals).forEach(([task, data]) => {
    if (excluded.has(task)) return;
    if (skipBudgetTableForTasks.has(task)) return;
    if (isBudgetPlaceholder(task)) return;
    if (isBasicTask(task)) return; /* 수면/근무는 기본에만 */
    if (data.isInvest && !seenInvest.has(task)) {
      const secKey = calendarBudgetInvestDisplaySection(task);
      const investList =
        secKey === "happiness_health"
          ? investHappinessHealthTasks
          : investDreamSideTasks;
      expandByScheduledTimes(task, data, true).forEach((e) =>
        investList.push(e),
      );
      seenInvest.add(task);
    } else if (!data.isInvest && !seenConsume.has(task)) {
      expandByScheduledTimes(task, data, false).forEach((e) =>
        consumeTasks.push(e),
      );
      seenConsume.add(task);
    }
  });
  const basicTasks = [];
  const seenBasic = new Set();
  BASIC_TASKS.forEach((task) => {
    if (seenBasic.has(task)) return;
    const data = storedGoals[task];
    const times = getScheduledTimesArray(data);
    if (!times.length) {
      seenBasic.add(task);
      return;
    }
    const memos = getScheduleMemosArray(data);
    times.forEach((scheduledTime, idx) => {
      basicTasks.push({
        task,
        hrs: 0,
        isNonproductive: false,
        scheduledTime,
        slotIndex: idx,
        rowMemo: String(memos[idx] || "").trim(),
      });
    });
    seenBasic.add(task);
  });

  const globalAddBtn = document.createElement("button");
  globalAddBtn.type = "button";
  globalAddBtn.className =
    "todo-add-btn time-ledger-add-plus-btn calendar-1day-budget-add-btn";
  globalAddBtn.title = "예상 일정 과제 추가";
  globalAddBtn.setAttribute("aria-label", "예상 일정 과제 추가");
  globalAddBtn.innerHTML = TIME_LEDGER_ADD_PLUS_ICON_SVG;
  globalAddBtn.addEventListener("click", () => {
    showCalendarBudgetTaskModal({
      mode: "add",
      addTaskOptions: allCalendarBudgetAddOptions,
      calendarBudgetProductivePicker: true,
    });
  });

  const topBarCluster = document.createElement("div");
  topBarCluster.className = "calendar-1day-budget-topbar-cluster";
  /* 슬롯이 잠깐 DOM에서 떨어져 있어도(ref만 유효) 같은 참조로 이어 붙임 — 탭 전환 직후 깜빡임 방지 */
  const useExternalAddMount = budgetAddButtonMount != null;
  if (useExternalAddMount) {
    budgetAddButtonMount.replaceChildren();
    const toolbarIcons = document.createElement("div");
    toolbarIcons.className =
      "time-ledger-toolbar-icons calendar-1day-budget-toolbar-icons";
    toolbarIcons.appendChild(globalAddBtn);
    budgetAddButtonMount.appendChild(toolbarIcons);
  } else {
    const toolbarIcons = document.createElement("div");
    toolbarIcons.className =
      "time-ledger-toolbar-icons calendar-1day-budget-toolbar-icons";
    toolbarIcons.appendChild(globalAddBtn);
    topBarCluster.appendChild(toolbarIcons);
  }

  const remainingHeader = document.createElement("div");
  remainingHeader.className = "time-budget-calendar-remaining";
  const remainingTitleRow = document.createElement("div");
  remainingTitleRow.className = "time-budget-calendar-remaining-title-row";
  const remainingTitle = document.createElement("div");
  remainingTitle.className = "time-budget-calendar-remaining-title";
  remainingTitle.textContent = "남은 시간";
  remainingTitleRow.appendChild(remainingTitle);
  const remainingValueEl = document.createElement("div");
  remainingValueEl.className = "time-budget-calendar-remaining-value";
  remainingValueEl.textContent = "23:59";
  remainingHeader.appendChild(remainingTitleRow);
  remainingHeader.appendChild(remainingValueEl);
  topBarCluster.appendChild(remainingHeader);

  const sortByStartTime = (list) =>
    [...list].sort((a, b) => {
      const { start: aStart } = parseScheduledTime(a.scheduledTime ?? "");
      const { start: bStart } = parseScheduledTime(b.scheduledTime ?? "");
      const aH = aStart ? parseTimeToHours(aStart) : Infinity;
      const bH = bStart ? parseTimeToHours(bStart) : Infinity;
      return aH - bH;
    });

  const basicBlock = document.createElement("div");
  basicBlock.className =
    "time-daily-budget-table-block time-daily-budget-table-block--basic";
  const basicTableWrap = document.createElement("div");
  basicTableWrap.className = "time-daily-budget-table-scroll-wrap";
  const basicTable = document.createElement("table");
  basicTable.className = "time-daily-budget-table";
  basicTable.innerHTML = `
    <colgroup>
      <col class="time-budget-col-task">
      <col class="time-budget-col-start">
      <col class="time-budget-col-end">
      <col class="time-budget-col-duration">
    </colgroup>
    <thead>
      <tr>
        <th>과제명</th>
        <th class="time-budget-th-sched">
          <span class="time-budget-th-vis-desktop">예상 시작 시간</span>
          <span class="time-budget-th-vis-mobile">예상 시작</span>
        </th>
        <th class="time-budget-th-sched">
          <span class="time-budget-th-vis-desktop">예상 마감 시간</span>
          <span class="time-budget-th-vis-mobile">예상 마감</span>
        </th>
        <th class="time-budget-col-duration">소요 시간</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const basicTbody = basicTable.querySelector("tbody");
  const basicCtx = {
    tbody: basicTbody,
    addRow: null,
    onOverlapCleared,
    onScheduledUpdate,
  };
  sortByStartTime(basicTasks).forEach((t) => {
    const goal = storedGoals[t.task];
    const goalTime = goal?.goalTime || "";
    const scheduledTime = t.scheduledTime ?? goal?.scheduledTime ?? "";
    basicTbody.appendChild(
      createBudgetTableRow(
        t.task,
        goalTime,
        scheduledTime,
        true,
        basicCtx,
        basicTaskDropdownOptions,
        t.slotIndex,
        t.rowMemo,
      ),
    );
  });
  basicTableWrap.appendChild(basicTable);
  basicBlock.appendChild(basicTableWrap);

  function renderInvestBudgetTableBlock(taskEntries) {
    const block = document.createElement("div");
    block.className =
      "time-daily-budget-table-block time-daily-budget-table-block--invest";
    const investTableWrap = document.createElement("div");
    investTableWrap.className = "time-daily-budget-table-scroll-wrap";
    const investTable = document.createElement("table");
    investTable.className = "time-daily-budget-table";
    investTable.innerHTML = `
    <colgroup>
      <col class="time-budget-col-task">
      <col class="time-budget-col-start">
      <col class="time-budget-col-end">
      <col class="time-budget-col-duration">
    </colgroup>
    <thead>
      <tr>
        <th>과제명</th>
        <th class="time-budget-th-sched">
          <span class="time-budget-th-vis-desktop">예상 시작 시간</span>
          <span class="time-budget-th-vis-mobile">예상 시작</span>
        </th>
        <th class="time-budget-th-sched">
          <span class="time-budget-th-vis-desktop">예상 마감 시간</span>
          <span class="time-budget-th-vis-mobile">예상 마감</span>
        </th>
        <th class="time-budget-col-duration">소요 시간</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

    const investTbody = investTable.querySelector("tbody");
    const investCtx = {
      tbody: investTbody,
      addRow: null,
      onOverlapCleared,
      onScheduledUpdate,
    };
    sortByStartTime(taskEntries).forEach((t) => {
      const goal = storedGoals[t.task];
      const goalTime = goal?.goalTime || "";
      const scheduledTime = t.scheduledTime ?? goal?.scheduledTime ?? "";
      investTbody.appendChild(
        createBudgetTableRow(
          t.task,
          goalTime,
          scheduledTime,
          true,
          investCtx,
          null,
          t.slotIndex,
          t.rowMemo,
        ),
      );
    });
    investTableWrap.appendChild(investTable);
    block.appendChild(investTableWrap);
    return block;
  }

  const happinessHealthInvestBlock = renderInvestBudgetTableBlock(
    investHappinessHealthTasks,
  );
  const dreamSideInvestBlock =
    renderInvestBudgetTableBlock(investDreamSideTasks);

  const consumeBlock = document.createElement("div");
  consumeBlock.className =
    "time-daily-budget-table-block time-daily-budget-table-block--consume";
  const consumeTableWrap = document.createElement("div");
  consumeTableWrap.className = "time-daily-budget-table-scroll-wrap";
  const consumeTable = document.createElement("table");
  consumeTable.className = "time-daily-budget-table";
  consumeTable.innerHTML = `
    <colgroup>
      <col class="time-budget-col-task">
      <col class="time-budget-col-start">
      <col class="time-budget-col-end">
      <col class="time-budget-col-duration">
    </colgroup>
    <thead>
      <tr>
        <th>과제명</th>
        <th class="time-budget-th-sched">
          <span class="time-budget-th-vis-desktop">예상 시작 시간</span>
          <span class="time-budget-th-vis-mobile">예상 시작</span>
        </th>
        <th class="time-budget-th-sched">
          <span class="time-budget-th-vis-desktop">예상 마감 시간</span>
          <span class="time-budget-th-vis-mobile">예상 마감</span>
        </th>
        <th class="time-budget-col-duration">소요 시간</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const consumeTbody = consumeTable.querySelector("tbody");
  const consumeCtx = {
    tbody: consumeTbody,
    addRow: null,
    onOverlapCleared,
    onScheduledUpdate,
  };
  sortByStartTime(consumeTasks).forEach((t) => {
    const goal = storedGoals[t.task];
    const goalTime = goal?.goalTime || "";
    const scheduledTime = t.scheduledTime ?? goal?.scheduledTime ?? "";
    consumeTbody.appendChild(
      createBudgetTableRow(
        t.task,
        goalTime,
        scheduledTime,
        false,
        consumeCtx,
        null,
        t.slotIndex,
        t.rowMemo,
      ),
    );
  });
  consumeTableWrap.appendChild(consumeTable);
  consumeBlock.appendChild(consumeTableWrap);

  function createSectionHeader(title, onAdd, addBtnTitle) {
    const header = document.createElement("div");
    header.className = "time-daily-budget-section-header";
    const titleEl = document.createElement("span");
    titleEl.className = "time-daily-budget-section-title";
    titleEl.textContent = title;
    header.appendChild(titleEl);
    if (onAdd) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "time-daily-budget-add-btn time-btn-add";
      addBtn.title = addBtnTitle || "계획하기";
      addBtn.innerHTML =
        '<img src="/toolbaricons/add-square.svg" alt="" class="time-daily-budget-add-icon" width="20" height="20">';
      addBtn.addEventListener("click", onAdd);
      header.appendChild(addBtn);
    }
    return header;
  }
  function wrapBlockAsSection(block, title, onAdd, addBtnTitle) {
    const section = document.createElement("div");
    section.className = "time-daily-budget-section";
    section.appendChild(createSectionHeader(title, onAdd, addBtnTitle));
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "time-daily-budget-section-scroll";
    scrollWrap.appendChild(block);
    section.appendChild(scrollWrap);
    return section;
  }

  const basicSection = wrapBlockAsSection(
    basicBlock,
    "1. 수면·근무 시간 배치",
    () =>
      showCalendarBudgetTaskModal({
        mode: "add",
        addTaskOptions: calendarBudgetModalOptionsBasic,
      }),
    "수면·근무 예정만 추가",
  );
  const productiveSectionLayouts = [
    {
      block: happinessHealthInvestBlock,
      title: "2. 행복/건강 과제 배치",
      buckets: ["happiness", "health"],
      addTitle: "행복·건강 과제만 추가",
    },
    {
      block: dreamSideInvestBlock,
      title: "3. 꿈, 부수입 과제 배치",
      buckets: ["dream", "sideincome"],
      addTitle: "꿈·부수입 과제만 추가",
    },
  ];
  const productiveSections = productiveSectionLayouts.map((layout) =>
    wrapBlockAsSection(
      layout.block,
      layout.title,
      () =>
        showCalendarBudgetTaskModal({
          mode: "add",
          addTaskOptions: calendarBudgetModalOptionsProductive,
          calendarBudgetProductiveBuckets: layout.buckets,
        }),
      layout.addTitle,
    ),
  );

  const consumeSection = wrapBlockAsSection(
    consumeBlock,
    "4. 비생산적 과제 배치",
    () =>
      showCalendarBudgetTaskModal({
        mode: "add",
        addTaskOptions: calendarBudgetModalOptionsNonproductive,
      }),
    "비생산적 과제만 추가",
  );

  function scheduledRowHours(tr) {
    if (!tr || tr.classList.contains("time-row-add")) return 0;
    const start = (tr.dataset.scheduledStart || "").trim();
    const end = (tr.dataset.scheduledEnd || "").trim();
    /* 입력 중 숫자만 있는 값은 제외 — blur 후 hh:mm 만 합산 */
    const hhmmRe = /^\d{1,2}:\d{2}$/;
    if (!hhmmRe.test(start) || !hhmmRe.test(end) || !isValidStartEnd(start, end))
      return 0;
    let startH = parseTimeToHours(start);
    let endH = parseTimeToHours(end);
    if (endH <= startH) endH += 24;
    return endH - startH;
  }

  function updateRemaining() {
    let plannedSum = 0;
    [
      basicBlock,
      happinessHealthInvestBlock,
      dreamSideInvestBlock,
      consumeBlock,
    ].forEach((block) => {
      block.querySelectorAll("tbody tr").forEach((tr) => {
        plannedSum += scheduledRowHours(tr);
      });
    });
    const remaining = Math.max(0, DAY_WALL_CLOCK_HOURS_FOR_BUDGET - plannedSum);
    if (remainingValueEl)
      remainingValueEl.textContent = formatHoursToHHMM(remaining);
  }

  updateRemaining();

  const fourPanels = document.createElement("div");
  fourPanels.className = "time-daily-budget-four-panels";
  fourPanels.appendChild(basicSection);
  if (todoSectionEl) {
    const todoWrap = document.createElement("div");
    todoWrap.className =
      "time-daily-budget-section time-daily-budget-section--todo";
    todoWrap.appendChild(todoSectionEl);
    fourPanels.appendChild(todoWrap);
  }
  productiveSections.forEach((sec) => fourPanels.appendChild(sec));
  fourPanels.appendChild(consumeSection);

  if (topBarLeft) {
    const topBarWrap = topBarLeft.closest(".calendar-1day-top-bar");
    const keep =
      topBarWrap && container.contains(topBarWrap) ? topBarWrap : null;
    if (keep) keep.remove();
    container.innerHTML = "";
    if (keep) container.appendChild(keep);
    topBarLeft.innerHTML = "";
    topBarLeft.appendChild(topBarCluster);
    container.appendChild(fourPanels);
  } else {
    container.innerHTML = "";
    const topRow = document.createElement("div");
    topRow.className = "calendar-1day-budget-top-row";
    topRow.appendChild(topBarCluster);
    const stickyHeader = document.createElement("div");
    stickyHeader.className = "calendar-1day-budget-sticky-header";
    stickyHeader.appendChild(topRow);
    container.appendChild(stickyHeader);
    container.appendChild(fourPanels);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("app-hourly-rate-changed", (e) => {
    const rate = Number(e.detail?.rate ?? 0);
    const root = document.querySelector(".app-tab-panel-content.time-ledger-view");
    if (!root) return;
    const inp = root.querySelector(".time-hourly-input");
    const disp = root.querySelector(".time-hourly-display");
    if (inp) inp.value = String(rate);
    if (disp) {
      disp.textContent =
        rate > 0
          ? new Intl.NumberFormat("ko-KR").format(Math.round(rate)) + "원"
          : "—";
    }
  });
}
