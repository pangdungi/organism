/**
 * 시간 레포트 v2 — 조회 기간 전체 기준, 기록 내용 중심 UI
 */

import {
  canonicalMealTaskDisplayName,
  chipDetailLabelsForReport,
  contentTypeReportLabel,
  isChipDetailTaskName,
  isEmotionalBuiltinTaskName,
  isHealthyMealDetailTaskName,
  isSleepBuiltinTaskName,
  isUnhealthyMealDetailTaskName,
} from "./timeTaskOptionsConstants.js";
import {
  formatIntegerMinutesDurationKo,
  formatInvestReclaimWonDisplay,
  formatLedgerLossKrwDisplay,
  formatYmdDotsWithWeekdayKo,
  getTimeLedgerRowDisplayProductivity,
  getTimeReportDonutSnapshotForDateRange,
  getTimeReportHeroSnapshotForDateRange,
  getTimeReportSummaryGridForDateRange,
  getTimeReportMonthInclusiveRange,
  loadTimeRows,
  parseTimeToHours,
} from "../views/Time.js";
import {
  normalizeTimeRatingForRow,
  productiveTimeRatingPriceMultiplier,
} from "./timeLedgerEntriesModel.js";
import { buildEmotionReportSnapshot } from "./timeEmotionReport.js";
import { buildMoveReportSnapshot } from "./timeMoveReport.js";
import { buildHappinessRoutineReportSnapshot } from "./timeHappinessRoutineReport.js";
import { buildPlanAdherenceReportSnapshot } from "./timePlanAdherenceReport.js";
import { buildFocusReportSnapshot } from "./timeFocusReport.js";
import { flowDisruptorCategoryColor } from "./timeTaskFlowDisruptors.js";
import { readUserHourlyRateLocal } from "./userHourlySync.js";

const SLEEP_TARGET_MIN = 7 * 60;
const CHART_COLORS = {
  sleep: "#818cf8",
  healthy: "#16a34a",
  unhealthy: "#ea580c",
  media: "#9333ea",
};

const PROD_CATEGORY_KEYS = new Set([
  "sideincome",
  "happiness",
  "health",
]);

/** 레포트 레이더 — 생산·비생산 카테고리 전체(기록 없어도 축 표시) */
const CATEGORY_RADAR_AXES = [
  { key: "sideincome", label: "시급 상승", tone: "prod" },
  { key: "happiness", label: "행복", tone: "prod" },
  { key: "health", label: "건강", tone: "prod" },
  { key: "pleasure", label: "쾌락충족", tone: "nonprod" },
  { key: "media_watch", label: "미디어", tone: "nonprod" },
  { key: "unhappiness", label: "불행", tone: "nonprod" },
  { key: "unhealthy", label: "비건강", tone: "nonprod" },
  { key: "moneylosing", label: "돈 잃는 일", tone: "nonprod" },
];

const RATING_REPORT_COLOR = "#C98484";
const RATING_REPORT_COLOR_MID = "#7E9FC3";
const RATING_REPORT_COLOR_LOW = "#C8D9EC";
const RATING_REPORT_COLOR_EMPTY = "#e8edf3";
const RATING_REPORT_COLOR_PEAK = "#d97706";
const WEEKDAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_CHART_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MEDIA_CONSCIOUS_TASK = "의식적 콘텐츠 소비";
const MEDIA_UNCONSCIOUS_TASK = "무의식적 콘텐츠 소비";
const MEDIA_CONSCIOUS_COLOR = "#C98484";
const MEDIA_UNCONSCIOUS_COLOR = "#7E9FC3";
const MOVE_ROUTINE_COLOR = "#C98484";
const MOVE_SIMPLE_COLOR = "#7E9FC3";

function isProductiveCategory(catKey) {
  return PROD_CATEGORY_KEYS.has(String(catKey || "").trim());
}

function formatPctRounded(n) {
  return `${Math.round(Number(n) || 0)}%`;
}

function orderDonutSegments(segments) {
  const prod = segments
    .filter((s) => isProductiveCategory(s.key))
    .sort((a, b) => b.hours - a.hours);
  const nonProd = segments
    .filter((s) => !isProductiveCategory(s.key))
    .sort((a, b) => b.hours - a.hours);
  return { prod, nonProd, ordered: [...prod, ...nonProd] };
}

const SVG_NS = "http://www.w3.org/2000/svg";

function normYmd(v) {
  return String(v || "")
    .replace(/\//g, "-")
    .slice(0, 10);
}

function addDaysYmd(ymd, delta) {
  const key = normYmd(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const [y, mo, d] = key.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + delta);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function listDatesInclusive(startYmd, endYmd) {
  const out = [];
  let cur = normYmd(startYmd);
  const end = normYmd(endYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cur) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return out;
  }
  while (cur <= end) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function resolveMountRange(arg2, arg3) {
  if (arg2 && typeof arg2 === "object" && arg2.rangeStart) {
    const start = normYmd(arg2.rangeStart);
    let end = normYmd(arg2.rangeEnd || arg2.rangeStart);
    if (start > end) {
      const x = start;
      start = end;
      end = x;
    }
    return { start, end };
  }
  const key = normYmd(arg2);
  if (arg3 === "month") {
    const r = getTimeReportMonthInclusiveRange(key);
    if (r) return { start: r.start, end: r.end };
  }
  return { start: key, end: key };
}

function formatRangeLabel(startYmd, endYmd) {
  const s = normYmd(startYmd);
  const e = normYmd(endYmd);
  if (s === e) return formatYmdDotsWithWeekdayKo(s);
  return `${formatYmdDotsWithWeekdayKo(s)} ~ ${formatYmdDotsWithWeekdayKo(e)}`;
}

function rowsInRange(startYmd, endYmd) {
  const rs = normYmd(startYmd);
  const re = normYmd(endYmd);
  return loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= rs && d <= re;
  });
}

function rowDateYmd(r) {
  return (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
}

function rowUserNote(r) {
  return String(r.feedback || r.memo || "").trim();
}

function rowMinutes(r) {
  const hrs = parseTimeToHours(r.timeTracked);
  if (!(hrs > 0) || !Number.isFinite(hrs)) return 0;
  return Math.round(hrs * 60);
}

function formatNetWon(netWon) {
  const n = Math.round(Number(netWon) || 0);
  if (n > 0) return formatInvestReclaimWonDisplay(n);
  if (n < 0) return formatLedgerLossKrwDisplay(Math.abs(n));
  return "₩0";
}

function readReportHourlyRateNumber() {
  return (
    parseFloat(String(readUserHourlyRateLocal() || "0").replace(/,/g, "")) || 0
  );
}

function createSection(title, subtitle) {
  const sec = document.createElement("section");
  sec.className = "lp-tr2-section";
  const h = document.createElement("h2");
  h.className = "lp-tr2-section-title";
  h.textContent = title;
  sec.appendChild(h);
  if (subtitle) {
    const p = document.createElement("p");
    p.className = "lp-tr2-section-sub";
    p.textContent = subtitle;
    sec.appendChild(p);
  }
  return sec;
}

function createStatCard(label, value, hint) {
  const card = document.createElement("article");
  card.className = "lp-tr2-stat-card";
  const lab = document.createElement("span");
  lab.className = "lp-tr2-stat-label";
  lab.textContent = label;
  const val = document.createElement("strong");
  val.className = "lp-tr2-stat-value";
  val.textContent = value;
  card.appendChild(lab);
  card.appendChild(val);
  if (hint) {
    const h = document.createElement("span");
    h.className = "lp-tr2-stat-hint";
    h.textContent = hint;
    card.appendChild(h);
  }
  return card;
}

function createSplitRatioBar(segments, ariaLabel) {
  const total = segments.reduce(
    (sum, seg) => sum + Math.max(0, Number(seg.minutes) || 0),
    0,
  );
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-split-ratio";

  const track = document.createElement("div");
  track.className = "lp-tr2-split-ratio-track";
  track.setAttribute("role", "img");
  track.setAttribute(
    "aria-label",
    ariaLabel || "두 항목 시간 비율",
  );

  const active = segments.filter((seg) => (Number(seg.minutes) || 0) > 0);
  active.forEach((seg, i) => {
    const el = document.createElement("div");
    el.className = "lp-tr2-split-ratio-seg";
    if (i === 0) el.classList.add("lp-tr2-split-ratio-seg--first");
    if (i === active.length - 1) el.classList.add("lp-tr2-split-ratio-seg--last");
    const mins = Number(seg.minutes) || 0;
    const pct = total > 0 ? (mins / total) * 100 : 0;
    el.style.width = `${pct}%`;
    el.style.background = seg.color;
    if (seg.title) el.title = seg.title;
    track.appendChild(el);
  });

  if (total <= 0) track.classList.add("is-empty");
  wrap.appendChild(track);
  wrap.appendChild(
    createRatingChartLegend(
      segments.map((seg) => {
        const mins = Number(seg.minutes) || 0;
        return {
          swatch: seg.color,
          label: `${seg.label} · ${mins > 0 ? formatIntegerMinutesDurationKo(mins) : "—"}`,
        };
      }),
    ),
  );
  return wrap;
}

function formatRatingAvg(avg) {
  const n = Number(avg);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n.toFixed(1)}`;
}

/** 시간 수익률(별점→배율) 평균 표기 — ×1.5 */
function formatReturnMultiplierAvg(mult) {
  const n = Number(mult);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const rounded = Math.round(n * 100) / 100;
  return `×${rounded}`;
}

function returnMultTier(mult) {
  const n = Number(mult);
  if (!Number.isFinite(n) || n <= 0) return "empty";
  if (n >= 1.5) return "high";
  if (n >= 1) return "mid";
  if (n >= 0.75) return "low";
  return "weak";
}

function returnMultFillColor(mult) {
  const tier = returnMultTier(mult);
  if (tier === "empty") return RATING_REPORT_COLOR_EMPTY;
  if (tier === "high") return RATING_REPORT_COLOR;
  if (tier === "mid") return RATING_REPORT_COLOR_MID;
  if (tier === "low") return RATING_REPORT_COLOR_LOW;
  return "#d8dee8";
}

function rowCountsForTimeReturnReport(r) {
  if (getTimeLedgerRowDisplayProductivity(r) !== "productive") return false;
  if (isEmotionalBuiltinTaskName(r?.taskName)) return false;
  return normalizeTimeRatingForRow(r.timeRating) != null;
}

function ratingTier(avg) {
  const n = Number(avg);
  if (!Number.isFinite(n) || n <= 0) return "empty";
  if (n >= 4.5) return "high";
  if (n >= 2.5) return "mid";
  if (n >= 1.5) return "low";
  return "weak";
}

function ratingFillColor(avg) {
  const tier = ratingTier(avg);
  if (tier === "empty") return RATING_REPORT_COLOR_EMPTY;
  if (tier === "high") return RATING_REPORT_COLOR;
  if (tier === "mid") return RATING_REPORT_COLOR_MID;
  if (tier === "low") return RATING_REPORT_COLOR_LOW;
  return "#d8dee8";
}

function ratingBarColor(avg) {
  return ratingFillColor(avg);
}

function createReturnRateBarRow(label, avgMult, meta) {
  const row = document.createElement("div");
  row.className = "lp-tr2-bar-row lp-tr2-bar-row--rating";
  if (meta) row.title = meta;
  const lab = document.createElement("span");
  lab.className = "lp-tr2-bar-label";
  lab.textContent = label;
  const track = document.createElement("div");
  track.className = "lp-tr2-bar-track";
  const fill = document.createElement("div");
  fill.className = "lp-tr2-bar-fill";
  const pct = Math.min(100, (Math.max(0, avgMult) / 2) * 100);
  fill.style.width = `${pct}%`;
  const tier = returnMultTier(avgMult);
  const fillColor = returnMultFillColor(avgMult);
  fill.style.background = fillColor;
  fill.style.backgroundColor = fillColor;
  if (tier !== "empty" && tier !== "weak") {
    fill.classList.add(`lp-tr2-bar-fill--rating-${tier}`);
  }
  const val = document.createElement("span");
  val.className = "lp-tr2-bar-value lp-tr2-bar-value--rating";
  if (tier === "high") val.classList.add("lp-tr2-bar-value--rating-high");
  else if (tier === "mid") val.classList.add("lp-tr2-bar-value--rating-mid");
  else if (tier === "low") val.classList.add("lp-tr2-bar-value--rating-low");
  val.textContent = formatReturnMultiplierAvg(avgMult);
  track.appendChild(fill);
  row.appendChild(lab);
  row.appendChild(track);
  row.appendChild(val);
  return row;
}

function createRatingBarRow(label, avgRating, meta) {
  const row = document.createElement("div");
  row.className = "lp-tr2-bar-row lp-tr2-bar-row--rating";
  if (meta) row.title = meta;
  const lab = document.createElement("span");
  lab.className = "lp-tr2-bar-label";
  lab.textContent = label;
  const track = document.createElement("div");
  track.className = "lp-tr2-bar-track";
  const fill = document.createElement("div");
  fill.className = "lp-tr2-bar-fill";
  const pct = Math.min(100, (Math.max(0, avgRating) / 5) * 100);
  fill.style.width = `${pct}%`;
  const tier = ratingTier(avgRating);
  const fillColor = ratingBarColor(avgRating);
  fill.style.background = fillColor;
  fill.style.backgroundColor = fillColor;
  if (tier !== "empty" && tier !== "weak") {
    fill.classList.add(`lp-tr2-bar-fill--rating-${tier}`);
  }
  const val = document.createElement("span");
  val.className = "lp-tr2-bar-value lp-tr2-bar-value--rating";
  if (tier === "high") val.classList.add("lp-tr2-bar-value--rating-high");
  else if (tier === "mid") val.classList.add("lp-tr2-bar-value--rating-mid");
  else if (tier === "low") val.classList.add("lp-tr2-bar-value--rating-low");
  const num = document.createElement("span");
  num.className = "lp-tr2-bar-value-num";
  num.textContent = formatRatingAvg(avgRating);
  const star = document.createElement("span");
  star.className = "lp-tr2-bar-value-star";
  star.textContent = "★";
  star.setAttribute("aria-hidden", "true");
  val.appendChild(num);
  val.appendChild(star);
  track.appendChild(fill);
  row.appendChild(lab);
  row.appendChild(track);
  row.appendChild(val);
  return row;
}

function createRatingBlock(title, subtitle) {
  const block = document.createElement("article");
  block.className = "lp-tr2-rating-block";
  const h = document.createElement("h3");
  h.className = "lp-tr2-rating-block-title";
  h.textContent = title;
  block.appendChild(h);
  if (subtitle) {
    const p = document.createElement("p");
    p.className = "lp-tr2-rating-block-sub";
    p.textContent = subtitle;
    block.appendChild(p);
  }
  return block;
}

function createRatingChartLegend(items) {
  const leg = document.createElement("div");
  leg.className = "lp-tr2-rating-chart-legend";
  items.forEach(({ swatch, label, mod }) => {
    const item = document.createElement("span");
    item.className = `lp-tr2-rating-chart-legend-item${mod ? ` ${mod}` : ""}`;
    const dot = document.createElement("span");
    dot.className = "lp-tr2-rating-chart-legend-swatch";
    if (swatch.startsWith("#")) dot.style.background = swatch;
    else dot.classList.add(swatch);
    item.appendChild(dot);
    item.appendChild(document.createTextNode(label));
    leg.appendChild(item);
  });
  return leg;
}

function render24HourRatingChart(hourGrid, peakHours, opts = {}) {
  const returnMode = opts.mode === "return";
  const peakSet = new Set((peakHours || []).map((h) => h.hour));
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-rating-hour-chart";
  const cols = document.createElement("div");
  cols.className = "lp-tr2-rating-hour-chart-cols";
  cols.setAttribute("role", "img");
  cols.setAttribute(
    "aria-label",
    returnMode
      ? "0시부터 23시까지 시간대별 수익률"
      : "0시부터 23시까지 시간대별 만족도",
  );

  hourGrid.forEach((h) => {
    const cell = document.createElement("div");
    cell.className = "lp-tr2-rating-hour-cell";
    const hasData = h.count > 0 && (returnMode ? h.avgMult != null : h.avg != null);
    if (hasData && peakSet.has(h.hour)) {
      cell.classList.add("lp-tr2-rating-hour-cell--peak");
    }
    const bar = document.createElement("div");
    bar.className = "lp-tr2-rating-hour-bar";
    if (hasData) {
      const pct = returnMode
        ? Math.max(14, ((h.avgMult ?? 0) / 2) * 100)
        : Math.max(14, ((h.avg ?? 0) / 5) * 100);
      bar.style.height = `${pct}%`;
      const fillColor = returnMode
        ? returnMultFillColor(h.avgMult)
        : ratingFillColor(h.avg);
      bar.style.background = fillColor;
      bar.style.backgroundColor = fillColor;
      cell.title = returnMode
        ? `${formatHourLabel(h.hour)} · ${formatReturnMultiplierAvg(h.avgMult)} · ${h.count}건 · ${formatIntegerMinutesDurationKo(h.minutes)}`
        : `${formatHourLabel(h.hour)} · ${formatRatingAvg(h.avg)}점 · ${h.count}건 · ${formatIntegerMinutesDurationKo(h.minutes)}`;
    } else {
      bar.classList.add("is-empty");
    }
    cell.appendChild(bar);
    cols.appendChild(cell);
  });

  const panel = document.createElement("div");
  panel.className = "lp-tr2-rating-hour-chart-panel";
  panel.appendChild(cols);

  const axis = document.createElement("div");
  axis.className = "lp-tr2-rating-hour-axis";
  axis.setAttribute("aria-hidden", "true");
  hourGrid.forEach((h) => {
    const tick = document.createElement("span");
    tick.className = "lp-tr2-rating-hour-axis-tick";
    if (h.hour % 6 === 0) tick.classList.add("is-major");
    tick.textContent = String(h.hour);
    axis.appendChild(tick);
  });
  panel.appendChild(axis);
  wrap.appendChild(panel);

  wrap.appendChild(
    createRatingChartLegend(
      returnMode
        ? [
            { swatch: RATING_REPORT_COLOR, label: "수익률 높음" },
            { swatch: RATING_REPORT_COLOR_MID, label: "보통" },
            { swatch: RATING_REPORT_COLOR_LOW, label: "수익률 낮음" },
            { swatch: RATING_REPORT_COLOR_EMPTY, label: "기록 없음" },
            { swatch: "is-peak-ring", label: "피크 시간" },
          ]
        : [
            { swatch: RATING_REPORT_COLOR, label: "만족 높음" },
            { swatch: RATING_REPORT_COLOR_MID, label: "보통" },
            { swatch: RATING_REPORT_COLOR_EMPTY, label: "기록 없음" },
            { swatch: "is-peak-ring", label: "피크 시간" },
          ],
    ),
  );
  return wrap;
}

function renderWeekdayReturnChart(weekdayGrid) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-rating-weekday-chart";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "요일별 수익률");

  weekdayGrid.forEach((w) => {
    const col = document.createElement("div");
    col.className = "lp-tr2-rating-weekday-col";
    const hasData = w.count > 0 && w.avgMult != null;
    const barWrap = document.createElement("div");
    barWrap.className = "lp-tr2-rating-weekday-bar-wrap";
    const bar = document.createElement("div");
    bar.className = "lp-tr2-rating-weekday-bar";
    if (hasData) {
      const pct = Math.max(14, ((w.avgMult ?? 0) / 2) * 100);
      bar.style.height = `${pct}%`;
      const fillColor = returnMultFillColor(w.avgMult);
      bar.style.background = fillColor;
      bar.style.backgroundColor = fillColor;
      col.title = `${w.label}요일 · ${formatReturnMultiplierAvg(w.avgMult)} · ${w.count}건`;
      const tier = returnMultTier(w.avgMult);
      if (tier === "high") col.classList.add("lp-tr2-rating-weekday-col--high");
      else if (tier === "mid") col.classList.add("lp-tr2-rating-weekday-col--mid");
    } else {
      bar.classList.add("is-empty");
    }
    barWrap.appendChild(bar);
    col.appendChild(barWrap);
    const lab = document.createElement("span");
    lab.className = "lp-tr2-rating-weekday-label";
    lab.textContent = w.label;
    col.appendChild(lab);
    if (hasData) {
      const score = document.createElement("span");
      score.className = "lp-tr2-rating-weekday-score";
      score.textContent = formatReturnMultiplierAvg(w.avgMult);
      col.appendChild(score);
    }
    wrap.appendChild(col);
  });
  return wrap;
}

function renderWeekdayRatingChart(weekdayGrid) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-rating-weekday-chart";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "요일별 만족도");

  weekdayGrid.forEach((w) => {
    const col = document.createElement("div");
    col.className = "lp-tr2-rating-weekday-col";
    const hasData = w.count > 0 && w.avg != null;
    const barWrap = document.createElement("div");
    barWrap.className = "lp-tr2-rating-weekday-bar-wrap";
    const bar = document.createElement("div");
    bar.className = "lp-tr2-rating-weekday-bar";
    if (hasData) {
      const pct = Math.max(14, ((w.avg ?? 0) / 5) * 100);
      bar.style.height = `${pct}%`;
      const fillColor = ratingFillColor(w.avg);
      bar.style.background = fillColor;
      bar.style.backgroundColor = fillColor;
      col.title = `${w.label}요일 · ${formatRatingAvg(w.avg)}점 · ${w.count}건`;
      const tier = ratingTier(w.avg);
      if (tier === "high") col.classList.add("lp-tr2-rating-weekday-col--high");
      else if (tier === "mid") col.classList.add("lp-tr2-rating-weekday-col--mid");
    } else {
      bar.classList.add("is-empty");
    }
    barWrap.appendChild(bar);
    col.appendChild(barWrap);
    const lab = document.createElement("span");
    lab.className = "lp-tr2-rating-weekday-label";
    lab.textContent = w.label;
    col.appendChild(lab);
    if (hasData) {
      const score = document.createElement("span");
      score.className = "lp-tr2-rating-weekday-score";
      score.textContent = `${formatRatingAvg(w.avg)}`;
      col.appendChild(score);
    }
    wrap.appendChild(col);
  });
  return wrap;
}

function rowStartHour(r) {
  const st = String(r.startTime || "").trim();
  if (!st) return null;
  const m = st.match(/(?:^|\s|T|\.)(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  return h >= 0 && h <= 23 ? h : null;
}

function rowWeekdayIndex(r) {
  const d = rowDateYmd(r);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [y, mo, day] = d.split("-").map(Number);
  return new Date(y, mo - 1, day).getDay();
}

function rowMonthKey(r) {
  const d = rowDateYmd(r);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(0, 7) : null;
}

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, "0")}시`;
}

