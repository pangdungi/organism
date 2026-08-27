/**
 * 목표 진행 상황 — 매일 반복·시간 누적 KPI 주간 성공·실패표
 */

import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { filterKpisByProgressStatus } from "./kpiProgressStatus.js";
import { kpiHasHabitUnitGoal } from "./kpiHabitUnitGoal.js";
import {
  addDaysToYmd,
  collectKpiHabitSuccessDateKeys,
  getKpiHabitTodayNumericValue,
  habitWeekDateKeysMonSun,
} from "./kpiHabitStreak.js";
import {
  formatMinutesToKoreanHm,
  formatKpiTargetTimeRequiredDisplay,
  getAccumulatedMinutesForKpiId,
  getAccumulatedMinutesForKpiIdOnDate,
  parseKpiTargetTimeRequiredToMinutes,
  syncHabitTrackerLogs,
} from "./timeKpiSync.js";
import { computeKpiProgress, resolveKpiGoalMode } from "./kpiTimeUnitKpi.js";

const DOMAINS = [
  { storageKey: "kpi-sideincome-paths", category: "시급" },
  { storageKey: "kpi-health-map", category: "건강" },
  { storageKey: "kpi-happiness-map", category: "행복" },
];

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function loadMap(storageKey) {
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function parseNum(str) {
  const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function toDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDisplayNum(n) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  const x = Number(n);
  if (Number.isInteger(x)) return String(x);
  return String(Math.round(x * 100) / 100);
}

/** @param {number|string} n @param {string} unit */
function formatValueWithUnit(n, unit) {
  const num = formatDisplayNum(n);
  const u = String(unit || "").trim();
  return u ? `${num}${u}` : num;
}

/** 표 칸용 — 0분이면 빈칸 */
function formatDayMinutesLabel(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (m <= 0) return "";
  return formatMinutesToKoreanHm(m);
}

function progressForKpi(kpi, data) {
  return computeKpiProgress(kpi, {
    getAllKpiLogs: () => data.kpiLogs || [],
    getKpiTodos: (kpiId) =>
      (data.kpiTodos || []).filter(
        (t) => String(t?.kpiId || "") === String(kpiId || ""),
      ),
    getKpiTaskCompletionEvents: (kpiId) =>
      (data.kpiTaskCompletionEvents || []).filter(
        (e) => String(e?.kpiId || "") === String(kpiId || ""),
      ),
    parseNum,
    toDateKey,
  });
}

/**
 * 진행중 매일 반복 + 시간 누적 + 목표 도달형(직접입력) KPI
 * @returns {{ kpi: object, logs: object[], category: string, kind: "habit"|"time"|"manual" }[]}
 */
/** @param {{ skipSync?: boolean }} [opts] */
export function collectGoalTrackerActiveHabitKpis(opts = {}) {
  if (!opts.skipSync) {
    try {
      syncHabitTrackerLogs();
    } catch (_) {}
  }

  const out = [];
  for (const domain of DOMAINS) {
    const data = loadMap(domain.storageKey);
    const list = Array.isArray(data.kpis) ? data.kpis : [];
    const active = filterKpisByProgressStatus(list, "active", (kpi) =>
      progressForKpi(kpi, data),
    );
    for (const kpi of active) {
      const id = String(kpi?.id || "").trim();
      if (!id) continue;
      const mode = resolveKpiGoalMode(kpi);
      if (mode !== "habit" && mode !== "time" && mode !== "manual") continue;
      out.push({
        kpi,
        logs: data.kpiLogs || [],
        category: domain.category,
        kind: mode,
      });
    }
  }
  return out;
}

/**
 * @param {{ kpi: object, logs: object[], kind?: string }} item
 * @param {string[]} weekKeys
 */
function buildWeekCells(item, weekKeys) {
  const { kpi, logs } = item;
  const kind = item.kind || "habit";
  const todayYmd = toDateKey();

  if (kind === "time") {
    return weekKeys.map((ymd) => {
      if (ymd > todayYmd) {
        return {
          ymd,
          goal: null,
          result: "",
          mark: "",
          ok: null,
          pending: true,
        };
      }
      const mins = getAccumulatedMinutesForKpiIdOnDate(kpi?.id, kpi?.name, ymd);
      const label = formatDayMinutesLabel(mins);
      const ok = mins > 0;
      return {
        ymd,
        goal: null,
        result: label,
        mark: ok ? "O" : "X",
        ok,
        pending: false,
      };
    });
  }

  if (kind === "manual") {
    const goalNum = parseNum(kpi.targetValue);
    const unit = String(kpi?.unit || "").trim();
    return weekKeys.map((ymd) => {
      if (ymd > todayYmd) {
        return {
          ymd,
          goal: formatValueWithUnit(goalNum, unit),
          result: "",
          mark: "",
          ok: null,
          pending: true,
        };
      }
      const result = getKpiHabitTodayNumericValue(kpi, logs, ymd);
      const label = result > 0 ? formatValueWithUnit(result, unit) : "";
      return {
        ymd,
        goal: formatValueWithUnit(goalNum, unit),
        result: label,
        mark: result > 0 ? "O" : "X",
        ok: result > 0,
        pending: false,
      };
    });
  }

  const hasUnit = kpiHasHabitUnitGoal(kpi);
  const goalNum = hasUnit ? parseNum(kpi.targetValue) : null;
  const success = collectKpiHabitSuccessDateKeys(kpi, logs);
  const unit = String(kpi?.unit || "").trim();

  return weekKeys.map((ymd) => {
    if (ymd > todayYmd) {
      return {
        ymd,
        goal: hasUnit ? formatValueWithUnit(goalNum, unit) : null,
        result: "",
        mark: "",
        ok: null,
        pending: true,
      };
    }
    if (hasUnit) {
      const result = getKpiHabitTodayNumericValue(kpi, logs, ymd);
      const ok = goalNum > 0 ? result >= goalNum : result > 0;
      return {
        ymd,
        goal: formatValueWithUnit(goalNum, unit),
        result: formatValueWithUnit(result, unit),
        mark: ok ? "O" : "X",
        ok,
        pending: false,
      };
    }
    const ok = success.has(ymd);
    return {
      ymd,
      goal: null,
      result: null,
      mark: ok ? "O" : "X",
      ok,
      pending: false,
    };
  });
}

/** @param {object} kpi */
function buildTimeProgressHead(kpi) {
  const targetMins = parseKpiTargetTimeRequiredToMinutes(
    kpi?.targetTimeRequired || kpi?.targetValue,
  );
  const accumulatedMins = getAccumulatedMinutesForKpiId(kpi?.id, kpi?.name);
  const pct =
    targetMins > 0
      ? Math.min(100, Math.round((accumulatedMins / targetMins) * 100))
      : 0;
  const accumLabel = formatMinutesToKoreanHm(accumulatedMins);
  const targetLabel = formatKpiTargetTimeRequiredDisplay(
    kpi?.targetTimeRequired || kpi?.targetValue,
  );
  return {
    pct,
    meta: `누적 ${accumLabel} / 목표 ${targetLabel}`,
    ariaLabel: "목표 시간 대비 누적",
  };
}

/** @param {object} kpi @param {object[]} logs */
function buildManualProgressHead(kpi, logs) {
  const unit = String(kpi?.unit || "").trim();
  const p = progressForKpi(kpi, {
    kpiLogs: logs,
    kpiTodos: [],
    kpiTaskCompletionEvents: [],
  });
  const targetVal = Number(p.targetVal) || parseNum(kpi?.targetValue);
  const currentVal = Number(p.currentVal) || 0;
  const pct = Math.min(100, Math.round(Number(p.progress) || 0));
  const lower = !!p.lowerBetter;
  const meta = lower
    ? `현재 ${formatValueWithUnit(currentVal, unit)} / 목표 ${formatValueWithUnit(targetVal, unit)}`
    : `${formatValueWithUnit(Math.max(0, targetVal - currentVal), unit)} 남음 · 누적 ${formatValueWithUnit(currentVal, unit)} / ${formatValueWithUnit(targetVal, unit)}`;
  return {
    pct,
    meta,
    ariaLabel: "목표 도달 대비 누적",
  };
}

/** @param {string} name @param {{ pct: number, meta: string, ariaLabel: string }} prog */
function renderProgressCardHeadHtml(name, prog) {
  return `
    <div class="habit-tracker-success-fail-head-row">
      <span class="habit-tracker-success-fail-head-name">${escapeHtml(name)}</span>
      <span class="habit-tracker-success-fail-head-pct">${prog.pct}%</span>
    </div>
    <div class="habit-tracker-success-fail-progress" role="progressbar" aria-valuenow="${prog.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(prog.ariaLabel)}">
      <div class="habit-tracker-success-fail-progress-fill" style="width:${prog.pct}%"></div>
    </div>
    <div class="habit-tracker-success-fail-head-meta">${escapeHtml(prog.meta)}</div>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   weekAnchorYmd?: string,
 *   onWeekChange?: (weekAnchorYmd: string) => void,
 *   skipSync?: boolean,
 * }} [opts]
 */
export function mountKpiGoalSuccessFailSection(container, opts = {}) {
  if (!container) return;

  const section = document.createElement("section");
  section.className = "habit-tracker-success-fail-section";

  const weekKeys = habitWeekDateKeysMonSun(opts.weekAnchorYmd || toDateKey());
  const weekNav = document.createElement("div");
  weekNav.className = "habit-tracker-success-fail-week-nav";
  weekNav.setAttribute("role", "group");
  weekNav.setAttribute("aria-label", "성공·실패표 주 선택");

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "habit-tracker-success-fail-week-nav-btn";
  prevBtn.setAttribute("aria-label", "이전 주");
  prevBtn.textContent = "‹";

  const weekLabel = document.createElement("span");
  weekLabel.className = "habit-tracker-success-fail-week-nav-label";
  weekLabel.textContent = `${weekKeys[0].replace(/-/g, ".")} ~ ${weekKeys[6].replace(/-/g, ".")}`;

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "habit-tracker-success-fail-week-nav-btn";
  nextBtn.setAttribute("aria-label", "다음 주");
  nextBtn.textContent = "›";

  const emitWeek = (deltaDays) => {
    const nextAnchor = addDaysToYmd(weekKeys[0], deltaDays);
    opts.onWeekChange?.(nextAnchor);
  };
  prevBtn.addEventListener("click", () => emitWeek(-7));
  nextBtn.addEventListener("click", () => emitWeek(7));

  weekNav.append(prevBtn, weekLabel, nextBtn);
  section.appendChild(weekNav);

  const items = collectGoalTrackerActiveHabitKpis({
    skipSync: !!opts.skipSync,
  });
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "dream-goals-empty habit-tracker-success-fail-empty";
    empty.textContent =
      "진행중인 매일 반복·시간 누적·목표 도달형 행동이 없습니다.";
    section.appendChild(empty);
    container.appendChild(section);
    return;
  }

  for (const item of items) {
    const kind = item.kind || "habit";
    const hasUnit = kind === "habit" && kpiHasHabitUnitGoal(item.kpi);
    const cells = buildWeekCells(item, weekKeys);
    const name = String(item.kpi?.name || "").trim() || "행동";

    const card = document.createElement("div");
    card.className = "habit-tracker-success-fail-card";
    if (kind === "time" || kind === "manual") {
      card.classList.add(`habit-tracker-success-fail-card--${kind}`);
    }

    const cardHead = document.createElement("div");
    cardHead.className = "habit-tracker-success-fail-card-head";
    if (kind === "time") {
      cardHead.classList.add("habit-tracker-success-fail-card-head--time");
      cardHead.innerHTML = renderProgressCardHeadHtml(
        name,
        buildTimeProgressHead(item.kpi),
      );
    } else if (kind === "manual") {
      cardHead.classList.add("habit-tracker-success-fail-card-head--time");
      cardHead.innerHTML = renderProgressCardHeadHtml(
        name,
        buildManualProgressHead(item.kpi, item.logs),
      );
    } else {
      cardHead.textContent = name;
    }
    card.appendChild(cardHead);

    const table = document.createElement("table");
    table.className = "habit-tracker-success-fail-table";
    const tableLabel =
      kind === "time"
        ? `${name} 일간 소요 시간`
        : kind === "manual"
          ? `${name} 일간 수행값`
          : `${name} 일간 성공·실패표`;
    table.setAttribute("aria-label", tableLabel);

    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>
      <th scope="col">요일</th>
      ${WEEKDAY_LABELS.map((d) => `<th scope="col">${d}</th>`).join("")}
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const markClass = (c) => {
      if (c.pending) return "is-pending";
      return c.ok ? "is-ok" : "is-fail";
    };

    if (kind === "time") {
      tbody.innerHTML = `
        <tr>
          <th scope="row">소요 시간</th>
          ${cells
            .map(
              (c) =>
                `<td class="${c.pending ? "is-pending" : ""}">${escapeHtml(c.result || "")}</td>`,
            )
            .join("")}
        </tr>
      `;
    } else if (kind === "manual") {
      const unit = String(item.kpi?.unit || "").trim();
      tbody.innerHTML = `
        <tr>
          <th scope="row">그날 수행</th>
          ${cells
            .map((c) => {
              if (c.pending) {
                return `<td class="is-pending"></td>`;
              }
              const label =
                c.result || formatValueWithUnit(0, unit) || "0";
              return `<td class="${c.ok ? "is-ok" : "is-fail"}">${escapeHtml(label)}</td>`;
            })
            .join("")}
        </tr>
        <tr class="habit-tracker-success-fail-row--mark">
          <th scope="row">성공·실패</th>
          ${cells
            .map(
              (c) =>
                `<td class="${markClass(c)}">${escapeHtml(c.mark || "")}</td>`,
            )
            .join("")}
        </tr>
      `;
    } else if (hasUnit) {
      tbody.innerHTML = `
        <tr>
          <th scope="row">매일의 목표</th>
          ${cells.map((c) => `<td>${escapeHtml(c.goal || "")}</td>`).join("")}
        </tr>
        <tr>
          <th scope="row">매일의 결과</th>
          ${cells
            .map(
              (c) =>
                `<td class="${c.pending ? "is-pending" : ""}">${escapeHtml(c.result || "")}</td>`,
            )
            .join("")}
        </tr>
        <tr class="habit-tracker-success-fail-row--mark">
          <th scope="row">성공·실패</th>
          ${cells
            .map(
              (c) =>
                `<td class="${markClass(c)}">${escapeHtml(c.mark || "")}</td>`,
            )
            .join("")}
        </tr>
      `;
    } else {
      tbody.innerHTML = `
        <tr class="habit-tracker-success-fail-row--mark">
          <th scope="row">성공·실패</th>
          ${cells
            .map(
              (c) =>
                `<td class="${markClass(c)}">${escapeHtml(c.mark || "")}</td>`,
            )
            .join("")}
        </tr>
      `;
    }
    table.appendChild(tbody);
    card.appendChild(table);
    section.appendChild(card);
  }

  container.appendChild(section);
}
