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
import {
  renderEmotionCategoryDonut,
  renderEmotionSubEmotionBars,
  renderEmotionTriggerList,
  renderEmotionTimeHeatmap,
} from "./timeEmotionReportCharts.js";
import { getEmotionCategoryChartColor } from "./timeEmotionTaxonomy.js";
import { buildMoveReportSnapshot } from "./timeMoveReport.js";
import { buildHappinessRoutineReportSnapshot } from "./timeHappinessRoutineReport.js";
import { buildPlanAdherenceReportSnapshot } from "./timePlanAdherenceReport.js";
import { buildFocusReportSnapshot } from "./timeFocusReport.js";
import { buildMealTasteReportSnapshot } from "./timeMealTasteReport.js";
import { flowDisruptorCategoryColor } from "./timeTaskFlowDisruptors.js";
import { getTaskOptionByName } from "./timeTaskOptionsModel.js";
import { readUserHourlyRateLocal } from "./userHourlySync.js";
import { tr2SvgFontSize } from "./timeReportUiScale.js";

const SLEEP_TARGET_MIN = 7 * 60;
const CHART_COLORS = {
  sleep: "#818cf8",
  healthy: "#c02b2b",
  unhealthy: "#1d4ed8",
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
  { key: "moneylosing", label: "시급 저하", tone: "nonprod" },
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

function createStatCard(label, value, hint, valueTone = "") {
  const card = document.createElement("article");
  card.className = "lp-tr2-stat-card";
  const lab = document.createElement("span");
  lab.className = "lp-tr2-stat-label";
  lab.textContent = label;
  const val = document.createElement("strong");
  val.className = "lp-tr2-stat-value";
  if (valueTone === "pos" || valueTone === "neg") {
    val.classList.add(`lp-tr2-stat-value--${valueTone}`);
  }
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

/** 수면 평가 1~5 — ★ 시각화 (반올림 채움) */
function createSleepRatingStarsEl(rating, { showScore = false } = {}) {
  const n = Number(rating);
  const wrap = document.createElement("span");
  wrap.className = "lp-tr2-sleep-rating-stars";
  if (!Number.isFinite(n) || n <= 0) {
    wrap.textContent = "—";
    return wrap;
  }
  const filled = Math.max(0, Math.min(5, Math.round(n)));
  wrap.setAttribute("aria-label", `${formatRatingAvg(n)}점 / 5점`);
  const stars = document.createElement("span");
  stars.className = "lp-tr2-sleep-rating-stars-row";
  stars.setAttribute("aria-hidden", "true");
  for (let i = 1; i <= 5; i += 1) {
    const s = document.createElement("span");
    s.className = i <= filled ? "is-on" : "is-off";
    s.textContent = "★";
    stars.appendChild(s);
  }
  wrap.appendChild(stars);
  if (showScore) {
    const score = document.createElement("span");
    score.className = "lp-tr2-sleep-rating-stars-score";
    score.textContent = formatRatingAvg(n);
    wrap.appendChild(score);
  }
  return wrap;
}

/** 배율(×1=0%) → 집중도 % — 5점 +100%, 4점 +50%, 3점 0%, 2점 −25%, 1점 −50% */
function returnMultToPercent(mult) {
  const n = Number(mult);
  if (!Number.isFinite(n)) return null;
  return Math.round((n - 1) * 100);
}

/** 집중도 표기 — +68%, 0%, −25% */
function formatReturnPercentAvg(mult) {
  const pct = returnMultToPercent(mult);
  if (pct == null) return "—";
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return "0%";
}

/** 막대 높이·너비 — −50%~+100% 구간을 0~100% 시각 길이로 */
function returnMultBarHeightPct(mult, minVisible = 14) {
  const pct = returnMultToPercent(mult);
  if (pct == null) return 0;
  const h = ((pct + 50) / 150) * 100;
  return Math.max(minVisible, Math.min(100, h));
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
  const pct = returnMultBarHeightPct(avgMult, 0);
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
  val.textContent = formatReturnPercentAvg(avgMult);
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

function render24HourRatingChart(hourGrid, opts = {}) {
  const returnMode = opts.mode === "return";
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-rating-hour-chart";
  const cols = document.createElement("div");
  cols.className = "lp-tr2-rating-hour-chart-cols";
  cols.setAttribute("role", "img");
  cols.setAttribute(
    "aria-label",
    returnMode
      ? "0시부터 23시까지 시간대별 집중도"
      : "0시부터 23시까지 시간대별 만족도",
  );

  hourGrid.forEach((h) => {
    const cell = document.createElement("div");
    cell.className = "lp-tr2-rating-hour-cell";
    const hasData = h.count > 0 && (returnMode ? h.avgMult != null : h.avg != null);
    const bar = document.createElement("div");
    bar.className = "lp-tr2-rating-hour-bar";
    if (hasData) {
      const pct = returnMode
        ? returnMultBarHeightPct(h.avgMult)
        : Math.max(14, ((h.avg ?? 0) / 5) * 100);
      bar.style.height = `${pct}%`;
      const fillColor = returnMode
        ? returnMultFillColor(h.avgMult)
        : ratingFillColor(h.avg);
      bar.style.background = fillColor;
      bar.style.backgroundColor = fillColor;
      cell.title = returnMode
        ? `${formatHourLabel(h.hour)} · ${formatReturnPercentAvg(h.avgMult)} · ${h.count}건 · ${formatIntegerMinutesDurationKo(h.minutes)}`
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
            { swatch: RATING_REPORT_COLOR, label: "집중 높음" },
            { swatch: RATING_REPORT_COLOR_MID, label: "보통" },
            { swatch: RATING_REPORT_COLOR_LOW, label: "집중 낮음" },
            { swatch: RATING_REPORT_COLOR_EMPTY, label: "기록 없음" },
          ]
        : [
            { swatch: RATING_REPORT_COLOR, label: "만족 높음" },
            { swatch: RATING_REPORT_COLOR_MID, label: "보통" },
            { swatch: RATING_REPORT_COLOR_EMPTY, label: "기록 없음" },
          ],
    ),
  );
  return wrap;
}

function renderWeekdayReturnChart(weekdayGrid) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-rating-weekday-chart";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "요일별 집중도");

  weekdayGrid.forEach((w) => {
    const col = document.createElement("div");
    col.className = "lp-tr2-rating-weekday-col";
    const hasData = w.count > 0 && w.avgMult != null;
    const score = document.createElement("span");
    score.className = "lp-tr2-rating-weekday-score";
    if (hasData) {
      score.textContent = formatReturnPercentAvg(w.avgMult);
    } else {
      score.textContent = "\u00a0";
      score.setAttribute("aria-hidden", "true");
    }
    const barWrap = document.createElement("div");
    barWrap.className = "lp-tr2-rating-weekday-bar-wrap";
    const bar = document.createElement("div");
    bar.className = "lp-tr2-rating-weekday-bar";
    if (hasData) {
      const pct = returnMultBarHeightPct(w.avgMult);
      bar.style.height = `${pct}%`;
      const fillColor = returnMultFillColor(w.avgMult);
      bar.style.background = fillColor;
      bar.style.backgroundColor = fillColor;
      col.title = `${w.label}요일 · ${formatReturnPercentAvg(w.avgMult)} · ${w.count}건`;
      const tier = returnMultTier(w.avgMult);
      if (tier === "high") col.classList.add("lp-tr2-rating-weekday-col--high");
      else if (tier === "mid") col.classList.add("lp-tr2-rating-weekday-col--mid");
    } else {
      bar.classList.add("is-empty");
    }
    barWrap.appendChild(bar);
    const lab = document.createElement("span");
    lab.className = "lp-tr2-rating-weekday-label";
    lab.textContent = w.label;
    col.appendChild(score);
    col.appendChild(barWrap);
    col.appendChild(lab);
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
    const score = document.createElement("span");
    score.className = "lp-tr2-rating-weekday-score";
    if (hasData) {
      score.textContent = `${formatRatingAvg(w.avg)}`;
    } else {
      score.textContent = "\u00a0";
      score.setAttribute("aria-hidden", "true");
    }
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
    const lab = document.createElement("span");
    lab.className = "lp-tr2-rating-weekday-label";
    lab.textContent = w.label;
    col.appendChild(score);
    col.appendChild(barWrap);
    col.appendChild(lab);
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
    weekdayScores,
    weekdayGrid,
    taskScores,
    topTasks,
    topRoiTasks,
    monthScores,
  };
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

/**
 * 가로 차트 스크롤 — 가로로 밀 때만 가로 스크롤을 잡고,
 * 세로로 밀면 부모(레포트) 스크롤이 그대로 이어지게 함
 */
function bindHorizontalChartScroll(el) {
  if (!(el instanceof HTMLElement)) return;
  let startX = 0;
  let startY = 0;
  /** @type {"x" | "y" | null} */
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
      if (e.touches.length !== 1 || el.scrollWidth <= el.clientWidth + 1) {
        return;
      }
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (axisLock == null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        /* 세로 의도가 분명하면 가로 잠금하지 않음 → 부모 스크롤 */
        if (Math.abs(dy) >= Math.abs(dx)) {
          axisLock = "y";
          return;
        }
        axisLock = "x";
      }
      if (axisLock === "y") return;
      if (axisLock === "x") {
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
  el.addEventListener(
    "touchcancel",
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
  /* 주간·2주: 스크롤 없이 카드 가로 100%에 맞춤. 긴 기간만 가로 스크롤 */
  const scroll = totalDays > 14;
  const minSlot = scroll
    ? totalDays <= 31
      ? 26
      : 20
    : totalDays <= 8
      ? 46
      : 38;
  const pad = { top: 16, right: 8, bottom: 22, left: 26 };
  const W = Math.max(320, pad.left + pad.right + totalDays * minSlot);
  const H = 148;
  return { W, H, pad, minSlot, scroll };
}

/** 수면 막대 차트 글자 — 업스케일 없이 작게(손글씨 폰트에서 과대 방지) */
function sleepChartSvgFont(base) {
  const n = Number(base);
  if (!Number.isFinite(n) || n <= 0) return 6;
  return Math.round(n * 10) / 10;
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
    /* meet: 비율 유지(글자 안 눌림). 가로는 CSS width:100% + height:auto 로 채움 */
    preserveAspectRatio: scroll ? "xMinYMid meet" : "xMidYMid meet",
    "aria-label": "날짜별 수면 시간 막대 그래프 · 7시간 목표",
  });
  if (scroll) {
    svg.style.minWidth = `${W}px`;
  } else {
    svg.removeAttribute("width");
    svg.removeAttribute("height");
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
      "font-size": sleepChartSvgFont(6.25),
      "font-weight": isTarget ? 600 : 400,
      "text-anchor": "end",
      class: "lp-tr2-sleep-chart-tick",
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
      "font-size": sleepChartSvgFont(6.25),
      "font-weight": 600,
      "text-anchor": "end",
      class: "lp-tr2-sleep-chart-tick",
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
        "font-size": sleepChartSvgFont(6.25),
        "text-anchor": "middle",
        class: "lp-tr2-sleep-chart-tick",
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
      fill: metGoal ? "#22c55e" : "#94a3b8",
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
        y: barTop - 3,
        fill: metGoal ? "#15803d" : "#64748b",
        "font-size": sleepChartSvgFont(6),
        "font-weight": 600,
        "text-anchor": "middle",
        class: "lp-tr2-sleep-chart-bar-label",
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
    { cls: "lp-tr2-sleep-chart-legend-met", text: "수면 시간(달성)" },
    { cls: "lp-tr2-sleep-chart-legend-miss", text: "수면 시간(미달)" },
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
 * 하루 수면 기록 해석 (기상일 기준)
 * - 기상: 당일 첫 기록 마감
 * - 취침: 전날 기록 중 마감이 23:59인 건의 시작 시각
 *   (낮잠을 수면하기로 적어도 2번째 기록으로 오인하지 않음)
 */
const DAY_END_MINUTES = 23 * 60 + 59; /* 23:59 */

/** 전날 밤 취침 시각(분) — 마감 23:59 구간의 시작 */
function prevNightBedtimeMin(prevDayRecs) {
  if (!prevDayRecs?.length) return null;
  const endingAtDayEnd = prevDayRecs.filter(
    (p) =>
      p?.endMin === DAY_END_MINUTES &&
      p?.startMin != null &&
      Number.isFinite(p.startMin),
  );
  if (!endingAtDayEnd.length) return null;
  /* 여러 개면 가장 늦게 시작한 것(실제 취침 구간) */
  let best = endingAtDayEnd[0];
  for (let i = 1; i < endingAtDayEnd.length; i += 1) {
    if (endingAtDayEnd[i].startMin > best.startMin) best = endingAtDayEnd[i];
  }
  return best.startMin;
}

/**
 * 취침→기상 수면 분. 자정을 넘기면(기상 ≤ 취침) 24h를 더해 계산.
 * @returns {number|null}
 */
function overnightSleepMinutes(bedtimeMin, wakeMin) {
  if (
    bedtimeMin == null ||
    wakeMin == null ||
    !Number.isFinite(bedtimeMin) ||
    !Number.isFinite(wakeMin)
  ) {
    return null;
  }
  const bed = Math.round(bedtimeMin);
  const wake = Math.round(wakeMin);
  if (wake <= bed) return wake + 24 * 60 - bed;
  return wake - bed;
}

function resolveSleepWakeBedForDay(dayRecs, prevDayRecs) {
  if (!dayRecs?.length) {
    return { wakeMin: null, bedtimeMin: null };
  }
  const wakeMin = dayRecs[0].endMin;
  /* 1) 전날 마감 23:59 수면의 시작 = 취침 */
  let bedtimeMin = prevNightBedtimeMin(prevDayRecs);
  if (bedtimeMin == null) {
    const first = dayRecs[0];
    if (
      first.startMin != null &&
      first.endMin != null &&
      first.endMin <= first.startMin
    ) {
      /* 한 건에 저녁 시작~아침 마감이 같이 있는 경우 */
      bedtimeMin = first.startMin;
    }
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

  const sleepByDay = dates.map((date) => {
    const dayRecs = recordsByDate.get(date) || [];
    const prevDayRecs = recordsByDate.get(addDaysYmd(date, -1)) || [];
    const { wakeMin, bedtimeMin } = resolveSleepWakeBedForDay(
      dayRecs,
      prevDayRecs,
    );
    const trackedSum = dayRecs.reduce((sum, rec) => sum + rec.minutes, 0);
    const span = overnightSleepMinutes(bedtimeMin, wakeMin);
    /* 수면 시간 = 전날 밤 취침 ~ 기상 (기록 분 합이 아님 — 00시 잘림 방지) */
    const minutes =
      span != null && span > 0 ? span : trackedSum;
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
  const correlations = buildSleepQualityCorrelations(daysWithSleep);
  const bestSleepEstimate = estimateBestRatedSleepMinutes(daysWithSleep);

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
    bestSleepEstimate,
    correlations,
    avgDurationMinutes: daysWithSleep.length
      ? Math.round(total / daysWithSleep.length)
      : 0,
    metDays,
  };
}

/**
 * 평가(별점)가 높았던 날의 수면 길이 평균 → 추천 수면 시간 추산
 * @returns {{ minutes: number, rating: number, sampleDays: number }|null}
 */
function estimateBestRatedSleepMinutes(daysWithSleep) {
  const rated = (daysWithSleep || []).filter(
    (d) => d.rating != null && Number.isFinite(d.rating) && d.minutes > 0,
  );
  if (rated.length < 2) return null;
  const maxR = Math.max(...rated.map((d) => d.rating));
  let best = rated.filter((d) => d.rating >= maxR - 0.05);
  /* 최고점이 하루뿐이면 4점 이상 날로 넓혀 추산 */
  if (best.length < 2 && maxR >= 4) {
    best = rated.filter((d) => d.rating >= 4);
  }
  if (best.length < 1) return null;
  const minutes = Math.round(
    best.reduce((sum, d) => sum + d.minutes, 0) / best.length,
  );
  if (!(minutes > 0)) return null;
  return {
    minutes,
    rating: maxR,
    sampleDays: best.length,
  };
}

function buildSleepStatsGrid(snap, options = {}) {
  const { daysWithSleep } = snap;
  const grid = document.createElement("div");
  grid.className = "lp-tr2-sleep-stats";
  const mins = daysWithSleep.map((x) => x.minutes);
  const isSingleDay = snap.dayCount <= 1;
  const isWeekView = Boolean(options.weekView);
  const day = daysWithSleep[0];

  const addStat = (label, value, hint = "", valueTone = "") => {
    const cell = document.createElement("div");
    cell.className = "lp-tr2-sleep-stat";
    const lab = document.createElement("span");
    lab.className = "lp-tr2-sleep-stat-label";
    lab.textContent = label;
    const val = document.createElement("strong");
    val.className = "lp-tr2-sleep-stat-value";
    if (valueTone) val.classList.add(`lp-tr2-sleep-stat-value--${valueTone}`);
    if (value instanceof Node) {
      val.appendChild(value);
    } else {
      val.textContent = value;
    }
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
      day.rating != null ? createSleepRatingStarsEl(day.rating) : "—",
      "수면 평가 별점",
      "rating",
    );
    addStat("수면 시간", formatIntegerMinutesDurationKo(day.minutes));
    return grid;
  }

  /* 주간: 평균 수면 · 취침 · 평가 · 추천 수면 */
  if (isWeekView) {
    grid.classList.add("lp-tr2-sleep-stats--week");
    addStat(
      "평균 수면",
      formatIntegerMinutesDurationKo(snap.avgDurationMinutes),
      "",
      "duration",
    );
    addStat(
      "평균 취침 시작 시간",
      snap.avgBedtime != null ? formatClockFromMinutes(snap.avgBedtime) : "—",
      "",
      "bedtime",
    );
    addStat(
      "평균 평가",
      snap.avgQuality != null
        ? createSleepRatingStarsEl(snap.avgQuality, { showScore: true })
        : "—",
      "",
      "rating",
    );
    const best = snap.bestSleepEstimate;
    addStat(
      "추천 수면 시간",
      best ? formatIntegerMinutesDurationKo(best.minutes) : "—",
      "",
      "recommend",
    );
    return grid;
  }

  addStat(
    "평균 취침 시작 시간",
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
    snap.avgQuality != null
      ? createSleepRatingStarsEl(snap.avgQuality, { showScore: true })
      : "—",
    "수면 평가 별점",
    "rating",
  );
  addStat(
    "평균 수면",
    formatIntegerMinutesDurationKo(snap.avgDurationMinutes),
  );
  {
    const best = snap.bestSleepEstimate;
    addStat(
      "추천 수면 시간",
      best ? formatIntegerMinutesDurationKo(best.minutes) : "—",
      "",
      "recommend",
    );
  }
  if (daysWithSleep.length > 1) {
    addStat("최소", formatIntegerMinutesDurationKo(Math.min(...mins)));
    addStat("최대", formatIntegerMinutesDurationKo(Math.max(...mins)));
  }
  addStat("목표 달성", `${snap.metDays}/${daysWithSleep.length}일`);
  return grid;
}

/** 주간 레포트 — 요일별 취침·기상·수면·평가 (품질 상관 전 상세) */
function buildWeeklySleepDetailTable(sleepByDay) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-sleep-day-table-wrap";
  const table = document.createElement("table");
  table.className = "lp-tr2-sleep-day-table";
  table.setAttribute("aria-label", "요일별 수면 상세");

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["요일", "취침", "기상", "수면", "평가"].forEach((label) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  sleepByDay.forEach((d) => {
    if (!d.minutes && d.bedtimeMin == null && d.wakeMin == null) return;
    const ymd = normYmd(d.date);
    const [y, mo, day] = ymd.split("-").map(Number);
    const wd = Number.isFinite(y) ? new Date(y, mo - 1, day).getDay() : 0;

    const tr = document.createElement("tr");

    const tdDay = document.createElement("td");
    tdDay.textContent = weekdays[wd] || "—";
    tr.appendChild(tdDay);

    const tdBed = document.createElement("td");
    tdBed.textContent =
      d.bedtimeMin != null ? formatClockFromMinutes(d.bedtimeMin) : "—";
    tr.appendChild(tdBed);

    const tdWake = document.createElement("td");
    tdWake.textContent =
      d.wakeMin != null ? formatClockFromMinutes(d.wakeMin) : "—";
    tr.appendChild(tdWake);

    const tdSleep = document.createElement("td");
    tdSleep.textContent =
      d.minutes > 0 ? formatIntegerMinutesDurationKo(d.minutes) : "—";
    tr.appendChild(tdSleep);

    const tdRate = document.createElement("td");
    if (d.rating != null) {
      tdRate.textContent = `${"★".repeat(Math.round(d.rating))}${"☆".repeat(Math.max(0, 5 - Math.round(d.rating)))}`;
      tdRate.setAttribute("aria-label", `${formatRatingAvg(d.rating)}점`);
    } else {
      tdRate.textContent = "—";
    }
    tr.appendChild(tdRate);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
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
 * @param {Array<{date:string, main:string, sub:string, rating?:number|null}>} entries
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

/**
 * 식단 목록: 음식마다 한 줄 + 맛 평가
 * @param {"healthy"|"unhealthy"|"neutral"} tone
 * @param {{ showDate?: boolean }} [options]
 */
function buildDayIntakeRatedFeed(entries, emptyText, tone, options = {}) {
  const ul = document.createElement("ul");
  ul.className = "lp-tr2-intake-day-list lp-tr2-intake-day-list--rated";
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "lp-tr2-intake-day-empty";
    li.textContent = emptyText;
    ul.appendChild(li);
    return ul;
  }
  const showDate = Boolean(options.showDate);
  entries.forEach((item) => {
    const li = document.createElement("li");
    li.className = "lp-tr2-intake-meal-row";
    const body = document.createElement("div");
    body.className = "lp-tr2-intake-meal-body";
    const name = document.createElement("span");
    name.className =
      tone === "healthy" || tone === "unhealthy"
        ? `lp-tr2-intake-meal-name lp-tr2-intake-day-meals--${tone}`
        : "lp-tr2-intake-meal-name lp-tr2-intake-meal-name--neutral";
    name.textContent = item.main;
    body.appendChild(name);
    const subParts = [];
    if (showDate && item.date) {
      subParts.push(formatCompactReportDate(item.date) || item.date);
    }
    if (item.sub) subParts.push(item.sub);
    if (subParts.length) {
      const sub = document.createElement("span");
      sub.className = "lp-tr2-intake-meal-sub";
      sub.textContent = subParts.join(" · ");
      body.appendChild(sub);
    }
    const taste = document.createElement("span");
    if (item.rating != null && Number.isFinite(item.rating)) {
      const r = Number(item.rating);
      taste.className = "lp-tr2-intake-meal-taste is-mid";
      taste.textContent = `${formatRatingAvg(r)} ★`;
      taste.title = `맛 평가 ${formatRatingAvg(r)}점`;
    } else {
      taste.className = "lp-tr2-intake-meal-taste is-empty";
      taste.textContent = "평가 없음";
    }
    li.appendChild(body);
    li.appendChild(taste);
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

function isMealEatTaskName(name) {
  return (
    isHealthyMealDetailTaskName(name) || isUnhealthyMealDetailTaskName(name)
  );
}

function isMealPrepTaskName(name) {
  const n = canonicalMealTaskDisplayName(String(name || "").trim());
  return n === "건강한 섭취 준비" || n === "건강하지 않은 섭취 준비";
}

/** 섭취·섭취 준비 시간 (건강/비건강 구분 없이) */
function buildIntakeTimeSnapshot(rows, range) {
  const dates = listDatesInclusive(range.start, range.end);
  let eatMinutes = 0;
  let prepMinutes = 0;
  const daysWithData = new Set();
  (rows || []).forEach((r) => {
    const date = rowDateYmd(r);
    if (!date || date < range.start || date > range.end) return;
    const mins = rowMinutes(r);
    if (mins <= 0) return;
    if (isMealEatTaskName(r.taskName)) {
      eatMinutes += mins;
      daysWithData.add(date);
    } else if (isMealPrepTaskName(r.taskName)) {
      prepMinutes += mins;
      daysWithData.add(date);
    }
  });
  const isDay = range.start === range.end;
  const denom = isDay
    ? 1
    : Math.max(1, daysWithData.size || dates.length);
  return {
    eatMinutes,
    prepMinutes,
    daysWithData: daysWithData.size,
    avgEatMinutes: Math.round(eatMinutes / denom),
    avgPrepMinutes: Math.round(prepMinutes / denom),
    hasData: eatMinutes > 0 || prepMinutes > 0,
  };
}

function collectIntakeLogs(rows) {
  /** @type {{ date: string, main: string, sub: string, rating: number|null }[]} */
  const healthy = [];
  /** @type {{ date: string, main: string, sub: string, rating: number|null }[]} */
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
    const entry = {
      date,
      main,
      sub: subParts.join(" · "),
      rating: normalizeTimeRatingForRow(r.timeRating),
    };
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

const EMOTION_DAY_TIMELINE_MINUTES = 24 * 60;

/** 일간: 그날 0~24시 감정 소비 타임라인 */
function renderEmotionDayTimeline(entries) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-emotion-day-timeline";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "이날 24시간 감정 소비 타임라인");

  const track = document.createElement("div");
  track.className = "lp-tr2-emotion-day-timeline-track";

  const dayCap = EMOTION_DAY_TIMELINE_MINUTES;
  (entries || []).forEach((e) => {
    if (e.startMinOfDay == null || !Number.isFinite(e.startMinOfDay)) return;
    const start = Math.max(0, Math.min(dayCap - 1, e.startMinOfDay));
    const dur = Math.max(5, Math.min(dayCap - start, Number(e.minutes) || 15));
    const block = document.createElement("div");
    block.className = "lp-tr2-emotion-day-timeline-block";
    block.style.left = `${(start / dayCap) * 100}%`;
    block.style.width = `${(dur / dayCap) * 100}%`;
    block.style.background = getEmotionCategoryChartColor(e.categoryId);
    block.title = [
      e.startLabel,
      e.subLabel,
      e.categoryLabel,
      formatIntegerMinutesDurationKo(e.minutes),
    ]
      .filter(Boolean)
      .join(" · ");
    track.appendChild(block);
  });

  const ticks = document.createElement("div");
  ticks.className = "lp-tr2-emotion-day-timeline-ticks";
  for (let h = 0; h <= 24; h += 3) {
    const tick = document.createElement("span");
    tick.className = "lp-tr2-emotion-day-timeline-tick";
    tick.style.left = `${(h / 24) * 100}%`;
    tick.textContent = String(h).padStart(2, "0");
    ticks.appendChild(tick);
  }

  wrap.appendChild(track);
  wrap.appendChild(ticks);
  return wrap;
}

/** 일간: 이날 느낀 감정·소비 기록(메모 포함) */
function renderEmotionDayJournal(entries) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-emotion-day-journal";
  const title = document.createElement("p");
  title.className = "lp-tr2-emotion-day-journal-title";
  title.textContent = "이날의 감정 기록";
  wrap.appendChild(title);

  if (!entries?.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "표시할 감정 기록이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  const list = document.createElement("ul");
  list.className = "lp-tr2-emotion-day-list";
  entries.forEach((e) => {
    const li = document.createElement("li");
    li.className = "lp-tr2-emotion-day-item";

    const head = document.createElement("div");
    head.className = "lp-tr2-emotion-day-item-head";
    const emotion = document.createElement("strong");
    emotion.className = "lp-tr2-emotion-day-item-emotion";
    emotion.textContent = e.subLabel;
    const meta = document.createElement("span");
    meta.className = "lp-tr2-emotion-day-item-meta";
    const metaParts = [
      e.categoryLabel,
      e.startLabel || null,
      e.minutes > 0 ? formatIntegerMinutesDurationKo(e.minutes) : null,
    ].filter(Boolean);
    meta.textContent = metaParts.join(" · ");
    head.appendChild(emotion);
    head.appendChild(meta);
    li.appendChild(head);

    if (e.trigger) {
      const trig = document.createElement("p");
      trig.className = "lp-tr2-emotion-day-item-trigger";
      trig.textContent = `상황 · ${e.trigger}`;
      li.appendChild(trig);
    }

    if (e.memo) {
      const memo = document.createElement("p");
      memo.className = "lp-tr2-emotion-day-item-memo";
      memo.textContent = e.memo;
      li.appendChild(memo);
    } else {
      const noMemo = document.createElement("p");
      noMemo.className = "lp-tr2-emotion-day-item-memo is-empty";
      noMemo.textContent = "메모 없음";
      li.appendChild(noMemo);
    }

    list.appendChild(li);
  });
  wrap.appendChild(list);
  return wrap;
}

function mountEmotionSection(scrollWrap, range, rows) {
  const hourlyRate = readReportHourlyRateNumber();
  const snap = buildEmotionReportSnapshot(rows, hourlyRate);
  const isDay = range.start === range.end;
  const dayCount = listDatesInclusive(range.start, range.end).length;
  const isWeekView = !isDay && dayCount > 1 && dayCount <= 8;
  const sec = createSection(
    "감정 소비",
    isDay
      ? "이날 느낀 감정과 남긴 메모"
      : isWeekView
        ? "감정 대분류 비중 · 트리거 · 시간대 패턴"
        : "감정 대분류·세부 감정·트리거·시간대 패턴",
  );

  if (!snap.hasData) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      snap.legacyCount > 0
        ? "이 기간에 새 방식(대분류·세부 감정) 기록이 없습니다. 예전 1~5점 기록만 있습니다."
        : "이 기간에 감정적이기 기록이 없습니다.";
    scrollWrap.appendChild(sec);
    sec.appendChild(note);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "lp-tr2-card-grid";
  hero.appendChild(
    createStatCard(
      "감정소비시간",
      formatIntegerMinutesDurationKo(snap.consumptionMinutes),
      snap.consumptionCount > 0
        ? `세부 감정 선택 기록 ${snap.consumptionCount}건`
        : "",
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

  if (snap.legacyCount > 0) {
    const legacyNote = document.createElement("p");
    legacyNote.className = "lp-tr2-chart-note";
    legacyNote.textContent = isDay
      ? `예전 1~5점 방식 기록 ${snap.legacyCount}건은 아래 목록에 포함되지 않습니다.`
      : `예전 1~5점 방식 기록 ${snap.legacyCount}건은 아래 차트에 포함되지 않습니다.`;
    sec.appendChild(legacyNote);
  }

  if (isDay) {
    const timeBlock = createRatingBlock(
      "하루 타임라인",
      "0시~24시 · 색=감정 대분류 · 길이는 기록 시간",
    );
    timeBlock.appendChild(renderEmotionDayTimeline(snap.entries || []));
    sec.appendChild(timeBlock);
    sec.appendChild(renderEmotionDayJournal(snap.entries || []));
    scrollWrap.appendChild(sec);
    return;
  }

  const donutBlock = createRatingBlock(
    "감정 대분류",
    "5개 분류 중 어디가 가장 많은지 · 조각 크기=비중(%)",
  );
  donutBlock.appendChild(renderEmotionCategoryDonut(snap));
  sec.appendChild(donutBlock);

  /* 주간: 대분류 원형으로 비중을 보므로 세부 감정 Top 5는 생략 */
  if (!isWeekView) {
    const subBlock = createRatingBlock(
      "세부 감정 Top 5",
      "가장 자주 기록된 세부 감정",
    );
    subBlock.appendChild(renderEmotionSubEmotionBars(snap));
    sec.appendChild(subBlock);
  }

  if (snap.triggers.length) {
    const triggerBlock = createRatingBlock(
      "트리거 패턴",
      "어떤 상황에서 감정적이기가 반복되는지",
    );
    triggerBlock.appendChild(renderEmotionTriggerList(snap));
    sec.appendChild(triggerBlock);
  }

  const heatBlock = createRatingBlock(
    "요일·시간대",
    "언제 감정적이기가 집중되는지 · 색=대분류(일간 타임라인과 동일)",
  );
  heatBlock.appendChild(renderEmotionTimeHeatmap(snap));
  sec.appendChild(heatBlock);

  scrollWrap.appendChild(sec);
}

/** 일간: 가용율 + 루틴/단순 비율 막대(시간 표시) */
function renderMoveDayComposition(snap) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-move-day-hero";

  const util = document.createElement("p");
  util.className = "lp-tr2-move-day-util";
  util.textContent = `이동시간 가용율 ${snap.routineUtilPct}%`;
  wrap.appendChild(util);

  const total = document.createElement("p");
  total.className = "lp-tr2-move-day-total";
  total.textContent = `총 이동시간 ${formatIntegerMinutesDurationKo(snap.totalMinutes)}`;
  wrap.appendChild(total);

  const barWrap = document.createElement("div");
  barWrap.className = "lp-tr2-move-day-bar-wrap";
  barWrap.setAttribute("role", "img");
  barWrap.setAttribute(
    "aria-label",
    `이동 루틴 ${formatIntegerMinutesDurationKo(snap.routineMinutes)}, 단순 이동 ${formatIntegerMinutesDurationKo(snap.simpleMinutes)}, 총 ${formatIntegerMinutesDurationKo(snap.totalMinutes)}`,
  );

  const track = document.createElement("div");
  track.className = "lp-tr2-move-day-bar-track";
  const totalMin = Math.max(0, Number(snap.totalMinutes) || 0);
  const segs = [
    {
      label: "이동 루틴",
      minutes: snap.routineMinutes,
      color: MOVE_ROUTINE_COLOR,
    },
    {
      label: "단순 이동",
      minutes: snap.simpleMinutes,
      color: MOVE_SIMPLE_COLOR,
    },
  ].filter((s) => (Number(s.minutes) || 0) > 0);

  segs.forEach((seg, i) => {
    const mins = Number(seg.minutes) || 0;
    const pct = totalMin > 0 ? (mins / totalMin) * 100 : 0;
    const el = document.createElement("div");
    el.className = "lp-tr2-move-day-bar-seg";
    if (i === 0) el.classList.add("is-first");
    if (i === segs.length - 1) el.classList.add("is-last");
    el.style.width = `${pct}%`;
    el.style.background = seg.color;
    el.title = `${seg.label} ${formatIntegerMinutesDurationKo(mins)}`;
    if (pct >= 18) {
      const txt = document.createElement("span");
      txt.className = "lp-tr2-move-day-bar-seg-label";
      txt.textContent = formatIntegerMinutesDurationKo(mins);
      el.appendChild(txt);
    }
    track.appendChild(el);
  });
  if (!segs.length) track.classList.add("is-empty");
  barWrap.appendChild(track);

  const legend = document.createElement("div");
  legend.className = "lp-tr2-move-day-legend";
  [
    {
      color: MOVE_ROUTINE_COLOR,
      label: `이동 루틴 ${formatIntegerMinutesDurationKo(snap.routineMinutes)}`,
    },
    {
      color: MOVE_SIMPLE_COLOR,
      label: `단순 이동 ${formatIntegerMinutesDurationKo(snap.simpleMinutes)}`,
    },
    {
      color: "#94A3B8",
      label: `총 이동 ${formatIntegerMinutesDurationKo(snap.totalMinutes)}`,
    },
  ].forEach(({ color, label }) => {
    const item = document.createElement("span");
    item.className = "lp-tr2-move-day-legend-item";
    const sw = document.createElement("span");
    sw.className = "lp-tr2-move-day-legend-swatch";
    sw.style.background = color;
    item.appendChild(sw);
    item.appendChild(document.createTextNode(label));
    legend.appendChild(item);
  });
  barWrap.appendChild(legend);
  wrap.appendChild(barWrap);

  const hint = document.createElement("p");
  hint.className = "lp-tr2-move-day-util-hint";
  hint.textContent = "가용율 = 총 이동시간 중 이동 루틴 비율";
  wrap.appendChild(hint);
  return wrap;
}

function mountMoveSection(scrollWrap, range, rows) {
  const snap = buildMoveReportSnapshot(rows, range);
  const isDay = range.start === range.end;
  const sec = createSection(
    "이동 시간",
    isDay
      ? "이동시간 가용율 · 루틴·단순·총 이동시간"
      : "이동 루틴 · 단순 이동 과제 기록 합산",
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

  if (isDay) {
    sec.appendChild(renderMoveDayComposition(snap));
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

function routineExecutionBarColor(pct) {
  const n = Number(pct) || 0;
  if (n >= 75) return "#1e4d7b";
  if (n >= 50) return "#7E9FC3";
  return "#8B5C3A";
}

function createRoutineCardProgressBar(pct, meta) {
  const row = document.createElement("div");
  row.className = "lp-tr2-routine-card-progress";
  if (meta) row.title = meta;
  const track = document.createElement("div");
  track.className = "lp-tr2-routine-card-progress-track";
  const fill = document.createElement("div");
  fill.className = "lp-tr2-routine-card-progress-fill";
  const width = Math.min(100, Math.max(0, Number(pct) || 0));
  fill.style.width = `${width}%`;
  fill.style.background = routineExecutionBarColor(pct);
  track.appendChild(fill);
  const val = document.createElement("span");
  val.className = "lp-tr2-routine-card-progress-pct";
  val.textContent = formatPctRounded(pct);
  row.append(track, val);
  return row;
}

function buildHappinessRoutineCardItemList(title, items, kind) {
  const texts = (items || [])
    .map((item) => String(item?.text || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));

  const panel = document.createElement("div");
  panel.className =
    kind === "kept"
      ? "lp-tr2-routine-day-panel lp-tr2-routine-day-panel--kept"
      : "lp-tr2-routine-day-panel lp-tr2-routine-day-panel--missed";

  const head = document.createElement("div");
  head.className = "lp-tr2-routine-day-panel-head";
  const h = document.createElement("h4");
  h.className = "lp-tr2-routine-day-panel-title";
  h.textContent = title;
  const count = document.createElement("span");
  count.className = "lp-tr2-routine-day-panel-count";
  count.textContent = `${texts.length}`;
  head.append(h, count);
  panel.appendChild(head);

  const body = document.createElement("p");
  body.className = texts.length
    ? "lp-tr2-routine-card-item-text"
    : "lp-tr2-routine-day-panel-empty";
  body.textContent = texts.length ? texts.join(", ") : "없음";
  panel.appendChild(body);
  return panel;
}

function appendHappinessRoutinePeriodCard(
  sec,
  routine,
  {
    subText,
    missedTitle,
    keptTitle,
    missedItems,
    keptItems,
    badgeKind = "",
  } = {},
) {
  if (!routine) return;

  const card = document.createElement("article");
  card.className = "lp-tr2-routine-day-card";

  const head = document.createElement("div");
  head.className = "lp-tr2-routine-day-card-head";
  const name = document.createElement("h3");
  name.className = "lp-tr2-routine-day-card-name";
  name.textContent = routine.name || "(이름 없음)";
  if (badgeKind === "ok" || badgeKind === "warn") {
    const badge = document.createElement("span");
    badge.className =
      badgeKind === "ok"
        ? "lp-tr2-routine-badge lp-tr2-routine-badge--ok"
        : "lp-tr2-routine-badge lp-tr2-routine-badge--warn";
    badge.textContent = badgeKind === "ok" ? "가장 높음" : "가장 낮음";
    name.appendChild(document.createTextNode(" "));
    name.appendChild(badge);
  }
  const sub = document.createElement("span");
  sub.className = "lp-tr2-routine-day-card-sub";
  sub.textContent =
    subText ||
    `체크 ${routine.totalChecks}/${routine.totalOpportunities}`;
  head.append(name, sub);
  card.appendChild(head);

  const dayDoneLabel =
    Number.isFinite(Number(routine.daysDone)) &&
    Number.isFinite(Number(routine.dayCount)) &&
    Number(routine.dayCount) > 0
      ? `${routine.daysDone}/${routine.dayCount}일`
      : "";
  card.appendChild(
    createRoutineCardProgressBar(
      routine.executionPct,
      dayDoneLabel
        ? `실행율 ${formatPctRounded(routine.executionPct)} · ${dayDoneLabel}`
        : `실행율 ${formatPctRounded(routine.executionPct)}`,
    ),
  );

  const split = document.createElement("div");
  split.className = "lp-tr2-routine-day-split";
  split.append(
    buildHappinessRoutineCardItemList(
      missedTitle || "안 지켜진",
      missedItems || [],
      "missed",
    ),
    buildHappinessRoutineCardItemList(
      keptTitle || "지켜진",
      keptItems || [],
      "kept",
    ),
  );
  card.appendChild(split);
  sec.appendChild(card);
}

/** 주간 등 — 매일할일 실행율 평균으로 잘 지킴 / 잘 안 지킴 분리 (50% 기준) */
function splitRoutineItemsByAvgExecution(routine) {
  const items = Array.isArray(routine?.items) ? routine.items : [];
  const weak = [];
  const strong = [];
  for (const item of items) {
    const pct = Number(item?.executionPct);
    if (!Number.isFinite(pct)) continue;
    if (pct < 50) weak.push(item);
    else strong.push(item);
  }
  weak.sort(
    (a, b) =>
      a.executionPct - b.executionPct ||
      String(a.text || "").localeCompare(String(b.text || ""), "ko"),
  );
  strong.sort(
    (a, b) =>
      b.executionPct - a.executionPct ||
      String(a.text || "").localeCompare(String(b.text || ""), "ko"),
  );
  return { weak, strong };
}

function appendHappinessRoutineDayView(sec, snap) {
  const routines = [...(snap.routines || [])];
  if (!routines.length) return;
  for (const routine of routines) {
    appendHappinessRoutinePeriodCard(sec, routine, {
      subText: `체크 ${routine.totalChecks}/${routine.totalOpportunities}`,
      missedTitle: "안 지켜진",
      keptTitle: "지켜진",
      missedItems: routine.missedItems || [],
      keptItems: routine.keptItems || [],
    });
  }
}

function appendHappinessRoutineWeekView(sec, snap) {
  const routines = [...(snap.routines || [])];
  if (!routines.length) return;
  const days = snap.calendarDayCount || 0;
  const bestId = snap.bestRoutine ? String(snap.bestRoutine.kpiId) : "";
  const worstId = snap.worstRoutine ? String(snap.worstRoutine.kpiId) : "";
  const showBothBadges =
    bestId && worstId && bestId !== worstId && routines.length > 1;

  for (const routine of routines) {
    const id = String(routine.kpiId);
    let badgeKind = "";
    if (showBothBadges && id === bestId) badgeKind = "ok";
    else if (showBothBadges && id === worstId) badgeKind = "warn";
    const { weak, strong } = splitRoutineItemsByAvgExecution(routine);
    const done = Number.isFinite(Number(routine.daysDone))
      ? routine.daysDone
      : 0;
    const span = Number(routine.dayCount) > 0 ? routine.dayCount : days;
    appendHappinessRoutinePeriodCard(sec, routine, {
      subText: `실행율 ${formatPctRounded(routine.executionPct)} · ${done}/${span}일`,
      missedTitle: "평균적으로 잘 안 지킨",
      keptTitle: "평균적으로 잘 지킨",
      missedItems: weak,
      keptItems: strong,
      badgeKind,
    });
  }
}

function mountHappinessRoutineSection(scrollWrap, range) {
  const isDay = range?.start === range?.end;
  const snap = buildHappinessRoutineReportSnapshot(range);
  const dayCount = snap.calendarDayCount || 0;
  const sec = createSection(
    "행복 루틴 점검",
    isDay
      ? "루틴 카드별 실행율 · 안 지켜진 / 지켜진 매일할일"
      : `${dayCount}일 중 한 날 했는지 · 아래는 매일할일 잘 지킨/안 지킨`,
  );

  if (!snap.hasData) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "행복 기본 루틴·매일 반복 KPI가 없거나, 이 기간 집계 대상이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  if (isDay) {
    appendHappinessRoutineDayView(sec, snap);
  } else {
    /* 주간·월간 동일 — 카드형 실행율 + 잘 지킨/안 지킨 */
    appendHappinessRoutineWeekView(sec, snap);
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

function buildPlanChartScale(items) {
  const maxMin = Math.max(
    60,
    ...(items || []).flatMap((i) => [i.plannedMin, i.actualMin]),
  );
  const scaleMaxMin = Math.max(60, Math.ceil(maxMin / 60) * 60);
  const maxTicks = 5;
  let stepMin = Math.max(
    60,
    Math.ceil(scaleMaxMin / maxTicks / 60) * 60,
  );
  const ticks = [0];
  for (let m = stepMin; m < scaleMaxMin; m += stepMin) ticks.push(m);
  if (ticks[ticks.length - 1] !== scaleMaxMin) ticks.push(scaleMaxMin);
  while (ticks.length > maxTicks + 1 && stepMin < scaleMaxMin) {
    stepMin += 60;
    ticks.length = 0;
    ticks.push(0);
    for (let m = stepMin; m < scaleMaxMin; m += stepMin) ticks.push(m);
    if (ticks[ticks.length - 1] !== scaleMaxMin) ticks.push(scaleMaxMin);
  }
  return { scaleMaxMin, ticks };
}

const PLAN_COMPARE_PLAN_COLOR = "#94A3B8";
const PLAN_COMPARE_ACTUAL_COLOR = "#1E4D7B";
const PLAN_COMPARE_UNPLANNED_COLOR = "#8B5C3A";

function formatPlanDeltaMinutes(deltaMin) {
  const n = Math.round(Number(deltaMin) || 0);
  if (n === 0) return "차이 없음";
  const abs = formatIntegerMinutesDurationKo(Math.abs(n));
  return n > 0 ? `+${abs}` : `−${abs}`;
}

/** 일간 — 과제별 계획 → 실제 → 결과(초과/딱 맞음/과다 할당) */
function renderPlanDayTaskCompareChart(tasks) {
  const items = (tasks || []).filter(
    (t) => (t.plannedMin || 0) > 0 || (t.actualMin || 0) > 0,
  );
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-plan-day-chart";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "과제별 계획 대비 실제 결과");

  wrap.appendChild(
    createRatingChartLegend([
      { swatch: PLAN_COMPARE_PLAN_COLOR, label: "계획" },
      { swatch: PLAN_COMPARE_ACTUAL_COLOR, label: "실제" },
      { swatch: PLAN_COMPARE_UNPLANNED_COLOR, label: "계획 밖" },
    ]),
  );

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "이 날 비교할 과제 기록이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  const { scaleMaxMin } = buildPlanChartScale(items);
  const list = document.createElement("div");
  list.className = "lp-tr2-plan-day-list";

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "lp-tr2-plan-day-row";
    const outcome = item.outcome || (item.isUnplanned ? "unplanned" : "match");
    row.classList.add(`is-outcome-${outcome}`);

    const head = document.createElement("div");
    head.className = "lp-tr2-plan-day-row-head";

    const name = document.createElement("span");
    name.className = "lp-tr2-plan-day-name";
    name.textContent = item.taskName || item.label;

    const badge = document.createElement("span");
    badge.className = `lp-tr2-plan-day-outcome lp-tr2-plan-day-outcome--${outcome}`;
    badge.textContent = item.outcomeLabel || "—";

    head.append(name, badge);

    const meta = document.createElement("p");
    meta.className = "lp-tr2-plan-day-meta";
    if (outcome === "unplanned") {
      meta.textContent = `계획 없음 → 실제 ${formatIntegerMinutesDurationKo(item.actualMin)}`;
    } else if (outcome === "missed") {
      meta.textContent = `계획 ${formatIntegerMinutesDurationKo(item.plannedMin)} → 실제 없음`;
    } else {
      meta.textContent = `계획 ${formatIntegerMinutesDurationKo(item.plannedMin)} → 실제 ${formatIntegerMinutesDurationKo(item.actualMin)} · ${formatPlanDeltaMinutes(item.deltaMin)}`;
    }

    const track = document.createElement("div");
    track.className = "lp-tr2-plan-day-track";
    track.title = `${name.textContent} · ${badge.textContent} · ${meta.textContent}`;

    const planPct =
      scaleMaxMin > 0
        ? Math.min(100, (Math.max(0, item.plannedMin) / scaleMaxMin) * 100)
        : 0;
    const actualPct =
      scaleMaxMin > 0
        ? Math.min(100, (Math.max(0, item.actualMin) / scaleMaxMin) * 100)
        : 0;

    if (item.plannedMin > 0) {
      const planFill = document.createElement("div");
      planFill.className = "lp-tr2-plan-day-plan";
      planFill.style.width = `${planPct}%`;
      track.appendChild(planFill);
    }

    if (item.actualMin > 0) {
      const actualFill = document.createElement("div");
      actualFill.className = item.isUnplanned
        ? "lp-tr2-plan-day-actual is-unplanned"
        : "lp-tr2-plan-day-actual";
      actualFill.style.width = `${actualPct}%`;
      track.appendChild(actualFill);
    }

    row.append(head, meta, track);
    list.appendChild(row);
  });

  wrap.appendChild(list);
  return wrap;
}

/** 주간+ — 실제 평균 기준으로 다음에 배치할 시간 안내 */
function renderPlanTaskSuggestDurationChart(tasks) {
  const items = (tasks || []).filter(
    (t) => (t.suggestedMin || t.avgActualMin || 0) > 0,
  );
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-plan-day-chart lp-tr2-plan-suggest-chart";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "과제별 다음에 배치할 권장 시간");

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent =
      "이 기간에 계획과 실제 기록이 둘 다 있는 과제가 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  const scaleItems = items.map((t) => ({
    plannedMin: t.avgPlannedMin || t.plannedMin || 0,
    actualMin: t.suggestedMin || t.avgActualMin || t.actualMin || 0,
  }));
  const { scaleMaxMin } = buildPlanChartScale(scaleItems);
  const list = document.createElement("div");
  list.className = "lp-tr2-plan-day-list";

  items.forEach((item) => {
    const suggestMin = Math.max(
      0,
      Math.round(Number(item.suggestedMin || item.avgActualMin) || 0),
    );
    const plannedAvg = Math.max(
      0,
      Math.round(Number(item.avgPlannedMin || item.plannedMin) || 0),
    );
    const actualAvg = Math.max(
      0,
      Math.round(Number(item.avgActualMin || item.actualMin) || 0),
    );
    const sampleN = Math.max(0, Math.round(Number(item.sampleCount) || 0));

    const row = document.createElement("div");
    row.className = "lp-tr2-plan-day-row lp-tr2-plan-suggest-row";

    const head = document.createElement("div");
    head.className = "lp-tr2-plan-day-row-head";

    const name = document.createElement("span");
    name.className = "lp-tr2-plan-day-name";
    name.textContent = item.taskName || item.label;

    const badge = document.createElement("span");
    badge.className = "lp-tr2-plan-day-outcome lp-tr2-plan-suggest-badge";
    badge.textContent = `권장 ${formatIntegerMinutesDurationKo(suggestMin)}`;

    head.append(name, badge);

    const meta = document.createElement("p");
    meta.className = "lp-tr2-plan-day-meta";
    const sampleSuffix = sampleN > 0 ? ` · ${sampleN}일` : "";
    meta.textContent = `평소 계획 ${formatIntegerMinutesDurationKo(plannedAvg)} · 실제 평균 ${formatIntegerMinutesDurationKo(actualAvg)}${sampleSuffix} → 다음엔 ${formatIntegerMinutesDurationKo(suggestMin)} 배치`;

    const track = document.createElement("div");
    track.className = "lp-tr2-plan-day-track";
    track.title = `${name.textContent} · ${meta.textContent}`;

    const planPct =
      scaleMaxMin > 0
        ? Math.min(100, (plannedAvg / scaleMaxMin) * 100)
        : 0;
    const suggestPct =
      scaleMaxMin > 0
        ? Math.min(100, (suggestMin / scaleMaxMin) * 100)
        : 0;

    if (plannedAvg > 0) {
      const planFill = document.createElement("div");
      planFill.className = "lp-tr2-plan-day-plan";
      planFill.style.width = `${planPct}%`;
      planFill.title = `평소 계획 ${formatIntegerMinutesDurationKo(plannedAvg)}`;
      track.appendChild(planFill);
    }

    if (suggestMin > 0) {
      const suggestFill = document.createElement("div");
      suggestFill.className = "lp-tr2-plan-day-actual";
      suggestFill.style.width = `${suggestPct}%`;
      suggestFill.title = `권장 ${formatIntegerMinutesDurationKo(suggestMin)}`;
      track.appendChild(suggestFill);
    }

    row.append(head, meta, track);
    list.appendChild(row);
  });

  wrap.appendChild(
    createRatingChartLegend([
      { swatch: PLAN_COMPARE_PLAN_COLOR, label: "평소 계획" },
      { swatch: PLAN_COMPARE_ACTUAL_COLOR, label: "권장 배치" },
    ]),
  );
  wrap.appendChild(list);
  return wrap;
}

function mountPlanAdherenceSection(scrollWrap, range, rows) {
  const snap = buildPlanAdherenceReportSnapshot(range, rows);
  const sec = createSection(
    "계획 이행",
    snap.isSingleDay
      ? "과제별 계획 → 실제 · 내일 계획에 참고"
      : `예상 일정 · 계획 습관 · ${snap.totalDaysInPeriod}일`,
  );
  sec.classList.add("lp-tr2-plan-section");

  const summaryGrid = document.createElement("div");
  summaryGrid.className = "lp-tr2-card-grid lp-tr2-plan-summary-grid";
  if (snap.isSingleDay) {
    const oc = snap.dayOutcomeCounts || {};
    summaryGrid.classList.add("lp-tr2-plan-summary-grid--day");
    summaryGrid.appendChild(
      createStatCard("시간 초과", `${oc.over || 0}건`, "실제 > 계획"),
    );
    summaryGrid.appendChild(
      createStatCard("딱 맞음", `${oc.match || 0}건`, "계획 ≈ 실제"),
    );
    summaryGrid.appendChild(
      createStatCard("계획 과다", `${oc.under || 0}건`, "실제 < 계획"),
    );
    if ((oc.missed || 0) > 0) {
      summaryGrid.appendChild(
        createStatCard("미실행", `${oc.missed}건`, "계획만 있고 실행 없음"),
      );
    }
  } else {
    summaryGrid.appendChild(
      createStatCard(
        "계획한 날",
        snap.totalDaysInPeriod > 0
          ? `${snap.plannedDaysCount}/${snap.totalDaysInPeriod}일`
          : "—",
        "조회 기간",
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
  }
  sec.appendChild(summaryGrid);

  if (!snap.isSingleDay && snap.planningHabitLine) {
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

  if (snap.isSingleDay) {
    const taskBlock = createRatingBlock(
      "과제별 계획 대비",
      "계획한 시간 → 실제로 쓴 시간",
    );
    taskBlock.appendChild(renderPlanDayTaskCompareChart(snap.tasks || []));
    sec.appendChild(taskBlock);
  } else {
    const avgTasks = snap.taskDurationAverages || [];
    if (avgTasks.length) {
      const avgBlock = createRatingBlock(
        "다음에 이만큼 잡으세요",
        "실제 평균 기준 · 계획·기록이 둘 다 있는 과제만",
      );
      avgBlock.appendChild(renderPlanTaskSuggestDurationChart(avgTasks));
      sec.appendChild(avgBlock);
    }
  }

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

  if (!snap.isSingleDay && snap.estimation) {
    const estBlock = createRatingBlock(
      "추정 정확도",
      "계획이 실제와 얼마나 맞는지",
    );
    const estP = document.createElement("p");
    estP.className = "lp-tr2-plan-est-text";
    estP.textContent = snap.estimation.message;
    estBlock.appendChild(estP);
    sec.appendChild(estBlock);
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

function pickFocusHourRanks(hourGrid, { best = true, take = 3, minCount = 1 } = {}) {
  const scored = (hourGrid || []).filter(
    (h) =>
      (h.count || 0) >= minCount &&
      (h.avgMult != null || h.avg != null),
  );
  scored.sort((a, b) => {
    const am = a.avgMult != null ? a.avgMult : (a.avg || 0) / 5;
    const bm = b.avgMult != null ? b.avgMult : (b.avg || 0) / 5;
    if (best) {
      return bm - am || (b.minutes || 0) - (a.minutes || 0);
    }
    return am - bm || (a.minutes || 0) - (b.minutes || 0);
  });
  return scored.slice(0, take);
}

/** 다음에 집중할 때 — 시간대·좋은 조건·피할 조건 한 줄 요약 */
function buildFocusNextPlanLines(ratingSnap, focusSnap) {
  const hourGrid = ratingSnap?.hourGrid || focusSnap?.hourGrid || [];
  const bestHours = pickFocusHourRanks(hourGrid, { best: true, take: 3 });
  const lowHours = pickFocusHourRanks(hourGrid, { best: false, take: 2 });
  const goodTags = (focusSnap?.recipeTags || []).slice(0, 3);
  const badTags = (focusSnap?.disruptorAnalysis?.ranking || []).slice(0, 2);

  const lines = [];
  if (bestHours.length) {
    lines.push(
      `평균 집중이 높았던 시각: ${bestHours.map((h) => formatHourLabel(h.hour)).join(" · ")}`,
    );
  }
  if (goodTags.length) {
    lines.push(
      `잘 된 상황(몰입 요소): ${goodTags.map((t) => `「${t.label}」`).join(" · ")}`,
    );
  }
  if (badTags.length) {
    lines.push(
      `피하면 좋은 방해: ${badTags.map((t) => `「${t.label}」`).join(" · ")}`,
    );
  }
  if (
    lowHours.length &&
    bestHours.length &&
    !bestHours.some((b) => lowHours.some((l) => l.hour === b.hour))
  ) {
    lines.push(
      `집중이 낮았던 시각: ${lowHours.map((h) => formatHourLabel(h.hour)).join(" · ")}`,
    );
  }
  if (!lines.length) {
    return [
      "생산적 작업에 「이 시간 평가」와 몰입·방해 요소를 남기면, 다음에 쓰기 좋은 시간대와 조건이 정리됩니다.",
    ];
  }
  return lines;
}

function mountFocusDisruptorAnalysisBlock(sec, analysis) {
  if (!analysis?.show) return;

  const analysisBlock = createRatingBlock(
    "이럴 때 집중이 안 됐음",
    "1~2점일 때 고른 방해 요소 · 다음에 피하면 좋은 조건",
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

function mountFocusReportSection(scrollWrap, range, rows) {
  const isDay = range?.start === range?.end;
  const ratingSnap = buildTimeRatingReportSnapshot(rows);
  const focusSnap = buildFocusReportSnapshot(rows);
  const sec = createSection(
    "집중 분석",
    "언제·어떤 상황에서 잘 되고 안 됐는지 · 다음에 집중할 때 참고",
  );
  sec.classList.add("lp-tr2-focus-section");

  if (!ratingSnap && !focusSnap) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "이 기간에 별점을 매긴 생산적 작업 기록이 없습니다. 기록할 때 「이 시간 평가」를 남겨 보세요.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  /* 1) 다음에 집중하려면 — 시간대 + 좋은/나쁜 조건 */
  const planBlock = createRatingBlock(
    "다음에 집중하려면",
    "평균으로 잘 됐던 시간대와 조건 · 피할 방해",
  );
  const planLines = buildFocusNextPlanLines(ratingSnap, focusSnap);
  planLines.forEach((text) => {
    const p = document.createElement("p");
    p.className = "lp-tr2-focus-next-plan-line";
    p.textContent = text;
    planBlock.appendChild(p);
  });
  if (ratingSnap) {
    const evalMeta = document.createElement("p");
    evalMeta.className = "lp-tr2-focus-eval-meta";
    evalMeta.textContent = `평가 ${ratingSnap.ratedCount}건 · ${formatIntegerMinutesDurationKo(ratingSnap.totalMinutes)}`;
    planBlock.appendChild(evalMeta);
  }
  sec.appendChild(planBlock);

  /* 2) 몇 시에 집중이 높았는지 */
  if (ratingSnap?.hourGrid?.some((h) => h.count > 0)) {
    const hourBlock = createRatingBlock(
      "주로 집중이 높은 시간",
      "시작 시각 기준 평균 집중도 · 막대가 높을수록 그 시간대에 잘 됨",
    );
    hourBlock.appendChild(
      render24HourRatingChart(ratingSnap.hourGrid, { mode: "return" }),
    );
    const bestHours = pickFocusHourRanks(ratingSnap.hourGrid, {
      best: true,
      take: 3,
    });
    if (bestHours.length) {
      const tip = document.createElement("p");
      tip.className = "lp-tr2-chart-note";
      tip.textContent = `평균 상위: ${bestHours
        .map(
          (h) =>
            `${formatHourLabel(h.hour)}(${formatReturnPercentAvg(h.avgMult)})`,
        )
        .join(" · ")}`;
      hourBlock.appendChild(tip);
    }
    sec.appendChild(hourBlock);
  }

  /* 3) 어떤 상황에서 잘 됐는지 */
  if (focusSnap?.recipeTags?.length) {
    const recipeBlock = createRatingBlock(
      "이럴 때 집중이 잘 됐음",
      "4~5점일 때 함께 있던 몰입 요소 · 다음에 만들기 좋은 조건",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars";
    focusSnap.recipeTags.slice(0, 6).forEach((item) => {
      bars.appendChild(createFocusRecipeTagRow(item));
    });
    recipeBlock.appendChild(bars);
    sec.appendChild(recipeBlock);
  } else if (focusSnap && focusSnap.highFocusSessionCount > 0) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = focusSnap.recipeOneLiner;
    sec.appendChild(note);
  }

  /* 4) 어떨 때 안 좋았는지 */
  if (focusSnap) {
    mountFocusDisruptorAnalysisBlock(sec, focusSnap.disruptorAnalysis);
  }

  if (!isDay && ratingSnap?.weekdayGrid?.some((w) => w.count > 0)) {
    const block = createRatingBlock(
      "요일별로 보면",
      "어떤 요일에 집중이 잘 됐는지 · 다음에 일정 잡을 때 참고",
    );
    block.appendChild(renderWeekdayReturnChart(ratingSnap.weekdayGrid));
    sec.appendChild(block);
  }

  if (ratingSnap?.topTasks?.length) {
    const block = createRatingBlock(
      "어떤 활동에서",
      "과제별 평균 집중도 · 집중이 잘 된 활동 유형",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars";
    ratingSnap.topTasks.forEach((t) => {
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

  if (ratingSnap?.monthScores?.length > 1) {
    const block = createRatingBlock("월별 집중 추이", "기간이 여러 달일 때");
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars lp-tr2-bars--compact";
    ratingSnap.monthScores.forEach((m) => {
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

const DAY_HERO_COLORS = {
  productive: "#E8A0A0",
  waste: "#A8C4E8",
  work: "#A8D4B8",
  sleep: "#B8DCC8",
  rest: "#EEF1F4",
};

/** 하루 = 0:00~23:59(1439분). 1440으로 세면 하루끝에도 1분이 그 외로 남음 */
const DAY_LENGTH_MINUTES = 23 * 60 + 59;

function donutSlicePath(cx, cy, r, rInner, startAngle, endAngle) {
  const span = endAngle - startAngle;
  if (span <= 1e-6) return "";
  if (span >= Math.PI * 2 - 1e-5) {
    return [
      `M ${cx - r} ${cy}`,
      `A ${r} ${r} 0 1 1 ${cx + r} ${cy}`,
      `A ${r} ${r} 0 1 1 ${cx - r} ${cy}`,
      `M ${cx - rInner} ${cy}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy}`,
      "Z",
    ].join(" ");
  }
  const large = span > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const xi1 = cx + rInner * Math.cos(endAngle);
  const yi1 = cy + rInner * Math.sin(endAngle);
  const xi2 = cx + rInner * Math.cos(startAngle);
  const yi2 = cy + rInner * Math.sin(startAngle);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${rInner} ${rInner} 0 ${large} 0 ${xi2} ${yi2} Z`;
}

function appendDonutRingSlices(
  svg,
  cx,
  cy,
  r,
  rInner,
  segments,
  startAngle,
  { withSliceLabels = false, labelMinSpan = 0.32 } = {},
) {
  let angle = startAngle;
  const total = segments.reduce(
    (sum, seg) => sum + Math.max(0, Number(seg.minutes) || 0),
    0,
  );
  if (!(total > 0)) return { angle, slices: [] };
  const slices = [];
  segments.forEach((seg) => {
    const mins = Math.max(0, Number(seg.minutes) || 0);
    if (mins <= 0) return;
    const slice = (mins / total) * Math.PI * 2;
    if (slice <= 0) return;
    const start = angle;
    const end = angle + slice;
    const d = donutSlicePath(cx, cy, r, rInner, start, end);
    if (!d) return;
    const path = svgEl("path", {
      d,
      fill: seg.color,
      class: seg.className || "",
    });
    const title = document.createElementNS(SVG_NS, "title");
    const pct =
      seg.pctText ||
      `${Math.round((mins / total) * 100)}%`;
    title.textContent = `${seg.label} ${formatIntegerMinutesDurationKo(Math.round(mins))} · ${pct}`;
    path.appendChild(title);
    svg.appendChild(path);
    slices.push({
      label: seg.label,
      minutes: mins,
      pctText: pct,
      slice,
      midAngle: start + slice / 2,
      color: seg.color,
    });
    angle = end;
  });

  if (withSliceLabels) {
    slices.forEach((item) => {
      if (item.slice < labelMinSpan) return;
      const labelR = (r + rInner) / 2;
      const tx = cx + labelR * Math.cos(item.midAngle);
      const ty = cy + labelR * Math.sin(item.midAngle);
      const fillColor = String(item.color || "").toLowerCase();
      const lightFill =
        fillColor === DAY_HERO_COLORS.rest.toLowerCase() ||
        fillColor === "#eef1f4" ||
        fillColor === "#f2f2f2";
      const text = svgEl("text", {
        x: tx.toFixed(1),
        y: ty.toFixed(1),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: lightFill ? "#64748b" : "#ffffff",
        "font-size": String(tr2SvgFontSize(11)),
        "font-weight": "800",
        class: "lp-tr2-day-hero-donut-slice-label",
      });
      text.textContent = item.pctText;
      svg.appendChild(text);
    });
  }

  return { angle, slices };
}

function buildDayHeroTimeParts(hero, { dayCount = 1 } = {}) {
  const days = Math.max(1, Math.round(Number(dayCount) || 1));
  const dayMin = DAY_LENGTH_MINUTES;
  const periodMin = dayMin * days;
  const productive = Math.max(0, Math.round(Number(hero.productiveMinutes) || 0));
  const waste = Math.max(0, Math.round(Number(hero.wasteMinutes) || 0));
  const work = Math.max(0, Math.round(Number(hero.workMinutes) || 0));
  const sleep = Math.max(0, Math.round(Number(hero.sleepMinutes) || 0));
  const categoryRecorded = productive + waste + work + sleep;
  /* 상단 총 기록과 동일 합 — 없으면 카테고리 합 */
  const logged = Math.max(
    0,
    Math.round(Number(hero.totalLoggedMinutes) || 0),
  );
  const recorded = logged > 0 ? logged : categoryRecorded;
  const rest = Math.max(0, periodMin - categoryRecorded);
  /* 가용 = (23:59×일수) − 근무 − 수면 */
  const available = Math.max(0, periodMin - work - sleep);
  const availProd = Math.min(productive, available);
  const availWaste = Math.min(waste, Math.max(0, available - availProd));
  const availLeft = Math.max(0, available - availProd - availWaste);
  const periodPct = (mins) =>
    periodMin > 0 ? Math.round((mins / periodMin) * 100) : 0;
  const availPctOf = (mins) =>
    available > 0 ? Math.round((mins / available) * 100) : 0;
  return {
    dayCount: days,
    dayMin,
    periodMin,
    recorded,
    recordedPct: periodPct(recorded),
    available,
    productive,
    waste,
    work,
    sleep,
    rest,
    availProd,
    availWaste,
    availLeft,
    prodPct: periodPct(productive),
    wastePct: periodPct(waste),
    workPct: periodPct(work),
    sleepPct: periodPct(sleep),
    restPct: periodPct(rest),
    availProdPct: availPctOf(availProd),
    availWastePct: availPctOf(availWaste),
    availLeftPct: availPctOf(availLeft),
  };
}

function dayHeroDonutSegments(parts) {
  const segs = [
    {
      label: "생산적",
      minutes: parts.productive,
      color: DAY_HERO_COLORS.productive,
    },
    {
      label: "비생산",
      minutes: parts.waste,
      color: DAY_HERO_COLORS.waste,
    },
    {
      label: "근무",
      minutes: parts.work,
      color: DAY_HERO_COLORS.work,
    },
    {
      label: "수면",
      minutes: parts.sleep,
      color: DAY_HERO_COLORS.sleep,
    },
  ];
  if (parts.rest > 0) {
    segs.push({
      label: "그 외",
      minutes: parts.rest,
      color: DAY_HERO_COLORS.rest,
    });
  }
  return segs;
}

function dayHeroAvailableDonutSegments(parts) {
  const segs = [
    {
      label: "생산적",
      minutes: parts.availProd,
      color: DAY_HERO_COLORS.productive,
      pctText: `${parts.availProdPct}%`,
    },
    {
      label: "비생산",
      minutes: parts.availWaste,
      color: DAY_HERO_COLORS.waste,
      pctText: `${parts.availWastePct}%`,
    },
  ];
  if (parts.availLeft > 0) {
    segs.push({
      label: "남는 가용",
      minutes: parts.availLeft,
      color: DAY_HERO_COLORS.rest,
      pctText: `${parts.availLeftPct}%`,
    });
  }
  return segs;
}

function fillDayHeroDonutCenter(wrap, { capText, totalText, subText }) {
  const center = document.createElement("div");
  center.className = "lp-tr2-day-hero-donut-center";
  if (capText) {
    const cap = document.createElement("span");
    cap.className = "lp-tr2-day-hero-donut-cap";
    cap.textContent = capText;
    center.appendChild(cap);
  }
  const totalEl = document.createElement("strong");
  totalEl.className = "lp-tr2-day-hero-donut-total";
  totalEl.textContent = totalText;
  center.appendChild(totalEl);
  if (subText) {
    const sub = document.createElement("span");
    sub.className = "lp-tr2-day-hero-donut-sub";
    sub.textContent = subText;
    center.appendChild(sub);
  }
  wrap.appendChild(center);
}

/** 하루 24시간 기준 — 생산 / 비생산 / 근무 / 수면 (/ 그 외), 가운데 = 총기록 */
function renderDayHeroDayDonut(parts) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-day-hero-donut";

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 96;
  const rInner = 58;
  const start = -Math.PI / 2;
  const segments = dayHeroDonutSegments(parts);

  const svg = svgEl("svg", {
    class: "lp-tr2-day-hero-donut-svg",
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    role: "img",
    "aria-label": `총기록 ${formatIntegerMinutesDurationKo(parts.recorded)}, 생산 ${formatIntegerMinutesDurationKo(parts.productive)}, 비생산 ${formatIntegerMinutesDurationKo(parts.waste)}, 근무 ${formatIntegerMinutesDurationKo(parts.work)}, 수면 ${formatIntegerMinutesDurationKo(parts.sleep)}`,
  });

  appendDonutRingSlices(svg, cx, cy, r, rInner, segments, start);
  wrap.appendChild(svg);
  fillDayHeroDonutCenter(wrap, {
    capText: "",
    totalText: formatIntegerMinutesDurationKo(parts.recorded),
    subText:
      parts.dayCount <= 1
        ? `${parts.recordedPct}%`
        : `${parts.dayCount}일 중 ${parts.recordedPct}%`,
  });
  return wrap;
}

/** 가용시간(근무·수면 제외) 안에서 생산·비생산 활용 — %는 도넛 안 */
function renderDayHeroAvailableDonut(parts) {
  const wrap = document.createElement("div");
  wrap.className =
    "lp-tr2-day-hero-donut lp-tr2-day-hero-donut--available";

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 96;
  const rInner = 58;
  const start = -Math.PI / 2;
  const segments = dayHeroAvailableDonutSegments(parts);

  const svg = svgEl("svg", {
    class: "lp-tr2-day-hero-donut-svg",
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    role: "img",
    "aria-label": `가용 ${formatIntegerMinutesDurationKo(parts.available)} 중 생산 ${formatIntegerMinutesDurationKo(parts.availProd)}, 비생산 ${formatIntegerMinutesDurationKo(parts.availWaste)}`,
  });

  if (parts.available > 0 && segments.some((s) => s.minutes > 0)) {
    appendDonutRingSlices(svg, cx, cy, r, rInner, segments, start, {
      withSliceLabels: true,
      labelMinSpan: 0.28,
    });
  } else {
    const emptyPath = donutSlicePath(cx, cy, r, rInner, 0, Math.PI * 2);
    if (emptyPath) {
      svg.appendChild(
        svgEl("path", {
          d: emptyPath,
          fill: DAY_HERO_COLORS.rest,
        }),
      );
    }
  }

  wrap.appendChild(svg);
  fillDayHeroDonutCenter(wrap, {
    capText: "가용시간",
    totalText: formatIntegerMinutesDurationKo(parts.available),
    subText: "근무·수면 제외",
  });
  return wrap;
}

function createDayHeroLegendItem(swatch, label, value, pctText) {
  const item = document.createElement("div");
  item.className = "lp-tr2-day-hero-legend-item";
  const sw = document.createElement("span");
  sw.className = "lp-tr2-day-hero-legend-swatch";
  sw.style.background = swatch;
  const body = document.createElement("div");
  body.className = "lp-tr2-day-hero-legend-body";
  const lab = document.createElement("span");
  lab.className = "lp-tr2-day-hero-legend-label";
  lab.textContent = label;
  body.appendChild(lab);
  const hasValue = value != null && Number.isFinite(Number(value));
  if (hasValue || pctText) {
    const meta = document.createElement("span");
    meta.className = "lp-tr2-day-hero-legend-meta";
    if (hasValue && pctText) {
      meta.textContent = `${formatIntegerMinutesDurationKo(value)} · ${pctText}`;
    } else if (hasValue) {
      meta.textContent = formatIntegerMinutesDurationKo(value);
    } else {
      meta.textContent = pctText;
    }
    body.appendChild(meta);
  }
  item.appendChild(sw);
  item.appendChild(body);
  return item;
}

function createDayHeroValueRow(label, valueText, tone) {
  const row = document.createElement("div");
  row.className = `lp-tr2-day-hero-value-row${tone ? ` lp-tr2-day-hero-value-row--${tone}` : ""}`;
  const lab = document.createElement("span");
  lab.className = "lp-tr2-day-hero-value-label";
  lab.textContent = label;
  const val = document.createElement("strong");
  val.className = "lp-tr2-day-hero-value-amount";
  val.textContent = valueText;
  row.appendChild(lab);
  row.appendChild(val);
  return row;
}

function renderDayHeroSummary(hero, { dayCount = 1 } = {}) {
  const parts = buildDayHeroTimeParts(hero, { dayCount });
  const isMultiDay = parts.dayCount > 1;
  const root = document.createElement("div");
  root.className = "lp-tr2-day-hero";

  const viz = document.createElement("div");
  viz.className = "lp-tr2-day-hero-viz";

  const charts = document.createElement("div");
  charts.className = "lp-tr2-day-hero-charts";

  const dayCol = document.createElement("div");
  dayCol.className = "lp-tr2-day-hero-chart-col";
  const dayCap = document.createElement("p");
  dayCap.className = "lp-tr2-day-hero-chart-cap";
  dayCap.textContent = isMultiDay
    ? `${parts.dayCount}일 쓴 시간`
    : "하루 구성";
  dayCol.appendChild(dayCap);
  dayCol.appendChild(renderDayHeroDayDonut(parts));
  const dayLegend = document.createElement("div");
  dayLegend.className = "lp-tr2-day-hero-legend";
  const dayLegendItems = [
    {
      color: DAY_HERO_COLORS.productive,
      label: "생산적",
      minutes: parts.productive,
      pct: `${parts.prodPct}%`,
    },
    {
      color: DAY_HERO_COLORS.waste,
      label: "비생산",
      minutes: parts.waste,
      pct: `${parts.wastePct}%`,
    },
    {
      color: DAY_HERO_COLORS.work,
      label: "근무",
      minutes: parts.work,
      pct: `${parts.workPct}%`,
    },
    {
      color: DAY_HERO_COLORS.sleep,
      label: "수면",
      minutes: parts.sleep,
      pct: `${parts.sleepPct}%`,
    },
  ];
  if (parts.rest > 0) {
    dayLegendItems.push({
      color: DAY_HERO_COLORS.rest,
      label: "그 외",
      minutes: parts.rest,
      pct: `${parts.restPct}%`,
    });
  }
  dayLegendItems.forEach((item) => {
    dayLegend.appendChild(
      createDayHeroLegendItem(item.color, item.label, item.minutes, item.pct),
    );
  });
  dayCol.appendChild(dayLegend);
  charts.appendChild(dayCol);

  const availCol = document.createElement("div");
  availCol.className = "lp-tr2-day-hero-chart-col";
  const availCap = document.createElement("p");
  availCap.className = "lp-tr2-day-hero-chart-cap";
  availCap.textContent = isMultiDay
    ? `${parts.dayCount}일 가용시간 활용`
    : "가용시간 활용";
  availCol.appendChild(availCap);
  availCol.appendChild(renderDayHeroAvailableDonut(parts));
  charts.appendChild(availCol);

  viz.appendChild(charts);
  root.appendChild(viz);

  const valuePanel = document.createElement("div");
  valuePanel.className = "lp-tr2-day-hero-value";
  const valueTitle = document.createElement("p");
  valueTitle.className = "lp-tr2-day-hero-value-title";
  valueTitle.textContent = isMultiDay ? "기간의 시간 가치" : "오늘의 시간 가치";
  valuePanel.appendChild(valueTitle);

  const investWon = Math.round(Number(hero.investWon) || 0);
  const wasteWon = Math.round(Number(hero.wasteWon) || 0);
  const netWon = Math.round(Number(hero.netWon) || 0);

  valuePanel.appendChild(
    createDayHeroValueRow(
      "생산적 가치",
      investWon > 0
        ? formatInvestReclaimWonDisplay(investWon)
        : "₩0",
      "prod",
    ),
  );
  valuePanel.appendChild(
    createDayHeroValueRow(
      "비생산 가치",
      wasteWon > 0
        ? formatLedgerLossKrwDisplay(wasteWon)
        : "₩0",
      "waste",
    ),
  );

  const netRow = createDayHeroValueRow(
    "합(순가치)",
    formatNetWon(netWon),
    netWon > 0 ? "net-pos" : netWon < 0 ? "net-neg" : "net-zero",
  );
  netRow.classList.add("lp-tr2-day-hero-value-row--net");
  valuePanel.appendChild(netRow);

  const scoreHint = document.createElement("p");
  scoreHint.className = "lp-tr2-day-hero-value-score";
  scoreHint.textContent = `집중 점수 ${hero.score}`;
  if (hero.focusLabel) {
    scoreHint.textContent += ` · ${hero.focusLabel} ${hero.focusPct}%`;
  }
  valuePanel.appendChild(scoreHint);

  root.appendChild(valuePanel);
  return root;
}

function mountHeroSection(scrollWrap, range) {
  const hero = getTimeReportHeroSnapshotForDateRange(range.start, range.end);
  const dayCount = listDatesInclusive(range.start, range.end).length;
  const sec = createSection(
    "한 장 요약",
    formatRangeLabel(range.start, range.end),
  );
  /* 일·주·월간 동일 — 구성 도넛 + 가용시간 도넛 + 시간 가치 */
  sec.appendChild(renderDayHeroSummary(hero, { dayCount }));
  scrollWrap.appendChild(sec);
}

/** 일간: 목표 수면 대비 가로 진행 바 */
function renderSleepGoalProgressBar(minutes) {
  const slept = Math.max(0, Math.round(Number(minutes) || 0));
  const target = SLEEP_TARGET_MIN;
  const pct = target > 0 ? Math.min(100, Math.round((slept / target) * 100)) : 0;
  const met = slept >= target;

  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-sleep-goal-bar";
  wrap.setAttribute(
    "aria-label",
    `목표 ${formatIntegerMinutesDurationKo(target)} 중 ${formatIntegerMinutesDurationKo(slept)} (${pct}%)`,
  );

  const head = document.createElement("div");
  head.className = "lp-tr2-sleep-goal-bar-head";
  const label = document.createElement("span");
  label.className = "lp-tr2-sleep-goal-bar-label";
  label.textContent = "목표 대비 수면";
  const meta = document.createElement("strong");
  meta.className = `lp-tr2-sleep-goal-bar-meta${met ? " is-met" : " is-miss"}`;
  meta.textContent = `${formatIntegerMinutesDurationKo(slept)} / ${formatIntegerMinutesDurationKo(target)} · ${pct}%`;
  head.appendChild(label);
  head.appendChild(meta);

  const track = document.createElement("div");
  track.className = "lp-tr2-sleep-goal-bar-track";
  const fill = document.createElement("div");
  fill.className = `lp-tr2-sleep-goal-bar-fill${met ? " is-met" : " is-miss"}`;
  fill.style.width = `${pct}%`;
  track.appendChild(fill);

  const foot = document.createElement("p");
  foot.className = "lp-tr2-sleep-goal-bar-foot";
  foot.textContent = met
    ? "7시간 목표 달성"
    : `목표까지 ${formatIntegerMinutesDurationKo(Math.max(0, target - slept))} 부족`;

  wrap.appendChild(head);
  wrap.appendChild(track);
  wrap.appendChild(foot);
  return wrap;
}

function mountSleepSection(scrollWrap, range, rows) {
  const snap = buildSleepReportSnapshot(rows, range);
  const isDay = range.start === range.end;
  const isWeekView = !isDay && snap.dayCount > 1 && snap.dayCount <= 8;
  const sec = createSection(
    "수면 기록",
    isDay
      ? "전날 밤 취침 ~ 기상 · 7시간 목표 대비"
      : isWeekView
        ? "평균 요약 · 막대=수면 시간 · 점선=7시간 목표"
        : "취침·기상·품질 패턴 · 막대=수면 시간 · 점선=7시간 목표",
  );

  if (!snap.daysWithSleep.length) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = "이 기간에 수면 기록이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  sec.appendChild(buildSleepStatsGrid(snap, { weekView: isWeekView }));

  if (isDay) {
    const day = snap.daysWithSleep[0];
    sec.appendChild(renderSleepGoalProgressBar(day?.minutes || 0));
    scrollWrap.appendChild(sec);
    return;
  }

  const chartBlock = createRatingBlock(
    "수면 시간 · 목표 대비",
    "날짜별 수면 길이와 7시간 목표",
  );
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
  chartBlock.appendChild(chartWrap);
  sec.appendChild(chartBlock);

  if (isWeekView) {
    const detailBlock = createRatingBlock(
      "요일별 상세",
      "취침 · 기상 · 수면 · 평가",
    );
    detailBlock.appendChild(buildWeeklySleepDetailTable(snap.sleepByDay));
    sec.appendChild(detailBlock);
  }

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
  const isDay = range.start === range.end;
  const isWeekView = !isDay && dayCount > 1 && dayCount <= 8;
  const meals = [...healthy, ...unhealthy].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || a.main.localeCompare(b.main, "ko"),
  );

  /* 일간·주간: 섭취/준비 시간 요약 + 식단(맛 평가 목록) */
  if (isDay || isWeekView) {
    const timeSnap = buildIntakeTimeSnapshot(rows, range);
    const sec = createSection(
      "섭취 기록",
      isDay
        ? "오늘 섭취·준비에 쓴 시간 · 식단 맛 평가"
        : "하루 평균 섭취·준비 시간 · 식단 맛 평가",
    );

    if (!timeSnap.hasData && !meals.length) {
      const note = document.createElement("p");
      note.className = "lp-tr2-chart-note";
      note.textContent = "이 기간에 섭취 기록이 없습니다.";
      sec.appendChild(note);
      scrollWrap.appendChild(sec);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "lp-tr2-card-grid";
    if (isDay) {
      grid.appendChild(
        createStatCard(
          "섭취 시간",
          formatIntegerMinutesDurationKo(timeSnap.eatMinutes),
          "건강한·비건강한 섭취 합",
        ),
      );
      grid.appendChild(
        createStatCard(
          "섭취 준비 시간",
          formatIntegerMinutesDurationKo(timeSnap.prepMinutes),
          "준비 과제 합",
        ),
      );
    } else {
      grid.appendChild(
        createStatCard(
          "평균 섭취 시간",
          formatIntegerMinutesDurationKo(timeSnap.avgEatMinutes),
          timeSnap.daysWithData > 0
            ? `${timeSnap.daysWithData}일 기준`
            : "",
        ),
      );
      grid.appendChild(
        createStatCard(
          "평균 섭취 준비 시간",
          formatIntegerMinutesDurationKo(timeSnap.avgPrepMinutes),
          timeSnap.daysWithData > 0
            ? `${timeSnap.daysWithData}일 기준`
            : "",
        ),
      );
    }
    sec.appendChild(grid);

    const dietBlock = createRatingBlock(
      "식단",
      isDay
        ? "건강한·건강하지 않은 섭취 · 옆의 별점이 맛 평가"
        : "건강한·건강하지 않은 섭취 · 옆의 별점이 맛 평가",
    );
    const panels = document.createElement("div");
    panels.className = "lp-tr2-intake-panels";
    /* 일간·주간: 세로 스크롤 없이 목록 전부 표시 */

    const makeDietPanel = (title, count, entries, tone) => {
      const panel = document.createElement("div");
      panel.className = `lp-tr2-intake-panel lp-tr2-intake-panel--${tone}`;
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
      body.appendChild(
        buildDayIntakeRatedFeed(entries, "기록 없음", tone, {
          showDate: !isDay,
        }),
      );
      panel.appendChild(head);
      panel.appendChild(body);
      return panel;
    };

    panels.appendChild(
      makeDietPanel("건강한 섭취", healthy.length, healthy, "healthy"),
    );
    panels.appendChild(
      makeDietPanel(
        "건강하지 않은 섭취",
        unhealthy.length,
        unhealthy,
        "unhealthy",
      ),
    );
    dietBlock.appendChild(panels);
    sec.appendChild(dietBlock);
    /* 주간: 식단 목록 + 좋아한/아쉬웠던 음식 (일간은 목록·별점만) */
    if (isWeekView) {
      appendMealTasteRankBlocks(sec, rows);
    }
    scrollWrap.appendChild(sec);
    return;
  }

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
    panel.className = `lp-tr2-intake-panel lp-tr2-intake-panel--${tone}`;
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
  appendMealTasteRankBlocks(sec, rows);
  scrollWrap.appendChild(sec);
}

/** 맛 평가 — 5~1점별 나열 (5=가장 좋아한, 1=가장 싫어한) */
function appendMealTasteRankBlocks(sec, rows) {
  const tasteSnap = buildMealTasteReportSnapshot(rows);
  if (!tasteSnap) return;

  const tasteNote = document.createElement("p");
  tasteNote.className = "lp-tr2-chart-note lp-tr2-intake-taste-note";
  tasteNote.textContent = `맛 평가 ${tasteSnap.ratedCount}건 · 식단 ${tasteSnap.foodCount}종`;
  sec.appendChild(tasteNote);

  /* 위 식단 목록에 중간 점수가 있으므로 5점·1점만 요약 */
  const byRating = (Array.isArray(tasteSnap.byRating) ? tasteSnap.byRating : [])
    .filter(({ rating }) => {
      const star = Math.round(Number(rating) || 0);
      return star === 5 || star === 1;
    });
  if (!byRating.length) return;

  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-intake-taste-by-rating";

  byRating.forEach(({ rating, foods }) => {
    if (!foods?.length) return;
    const star = Math.round(Number(rating) || 0);
    const title = star === 5 ? "가장 좋아한 음식" : "가장 싫어한 음식";
    const sub = star === 5 ? "5점을 준 식단" : "1점을 준 식단";
    const chipMod =
      star === 5
        ? "lp-tr2-intake-taste-chip--high"
        : "lp-tr2-intake-taste-chip--low";

    const block = createRatingBlock(title, sub);
    const row = document.createElement("div");
    row.className = "lp-tr2-intake-taste-chip-row";
    foods.forEach(({ food, count }) => {
      const chip = document.createElement("span");
      chip.className = `lp-tr2-intake-taste-chip ${chipMod}`;
      chip.textContent =
        count > 1 ? `${food} · ${count}회` : food;
      row.appendChild(chip);
    });
    block.appendChild(row);
    wrap.appendChild(block);
  });

  sec.appendChild(wrap);
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

  let anchor = "middle";
  if (cos > 0.22) anchor = "start";
  else if (cos < -0.22) anchor = "end";

  let dy = 0;
  if (sin < -0.28) dy = -3;
  else if (sin > 0.28) dy = 4;

  const t = svgEl("text", {
    x: lx,
    y: ly + dy,
    fill: "#334155",
    "fill-opacity": "1",
    "font-size": tr2SvgFontSize(12),
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

/** 월간 과제 트리맵 — 파스텔 카테고리 색 */
const MONTH_TASK_TREEMAP_COLORS = {
  sideincome: "#F3D0D0",
  happiness: "#F5DCE4",
  health: "#D0EBD8",
  pleasure: "#F3E4CC",
  media_watch: "#DDD6F0",
  unhappiness: "#D8DCE8",
  unhealthy: "#D0E0F2",
  moneylosing: "#E8D6E0",
  work: "#D0E4F5",
  sleep: "#D0EBE2",
  other: "#E0E6EE",
};

const MONTH_TASK_TREEMAP_CAT_LABELS = {
  sideincome: "시급 상승",
  happiness: "행복",
  health: "건강",
  pleasure: "쾌락",
  media_watch: "미디어",
  unhappiness: "불행",
  unhealthy: "비건강",
  moneylosing: "시급 저하",
  work: "근무",
  sleep: "수면",
  other: "기타",
};

function monthTaskCategoryKey(taskName, rowHint) {
  const fromRow = String(rowHint || "").trim();
  if (fromRow && MONTH_TASK_TREEMAP_COLORS[fromRow]) return fromRow;
  const opt = getTaskOptionByName(String(taskName || "").trim());
  const cat = String(opt?.category || "").trim();
  return MONTH_TASK_TREEMAP_COLORS[cat] ? cat : "other";
}

/**
 * 기간 안 기록된 과제별 총 시간 — 과제명마다 전부 표시(묶음 없음)
 */
function buildMonthTaskTreemapItems(rows) {
  /** @type {Map<string, { name: string, minutes: number, categoryKey: string }>} */
  const map = new Map();
  for (const r of rows || []) {
    const name = String(r?.taskName || "").trim();
    if (!name) continue;
    const mins = rowMinutes(r);
    if (mins <= 0) continue;
    const cur = map.get(name) || {
      name,
      minutes: 0,
      categoryKey: monthTaskCategoryKey(name, r.category),
    };
    cur.minutes += mins;
    if (!MONTH_TASK_TREEMAP_COLORS[cur.categoryKey]) {
      cur.categoryKey = monthTaskCategoryKey(name, r.category);
    }
    map.set(name, cur);
  }
  return [...map.values()].sort(
    (a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "ko"),
  );
}

/** 이분 분할 트리맵 레이아웃 (0~100% 좌표) */
function layoutMonthTaskTreemap(items) {
  const total = items.reduce((s, t) => s + t.minutes, 0);
  if (total <= 0) return [];
  /** @type {{ name: string, minutes: number, categoryKey: string, x: number, y: number, w: number, h: number, pct: number }[]} */
  const out = [];

  function split(list, x, y, w, h) {
    if (!list.length || w < 0.4 || h < 0.4) return;
    if (list.length === 1) {
      const t = list[0];
      out.push({
        ...t,
        x,
        y,
        w,
        h,
        pct: Math.round((t.minutes / total) * 100),
      });
      return;
    }
    const sum = list.reduce((s, t) => s + t.minutes, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < list.length - 1; i += 1) {
      acc += list[i].minutes;
      cut = i + 1;
      if (acc >= sum / 2) break;
    }
    const left = list.slice(0, cut);
    const right = list.slice(cut);
    const leftSum = left.reduce((s, t) => s + t.minutes, 0);
    const ratio = sum > 0 ? leftSum / sum : 0.5;
    if (w >= h) {
      const w1 = w * ratio;
      split(left, x, y, w1, h);
      split(right, x + w1, y, w - w1, h);
    } else {
      const h1 = h * ratio;
      split(left, x, y, w, h1);
      split(right, x, y + h1, w, h - h1);
    }
  }

  split(
    [...items].sort((a, b) => b.minutes - a.minutes),
    0,
    0,
    100,
    100,
  );
  return out;
}

function renderMonthTaskTreemap(items) {
  const layout = layoutMonthTaskTreemap(items);
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-task-treemap";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "한달 과제별 사용 시간");

  const board = document.createElement("div");
  board.className = "lp-tr2-task-treemap-board";

  const GAP = 0.45;
  layout.forEach((cell) => {
    const el = document.createElement("div");
    el.className = "lp-tr2-task-treemap-cell";
    const w = Math.max(0, cell.w - GAP);
    const h = Math.max(0, cell.h - GAP);
    el.style.left = `${cell.x + GAP / 2}%`;
    el.style.top = `${cell.y + GAP / 2}%`;
    el.style.width = `${w}%`;
    el.style.height = `${h}%`;
    el.style.background =
      MONTH_TASK_TREEMAP_COLORS[cell.categoryKey] ||
      MONTH_TASK_TREEMAP_COLORS.other;
    el.title = `${cell.name} · ${formatIntegerMinutesDurationKo(cell.minutes)} · ${cell.pct}%`;

    if (h < 9 || w < 11) el.classList.add("is-compact");
    if (h < 7 || w < 9) el.classList.add("is-tiny");

    const name = document.createElement("span");
    name.className = "lp-tr2-task-treemap-name";
    name.textContent = cell.name;

    const meta = document.createElement("span");
    meta.className = "lp-tr2-task-treemap-meta";
    meta.textContent = `${formatIntegerMinutesDurationKo(cell.minutes)} · ${cell.pct}%`;

    el.append(name, meta);
    board.appendChild(el);
  });

  wrap.appendChild(board);

  const usedCats = [
    ...new Set(items.map((i) => i.categoryKey).filter(Boolean)),
  ];
  if (usedCats.length) {
    wrap.appendChild(
      createRatingChartLegend(
        usedCats.map((key) => ({
          swatch: MONTH_TASK_TREEMAP_COLORS[key] || MONTH_TASK_TREEMAP_COLORS.other,
          label: MONTH_TASK_TREEMAP_CAT_LABELS[key] || key,
        })),
      ),
    );
  }
  return wrap;
}

/** 주간·월간 — 시간의 방향 위에 과제별 시간 지도(동일 네모 형태) */
function mountTaskTimeMapSection(scrollWrap, range, rows) {
  const isDay = range.start === range.end;
  if (isDay) return;

  const dayCount = listDatesInclusive(range.start, range.end).length;
  const isWeek = dayCount > 1 && dayCount <= 8;
  const items = buildMonthTaskTreemapItems(rows);

  const sec = createSection(
    isWeek ? "1주 시간 지도" : "한달 시간 지도",
    "",
  );

  if (!items.length) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = isWeek
      ? "이 주에 집계할 과제 기록이 없습니다."
      : "이 달에 집계할 과제 기록이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  sec.appendChild(renderMonthTaskTreemap(items));
  scrollWrap.appendChild(sec);
}

function mountDonutSection(scrollWrap, range) {
  const snap = getTimeReportDonutSnapshotForDateRange(range.start, range.end);
  const radarSnap = buildCategoryTimeRadarFromDonutSnap(snap);
  const sec = createSection(
    "시간의 방향",
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
  mountTaskTimeMapSection(scrollWrap, range, rows);
  mountDonutSection(scrollWrap, range);
  mountSleepSection(scrollWrap, range, rows);
  mountIntakeSection(scrollWrap, range, rows);
  mountEmotionSection(scrollWrap, range, rows);
  mountMoveSection(scrollWrap, range, rows);
  mountHappinessRoutineSection(scrollWrap, range);
  mountMediaSection(scrollWrap, range, rows);
  mountFocusReportSection(scrollWrap, range, rows);
  mountPlanAdherenceSection(scrollWrap, range, rows);
}