function buildTimeRatingReportSnapshot(rows) {
  /** @type {{ rating: number, mult: number, minutes: number, hour: number|null, weekday: number|null, month: string|null, task: string }[]} */
  const entries = [];
  for (const r of rows) {
    if (!rowCountsForTimeReturnReport(r)) continue;
    const rating = normalizeTimeRatingForRow(r.timeRating);
    if (rating == null) continue;
    const mult = productiveTimeRatingPriceMultiplier(rating);
    if (mult == null) continue;
    const mins = rowMinutes(r) || 15;
    entries.push({
      rating,
      mult,
      minutes: mins,
      hour: rowStartHour(r),
      weekday: rowWeekdayIndex(r),
      month: rowMonthKey(r),
      task: String(r.taskName || "").trim() || "(제목 없음)",
    });
  }
  if (!entries.length) return null;

  let weightedSum = 0;
  let weightedMultSum = 0;
  let totalMinutes = 0;
  for (const e of entries) {
    weightedSum += e.rating * e.minutes;
    weightedMultSum += e.mult * e.minutes;
    totalMinutes += e.minutes;
  }
  const overallWeightedAvg =
    totalMinutes > 0 ? weightedSum / totalMinutes : 0;
  const overallWeightedAvgMult =
    totalMinutes > 0 ? weightedMultSum / totalMinutes : 0;

  const hourBuckets = Array.from({ length: 24 }, () => ({
    weighted: 0,
    weightedMult: 0,
    minutes: 0,
    count: 0,
  }));
  for (const e of entries) {
    if (e.hour == null) continue;
    hourBuckets[e.hour].weighted += e.rating * e.minutes;
    hourBuckets[e.hour].weightedMult += e.mult * e.minutes;
    hourBuckets[e.hour].minutes += e.minutes;
    hourBuckets[e.hour].count += 1;
  }
  const hourGrid = hourBuckets.map((b, hour) => ({
    hour,
    avg: b.minutes > 0 ? b.weighted / b.minutes : null,
    avgMult: b.minutes > 0 ? b.weightedMult / b.minutes : null,
    count: b.count,
    minutes: b.minutes,
  }));
  const hourScores = hourGrid.filter((h) => h.count > 0);

  const hourScoresByMult = [...hourScores].sort(
    (a, b) => (b.avgMult ?? 0) - (a.avgMult ?? 0),
  );
  const peakHours = hourScoresByMult.slice(0, 3);
  const lowHours = [...hourScoresByMult]
    .reverse()
    .slice(0, 3)
    .filter((h) => (h.avgMult ?? 0) < overallWeightedAvgMult);

  const wdBuckets = Array.from({ length: 7 }, () => ({
    weighted: 0,
    weightedMult: 0,
    minutes: 0,
    count: 0,
  }));
  for (const e of entries) {
    if (e.weekday == null) continue;
    wdBuckets[e.weekday].weighted += e.rating * e.minutes;
    wdBuckets[e.weekday].weightedMult += e.mult * e.minutes;
    wdBuckets[e.weekday].minutes += e.minutes;
    wdBuckets[e.weekday].count += 1;
  }
  const weekdayScores = wdBuckets
    .map((b, i) => ({
      weekday: i,
      label: WEEKDAY_LABELS_KO[i],
      avg: b.minutes > 0 ? b.weighted / b.minutes : null,
      avgMult: b.minutes > 0 ? b.weightedMult / b.minutes : null,
      count: b.count,
      minutes: b.minutes,
    }))
    .filter((w) => w.count > 0);
  const weekdayGrid = WEEKDAY_CHART_ORDER.map((i) => {
    const b = wdBuckets[i];
    return {
      weekday: i,
      label: WEEKDAY_LABELS_KO[i],
      avg: b.minutes > 0 ? b.weighted / b.minutes : null,
      avgMult: b.minutes > 0 ? b.weightedMult / b.minutes : null,
      count: b.count,
      minutes: b.minutes,
    };
  });

  const taskMap = new Map();
  for (const e of entries) {
    if (!taskMap.has(e.task)) {
      taskMap.set(e.task, { weighted: 0, weightedMult: 0, minutes: 0, count: 0 });
    }
    const t = taskMap.get(e.task);
    t.weighted += e.rating * e.minutes;
    t.weightedMult += e.mult * e.minutes;
    t.minutes += e.minutes;
    t.count += 1;
  }
  const taskScores = [...taskMap.entries()]
    .map(([name, b]) => ({
      name,
      avg: b.minutes > 0 ? b.weighted / b.minutes : 0,
      avgMult: b.minutes > 0 ? b.weightedMult / b.minutes : 0,
      count: b.count,
      minutes: b.minutes,
      roi: b.minutes > 0 ? b.weightedMult / (b.minutes / 60) : 0,
    }))
    .sort((a, b) => b.avgMult - a.avgMult);

  const monthMap = new Map();
  for (const e of entries) {
    if (!e.month) continue;
    if (!monthMap.has(e.month)) {
      monthMap.set(e.month, { weighted: 0, weightedMult: 0, minutes: 0, count: 0 });
    }
    const m = monthMap.get(e.month);
    m.weighted += e.rating * e.minutes;
    m.weightedMult += e.mult * e.minutes;
    m.minutes += e.minutes;
    m.count += 1;
  }
  const monthScores = [...monthMap.entries()]
    .map(([key, b]) => ({
      key,
      label: `${key.slice(0, 4)}.${key.slice(5, 7)}`,
      avg: b.minutes > 0 ? b.weighted / b.minutes : 0,
      avgMult: b.minutes > 0 ? b.weightedMult / b.minutes : 0,
      count: b.count,
      minutes: b.minutes,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const topTasks = taskScores
    .filter((t) => t.minutes >= 15 || t.count >= 2)
    .slice(0, 6);
  const topRoiTasks = [...taskScores]
    .filter((t) => t.minutes >= 30)
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 5);

  return {
    ratedCount: entries.length,
    totalMinutes,
    overallWeightedAvg,
    overallWeightedAvgMult,
    hourGrid,
    hourScores,
    peakHours,
    lowHours,
    weekdayScores,
    weekdayGrid,
    taskScores,
    topTasks,
    topRoiTasks,
    monthScores,
  };
}

function buildRatingInsightText(snap) {
  const parts = [];
  if (snap.peakHours.length) {
    const labels = snap.peakHours
      .map((h) => formatHourLabel(h.hour))
      .join(" · ");
    parts.push(`수익률이 높은 시간 ${labels}`);
  }
  const wdSorted = [...snap.weekdayScores].sort(
    (a, b) => (b.avgMult ?? 0) - (a.avgMult ?? 0),
  );
  if (wdSorted.length >= 2) {
    parts.push(
      `${wdSorted[0].label}요일 수익률이 높고 ${wdSorted[wdSorted.length - 1].label}요일이 낮아요`,
    );
  }
  if (snap.topTasks.length) {
    parts.push(
      `가장 수익률이 높은 활동은 「${snap.topTasks[0].name}」 (${formatReturnMultiplierAvg(snap.topTasks[0].avgMult)})`,
    );
  }
  return parts.join(" · ");
}

function mountTimeRatingReportSection(scrollWrap, _range, rows) {
  const snap = buildTimeRatingReportSnapshot(rows);
  const sec = createSection(
    "시간 수익률 분석",
    "투자한 시간의 별점(×배율)으로 어떤 활동·시간대가 이득인지 봅니다",
  );

  if (!snap) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "이 기간에 평가한 생산적 시간 기록이 없습니다. 기록 모달에서 「이 시간 평가」를 남겨 보세요.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "lp-tr2-card-grid";
  hero.appendChild(
    createStatCard("평가한 기록", `${snap.ratedCount}건`, ""),
  );
  hero.appendChild(
    createStatCard(
      "평가한 시간",
      formatIntegerMinutesDurationKo(snap.totalMinutes),
      "",
    ),
  );
  hero.appendChild(
    createStatCard(
      "평균 수익률",
      formatReturnMultiplierAvg(snap.overallWeightedAvgMult),
      "시간 가중 평균 배율",
    ),
  );
  hero.appendChild(
    createStatCard(
      snap.topTasks[0]?.name ? "최고 수익 활동" : "기준 배율",
      snap.topTasks[0]?.name
        ? formatReturnMultiplierAvg(snap.topTasks[0].avgMult)
        : "×1",
      snap.topTasks[0]?.name
        ? String(snap.topTasks[0].name).slice(0, 12)
        : "×1 = 시급 그대로",
    ),
  );
  sec.appendChild(hero);

  const insight = buildRatingInsightText(snap);
  if (insight) {
    const box = document.createElement("p");
    box.className = "lp-tr2-rating-insight";
    box.textContent = insight;
    sec.appendChild(box);
  }

  if (snap.hourGrid.some((h) => h.count > 0)) {
    const block = createRatingBlock(
      "24시간 수익률",
      "시작 시각 기준 · 막대 높이=배율(×2 최대) · 주황 테두리=피크",
    );
    block.appendChild(
      render24HourRatingChart(snap.hourGrid, snap.peakHours, { mode: "return" }),
    );
    if (snap.peakHours.length) {
      const peakNote = document.createElement("p");
      peakNote.className = "lp-tr2-rating-peak-note";
      peakNote.textContent = `피크: ${snap.peakHours
        .map(
          (h) =>
            `${formatHourLabel(h.hour)} (${formatReturnMultiplierAvg(h.avgMult)})`,
        )
        .join(" · ")}`;
      block.appendChild(peakNote);
    }
    sec.appendChild(block);
  }

  if (snap.weekdayGrid.some((w) => w.count > 0)) {
    const block = createRatingBlock(
      "요일별 패턴",
      "월~일 요일별 평균 배율 · 막대가 높을수록 수익률 높음",
    );
    block.appendChild(renderWeekdayReturnChart(snap.weekdayGrid));
    sec.appendChild(block);
  }

  if (snap.topTasks.length) {
    const block = createRatingBlock(
      "활동별 수익률",
      "과제별 평균 배율 · 15분 이상 또는 2회 이상",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars";
    snap.topTasks.forEach((t) => {
      bars.appendChild(
        createReturnRateBarRow(
          t.name,
          t.avgMult,
          `${t.count}회 · ${formatIntegerMinutesDurationKo(t.minutes)}`,
        ),
      );
    });
    block.appendChild(bars);
    sec.appendChild(block);
  }

  if (snap.topRoiTasks.length) {
    const block = createRatingBlock(
      "시간 대비 수익률 TOP",
      "30분 이상 쓴 활동만 · 같은 1시간 투자 시 배율이 높은 순",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars";
    snap.topRoiTasks.forEach((t) => {
      bars.appendChild(
        createReturnRateBarRow(
          t.name,
          t.avgMult,
          `${formatIntegerMinutesDurationKo(t.minutes)} · ${t.count}회 평가`,
        ),
      );
    });
    block.appendChild(bars);
    sec.appendChild(block);
  }

  if (snap.monthScores.length > 1) {
    const block = createRatingBlock("월별 추이", "기간이 여러 달일 때");
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars lp-tr2-bars--compact";
    snap.monthScores.forEach((m) => {
      bars.appendChild(
        createReturnRateBarRow(
          m.label,
          m.avgMult,
          `${m.count}건 · ${formatIntegerMinutesDurationKo(m.minutes)}`,
        ),
      );
    });
    block.appendChild(bars);
    sec.appendChild(block);
  }

  scrollWrap.appendChild(sec);
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

/** 가로 차트 스크롤 시 부모(레포트 세로 스크롤)로 터치가 넘어가며 위로 튀는 현상 완화 */
function bindHorizontalChartScroll(el) {
  if (!(el instanceof HTMLElement)) return;
  let startX = 0;
  let startY = 0;
  /** @type {boolean | null} */
  let axisLock = null;

  el.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) {
        axisLock = null;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      axisLock = null;
    },
    { passive: true },
  );

  el.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length !== 1 || el.scrollWidth <= el.clientWidth) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (axisLock == null) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        axisLock = Math.abs(dx) > Math.abs(dy);
      }
      if (axisLock) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    { passive: false },
  );

  el.addEventListener(
    "touchend",
    () => {
      axisLock = null;
    },
    { passive: true },
  );
}

function sleepChartDateLabel(dateYmd, totalDays) {
  const mo = parseInt(dateYmd.slice(5, 7), 10);
  const day = parseInt(dateYmd.slice(8, 10), 10);
  if (totalDays <= 14) return String(day);
  return `${mo}.${day}`;
}

function fmtSleepAxisHours(h) {
  const rounded = Math.round(h);
  return String(rounded);
}

function computeSleepYDomain(hoursValues, targetHours) {
  let yMax = Math.max(...hoursValues, targetHours, 8);
  yMax = Math.ceil((yMax + 0.5) / 3) * 3;
  return { yMin: 0, yMax, yRange: yMax || 1 };
}

function sleepChartLayout(totalDays) {
  const scroll = totalDays > 7;
  const minSlot = scroll
    ? totalDays <= 14
      ? 28
      : 22
    : totalDays <= 7
      ? 34
      : 24;
  const pad = { top: 18, right: 8, bottom: 24, left: 28 };
  const W = Math.max(300, pad.left + pad.right + totalDays * minSlot);
  const H = 128;
  return { W, H, pad, minSlot, scroll };
}

function formatCompactSleepBarLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}시`;
  if (h === 0) return `${m}분`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** @param {HTMLElement} canvas @param {Array<{date:string, minutes:number}>} sleepByDay */
function renderSleepGoalBarChart(canvas, sleepByDay) {
  const totalDays = sleepByDay.length;
  const recorded = sleepByDay.filter((x) => x.minutes > 0);
  if (!recorded.length) return { scroll: false };

  const targetH = SLEEP_TARGET_MIN / 60;
  const hoursValues = recorded.map((x) => x.minutes / 60);
  const { yMin, yMax, yRange } = computeSleepYDomain(hoursValues, targetH);
  const { W, H, pad, scroll } = sleepChartLayout(totalDays);
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const plotBottom = pad.top + plotH;
  const yAt = (h) => pad.top + plotH - ((h - yMin) / yRange) * plotH;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "lp-tr2-sleep-chart-svg",
    role: "img",
    preserveAspectRatio: scroll ? "xMinYMid meet" : "xMidYMid meet",
    "aria-label": "날짜별 수면 시간 막대 그래프 · 7시간 목표",
  });
  if (scroll) {
    svg.style.minWidth = `${W}px`;
  }

  svg.appendChild(
    svgEl("rect", {
      x: pad.left,
      y: pad.top,
      width: plotW,
      height: plotH,
      fill: "#fafafa",
      rx: 6,
    }),
  );

  const gridStep = yMax <= 9 ? 3 : Math.ceil(yMax / 4 / 3) * 3;
  for (let v = 0; v <= yMax + 0.01; v += gridStep) {
    const y = yAt(v);
    const isTarget = Math.abs(v - targetH) < 0.01;
    svg.appendChild(
      svgEl("line", {
        x1: pad.left,
        x2: W - pad.right,
        y1: y,
        y2: y,
        stroke: isTarget ? "#fde68a" : "#e5e5e5",
        "stroke-width": isTarget ? 1.25 : 1,
      }),
    );
    const tick = svgEl("text", {
      x: pad.left - 5,
      y: y + 3,
      fill: isTarget ? "#d97706" : "#999999",
      "font-size": 8,
      "font-weight": isTarget ? 600 : 400,
      "text-anchor": "end",
    });
    tick.textContent = isTarget ? "7" : fmtSleepAxisHours(v);
    svg.appendChild(tick);
  }
  if (Math.abs(yMax - targetH) > 0.01 && targetH % gridStep !== 0) {
    const y = yAt(targetH);
    const tick = svgEl("text", {
      x: pad.left - 5,
      y: y + 3,
      fill: "#d97706",
      "font-size": 8,
      "font-weight": 600,
      "text-anchor": "end",
    });
    tick.textContent = "7";
    svg.appendChild(tick);
  }

  svg.appendChild(
    svgEl("line", {
      x1: pad.left,
      x2: pad.left,
      y1: pad.top,
      y2: plotBottom,
      stroke: "#cccccc",
      "stroke-width": 1,
    }),
  );
  svg.appendChild(
    svgEl("line", {
      x1: pad.left,
      x2: W - pad.right,
      y1: plotBottom,
      y2: plotBottom,
      stroke: "#cccccc",
      "stroke-width": 1,
    }),
  );

  const ty = yAt(targetH);
  svg.appendChild(
    svgEl("line", {
      x1: pad.left,
      x2: W - pad.right,
      y1: ty,
      y2: ty,
      stroke: "#f59e0b",
      "stroke-width": 1.75,
      "stroke-dasharray": "5 3",
    }),
  );

  const slotW = plotW / totalDays;
  const barW = Math.max(4, Math.min(22, slotW * 0.52));
  const goalTop = yAt(targetH);
  const goalHeight = plotBottom - goalTop;

  sleepByDay.forEach(({ date, minutes }, index) => {
    const cx = pad.left + (index + 0.5) * slotW;
    const label = sleepChartDateLabel(date, totalDays);
    const showDate =
      totalDays <= 10 ||
      index === 0 ||
      index === totalDays - 1 ||
      (totalDays <= 20 && index % 2 === 0) ||
      (totalDays > 20 && index % 3 === 0);

    if (showDate) {
      const dateLabel = svgEl("text", {
        x: cx,
        y: H - 6,
        fill: "#999999",
        "font-size": 8,
        "text-anchor": "middle",
      });
      dateLabel.textContent = label;
      svg.appendChild(dateLabel);
    }

    if (minutes <= 0) return;

    svg.appendChild(
      svgEl("rect", {
        x: cx - barW / 2,
        y: goalTop,
        width: barW,
        height: Math.max(1, goalHeight),
        fill: "#fff7ed",
        rx: 2,
      }),
    );

    const hours = minutes / 60;
    const barTop = yAt(hours);
    const barHeight = Math.max(2, plotBottom - barTop);
    const metGoal = minutes >= SLEEP_TARGET_MIN;
    const bar = svgEl("rect", {
      x: cx - barW / 2,
      y: barTop,
      width: barW,
      height: barHeight,
      fill: metGoal ? "#22c55e" : "#818cf8",
      opacity: metGoal ? 0.92 : 0.88,
      rx: 2,
    });
    const tip = `${formatYmdDotsWithWeekdayKo(date)} · ${formatIntegerMinutesDurationKo(minutes)}${metGoal ? " · 목표 달성" : " · 목표 미달"}`;
    const titleEl = svgEl("title");
    titleEl.textContent = tip;
    bar.appendChild(titleEl);
    svg.appendChild(bar);

    if (totalDays <= 10) {
      const valLabel = svgEl("text", {
        x: cx,
        y: barTop - 4,
        fill: metGoal ? "#15803d" : "#4d4d4d",
        "font-size": 7.5,
        "font-weight": 600,
        "text-anchor": "middle",
      });
      valLabel.textContent = formatCompactSleepBarLabel(minutes);
      svg.appendChild(valLabel);
    }
  });

  canvas.appendChild(svg);
  return { scroll };
}

function buildSleepChartLegend() {
  const legend = document.createElement("div");
  legend.className = "lp-tr2-sleep-chart-legend";
  const items = [
    { cls: "lp-tr2-sleep-chart-legend-target", text: "7시간 목표" },
    { cls: "lp-tr2-sleep-chart-legend-met", text: "달성" },
    { cls: "lp-tr2-sleep-chart-legend-miss", text: "미달" },
  ];
  items.forEach(({ cls, text }) => {
    const item = document.createElement("span");
    item.className = "lp-tr2-sleep-chart-legend-item";
    const mark = document.createElement("span");
    mark.className = cls;
    mark.setAttribute("aria-hidden", "true");
    item.appendChild(mark);
    item.appendChild(document.createTextNode(text));
    legend.appendChild(item);
  });
  return legend;
}

function parseRowClockMinutes(str) {
  const st = String(str || "").trim();
  const m = st.match(/(?:^|\s|T|\.)(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function rowStartSortKey(r) {
  const st = String(r.startTime || "").trim();
  const m = st.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s.](\d{1,2}):(\d{2})/,
  );
  if (m) {
    const [, y, mo, d, h, mi] = m;
    const pad = (n) => String(n).padStart(2, "0");
    return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${mi}`;
  }
  const clock = parseRowClockMinutes(st);
  const date = rowDateYmd(r);
  if (clock != null && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const h = Math.floor(clock / 60);
    const mi = clock % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${date}T${pad(h)}:${pad(mi)}`;
  }
  return st || "9999";
}

/**
 * 하루 수면 기록 해석
 * - 2건 이상: 1번째 마감=기상, 2번째 시작=취침
 * - 1건(아침 기상만): 마감=기상, 취침=전날 2번째 시작 → 없으면 다음날 1번째 시작
 */
function resolveSleepWakeBedForDay(dayRecs, nextDayRecs, prevDayRecs) {
  if (!dayRecs?.length) {
    return { wakeMin: null, bedtimeMin: null };
  }
  if (dayRecs.length >= 2) {
    return {
      wakeMin: dayRecs[0].endMin,
      bedtimeMin: dayRecs[1].startMin,
    };
  }
  const wakeMin = dayRecs[0].endMin;
  let bedtimeMin = null;
  if (prevDayRecs?.length >= 2) {
    bedtimeMin = prevDayRecs[1].startMin;
  }
  if (bedtimeMin == null) {
    bedtimeMin = nextDayRecs?.[0]?.startMin ?? null;
  }
  return { wakeMin, bedtimeMin };
}

/** 취침·기상 해석용 — 조회 기간 전후 1일 수면 기록 포함 */
function sleepRowsForReportContext(range) {
  const padStart = addDaysYmd(range.start, -1);
  const padEnd = addDaysYmd(range.end, 1);
  return loadTimeRows().filter((r) => {
    const d = rowDateYmd(r);
    if (!d || d < padStart || d > padEnd) return false;
    return isSleepLedgerRow(r);
  });
}

function collectSleepRecordsByDate(rows) {
  /** @type {Map<string, { startMin: number|null, endMin: number|null, minutes: number, rating: number|null, startSort: string }[]>} */
  const byDate = new Map();
  rows.forEach((r) => {
    if (!isSleepLedgerRow(r)) return;
    const date = rowDateYmd(r);
    if (!date) return;
    const minutes = rowMinutes(r);
    if (minutes <= 0) return;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({
      startMin: parseRowClockMinutes(r.startTime),
      endMin: parseRowClockMinutes(r.endTime),
      minutes,
      rating: normalizeTimeRatingForRow(r.timeRating),
      startSort: rowStartSortKey(r),
    });
  });
  byDate.forEach((recs) => {
    recs.sort((a, b) => a.startSort.localeCompare(b.startSort));
  });
  return byDate;
}

function isSleepLedgerRow(r) {
  const tn = String(r.taskName || "").trim();
  if (isSleepBuiltinTaskName(tn)) return true;
  const cat = String(r.category || "").trim();
  return cat === "sleep";
}

function normalizeBedtimeMinutes(mins) {
  if (mins == null || !Number.isFinite(mins)) return null;
  if (mins < 12 * 60) return mins + 24 * 60;
  return mins;
}

function formatClockFromMinutes(mins) {
  if (mins == null || !Number.isFinite(mins)) return "—";
  let m = Math.round(mins);
  while (m >= 24 * 60) m -= 24 * 60;
  while (m < 0) m += 24 * 60;
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

function circularMeanMinutes(values) {
  if (!values.length) return null;
  const day = 24 * 60;
  const angles = values.map((v) => ((v % day) / day) * 2 * Math.PI);
  const sinSum = angles.reduce((s, a) => s + Math.sin(a), 0);
  const cosSum = angles.reduce((s, a) => s + Math.cos(a), 0);
  let meanAngle = Math.atan2(sinSum / values.length, cosSum / values.length);
  if (meanAngle < 0) meanAngle += 2 * Math.PI;
  return (meanAngle / (2 * Math.PI)) * day;
}

function stdDevMinutes(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatRegularitySpread(stdMinutes) {
  const m = Math.round(Number(stdMinutes) || 0);
  if (m <= 0) return "—";
  if (m < 60) return `±${m}분`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `±${h}시간`;
  return `±${h}시간 ${r}분`;
}

function medianOf(nums) {
  const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function avgRatingOf(days) {
  const rated = days.filter((d) => d.rating != null);
  if (!rated.length) return null;
  const sum = rated.reduce((a, d) => a + d.rating, 0);
  return sum / rated.length;
}

function weekStartYmdMonday(dateYmd) {
  const key = normYmd(dateYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const [y, mo, d] = key.split("-").map(Number);
  const wd = new Date(y, mo - 1, d).getDay();
  const delta = wd === 0 ? -6 : 1 - wd;
  return addDaysYmd(key, delta);
}

function resolveSleepTrendMode(dayCount) {
  if (dayCount <= 14) return "daily";
  if (dayCount <= 62) return "weekly";
  return "monthly";
}

function buildSleepTrendPoints(daysWithSleep, mode) {
  if (!daysWithSleep.length) return [];
  if (mode === "daily") {
    return daysWithSleep
      .filter((d) => d.rating != null)
      .map((d) => ({
        key: d.date,
        label: sleepChartDateLabel(d.date, daysWithSleep.length),
        avg: d.rating,
        count: 1,
      }));
  }
  const bucketMap = new Map();
  daysWithSleep.forEach((d) => {
    if (d.rating == null) return;
    const key =
      mode === "weekly"
        ? weekStartYmdMonday(d.date)
        : d.date.slice(0, 7);
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { sum: 0, count: 0, key });
    }
    const b = bucketMap.get(key);
    b.sum += d.rating;
    b.count += 1;
  });
  return [...bucketMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => ({
      key: b.key,
      label:
        mode === "weekly"
          ? `${b.key.slice(5).replace("-", ".")}~`
          : `${b.key.slice(0, 4)}.${b.key.slice(5, 7)}`,
      avg: b.sum / b.count,
      count: b.count,
    }));
}

function buildSleepQualityCorrelations(daysWithSleep) {
  const rated = daysWithSleep.filter(
    (d) =>
      d.rating != null &&
      (d.bedtimeMin != null || d.wakeMin != null || d.minutes > 0),
  );
  if (rated.length < 3) return null;

  const insights = [];

  const bedNorm = rated
    .filter((d) => d.bedtimeMin != null)
    .map((d) => ({ ...d, bedNorm: normalizeBedtimeMinutes(d.bedtimeMin) }));
  if (bedNorm.length >= 3) {
    const med = medianOf(bedNorm.map((d) => d.bedNorm));
    const early = bedNorm.filter((d) => d.bedNorm <= med);
    const late = bedNorm.filter((d) => d.bedNorm > med);
    const earlyAvg = avgRatingOf(early);
    const lateAvg = avgRatingOf(late);
    if (earlyAvg != null && lateAvg != null) {
      insights.push({
        label: "일찍 잔 날",
        avg: earlyAvg,
        meta: `${early.length}일 · 취침 ${formatClockFromMinutes(med)} 이전`,
      });
      insights.push({
        label: "늦게 잔 날",
        avg: lateAvg,
        meta: `${late.length}일 · 취침 ${formatClockFromMinutes(med)} 이후`,
      });
    }
  }

  const durRated = rated.filter((d) => d.minutes > 0);
  if (durRated.length >= 3) {
    const medDur = medianOf(durRated.map((d) => d.minutes));
    const longDays = durRated.filter((d) => d.minutes >= medDur);
    const shortDays = durRated.filter((d) => d.minutes < medDur);
    const longAvg = avgRatingOf(longDays);
    const shortAvg = avgRatingOf(shortDays);
    if (longAvg != null && shortAvg != null) {
      insights.push({
        label: "긴 수면",
        avg: longAvg,
        meta: `${longDays.length}일 · ${formatIntegerMinutesDurationKo(Math.round(medDur))} 이상`,
      });
      insights.push({
        label: "짧은 수면",
        avg: shortAvg,
        meta: `${shortDays.length}일 · ${formatIntegerMinutesDurationKo(Math.round(medDur))} 미만`,
      });
    }
  }

  const wakeBuckets = [
    { label: "7~8시", test: (m) => m >= 7 * 60 && m < 8 * 60 },
    { label: "8~9시", test: (m) => m >= 8 * 60 && m < 9 * 60 },
    { label: "9시 이후", test: (m) => m >= 9 * 60 },
  ];
  const wakeRated = rated.filter((d) => d.wakeMin != null);
  wakeBuckets.forEach(({ label, test }) => {
    const bucket = wakeRated.filter((d) => test(d.wakeMin));
    const avg = avgRatingOf(bucket);
    if (avg != null && bucket.length >= 2) {
      insights.push({
        label: `기상 ${label}`,
        avg,
        meta: `${bucket.length}일`,
      });
    }
  });

  return insights.length ? insights : null;
}

/** @param {ReturnType<typeof loadTimeRows>} rows @param {{start:string,end:string}} range */
function buildSleepReportSnapshot(rows, range) {
  const dates = listDatesInclusive(range.start, range.end);
  const recordsByDate = collectSleepRecordsByDate(
    sleepRowsForReportContext(range),
  );

  const sleepByDay = dates.map((date, index) => {
    const dayRecs = recordsByDate.get(date) || [];
    const nextDate = dates[index + 1];
    const nextDayRecs = nextDate
      ? recordsByDate.get(nextDate) || []
      : recordsByDate.get(addDaysYmd(date, 1)) || [];
    const prevDayRecs = recordsByDate.get(addDaysYmd(date, -1)) || [];
    const minutes = dayRecs.reduce((sum, rec) => sum + rec.minutes, 0);
    const { wakeMin, bedtimeMin } = resolveSleepWakeBedForDay(
      dayRecs,
      nextDayRecs,
      prevDayRecs,
    );
    const rated = dayRecs.filter((rec) => rec.rating != null);
    const rating = rated.length
      ? rated.reduce((sum, rec) => sum + rec.rating, 0) / rated.length
      : null;
    return {
      date,
      minutes,
      bedtimeMin,
      wakeMin,
      rating,
    };
  });

  const daysWithSleep = sleepByDay.filter((x) => x.minutes > 0);
  const bedNorm = daysWithSleep
    .map((d) => normalizeBedtimeMinutes(d.bedtimeMin))
    .filter((v) => v != null);
  const wakeMins = daysWithSleep
    .map((d) => d.wakeMin)
    .filter((v) => v != null);
  const avgBedtime =
    bedNorm.length > 0 ? circularMeanMinutes(bedNorm) : null;
  const avgWake =
    wakeMins.length > 0
      ? wakeMins.reduce((a, b) => a + b, 0) / wakeMins.length
      : null;
  const bedtimeRegularity =
    bedNorm.length > 1 ? stdDevMinutes(bedNorm) : 0;
  const wakeRegularity = wakeMins.length > 1 ? stdDevMinutes(wakeMins) : 0;
  const regularitySpread =
    bedNorm.length > 1 && wakeMins.length > 1
      ? (bedtimeRegularity + wakeRegularity) / 2
      : bedtimeRegularity || wakeRegularity;
  const avgQuality = avgRatingOf(daysWithSleep);
  const trendMode = resolveSleepTrendMode(dates.length);
  const trendPoints = buildSleepTrendPoints(daysWithSleep, trendMode);
  const correlations = buildSleepQualityCorrelations(daysWithSleep);

  const total = daysWithSleep.reduce((a, x) => a + x.minutes, 0);
  const metDays = daysWithSleep.filter(
    (x) => x.minutes >= SLEEP_TARGET_MIN,
  ).length;

  return {
    sleepByDay,
    daysWithSleep,
    dayCount: dates.length,
    avgBedtime,
    avgWake,
    bedtimeRegularity,
    wakeRegularity,
    regularitySpread,
    avgQuality,
    trendMode,
    trendPoints,
    correlations,
    avgDurationMinutes: daysWithSleep.length
      ? Math.round(total / daysWithSleep.length)
      : 0,
    metDays,
  };
}

function renderSleepQualityTrendChart(points, mode) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-sleep-quality-trend";
  if (!points.length) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = "이 기간에 수면 평가(별점)가 없습니다.";
    wrap.appendChild(note);
    return wrap;
  }

  const scroll = mode === "daily" && points.length > 10;
  const slotW = mode === "daily" ? 26 : 44;
  const pad = { top: 14, right: 10, bottom: 22, left: 28 };
  const W = Math.max(
    280,
    pad.left + pad.right + points.length * slotW,
  );
  const H = 108;
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const yMin = 1;
  const yMax = 5;
  const yRange = yMax - yMin;
  const yAt = (v) =>
    pad.top + plotH - ((v - yMin) / yRange) * plotH;

  const canvas = document.createElement("div");
  canvas.className = "lp-tr2-sleep-quality-trend-canvas";
  if (scroll) canvas.classList.add("lp-tr2-sleep-quality-trend-canvas--scroll");

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "lp-tr2-sleep-quality-trend-svg",
    role: "img",
    preserveAspectRatio: scroll ? "xMinYMid meet" : "xMidYMid meet",
    "aria-label": "수면 품질 추세",
  });
  if (scroll) svg.style.minWidth = `${W}px`;

  [1, 3, 5].forEach((v) => {
    const y = yAt(v);
    svg.appendChild(
      svgEl("line", {
        x1: pad.left,
        x2: W - pad.right,
        y1: y,
        y2: y,
        stroke: "#e5e5e5",
        "stroke-width": 1,
      }),
    );
    const tick = svgEl("text", {
      x: pad.left - 5,
      y: y + 3,
      fill: "#999999",
      "font-size": 8,
      "text-anchor": "end",
    });
    tick.textContent = String(v);
    svg.appendChild(tick);
  });

  const coords = points.map((p, i) => {
    const cx = pad.left + (i + 0.5) * (plotW / points.length);
    const cy = yAt(p.avg);
    return { ...p, cx, cy };
  });

  if (coords.length > 1) {
    const d = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.cx},${c.cy}`)
      .join(" ");
    svg.appendChild(
      svgEl("path", {
        d,
        fill: "none",
        stroke: "#818cf8",
        "stroke-width": 2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      }),
    );
  }

  coords.forEach((c, i) => {
    const dot = svgEl("circle", {
      cx: c.cx,
      cy: c.cy,
      r: 3.5,
      fill: ratingFillColor(c.avg),
      stroke: "#fff",
      "stroke-width": 1,
    });
    const titleEl = svgEl("title");
    titleEl.textContent = `${c.label} · ${formatRatingAvg(c.avg)}점 · ${c.count}건`;
    dot.appendChild(titleEl);
    svg.appendChild(dot);
    const showLabel =
      points.length <= 8 ||
      i === 0 ||
      i === points.length - 1 ||
      (points.length <= 16 && i % 2 === 0);
    if (showLabel) {
      const lab = svgEl("text", {
        x: c.cx,
        y: H - 6,
        fill: "#999999",
        "font-size": 7.5,
        "text-anchor": "middle",
      });
      lab.textContent = c.label;
      svg.appendChild(lab);
    }
  });

  canvas.appendChild(svg);
  wrap.appendChild(canvas);
  return wrap;
}

function buildSleepStatsGrid(snap) {
  const { daysWithSleep } = snap;
  const grid = document.createElement("div");
  grid.className = "lp-tr2-sleep-stats";
  const mins = daysWithSleep.map((x) => x.minutes);
  const isSingleDay = snap.dayCount <= 1;
  const day = daysWithSleep[0];

  const addStat = (label, value, hint = "") => {
    const cell = document.createElement("div");
    cell.className = "lp-tr2-sleep-stat";
    const lab = document.createElement("span");
    lab.className = "lp-tr2-sleep-stat-label";
    lab.textContent = label;
    const val = document.createElement("strong");
    val.className = "lp-tr2-sleep-stat-value";
    val.textContent = value;
    cell.appendChild(lab);
    cell.appendChild(val);
    if (hint) {
      const h = document.createElement("span");
      h.className = "lp-tr2-sleep-stat-hint";
      h.textContent = hint;
      cell.appendChild(h);
    }
    grid.appendChild(cell);
  };

  if (isSingleDay && day) {
    addStat(
      "취침",
      day.bedtimeMin != null ? formatClockFromMinutes(day.bedtimeMin) : "—",
      day.bedtimeMin != null ? "전날 밤" : "",
    );
    addStat("기상", day.wakeMin != null ? formatClockFromMinutes(day.wakeMin) : "—");
    addStat(
      "수면 품질",
      day.rating != null ? `${formatRatingAvg(day.rating)}/5` : "—",
      "수면 평가 별점",
    );
    addStat("수면 시간", formatIntegerMinutesDurationKo(day.minutes));
    addStat(
      "7시간 목표",
      day.minutes >= SLEEP_TARGET_MIN ? "달성" : "미달",
    );
    return grid;
  }

  addStat(
    "평균 취침",
    snap.avgBedtime != null ? formatClockFromMinutes(snap.avgBedtime) : "—",
  );
  addStat(
    "평균 기상",
    snap.avgWake != null ? formatClockFromMinutes(snap.avgWake) : "—",
  );
  addStat(
    "취침·기상 규칙성",
    snap.regularitySpread > 0
      ? formatRegularitySpread(snap.regularitySpread)
      : "—",
    "클수록 불규칙",
  );
  addStat(
    "평균 품질",
    snap.avgQuality != null ? `${formatRatingAvg(snap.avgQuality)}/5` : "—",
    "수면 평가 별점",
  );
  addStat(
    "평균 수면",
    formatIntegerMinutesDurationKo(snap.avgDurationMinutes),
  );
  if (daysWithSleep.length > 1) {
    addStat("최소", formatIntegerMinutesDurationKo(Math.min(...mins)));
    addStat("최대", formatIntegerMinutesDurationKo(Math.max(...mins)));
  }
  addStat("목표 달성", `${snap.metDays}/${daysWithSleep.length}일`);
  return grid;
}

function formatCompactReportDate(ymd) {
  const dStr = normYmd(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
  const [y, mo, d] = dStr.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${mo}.${d}(${weekdays[dt.getDay()]})`;
}

/** @param {Array<{date:string, main:string, sub:string}>} entries */
function groupIntakeEntriesByDate(entries) {
  const byDate = new Map();
  entries.forEach((entry) => {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  });
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));
}

/** @param {Array<{main:string, sub:string}>} items */
function formatIntakeDayLine(items) {
  return items
    .map((item) => {
      if (item.sub) return `${item.main} (${item.sub})`;
      return item.main;
    })
    .join(" · ");
}

/**
 * @param {Array<{date:string, main:string, sub:string}>} entries
 * @param {"healthy"|"unhealthy"} tone
 */
function buildCompactIntakeFeed(entries, emptyText, tone) {
  const ul = document.createElement("ul");
  ul.className = "lp-tr2-intake-day-list";
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "lp-tr2-intake-day-empty";
    li.textContent = emptyText;
    ul.appendChild(li);
    return ul;
  }
  groupIntakeEntriesByDate(entries).forEach(({ date, items }) => {
    const li = document.createElement("li");
    li.className = "lp-tr2-intake-day-row";
    const dateEl = document.createElement("span");
    dateEl.className = "lp-tr2-intake-day-date";
    dateEl.textContent = formatCompactReportDate(date);
    dateEl.title = formatYmdDotsWithWeekdayKo(date);
    const meals = document.createElement("span");
    meals.className = `lp-tr2-intake-day-meals lp-tr2-intake-day-meals--${tone}`;
    meals.textContent = formatIntakeDayLine(items);
    li.appendChild(dateEl);
    li.appendChild(meals);
    ul.appendChild(li);
  });
  return ul;
}

function buildJournalList(items, emptyText) {
  const ul = document.createElement("ul");
  ul.className = "lp-tr2-journal-list";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "lp-tr2-journal-empty";
    li.textContent = emptyText;
    ul.appendChild(li);
    return ul;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "lp-tr2-journal-item";
    const dateEl = document.createElement("span");
    dateEl.className = "lp-tr2-journal-date";
    dateEl.textContent = formatYmdDotsWithWeekdayKo(item.date);
    const body = document.createElement("div");
    body.className = "lp-tr2-journal-body";
    const main = document.createElement("p");
    main.className = "lp-tr2-journal-main";
    main.textContent = item.main;
    body.appendChild(main);
    if (item.sub) {
      const sub = document.createElement("p");
      sub.className = "lp-tr2-journal-sub";
      sub.textContent = item.sub;
      body.appendChild(sub);
    }
    li.appendChild(dateEl);
    li.appendChild(body);
    ul.appendChild(li);
  });
  return ul;
}

function collectIntakeLogs(rows) {
  /** @type {{ date: string, main: string, sub: string }[]} */
  const healthy = [];
  /** @type {{ date: string, main: string, sub: string }[]} */
  const unhealthy = [];
  rows.forEach((r) => {
    const tn = String(r.taskName || "").trim();
    const md = String(r.mealDetail || "").trim();
    const note = rowUserNote(r);
    const date = rowDateYmd(r);
    if (!date) return;
    const main = md || note || tn;
    if (!main) return;
    const subParts = [];
    if (md && note && note !== md) subParts.push(note);
    const mins = rowMinutes(r);
    if (mins > 0) subParts.push(formatIntegerMinutesDurationKo(mins));
    const entry = { date, main, sub: subParts.join(" · ") };
    if (isHealthyMealDetailTaskName(tn)) healthy.push(entry);
    else if (isUnhealthyMealDetailTaskName(tn)) unhealthy.push(entry);
  });
  const sortDesc = (a, b) =>
    b.date.localeCompare(a.date) || a.main.localeCompare(b.main, "ko");
  healthy.sort(sortDesc);
  unhealthy.sort(sortDesc);
  return { healthy, unhealthy };
}

function getDayAvailableMinutes(ymd) {
  const s = getTimeReportSummaryGridForDateRange(ymd, ymd);
  return Math.max(0, Math.round(24 * 60 - s.workMinutes - s.sleepMinutes));
}

function aggregateContentTypesFromEntries(entries, categoryTotalMinutes) {
  /** @type {Map<string, { label: string, minutes: number }>} */
  const byKey = new Map();
  entries.forEach(({ label, minutes }) => {
    const reportLabel = contentTypeReportLabel(label);
    const cur = byKey.get(reportLabel) || { label: reportLabel, minutes: 0 };
    cur.minutes += minutes;
    byKey.set(reportLabel, cur);
  });

  const list = [...byKey.values()]
    .map(({ label, minutes }) => ({
      label,
      minutes: Math.round(minutes),
      pct:
        categoryTotalMinutes > 0
          ? Math.round((minutes / categoryTotalMinutes) * 100)
          : 0,
    }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const TOP = 10;
  if (list.length <= TOP) return list;
  const top = list.slice(0, TOP);
  const restMin = list.slice(TOP).reduce((a, x) => a + x.minutes, 0);
  if (restMin > 0) {
    top.push({
      label: "기타",
      minutes: restMin,
      pct:
        categoryTotalMinutes > 0
          ? Math.round((restMin / categoryTotalMinutes) * 100)
          : 0,
    });
  }
  return top;
}

function createMediaTagBarRow(label, pct, minutes, color) {
  const row = document.createElement("div");
  row.className = "lp-tr2-bar-row lp-tr2-bar-row--media-tag";
  row.title = `${label} · ${formatIntegerMinutesDurationKo(minutes)}`;
  const lab = document.createElement("span");
  lab.className = "lp-tr2-bar-label";
  lab.textContent = label;
  const track = document.createElement("div");
  track.className = "lp-tr2-bar-track";
  const fill = document.createElement("div");
  fill.className = "lp-tr2-bar-fill";
  fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  fill.style.background = color;
  const val = document.createElement("span");
  val.className = "lp-tr2-bar-value";
  val.textContent = `${pct}%`;
  track.appendChild(fill);
  row.appendChild(lab);
  row.appendChild(track);
  row.appendChild(val);
  return row;
}

function renderMediaTagBreakdown(title, subtitle, tags, kind) {
  if (!tags.length) return null;
  const block = document.createElement("article");
  block.className = `lp-tr2-media-tag-block lp-tr2-media-tag-block--${kind}`;
  const h = document.createElement("h3");
  h.className = "lp-tr2-media-tag-block-title";
  h.textContent = title;
  block.appendChild(h);
  if (subtitle) {
    const p = document.createElement("p");
    p.className = "lp-tr2-media-tag-block-sub";
    p.textContent = subtitle;
    block.appendChild(p);
  }
  const bars = document.createElement("div");
  bars.className = "lp-tr2-bars";
  const color =
    kind === "conscious" ? MEDIA_CONSCIOUS_COLOR : MEDIA_UNCONSCIOUS_COLOR;
  tags.forEach((item) => {
    bars.appendChild(
      createMediaTagBarRow(item.label, item.pct, item.minutes, color),
    );
  });
  block.appendChild(bars);
  return block;
}

function mediaContentKind(row) {
  const tn = canonicalMealTaskDisplayName(String(row.taskName || "").trim());
  if (tn === MEDIA_CONSCIOUS_TASK) return "conscious";
  if (tn === MEDIA_UNCONSCIOUS_TASK) return "unconscious";
  return null;
}

function rowContentLabels(row) {
  const tn = String(row.taskName || "").trim();
  const md = String(row.mealDetail || "").trim();
  if (md && isChipDetailTaskName(tn)) {
    const labels = chipDetailLabelsForReport(tn, md);
    if (labels.length) return labels;
  }
  if (md) return [md];
  const fb = String(row.feedback || row.memo || "").trim();
  if (fb.startsWith("[콘텐츠] ")) {
    const first = fb.split("\n")[0] || "";
    const legacy = first.slice("[콘텐츠] ".length).trim();
    if (legacy) {
      if (isChipDetailTaskName(tn)) {
        return chipDetailLabelsForReport(tn, legacy);
      }
      return [legacy];
    }
  }
  return [];
}

function buildMediaReportSnapshot(rows, range) {
  /** @type {Map<string, { conscious: number, unconscious: number }>} */
  const byDate = new Map();
  /** @type {{ label: string, minutes: number }[]} */
  const consciousEntriesAll = [];
  /** @type {{ label: string, minutes: number }[]} */
  const unconsciousEntriesAll = [];
  let totalConscious = 0;
  let totalUnconscious = 0;

  rows.forEach((r) => {
    const kind = mediaContentKind(r);
    if (!kind) return;
    const date = rowDateYmd(r);
    if (!date) return;
    const mins = rowMinutes(r);
    if (mins <= 0) return;
    const labels = rowContentLabels(r);
    const splitMin =
      labels.length > 0 ? mins / labels.length : mins;
    const entryLabels = labels.length > 0 ? labels : [""];

    if (!byDate.has(date)) {
      byDate.set(date, { conscious: 0, unconscious: 0 });
    }
    const day = byDate.get(date);
    entryLabels.forEach((label) => {
      if (kind === "conscious") {
        consciousEntriesAll.push({ label, minutes: splitMin });
      } else {
        unconsciousEntriesAll.push({ label, minutes: splitMin });
      }
    });
    if (kind === "conscious") {
      day.conscious += mins;
      totalConscious += mins;
    } else {
      day.unconscious += mins;
      totalUnconscious += mins;
    }
  });

  const totalMinutes = totalConscious + totalUnconscious;
  const chartDays = [...byDate.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const d = byDate.get(date);
      const consciousMinutes = d?.conscious ?? 0;
      const unconsciousMinutes = d?.unconscious ?? 0;
      const minutes = consciousMinutes + unconsciousMinutes;
      const avail = getDayAvailableMinutes(date);
      const pct = avail > 0 ? Math.round((minutes / avail) * 100) : 0;
      return {
        date,
        minutes,
        consciousMinutes,
        unconsciousMinutes,
        availableMinutes: avail,
        pct,
      };
    });

  let totalAvailable = 0;
  chartDays.forEach((d) => {
    totalAvailable += d.availableMinutes;
  });
  const periodPct =
    totalAvailable > 0 ? Math.round((totalMinutes / totalAvailable) * 100) : 0;

  return {
    totalMinutes,
    totalConsciousMinutes: totalConscious,
    totalUnconsciousMinutes: totalUnconscious,
    periodPct,
    totalAvailableMinutes: totalAvailable,
    chartDays,
    dayCount: chartDays.length,
    consciousTags: aggregateContentTypesFromEntries(
      consciousEntriesAll,
      totalConscious,
    ),
    unconsciousTags: aggregateContentTypesFromEntries(
      unconsciousEntriesAll,
      totalUnconscious,
    ),
  };
}

function renderMediaCompareChart(chartDays) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-media-compare-chart";
  const maxMins = Math.max(
    1,
    ...chartDays.map((d) => Math.max(d.consciousMinutes, d.unconsciousMinutes)),
  );

  const cols = document.createElement("div");
  cols.className = "lp-tr2-media-compare-cols";
  if (chartDays.length >= 8) {
    cols.classList.add("lp-tr2-media-compare-cols--scroll");
    bindHorizontalChartScroll(cols);
  }
  cols.setAttribute("role", "img");
  cols.setAttribute("aria-label", "날짜별 의식적·무의식적 미디어 시청 비교");

  chartDays.forEach((day) => {
    const col = document.createElement("div");
    col.className = "lp-tr2-media-compare-col";
    const group = document.createElement("div");
    group.className = "lp-tr2-media-compare-bars";

    [
      ["conscious", day.consciousMinutes, MEDIA_CONSCIOUS_COLOR, "의식적"],
      ["unconscious", day.unconsciousMinutes, MEDIA_UNCONSCIOUS_COLOR, "무의식적"],
    ].forEach(([kind, mins, color, labelKo]) => {
      const bar = document.createElement("div");
      bar.className = `lp-tr2-media-compare-bar lp-tr2-media-compare-bar--${kind}`;
      const fill = document.createElement("div");
      fill.className = "lp-tr2-media-compare-bar-fill";
      const pct = mins > 0 ? Math.max(10, (mins / maxMins) * 100) : 0;
      fill.style.height = `${pct}%`;
      fill.style.background = color;
      bar.title = `${labelKo} ${formatIntegerMinutesDurationKo(mins)}`;
      bar.appendChild(fill);
      group.appendChild(bar);
    });

    col.appendChild(group);
    const dateLab = document.createElement("span");
    dateLab.className = "lp-tr2-media-compare-date";
    dateLab.textContent = formatCompactReportDate(day.date);
    dateLab.title = formatYmdDotsWithWeekdayKo(day.date);
    col.appendChild(dateLab);
    cols.appendChild(col);
  });

  wrap.appendChild(cols);
  wrap.appendChild(
    createRatingChartLegend([
      { swatch: MEDIA_CONSCIOUS_COLOR, label: "의식적" },
      { swatch: MEDIA_UNCONSCIOUS_COLOR, label: "무의식적" },
    ]),
  );
  return wrap;
}

function buildEmotionTriggerTable(items) {
  const table = document.createElement("div");
  table.className = "lp-tr2-emotion-trigger-table";
  table.setAttribute("role", "table");

  const head = document.createElement("div");
  head.className = "lp-tr2-emotion-trigger-table-head";
  head.setAttribute("role", "row");
  ["트리거", "횟수", "평균 강도", "평균 시간"].forEach((text) => {
    const cell = document.createElement("span");
    cell.setAttribute("role", "columnheader");
    cell.textContent = text;
    head.appendChild(cell);
  });
  table.appendChild(head);

  const body = document.createElement("div");
  body.className = "lp-tr2-emotion-trigger-table-body";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "lp-tr2-emotion-trigger-table-row";
    row.setAttribute("role", "row");

    const labelCell = document.createElement("span");
    labelCell.className = "lp-tr2-emotion-trigger-table-label";
    labelCell.setAttribute("role", "cell");
    labelCell.textContent = item.label;

    const countCell = document.createElement("span");
    countCell.className = "lp-tr2-emotion-trigger-table-num";
    countCell.setAttribute("role", "cell");
    countCell.textContent = `${item.count}회`;

    const ratingCell = document.createElement("span");
    ratingCell.className = "lp-tr2-emotion-trigger-table-num";
    ratingCell.setAttribute("role", "cell");
    ratingCell.textContent =
      item.avgRating != null ? `${formatRatingAvg(item.avgRating)}/5` : "—";

    const durCell = document.createElement("span");
    durCell.className = "lp-tr2-emotion-trigger-table-num";
    durCell.setAttribute("role", "cell");
    durCell.textContent = formatIntegerMinutesDurationKo(
      Math.round(item.avgMinutes),
    );

    row.append(labelCell, countCell, ratingCell, durCell);
    body.appendChild(row);
  });
  table.appendChild(body);
  return table;
}

function mountEmotionSection(scrollWrap, range, rows) {
  const hourlyRate = readReportHourlyRateNumber();
  const snap = buildEmotionReportSnapshot(rows, hourlyRate);
  const sec = createSection(
    "감정 소비",
    "감정적이기 중 1~2점(나쁨·매우 나쁨) 기록만 집계합니다",
  );

  if (!snap.hasData) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "이 기간에 감정 1~2점 기록이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "lp-tr2-card-grid";
  hero.appendChild(
    createStatCard(
      "감정소비시간",
      formatIntegerMinutesDurationKo(snap.consumptionMinutes),
      snap.consumptionCount > 0
        ? `감정 1~2점 기록 ${snap.consumptionCount}건`
        : "이 기간에 1~2점 기록 없음",
    ),
  );
  hero.appendChild(
    createStatCard(
      "감정 소비 비용",
      snap.consumptionCostWon > 0
        ? formatLedgerLossKrwDisplay(snap.consumptionCostWon)
        : hourlyRate > 0
          ? "₩0"
          : "—",
      hourlyRate > 0
        ? "설정한 시급 × 감정소비시간"
        : "나의 계정에서 시급을 넣으면 표시됩니다",
    ),
  );
  sec.appendChild(hero);

  if (snap.triggers.length) {
    const block = createRatingBlock(
      "트리거별 (1~2점만)",
      "어떤 상황에서 나쁜 감정이 얼마나·얼마나 오래 이어졌는지",
    );
    block.appendChild(buildEmotionTriggerTable(snap.triggers));
    sec.appendChild(block);
  }

  scrollWrap.appendChild(sec);
}

function mountMoveSection(scrollWrap, range, rows) {
  const snap = buildMoveReportSnapshot(rows, range);
  const sec = createSection(
    "이동 시간",
    "이동 루틴 · 단순 이동 과제 기록 합산",
  );

  if (!snap.hasData) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "이 기간에 이동 루틴·단순 이동 기록이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "lp-tr2-media-hero";
  const heroMain = document.createElement("p");
  heroMain.className = "lp-tr2-media-hero-main";
  heroMain.textContent = `이동시간 가용율 ${snap.routineUtilPct}%`;
  const heroSub = document.createElement("p");
  heroSub.className = "lp-tr2-media-hero-sub";
  heroSub.textContent = `총 이동 ${formatIntegerMinutesDurationKo(snap.totalMinutes)} · 일평균 ${formatIntegerMinutesDurationKo(snap.dailyAvgMinutes)} · 이동 루틴 ${formatIntegerMinutesDurationKo(snap.routineMinutes)} · 단순 이동 ${formatIntegerMinutesDurationKo(snap.simpleMinutes)}`;
  hero.appendChild(heroMain);
  hero.appendChild(heroSub);
  sec.appendChild(hero);

  const hint = document.createElement("p");
  hint.className = "lp-tr2-media-tag-hint";
  hint.textContent =
    "가용율 = 총 이동시간 중 이동 루틴에 쓴 비율입니다. 일평균은 조회 기간 전체 일수로 나눈 값입니다.";
  sec.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "lp-tr2-card-grid";
  grid.appendChild(
    createStatCard(
      "총 이동시간",
      formatIntegerMinutesDurationKo(snap.totalMinutes),
      `기록 ${snap.recordCount}건 · 이동 있던 날 ${snap.daysWithMoveCount}일`,
    ),
  );
  grid.appendChild(
    createStatCard(
      "일평균 이동시간",
      formatIntegerMinutesDurationKo(snap.dailyAvgMinutes),
      `조회 ${snap.calendarDayCount}일 기준`,
    ),
  );
  grid.appendChild(
    createStatCard(
      "이동 루틴",
      formatIntegerMinutesDurationKo(snap.routineMinutes),
      snap.totalMinutes > 0
        ? `총 이동의 ${formatPctRounded((snap.routineMinutes / snap.totalMinutes) * 100)}`
        : "",
    ),
  );
  grid.appendChild(
    createStatCard(
      "단순 이동",
      formatIntegerMinutesDurationKo(snap.simpleMinutes),
      snap.totalMinutes > 0
        ? `총 이동의 ${formatPctRounded((snap.simpleMinutes / snap.totalMinutes) * 100)}`
        : "",
    ),
  );
  sec.appendChild(grid);

  const block = document.createElement("div");
  block.className = "lp-tr2-rating-block";
  const blockTitle = document.createElement("p");
  blockTitle.className = "lp-tr2-rating-block-title";
  blockTitle.textContent = "이동 시간 구성";
  const blockSub = document.createElement("p");
  blockSub.className = "lp-tr2-rating-block-sub";
  blockSub.textContent = "이동 루틴 vs 단순 이동";
  block.appendChild(blockTitle);
  block.appendChild(blockSub);
  block.appendChild(
    createSplitRatioBar(
      [
        {
          label: "이동 루틴",
          minutes: snap.routineMinutes,
          color: MOVE_ROUTINE_COLOR,
          title: "의도한 이동 루틴에 쓴 시간",
        },
        {
          label: "단순 이동",
          minutes: snap.simpleMinutes,
          color: MOVE_SIMPLE_COLOR,
          title: "단순 이동 과제에 쓴 시간",
        },
      ],
      "이동 루틴과 단순 이동 시간 비율",
    ),
  );
  sec.appendChild(block);

  scrollWrap.appendChild(sec);
}

function buildHappinessRoutineWeakItemsLine(items) {
  const line = document.createElement("p");
  line.className = "lp-tr2-routine-weak-line";

  const label = document.createElement("span");
  label.className = "lp-tr2-routine-weak-line-label";
  label.textContent = "잘 안 지켜진 매일할일";

  const names = document.createElement("span");
  names.className = "lp-tr2-routine-weak-line-items";
  names.textContent = items
    .map((item) => String(item.text || "").trim())
    .filter(Boolean)
    .join(" · ");

  line.append(label, document.createTextNode(" "), names);
  return line;
}

function appendHappinessRoutineBlock(sec, snap, { heading, routine, items, badgeKind }) {
  if (!routine) return;

  const block = document.createElement("div");
  block.className = "lp-tr2-routine-block";

  const head = document.createElement("div");
  head.className = "lp-tr2-routine-block-head";

  const title = document.createElement("p");
  title.className = "lp-tr2-routine-block-title";
  title.textContent = heading;

  const name = document.createElement("span");
  name.className = "lp-tr2-routine-block-name";
  name.textContent = routine.name;

  const badge = document.createElement("span");
  badge.className =
    badgeKind === "ok"
      ? "lp-tr2-routine-badge lp-tr2-routine-badge--ok"
      : "lp-tr2-routine-badge lp-tr2-routine-badge--warn";
  badge.textContent = badgeKind === "ok" ? "가장 높음" : "가장 낮음";

  const pct = document.createElement("span");
  pct.className = "lp-tr2-routine-block-pct";
  pct.textContent = `실행율 ${formatPctRounded(routine.executionPct)}`;

  head.append(title, name, badge, pct);
  block.appendChild(head);

  const sub = document.createElement("p");
  sub.className = "lp-tr2-routine-block-sub";
  sub.textContent = `체크 ${routine.totalChecks}/${routine.totalOpportunities} · ${snap.calendarDayCount}일 기준`;
  block.appendChild(sub);

  if (items.length) {
    block.appendChild(buildHappinessRoutineWeakItemsLine(items));
  } else {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "이 루틴에서 실행율이 특히 낮은 매일할일은 없습니다.";
    block.appendChild(empty);
  }

  sec.appendChild(block);
}

function mountHappinessRoutineSection(scrollWrap, range) {
  const snap = buildHappinessRoutineReportSnapshot(range);
  const sec = createSection(
    "행복 루틴 점검",
    `매일반복 루틴 · ${snap.calendarDayCount || 0}일 · 가장 잘·덜 지켜진 루틴만`,
  );

  if (!snap.hasData) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "매일반복이 켜진 행복 루틴과 매일할일이 없거나, 이 기간 집계 대상이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  const best = snap.bestRoutine;
  const worst = snap.worstRoutine;
  const sameRoutine =
    best && worst && String(best.kpiId) === String(worst.kpiId);

  appendHappinessRoutineBlock(sec, snap, {
    heading: "가장 잘 지켜지는 루틴",
    routine: best,
    items: best?.weakItems || [],
    badgeKind: "ok",
  });

  if (!sameRoutine) {
    const weakItems =
      worst?.weakItems?.length > 0
        ? worst.weakItems
        : (worst?.items || []).slice(0, 3);
    appendHappinessRoutineBlock(sec, snap, {
      heading: "가장 덜 지켜지는 루틴",
      routine: worst,
      items: weakItems,
      badgeKind: "warn",
    });
  }

  scrollWrap.appendChild(sec);
}

function mountMediaSection(scrollWrap, range, rows) {
  const snap = buildMediaReportSnapshot(rows, range);
  const sec = createSection(
    "콘텐츠·미디어 시청",
    "기록에서 고른 콘텐츠 종류 · 의식적 vs 무의식적 비율",
  );

  if (snap.totalMinutes <= 0) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-media-empty";
    empty.textContent =
      "의식적·무의식적 콘텐츠 소비 기록이 없습니다.";
    sec.appendChild(empty);
    scrollWrap.appendChild(sec);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "lp-tr2-media-hero";
  const heroMain = document.createElement("p");
  heroMain.className = "lp-tr2-media-hero-main";
  heroMain.textContent = `가용시간의 ${snap.periodPct}%를 미디어에 사용`;
  const heroSub = document.createElement("p");
  heroSub.className = "lp-tr2-media-hero-sub";
  heroSub.textContent = `총 ${formatIntegerMinutesDurationKo(snap.totalMinutes)} · 의식적 ${formatIntegerMinutesDurationKo(snap.totalConsciousMinutes)} · 무의식적 ${formatIntegerMinutesDurationKo(snap.totalUnconsciousMinutes)} · ${snap.dayCount}일`;
  hero.appendChild(heroMain);
  hero.appendChild(heroSub);
  sec.appendChild(hero);

  const tagHint = document.createElement("p");
  tagHint.className = "lp-tr2-media-tag-hint";
  tagHint.textContent =
    "시간 기록에서 선택한 콘텐츠 종류별 비율입니다. 메모는 여기에 반영되지 않습니다.";
  sec.appendChild(tagHint);

  const unconsciousBlock = renderMediaTagBreakdown(
    "무의식적 — 많이 본 내용",
    "무의식적 콘텐츠 소비 시간 중 비율",
    snap.unconsciousTags,
    "unconscious",
  );
  if (unconsciousBlock) sec.appendChild(unconsciousBlock);

  const consciousBlock = renderMediaTagBreakdown(
    "의식적 — 많이 본 내용",
    "의식적 콘텐츠 소비 시간 중 비율",
    snap.consciousTags,
    "conscious",
  );
  if (consciousBlock) sec.appendChild(consciousBlock);

  if (snap.chartDays.length > 1) {
    const chartBlock = document.createElement("div");
    chartBlock.className = "lp-tr2-media-compare-block";
    const chartTitle = document.createElement("p");
    chartTitle.className = "lp-tr2-media-days-title";
    chartTitle.textContent = "날짜별 의식적 vs 무의식적";
    const chartSub = document.createElement("p");
    chartSub.className = "lp-tr2-media-compare-sub";
    chartSub.textContent = "하루마다 의식적(붉은)·무의식적(파란) 시청 시간을 나란히 비교";
    chartBlock.appendChild(chartTitle);
    chartBlock.appendChild(chartSub);
    chartBlock.appendChild(renderMediaCompareChart(snap.chartDays));
    sec.appendChild(chartBlock);
  }

  scrollWrap.appendChild(sec);
}

function minutesToHhMmShort(totalMin) {
  const n = Math.max(0, Math.round(Number(totalMin) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h <= 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** 계획 vs 실제 — 생산·비생산 카테고리 전부(수면·근무 제외) */
const PLAN_COMPARE_AXES = [
  { key: "sideincome", label: "시급상승" },
  { key: "happiness", label: "행복" },
  { key: "health", label: "건강" },
  { key: "pleasure", label: "쾌락충족" },
  { key: "media_watch", label: "미디어" },
  { key: "unhappiness", label: "불행" },
  { key: "unhealthy", label: "비건강" },
  { key: "moneylosing", label: "돈버는일" },
];

function buildPlanCompareChartItems(categories) {
  const byKey = new Map((categories || []).map((c) => [c.key, c]));
  return PLAN_COMPARE_AXES.map(({ key, label }) => ({
    key,
    label,
    plannedMin: byKey.get(key)?.plannedMin || 0,
    actualMin: byKey.get(key)?.actualMin || 0,
  }));
}

function formatPlanChartAxisLabel(minutes) {
  const n = Math.max(0, Math.round(Number(minutes) || 0));
  if (n <= 0) return "0m";
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return `${h}h`;
  return `${h}h`;
}

function buildPlanChartScale(items) {
  const maxMin = Math.max(
    60,
    ...(items || []).flatMap((i) => [i.plannedMin, i.actualMin]),
  );
  const maxH = Math.ceil(maxMin / 60);
  const scaleHours =
    maxH <= 2 ? maxH : Math.ceil(maxH / 2) * 2;
  const scaleMaxMin = Math.max(60, scaleHours * 60);
  const stepMin = scaleHours <= 3 ? 60 : scaleHours <= 8 ? 60 : 120;
  const ticks = [0];
  for (let m = stepMin; m < scaleMaxMin; m += stepMin) ticks.push(m);
  if (ticks[ticks.length - 1] !== scaleMaxMin) ticks.push(scaleMaxMin);
  return { scaleMaxMin, ticks };
}

function renderPlanCompareChart(items) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-plan-compare-chart";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "카테고리별 계획과 실제 시간");

  wrap.appendChild(
    createRatingChartLegend([
      { swatch: "#d1d5db", label: "계획" },
      { swatch: "#111111", label: "실제" },
    ]),
  );

  const { scaleMaxMin, ticks } = buildPlanChartScale(items);
  const panel = document.createElement("div");
  panel.className = "lp-tr2-plan-compare-panel";

  const rowsWrap = document.createElement("div");
  rowsWrap.className = "lp-tr2-plan-compare-rows-wrap";

  const vgrid = document.createElement("div");
  vgrid.className = "lp-tr2-plan-compare-vgrid";
  vgrid.setAttribute("aria-hidden", "true");
  ticks.forEach((min) => {
    if (min <= 0) return;
    const line = document.createElement("span");
    line.className = "lp-tr2-plan-compare-grid-line";
    line.style.left = `${(min / scaleMaxMin) * 100}%`;
    vgrid.appendChild(line);
  });

  const rows = document.createElement("div");
  rows.className = "lp-tr2-plan-compare-rows";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "lp-tr2-plan-compare-row";
    const lab = document.createElement("span");
    lab.className = "lp-tr2-plan-compare-label";
    lab.textContent = item.label;
    const bars = document.createElement("div");
    bars.className = "lp-tr2-plan-compare-bars";

    [
      ["plan", item.plannedMin, "#d1d5db"],
      ["actual", item.actualMin, "#111111"],
    ].forEach(([kind, mins, color]) => {
      const bar = document.createElement("div");
      bar.className = `lp-tr2-plan-compare-bar lp-tr2-plan-compare-bar--${kind}`;
      const fill = document.createElement("div");
      fill.className = "lp-tr2-plan-compare-bar-fill";
      const pct =
        scaleMaxMin > 0
          ? Math.min(100, (Math.max(0, mins) / scaleMaxMin) * 100)
          : 0;
      fill.style.width = `${pct}%`;
      fill.style.background = color;
      if (mins > 0) {
        bar.title = `${item.label} · ${kind === "plan" ? "계획" : "실제"} · ${formatIntegerMinutesDurationKo(mins)}`;
      }
      bar.appendChild(fill);
      bars.appendChild(bar);
    });

    row.append(lab, bars);
    rows.appendChild(row);
  });

  rowsWrap.append(vgrid, rows);
  panel.appendChild(rowsWrap);

  const axis = document.createElement("div");
  axis.className = "lp-tr2-plan-compare-axis";
  axis.setAttribute("aria-hidden", "true");
  const axisSpacer = document.createElement("span");
  axisSpacer.className = "lp-tr2-plan-compare-axis-spacer";
  const axisTrack = document.createElement("div");
  axisTrack.className = "lp-tr2-plan-compare-axis-track";
  ticks.forEach((min, idx) => {
    const tick = document.createElement("span");
    tick.className = "lp-tr2-plan-compare-axis-tick";
    if (idx === 0) tick.classList.add("is-origin");
    tick.style.left = `${(min / scaleMaxMin) * 100}%`;
    tick.textContent = formatPlanChartAxisLabel(min);
    axisTrack.appendChild(tick);
  });
  axis.append(axisSpacer, axisTrack);
  panel.appendChild(axis);

  wrap.appendChild(panel);
  return wrap;
}

function mountPlanAdherenceSection(scrollWrap, range, rows) {
  const snap = buildPlanAdherenceReportSnapshot(range, rows);
  const sec = createSection(
    "계획 이행",
    snap.isSingleDay
      ? "예상 일정 · 계획 습관 · 실제 이행"
      : `예상 일정 · 계획 습관 · ${snap.totalDaysInPeriod}일`,
  );
  sec.classList.add("lp-tr2-plan-section");

  const summaryGrid = document.createElement("div");
  summaryGrid.className = "lp-tr2-card-grid lp-tr2-plan-summary-grid";
  summaryGrid.appendChild(
    createStatCard(
      "계획한 날",
      snap.totalDaysInPeriod > 0
        ? `${snap.plannedDaysCount}/${snap.totalDaysInPeriod}일`
        : "—",
      snap.isSingleDay ? "이 날 기준" : "조회 기간",
    ),
  );
  summaryGrid.appendChild(
    createStatCard(
      "계획 빈도",
      snap.totalDaysInPeriod > 0
        ? `${Math.round(snap.planningHabitPct)}%`
        : "—",
      "예상 일정이 있는 날 비율",
    ),
  );
  summaryGrid.appendChild(
    createStatCard(
      "계획 이행률",
      snap.hasPlanData ? formatPctRounded(snap.adherencePct) : "—",
      snap.hasPlanData && snap.oneLiner ? snap.oneLiner : "예상 일정 대비 실행",
    ),
  );
  sec.appendChild(summaryGrid);

  if (snap.planningHabitLine) {
    const habitLine = document.createElement("p");
    habitLine.className = "lp-tr2-plan-est-text";
    habitLine.textContent = snap.planningHabitLine;
    sec.appendChild(habitLine);
  }

  if (!snap.hasPlanData) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "이 기간에 실행할 예상 일정(과제·시간)이 없어 이행률은 아직 계산되지 않습니다. 캘린더에서 타임박스를 넣어 보세요.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  sec.appendChild(
    renderPlanCompareChart(buildPlanCompareChartItems(snap.categories)),
  );

  if (snap.leak.minutes > 0) {
    const leakBlock = createRatingBlock("시간 누수", "계획에 없던 활동");
    const leakMain = document.createElement("p");
    leakMain.className = "lp-tr2-plan-leak-main";
    leakMain.textContent = `계획 밖 ${formatIntegerMinutesDurationKo(snap.leak.minutes)} · 전체의 ${snap.leak.pct}%`;
    leakBlock.appendChild(leakMain);
    if (snap.leak.items.length) {
      const leakLine = document.createElement("p");
      leakLine.className = "lp-tr2-plan-leak-items";
      leakLine.textContent = snap.leak.items
        .map((x) => `${x.taskName} ${minutesToHhMmShort(x.minutes)}`)
        .join(" · ");
      leakBlock.appendChild(leakLine);
    }
    sec.appendChild(leakBlock);
  }

  if (snap.estimation) {
    const estBlock = createRatingBlock("추정 정확도", "계획 시간 vs 실제");
    const estP = document.createElement("p");
    estP.className = "lp-tr2-plan-est-text";
    estP.textContent = snap.estimation.message;
    estBlock.appendChild(estP);
    sec.appendChild(estBlock);
  }

  if (snap.categoryRank) {
    const rankBlock = createRatingBlock("카테고리 이행", "가장 잘·못 지킨 항목");
    const rankLine = document.createElement("p");
    rankLine.className = "lp-tr2-plan-rank-line";
    rankLine.textContent = `잘함 ${snap.categoryRank.best.label} ${snap.categoryRank.best.pct}% · 미달 ${snap.categoryRank.worst.label} ${snap.categoryRank.worst.pct}%`;
    rankBlock.appendChild(rankLine);
    sec.appendChild(rankBlock);
  }

  scrollWrap.appendChild(sec);
}

function createFocusRecipeTagRow(item) {
  const row = document.createElement("div");
  row.className = "lp-tr2-bar-row lp-tr2-bar-row--focus-recipe";
  const lab = document.createElement("span");
  lab.className = "lp-tr2-bar-label";
  lab.textContent = item.label;
  const track = document.createElement("div");
  track.className = "lp-tr2-bar-track";
  const fill = document.createElement("div");
  fill.className = "lp-tr2-bar-fill";
  const pct = Math.min(100, Math.max(0, Number(item.pct) || 0));
  fill.style.width = `${pct}%`;
  fill.style.background = "#000000";
  const val = document.createElement("span");
  val.className = "lp-tr2-bar-value";
  val.textContent = `${item.pct}%`;
  track.appendChild(fill);
  row.append(lab, track, val);
  return row;
}

function createFocusSubheading(title, subtitle) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-focus-subblock";
  const h = document.createElement("h4");
  h.className = "lp-tr2-focus-subblock-title";
  h.textContent = title;
  wrap.appendChild(h);
  if (subtitle) {
    const p = document.createElement("p");
    p.className = "lp-tr2-focus-subblock-sub";
    p.textContent = subtitle;
    wrap.appendChild(p);
  }
  return wrap;
}

function createFocusDisruptorBarRow(label, barPct, meta, color) {
  const row = document.createElement("div");
  row.className = "lp-tr2-bar-row lp-tr2-bar-row--focus-disruptor";
  const lab = document.createElement("span");
  lab.className = "lp-tr2-bar-label";
  lab.textContent = label;
  const track = document.createElement("div");
  track.className = "lp-tr2-bar-track";
  const fill = document.createElement("div");
  fill.className = "lp-tr2-bar-fill";
  const pct = Math.min(100, Math.max(0, Number(barPct) || 0));
  fill.style.width = `${pct}%`;
  fill.style.background = color || "#8B5C3A";
  const val = document.createElement("span");
  val.className = "lp-tr2-bar-value";
  val.textContent = meta;
  track.appendChild(fill);
  row.append(lab, track, val);
  return row;
}

function mountFocusDisruptorAnalysisBlock(sec, analysis) {
  if (!analysis?.show) return;

  const analysisBlock = createRatingBlock(
    "방해 요소 분석",
    "생산적 과제할 때 피하면 좋은 요소",
  );

  const insight = document.createElement("p");
  insight.className = "lp-tr2-focus-disruptor-insight";
  insight.textContent = analysis.oneLiner;
  analysisBlock.appendChild(insight);

  if (analysis.ranking.length) {
    analysisBlock.appendChild(
      createFocusSubheading(
        "몰입을 깬 이유 빈도 순위",
        "1~2점 세션에서 고른 항목 · 많이 고른 순",
      ),
    );
    const maxCount = analysis.ranking[0]?.count || 1;
    const rankBars = document.createElement("div");
    rankBars.className = "lp-tr2-bars lp-tr2-bars--focus-disruptor";
    analysis.ranking.slice(0, 8).forEach((item, i) => {
      rankBars.appendChild(
        createFocusDisruptorBarRow(
          `${i + 1}. ${item.label}`,
          Math.round((item.count / maxCount) * 100),
          `${item.count}회 · ${item.pct}%`,
          "#8B5C3A",
        ),
      );
    });
    analysisBlock.appendChild(rankBars);
  }

  if (analysis.categories.length) {
    analysisBlock.appendChild(
      createFocusSubheading(
        "방해 요소 카테고리별 비율",
        "환경 · 신체 · 심리 · 디지털 · 작업 · 외부",
      ),
    );
    const catBars = document.createElement("div");
    catBars.className = "lp-tr2-bars lp-tr2-bars--focus-disruptor";
    analysis.categories.forEach((item) => {
      catBars.appendChild(
        createFocusDisruptorBarRow(
          item.label,
          item.pct,
          `${item.pct}% · ${item.count}회`,
          flowDisruptorCategoryColor(item.id),
        ),
      );
    });
    analysisBlock.appendChild(catBars);
  }

  if (!analysis.ranking.length && analysis.sessionCount > 0) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = `1~2점 세션 ${analysis.sessionCount}건 — 기록할 때 몰입 방해요소를 고르면 순위가 채워집니다.`;
    analysisBlock.appendChild(note);
  }

  sec.appendChild(analysisBlock);
}

function mountFocusReportSection(scrollWrap, _range, rows) {
  const snap = buildFocusReportSnapshot(rows);
  const sec = createSection(
    "초집중 분석",
    "생산적 작업 별점·몰입 요소·방해 요소로 나만의 패턴을 봅니다",
  );
  sec.classList.add("lp-tr2-focus-section");

  if (!snap) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "이 기간에 별점을 매긴 생산적 작업 기록이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "lp-tr2-plan-hero lp-tr2-focus-hero";
  const heroLab = document.createElement("span");
  heroLab.className = "lp-tr2-plan-hero-label";
  heroLab.textContent = "나의 초집중 레시피";
  const heroVal = document.createElement("strong");
  heroVal.className = "lp-tr2-plan-hero-value lp-tr2-focus-hero-value";
  heroVal.textContent =
    snap.highFocusSessionCount > 0
      ? `${snap.highFocusSessionCount}건`
      : "—";
  const heroLine = document.createElement("p");
  heroLine.className = "lp-tr2-plan-hero-line";
  heroLine.textContent = snap.recipeOneLiner;
  hero.append(heroLab, heroVal, heroLine);
  sec.appendChild(hero);

  if (snap.recipeTags.length) {
    const recipeBlock = createRatingBlock(
      "4~5점 세션 조건 순위",
      "몰입 요소가 함께 있던 비율",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars";
    snap.recipeTags.slice(0, 6).forEach((item) => {
      bars.appendChild(createFocusRecipeTagRow(item));
    });
    recipeBlock.appendChild(bars);
    sec.appendChild(recipeBlock);
  }

  if (snap.hourGrid.some((h) => h.count > 0)) {
    const hourBlock = createRatingBlock(
      "시간대별 집중",
      "시작 시각 기준 평균 별점 · 주황=피크",
    );
    hourBlock.appendChild(
      render24HourRatingChart(snap.hourGrid, snap.peakHours),
    );
    if (snap.peakHourLine) {
      const peakNote = document.createElement("p");
      peakNote.className = "lp-tr2-rating-peak-note";
      peakNote.textContent = snap.peakHourLine;
      hourBlock.appendChild(peakNote);
    }
    sec.appendChild(hourBlock);
  }

  const durGrid = document.createElement("div");
  durGrid.className = "lp-tr2-card-grid";
  durGrid.appendChild(
    createStatCard(
      "평균 집중 시간",
      formatIntegerMinutesDurationKo(Math.round(snap.duration.avgMins)),
      `${snap.duration.count}건`,
    ),
  );
  if (snap.duration.avgHighFocusMins != null) {
    durGrid.appendChild(
      createStatCard(
        "4~5점 세션 평균",
        formatIntegerMinutesDurationKo(
          Math.round(snap.duration.avgHighFocusMins),
        ),
        `${snap.duration.highFocusSessionCount}건`,
      ),
    );
  }
  durGrid.appendChild(
    createStatCard(
      "최장 세션",
      formatIntegerMinutesDurationKo(snap.duration.maxMins),
      "",
    ),
  );
  const durBlock = createRatingBlock("집중 지속 시간", "시작~종료 기록 기준");
  durBlock.appendChild(durGrid);
  sec.appendChild(durBlock);

  if (snap.tasks.length) {
    const taskBlock = createRatingBlock(
      "과제별 집중도",
      "생산적 작업 평균 별점",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars";
    snap.tasks.forEach((t) => {
      bars.appendChild(
        createRatingBarRow(
          t.name,
          t.avg,
          `${t.count}회 · ${formatIntegerMinutesDurationKo(t.minutes)}`,
        ),
      );
    });
    taskBlock.appendChild(bars);
    sec.appendChild(taskBlock);
  }

  mountFocusDisruptorAnalysisBlock(sec, snap.disruptorAnalysis);

  scrollWrap.appendChild(sec);
}

function mountHeroSection(scrollWrap, range) {
  const hero = getTimeReportHeroSnapshotForDateRange(range.start, range.end);
  const sec = createSection("한 장 요약", formatRangeLabel(range.start, range.end));
  const grid = document.createElement("div");
  grid.className = "lp-tr2-card-grid";
  grid.appendChild(
    createStatCard(
      "가용 시간",
      formatIntegerMinutesDurationKo(hero.availableMinutes),
      hero.daysWithData > 1 ? `${hero.daysWithData}일 기준 평균` : "",
    ),
  );
  grid.appendChild(
    createStatCard(
      "생산(투자)",
      formatIntegerMinutesDurationKo(hero.productiveMinutes),
      hero.focusLabel ? `${hero.focusLabel} ${hero.focusPct}%` : "",
    ),
  );
  grid.appendChild(
    createStatCard(
      "비생산(소비)",
      formatIntegerMinutesDurationKo(hero.wasteMinutes),
      "",
    ),
  );
  grid.appendChild(
    createStatCard(
      "시간의 가격(순가치)",
      formatNetWon(hero.netWon),
      `집중 점수 ${hero.score}`,
    ),
  );
  sec.appendChild(grid);
  scrollWrap.appendChild(sec);
}

function mountSleepSection(scrollWrap, range, rows) {
  const snap = buildSleepReportSnapshot(rows, range);
  const sec = createSection(
    "수면 기록",
    "취침·기상·품질 패턴 · 막대=수면 시간 · 점선=7시간 목표",
  );

  if (!snap.daysWithSleep.length) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = "이 기간에 수면 기록이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  sec.appendChild(buildSleepStatsGrid(snap));

  const chartWrap = document.createElement("div");
  chartWrap.className = "lp-tr2-sleep-chart-wrap";
  const canvas = document.createElement("div");
  canvas.className = "lp-tr2-sleep-chart-canvas";
  const { scroll } =
    renderSleepGoalBarChart(canvas, snap.sleepByDay) || {};
  if (scroll) {
    canvas.classList.add("lp-tr2-sleep-chart-canvas--scroll");
    bindHorizontalChartScroll(canvas);
  }
  chartWrap.appendChild(canvas);
  chartWrap.appendChild(buildSleepChartLegend());
  if (scroll) {
    const scrollHint = document.createElement("p");
    scrollHint.className = "lp-tr2-sleep-chart-scroll-hint";
    scrollHint.textContent = "← 좌우로 밀어 전체 날짜를 볼 수 있어요";
    chartWrap.appendChild(scrollHint);
  }
  sec.appendChild(chartWrap);

  const trendModeLabel =
    snap.trendMode === "daily"
      ? "일별"
      : snap.trendMode === "weekly"
        ? "주간"
        : "월간";
  const trendBlock = createRatingBlock(
    `수면 품질 추세 (${trendModeLabel})`,
    "수면 평가 별점 · 선으로 이어진 추세",
  );
  const trendChart = renderSleepQualityTrendChart(
    snap.trendPoints,
    snap.trendMode,
  );
  trendChart
    .querySelectorAll(".lp-tr2-sleep-quality-trend-canvas--scroll")
    .forEach((node) => bindHorizontalChartScroll(node));
  trendBlock.appendChild(trendChart);
  sec.appendChild(trendBlock);

  if (snap.correlations?.length) {
    const corrBlock = createRatingBlock(
      "품질 상관 분석",
      "일찍 잔 날 · 수면 길이 · 기상 시각대별 평균 품질",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars";
    snap.correlations.forEach((item) => {
      bars.appendChild(
        createRatingBarRow(item.label, item.avg, item.meta),
      );
    });
    corrBlock.appendChild(bars);
    sec.appendChild(corrBlock);
  }

  scrollWrap.appendChild(sec);
}

function mountIntakeSection(scrollWrap, range, rows) {
  const { healthy, unhealthy } = collectIntakeLogs(rows);
  const dayCount = listDatesInclusive(range.start, range.end).length;
  const totalEntries = healthy.length + unhealthy.length;
  const sec = createSection(
    "섭취 기록",
    dayCount > 1
      ? "날짜별 한 줄 요약 · 길면 패널 안에서 스크롤"
      : "무엇을 먹었는지(식단 메모)",
  );
  const counts = document.createElement("p");
  counts.className = "lp-tr2-intake-counts";
  counts.textContent = `건강 ${healthy.length}건 · 비건강 ${unhealthy.length}건 · ${new Set([...healthy, ...unhealthy].map((e) => e.date)).size}일`;

  const panels = document.createElement("div");
  panels.className = "lp-tr2-intake-panels";
  if (dayCount >= 7 || totalEntries > 8) {
    panels.classList.add("lp-tr2-intake-panels--scroll");
  }

  const makePanel = (title, count, entries, emptyText, tone) => {
    const panel = document.createElement("div");
    panel.className = "lp-tr2-intake-panel";
    const head = document.createElement("div");
    head.className = "lp-tr2-intake-panel-head";
    const headTitle = document.createElement("span");
    headTitle.textContent = title;
    const headCount = document.createElement("span");
    headCount.className = "lp-tr2-intake-panel-count";
    headCount.textContent = `${count}건`;
    head.appendChild(headTitle);
    head.appendChild(headCount);
    const body = document.createElement("div");
    body.className = "lp-tr2-intake-panel-body";
    body.appendChild(buildCompactIntakeFeed(entries, emptyText, tone));
    panel.appendChild(head);
    panel.appendChild(body);
    return panel;
  };

  panels.appendChild(
    makePanel(
      "건강한 섭취",
      healthy.length,
      healthy,
      "기록 없음",
      "healthy",
    ),
  );
  panels.appendChild(
    makePanel(
      "건강하지 않은 섭취",
      unhealthy.length,
      unhealthy,
      "기록 없음",
      "unhealthy",
    ),
  );

  sec.appendChild(counts);
  sec.appendChild(panels);
  scrollWrap.appendChild(sec);
}

const FIELD_TIME_SCORE_KEYS = [
  { key: "sideincome", label: "시급상승 점수" },
  { key: "health", label: "건강 점수" },
  { key: "happiness", label: "행복 점수" },
];

function hoursForFieldScoreKey(segments, key) {
  return (segments || [])
    .filter((s) => s.key === key)
    .reduce((sum, s) => sum + (Number(s.hours) || 0), 0);
}

function fieldTimeScoresFromDonutSnap(snap) {
  const totalHours = Number(snap?.totalHours) || 0;
  const segments = snap?.segments || [];
  const rows = FIELD_TIME_SCORE_KEYS.map(({ key, label }) => {
    const hours = hoursForFieldScoreKey(segments, key);
    const pct = totalHours > 0 ? (hours / totalHours) * 100 : 0;
    return { key, label, hours, pct };
  });
  const focusTotalHours = rows.reduce((sum, r) => sum + r.hours, 0);
  if (focusTotalHours <= 0) {
    return rows.map((row) => ({ ...row, score: 0 }));
  }
  const weighted = rows.map((row) => ({
    ...row,
    scoreRaw: (row.hours / focusTotalHours) * 100,
  }));
  const scores = weighted.map((row) => Math.round(row.scoreRaw));
  let remainder = 100 - scores.reduce((sum, n) => sum + n, 0);
  if (remainder !== 0) {
    const adjustIdx = weighted
      .map((row, i) => ({ i, frac: row.scoreRaw - Math.floor(row.scoreRaw) }))
      .sort((a, b) => b.frac - a.frac)[0].i;
    scores[adjustIdx] += remainder;
  }
  return weighted.map((row, i) => ({
    key: row.key,
    label: row.label,
    hours: row.hours,
    pct: row.pct,
    score: scores[i],
  }));
}

function mountFieldTimeScoresRow(parent, snap) {
  const row = document.createElement("div");
  row.className = "lp-tr2-field-scores";
  fieldTimeScoresFromDonutSnap(snap).forEach(({ label, hours, pct, score }) => {
    const mins = Math.round(hours * 60);
    const hint =
      mins > 0
        ? `${formatIntegerMinutesDurationKo(mins)} · ${formatPctRounded(pct)}`
        : "기록 없음";
    row.appendChild(createStatCard(label, `${score}점`, hint));
  });
  parent.appendChild(row);
}

function radarGridStep(scaleMax) {
  if (scaleMax <= 120) return 30;
  if (scaleMax <= 300) return 60;
  return Math.max(60, Math.round(scaleMax / 5 / 60) * 60);
}

function buildCategoryTimeRadarFromDonutSnap(snap) {
  /** @type {Map<string, { hours: number, label?: string }>} */
  const byKey = new Map();
  for (const s of snap.segments || []) {
    const k = s.key === "dream" ? "sideincome" : s.key;
    const prev = byKey.get(k);
    const hours = (prev?.hours || 0) + (Number(s.hours) || 0);
    byKey.set(k, { hours, label: s.label });
  }

  const axes = CATEGORY_RADAR_AXES.map(({ key, label, tone }) => {
    const seg = byKey.get(key);
    return {
      key,
      label,
      minutes: seg ? Math.round(seg.hours * 60) : 0,
      tone,
    };
  });

  const rawMax = Math.max(0, ...axes.map((a) => a.minutes));
  const step = radarGridStep(Math.max(rawMax, 30));
  const scaleMax =
    rawMax > 0 ? Math.max(step, Math.ceil(rawMax / step) * step) : 60;

  return {
    axes,
    scaleMax,
    hasData: axes.some((a) => a.minutes > 0),
  };
}

function radarSeriesPoints(axes, scaleMax, cx, cy, R) {
  const n = axes.length;
  return axes.map((a, i) => {
    const r = scaleMax > 0 ? (Math.max(0, a.minutes) / scaleMax) * R : 0;
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  });
}

function closedPointsAttr(points) {
  if (!points.length) return "";
  const flat = points.map((p) => p.join(","));
  return `${flat.join(" ")} ${points[0].join(",")}`;
}

function appendRadarAxisLabel(svg, axis, i, n, cx, cy, labelR) {
  const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const lx = cx + labelR * Math.cos(ang);
  const ly = cy + labelR * Math.sin(ang);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const hasValue = axis.minutes > 0;

  let anchor = "middle";
  if (cos > 0.22) anchor = "start";
  else if (cos < -0.22) anchor = "end";

  let dy = 0;
  if (sin < -0.28) dy = -3;
  else if (sin > 0.28) dy = 4;

  const t = svgEl("text", {
    x: lx,
    y: ly + dy,
    fill: hasValue
      ? axis.tone === "prod"
        ? "#a87070"
        : "#6d8aad"
      : "#b8c5d4",
    "font-size": 10,
    "font-weight": 700,
    "text-anchor": anchor,
    "dominant-baseline": "middle",
  });
  t.textContent = axis.label;
  svg.appendChild(t);
}

function renderCategoryTimeRadarChart(radarSnap) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-balance-radar";

  const W = 380;
  const H = 360;
  const cx = 190;
  const cy = 178;
  const R = 98;
  const labelR = R + 36;
  const axes = radarSnap.axes || [];
  const n = axes.length;
  if (n === 0) return wrap;

  const scaleMax = Math.max(30, Number(radarSnap.scaleMax) || 60);
  const gridStep = radarGridStep(scaleMax);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.classList.add("lp-tr2-balance-radar-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "카테고리별 기록 시간");

  for (let val = gridStep; val <= scaleMax; val += gridStep) {
    const r = (val / scaleMax) * R;
    const ringPts = [];
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      ringPts.push(`${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`);
    }
    svg.appendChild(
      svgEl("polygon", {
        points: ringPts.join(" "),
        fill: "none",
        stroke: "#e8edf3",
        "stroke-width": 1,
      }),
    );
  }

  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    svg.appendChild(
      svgEl("line", {
        x1: cx,
        y1: cy,
        x2: cx + R * Math.cos(ang),
        y2: cy + R * Math.sin(ang),
        stroke: "#e8edf3",
        "stroke-width": 1,
      }),
    );
  }

  const pts = radarSeriesPoints(axes, scaleMax, cx, cy, R);
  const hasAnyValue = axes.some((a) => a.minutes > 0);
  if (hasAnyValue) {
    svg.appendChild(
      svgEl("polygon", {
        points: closedPointsAttr(pts),
        fill: "rgba(126, 159, 195, 0.12)",
        stroke: "#64748b",
        "stroke-width": 2,
        "stroke-linejoin": "round",
      }),
    );
  }
  pts.forEach(([x, y], i) => {
    const axis = axes[i];
    if (!axis || axis.minutes <= 0) return;
    const fill = axis.tone === "prod" ? "#C98484" : "#7E9FC3";
    const dot = svgEl("circle", { cx: x, cy: y, r: 4, fill });
    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = `${axis.label} · ${formatIntegerMinutesDurationKo(axis.minutes)}`;
    dot.appendChild(titleEl);
    svg.appendChild(dot);
  });

  axes.forEach((a, i) => {
    appendRadarAxisLabel(svg, a, i, n, cx, cy, labelR);
  });

  wrap.appendChild(svg);
  wrap.appendChild(
    createRatingChartLegend([
      { swatch: "#C98484", label: "생산" },
      { swatch: "#7E9FC3", label: "비생산" },
    ]),
  );
  return wrap;
}

function mountDonutSection(scrollWrap, range) {
  const snap = getTimeReportDonutSnapshotForDateRange(range.start, range.end);
  const radarSnap = buildCategoryTimeRadarFromDonutSnap(snap);
  const sec = createSection(
    "생산 · 비생산 시간",
    "수면·근무 제외 · 카테고리별 기록 시간",
  );
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-donut-wrap";

  const hasProdNonProd = snap.totalHours > 0;

  if (!hasProdNonProd) {
    wrap.appendChild(renderCategoryTimeRadarChart(radarSnap));
    const empty = document.createElement("p");
    empty.className = "lp-tr2-donut-legend-empty";
    empty.textContent = "집계할 생산·비생산 기록이 없습니다.";
    wrap.appendChild(empty);
    mountFieldTimeScoresRow(wrap, snap);
    sec.appendChild(wrap);
    scrollWrap.appendChild(sec);
    return;
  }

  if (hasProdNonProd) {
    const { prod, nonProd } = orderDonutSegments(snap.segments);
    const prodHours = prod.reduce((a, s) => a + s.hours, 0);
    const nonProdHours = nonProd.reduce((a, s) => a + s.hours, 0);
    const prodPct = (prodHours / snap.totalHours) * 100;
    const nonProdPct = (nonProdHours / snap.totalHours) * 100;

    const split = document.createElement("div");
    split.className = "lp-tr2-donut-split";
    const prodChip = document.createElement("div");
    prodChip.className = "lp-tr2-donut-split-chip lp-tr2-donut-split-chip--prod";
    prodChip.innerHTML = `<span class="lp-tr2-donut-split-label">생산</span><strong>${formatIntegerMinutesDurationKo(Math.round(prodHours * 60))}</strong><span class="lp-tr2-donut-split-pct">${formatPctRounded(prodPct)}</span>`;
    const nonProdChip = document.createElement("div");
    nonProdChip.className =
      "lp-tr2-donut-split-chip lp-tr2-donut-split-chip--nonprod";
    nonProdChip.innerHTML = `<span class="lp-tr2-donut-split-label">비생산</span><strong>${formatIntegerMinutesDurationKo(Math.round(nonProdHours * 60))}</strong><span class="lp-tr2-donut-split-pct">${formatPctRounded(nonProdPct)}</span>`;
    split.appendChild(prodChip);
    split.appendChild(nonProdChip);
    wrap.appendChild(split);
    wrap.appendChild(renderCategoryTimeRadarChart(radarSnap));
  }

  mountFieldTimeScoresRow(wrap, snap);
  sec.appendChild(wrap);
  scrollWrap.appendChild(sec);
}

/**
 * @param {HTMLElement} scrollWrap
 * @param {{ rangeStart: string, rangeEnd: string } | string} arg2
 * @param {"day"|"month"} [arg3] — Diary 호환
 */
export function mountUnifiedTimeReport(scrollWrap, arg2, arg3) {
  if (!scrollWrap) return;
  const range = resolveMountRange(arg2, arg3);
  const rows = rowsInRange(range.start, range.end);

  scrollWrap.replaceChildren();
  scrollWrap.classList.remove("lp-time-report-body--empty");
  scrollWrap.classList.add("lp-tr2-root");

  mountHeroSection(scrollWrap, range);
  mountDonutSection(scrollWrap, range);
  mountSleepSection(scrollWrap, range, rows);
  mountIntakeSection(scrollWrap, range, rows);
  mountEmotionSection(scrollWrap, range, rows);
  mountMoveSection(scrollWrap, range, rows);
  mountHappinessRoutineSection(scrollWrap, range);
  mountMediaSection(scrollWrap, range, rows);
  mountTimeRatingReportSection(scrollWrap, range, rows);
  mountFocusReportSection(scrollWrap, range, rows);
  mountPlanAdherenceSection(scrollWrap, range, rows);
}
