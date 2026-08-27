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
  isMealIntakeTasteRatingTaskName,
  isReadingDetailTaskName,
  isSleepBuiltinTaskName,
  isUnhealthyMealDetailTaskName,
  CONVERSATION_SPEECH_CHECK_OPTIONS,
  CONVERSATION_TYPE_OPTIONS,
  isConversationDetailTaskName,
  isUnproductiveConversationTaskName,
  isWorkBuiltinTaskName,
  parseConversationDetail,
} from "./timeTaskOptionsConstants.js";
import {
  formatIntegerMinutesDurationKo,
  formatInvestReclaimWonDisplay,
  formatLedgerLossKrwDisplay,
  formatYmdDotsWithWeekdayKo,
  getLedgerEffectiveHoursForReclaim,
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
  renderEmotionDistributionTable,
  renderEmotionPeriodSummaryLine,
  renderEmotionSituationPatterns,
  renderEmotionSubEmotionBars,
  renderEmotionTriggerDonut,
} from "./timeEmotionReportCharts.js";
import { getEmotionCategoryChartColor } from "./timeEmotionTaxonomy.js";
import { parseEmotionReflectMemo } from "./timeEmotionReflectMemo.js";
import { ledgerRowUserMemoFeedback } from "./timeLedgerCardKpiMemo.js";
import { buildMoveReportSnapshot } from "./timeMoveReport.js";
import { buildHappinessRoutineReportSnapshot } from "./timeHappinessRoutineReport.js";
import {
  buildAverageActualDaySchedule,
  buildPlanAdherenceReportSnapshot,
} from "./timePlanAdherenceReport.js";
import { buildFocusReportSnapshot } from "./timeFocusReport.js";
import { buildNonproductiveBadFeelingReportSnapshot } from "./timeNonproductiveBadFeelingReport.js";
import { buildNonproductiveGoodFeelingReportSnapshot } from "./timeNonproductiveGoodFeelingReport.js";
import { buildMealTasteReportSnapshot } from "./timeMealTasteReport.js";
import { flowDisruptorCategoryColor } from "./timeTaskFlowDisruptors.js";
import {
  normalizeTimeSleepGoodFactorsForRow,
  timeSleepGoodFactorLabelForId,
} from "./timeTaskSleepGoodFactors.js";
import {
  normalizeTimeSleepPoorReasonsForRow,
  timeSleepPoorReasonLabelForId,
} from "./timeTaskSleepPoorReasons.js";
import { getTaskOptionByName } from "./timeTaskOptionsModel.js";
import { readUserHourlyRateLocal } from "./userHourlySync.js";
import { tr2SvgFontSize } from "./timeReportUiScale.js";
import { mountReportHabitScoreboard } from "./reportHabitScoreboard.js";
import { buildYearKpiGoalReportSnapshot } from "./yearKpiGoalReport.js";
import {
  buildDayTaskCompareReport,
  renderDayTaskCompareChart,
} from "./timeDayCompareReport.js";
import { syncHabitTrackerLogs } from "./timeKpiSync.js";

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

function rowsInRange(startYmd, endYmd, allRows) {
  const rs = normYmd(startYmd);
  const re = normYmd(endYmd);
  const src = Array.isArray(allRows) ? allRows : loadTimeRows();
  return src.filter((r) => {
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

/** 한 장 요약 금액 — 손글씨 폰트에 없는 ₩·반각 ± 대신 전각 부호·「원」 */
function createDayHeroWonAmountEl(signedWon) {
  const n = Math.round(Number(signedWon) || 0);
  const abs = Math.abs(n);
  const digits = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const el = document.createElement("span");
  el.className = "lp-tr2-day-hero-value-amount";
  if (n > 0) {
    const sign = document.createElement("span");
    sign.className = "lp-tr2-day-hero-value-sign";
    sign.textContent = "＋";
    el.appendChild(sign);
  } else if (n < 0) {
    const sign = document.createElement("span");
    sign.className = "lp-tr2-day-hero-value-sign";
    sign.textContent = "－";
    el.appendChild(sign);
  }
  const num = document.createElement("span");
  num.className = "lp-tr2-day-hero-value-digits";
  num.textContent = digits;
  const cur = document.createElement("span");
  cur.className = "lp-tr2-day-hero-value-currency";
  cur.textContent = "원";
  el.append(num, cur);
  el.setAttribute(
    "aria-label",
    n > 0 ? `플러스 ${digits}원` : n < 0 ? `마이너스 ${digits}원` : `${digits}원`,
  );
  return el;
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

/**
 * 요일별 등 — 이번 차트 안 최저~최고에 맞춰 높이 차이를 키움
 * (절대 스케일이면 +79%·+98%가 비슷해 보임)
 */
function returnMultBarHeightPctInRange(mult, lo, hi, minVisible = 22) {
  const pct = returnMultToPercent(mult);
  if (pct == null) return 0;
  const span = Math.max(1, Number(hi) - Number(lo));
  const t = (pct - Number(lo)) / span;
  return Math.max(
    minVisible,
    Math.min(100, minVisible + t * (100 - minVisible)),
  );
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
  /* 건강한·건강하지 않은 섭취 별점은 맛 평가 — 집중도와 분리 */
  if (isMealIntakeTasteRatingTaskName(r?.taskName)) return false;
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

/** 생산·비생산·콘텐츠·맛·감정 등 별점이 있는 모든 기록 */
function collectAllRatedSessions(rows) {
  const dayCap = 24 * 60;
  /** @type {{ rating: number, minutes: number, startMin: number|null, endMin: number|null, overnight: boolean, startLabel: string, endLabel: string, task: string, hour: number|null }[]} */
  const out = [];
  for (const r of rows || []) {
    const rating = normalizeTimeRatingForRow(r?.timeRating);
    if (rating == null) continue;
    const startMin = parseRowClockMinutes(r.startTime);
    const endParsed = parseRowClockMinutes(r.endTime);
    const minutes = rowMinutes(r) || 15;
    let endMin = null;
    let overnight = false;
    if (startMin != null) {
      if (endParsed != null && endParsed > startMin) {
        endMin = endParsed;
      } else if (endParsed != null && endParsed < startMin) {
        /* 전날 밤→당일 아침 수면 등 */
        overnight = true;
        endMin = endParsed;
      } else {
        endMin = Math.min(dayCap, startMin + Math.max(5, minutes));
      }
    }
    out.push({
      rating,
      minutes,
      startMin,
      endMin,
      overnight,
      startLabel: startMin != null ? formatClockFromMinutes(startMin) : "",
      endLabel: endMin != null ? formatClockFromMinutes(endMin) : "",
      task: String(r.taskName || "").trim() || "(제목 없음)",
      hour: rowStartHour(r),
    });
  }
  out.sort((a, b) => {
    const am = a.startMin == null ? 99 * 60 : a.startMin;
    const bm = b.startMin == null ? 99 * 60 : b.startMin;
    return am - bm;
  });
  return out;
}

function addRatedMinutesToHourBuckets(hourBuckets, rating, fromMin, toMin) {
  const dayCap = 24 * 60;
  let cursor = Math.max(0, Math.min(dayCap, fromMin));
  const end = Math.max(cursor + 1, Math.min(dayCap, toMin));
  while (cursor < end) {
    const hour = Math.min(23, Math.floor(cursor / 60));
    const hourEnd = Math.min(end, (hour + 1) * 60);
    const slice = Math.max(0, hourEnd - cursor);
    if (slice > 0) {
      hourBuckets[hour].weighted += rating * slice;
      hourBuckets[hour].minutes += slice;
      hourBuckets[hour].count += 1;
    }
    cursor = hourEnd;
  }
}

/** 과제 구간에 걸친 시(0~23)마다 별점을 배분 — 자정 넘김 수면 포함 */
function buildHourGridFromRatedSessions(sessions) {
  const dayCap = 24 * 60;
  const hourBuckets = Array.from({ length: 24 }, () => ({
    weighted: 0,
    minutes: 0,
    count: 0,
  }));
  for (const e of sessions || []) {
    if (e.startMin == null || !Number.isFinite(e.startMin)) continue;
    const start = Math.max(0, Math.min(dayCap - 1, e.startMin));
    if (e.overnight && e.endMin != null && e.endMin < start) {
      addRatedMinutesToHourBuckets(hourBuckets, e.rating, start, dayCap);
      addRatedMinutesToHourBuckets(hourBuckets, e.rating, 0, e.endMin);
      continue;
    }
    let end =
      e.endMin != null && e.endMin > start
        ? e.endMin
        : start + Math.max(5, e.minutes || 15);
    addRatedMinutesToHourBuckets(hourBuckets, e.rating, start, end);
  }
  return hourBuckets.map((b, hour) => ({
    hour,
    avg: b.minutes > 0 ? b.weighted / b.minutes : null,
    avgMult: null,
    count: b.count,
    minutes: b.minutes,
  }));
}

/** 별점 구간 차트 x축 — 평가가 있는 구간에 맞춰 확대 */
function resolveDayRatingChartTimeWindow(points) {
  const dayCap = 24 * 60;
  const mins = [];
  for (const s of points || []) {
    if (s.startMin != null && Number.isFinite(s.startMin)) mins.push(s.startMin);
    if (s.endMin != null && Number.isFinite(s.endMin)) mins.push(s.endMin);
  }
  if (!mins.length) return { minM: 0, maxM: dayCap, spanM: dayCap };
  let minM = Math.min(...mins);
  let maxM = Math.max(...mins);
  const span = Math.max(0, maxM - minM);
  /* 좌우 여백: 최소 90분, 구간이 길면 구간의 12% */
  const pad = Math.max(90, Math.round(span * 0.12));
  /* 점 1개·구간이 너무 짧으면 최소 6시간 폭 */
  const minSpan = 6 * 60;
  if (span < minSpan) {
    const mid = (minM + maxM) / 2;
    minM = mid - minSpan / 2;
    maxM = mid + minSpan / 2;
  } else {
    minM -= pad;
    maxM += pad;
  }
  minM = Math.max(0, Math.floor(minM));
  maxM = Math.min(dayCap, Math.ceil(maxM));
  if (maxM - minM < minSpan) {
    if (minM <= 0) maxM = Math.min(dayCap, minSpan);
    else if (maxM >= dayCap) minM = Math.max(0, dayCap - minSpan);
  }
  if (maxM <= minM) {
    minM = 0;
    maxM = dayCap;
  }
  return { minM, maxM, spanM: maxM - minM };
}

function buildDayRatingChartXTicks(minM, maxM) {
  const spanM = Math.max(1, maxM - minM);
  const spanH = spanM / 60;
  let stepH = 1;
  if (spanH > 18) stepH = 3;
  else if (spanH > 10) stepH = 2;
  else if (spanH <= 4) stepH = 0.5;
  const stepM = stepH * 60;
  const startTick = Math.ceil(minM / stepM) * stepM;
  const ticks = [];
  for (let t = startTick; t <= maxM + 0.01; t += stepM) {
    ticks.push(Math.round(t));
  }
  if (!ticks.length || ticks[0] > minM + 1) ticks.unshift(Math.round(minM));
  if (ticks[ticks.length - 1] < maxM - 1) ticks.push(Math.round(maxM));
  /* 중복 제거 */
  return [...new Set(ticks)].filter((t) => t >= minM - 0.5 && t <= maxM + 0.5);
}

function formatDayRatingAxisClock(mins) {
  const m = Math.max(0, Math.min(24 * 60, Math.round(mins)));
  if (m >= 24 * 60) return "24:00";
  return formatClockFromMinutes(m);
}

/**
 * 일간 별점 — 시간대(시)별 평균을 점으로 찍고 이웃 시간대를 선으로 이음
 * 가로축 00~23, 눈금 「시」 없음
 * 좁은 화면: 가로를 화면에 맞게 축소, X축 눈금은 2시간 단위
 */
function renderDayRatingLinkChart(sessions) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-day-rating-line-chart";
  const hourGrid = buildHourGridFromRatedSessions(sessions);
  const series = hourGrid.filter((h) => h.count > 0 && h.avg != null);
  if (!series.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "시간대별 별점 기록이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  let fitToViewport = false;
  try {
    fitToViewport =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 46rem)").matches;
  } catch (_) {
    fitToViewport = false;
  }

  const hour0 = 0;
  const hour1 = 23;
  const nHours = 24;
  const slotW = fitToViewport ? 12 : 28;
  const H = fitToViewport ? 188 : 210;
  const padL = fitToViewport ? 36 : 44;
  const padR = fitToViewport ? 8 : 12;
  const padT = 14;
  const padB = 26;
  const W = slotW * nHours + padL + padR;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xAtHourCenter = (hour) =>
    padL + ((hour - hour0 + 0.5) / nHours) * plotW;
  const yAtRating = (rating) => padT + ((5 - rating) / 4) * plotH;
  const xTickStep = fitToViewport ? 2 : 1;

  const scroll = document.createElement("div");
  scroll.className = "lp-tr2-day-rating-line-scroll";
  if (fitToViewport) {
    scroll.classList.add("lp-tr2-day-rating-line-scroll--fit");
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute(
    "preserveAspectRatio",
    fitToViewport ? "xMidYMid meet" : "xMinYMid meet",
  );
  svg.setAttribute("class", "lp-tr2-day-rating-line-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "00부터 23까지 시간대별 평균 별점");
  if (fitToViewport) {
    svg.style.width = "100%";
    svg.style.minWidth = "0";
    svg.style.height = "auto";
    svg.style.maxHeight = "12rem";
  } else {
    svg.style.minWidth = `${W}px`;
  }

  for (let star = 1; star <= 5; star += 1) {
    const y = yAtRating(star);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(padL));
    line.setAttribute("x2", String(padL + plotW));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", "lp-tr2-day-rating-line-guide");
    svg.appendChild(line);
    const lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lab.setAttribute("x", String(padL - 10));
    lab.setAttribute("y", String(y + 3.5));
    lab.setAttribute("text-anchor", "end");
    lab.setAttribute("class", "lp-tr2-day-rating-line-ylab");
    lab.setAttribute("font-size", String(tr2SvgFontSize(10)));
    lab.textContent = `${star}★`;
    svg.appendChild(lab);
  }

  const coords = series.map((h) => ({
    hour: h.hour,
    avg: h.avg,
    count: h.count,
    minutes: h.minutes,
    x: xAtHourCenter(h.hour),
    y: yAtRating(h.avg),
  }));

  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i];
    const b = coords[i + 1];
    if (b.hour - a.hour > 3) continue;
    const seg = document.createElementNS("http://www.w3.org/2000/svg", "line");
    seg.setAttribute("x1", String(a.x));
    seg.setAttribute("y1", String(a.y));
    seg.setAttribute("x2", String(b.x));
    seg.setAttribute("y2", String(b.y));
    seg.setAttribute("class", "lp-tr2-day-rating-line-path");
    svg.appendChild(seg);
  }

  coords.forEach((p) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", String(p.x));
    c.setAttribute("cy", String(p.y));
    c.setAttribute("r", "4.5");
    c.setAttribute("fill", ratingFillColor(p.avg));
    c.setAttribute("class", "lp-tr2-day-rating-line-dot");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = [
      `${String(p.hour).padStart(2, "0")}`,
      `평균 ${formatRatingAvg(p.avg)}점`,
      `${p.count}건`,
      p.minutes > 0 ? formatIntegerMinutesDurationKo(p.minutes) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    c.appendChild(title);
    svg.appendChild(c);
  });

  const tickFont = tr2SvgFontSize(fitToViewport ? 7 : 8);
  for (let h = hour0; h <= hour1; h += xTickStep) {
    const lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lab.setAttribute("x", String(xAtHourCenter(h)));
    lab.setAttribute("y", String(H - 8));
    lab.setAttribute("text-anchor", "middle");
    lab.setAttribute("class", "lp-tr2-day-rating-line-xlab");
    lab.setAttribute("font-size", String(tickFont));
    lab.textContent = String(h).padStart(2, "0");
    svg.appendChild(lab);
  }

  scroll.appendChild(svg);
  wrap.appendChild(scroll);
  const rangeHint = document.createElement("p");
  rangeHint.className = "lp-tr2-day-rating-line-range-hint";
  rangeHint.textContent = fitToViewport
    ? "가로 00~22(2시간 눈금) · 점은 매시 평균 별점"
    : "가로 00~23 · 각 점은 그 시간대 평균 별점";
  wrap.appendChild(rangeHint);
  return wrap;
}

/** 일간 전용 — 모든 별점 기록을 이은 그래프 */
function mountDayStarRatingSection(scrollWrap, range, rows) {
  if (!scrollWrap || range?.start !== range?.end) return;
  const sessions = collectAllRatedSessions(rows);
  const sec = createSection(
    "이날의 별점",
    "시간대별 평균 별점을 선으로 이은 그래프",
  );
  sec.classList.add("lp-tr2-day-rating-section");

  if (!sessions.length) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "오늘 별점을 남긴 기록이 없습니다. 과제 기록할 때 평가를 남겨 보세요.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  let weighted = 0;
  let totalMin = 0;
  for (const s of sessions) {
    weighted += s.rating * s.minutes;
    totalMin += s.minutes;
  }
  const avg = totalMin > 0 ? weighted / totalMin : 0;

  const summary = document.createElement("p");
  summary.className = "lp-tr2-day-rating-summary";
  summary.textContent = `평가 ${sessions.length}건 · 시간 가중 평균 ${formatRatingAvg(avg)}점 · ${formatIntegerMinutesDurationKo(totalMin)}`;
  sec.appendChild(summary);

  const lineBlock = createRatingBlock(
    "별점 선 그래프",
    "시간대(시)별 평균 별점 · 점과 점을 선으로 연결",
  );
  lineBlock.appendChild(renderDayRatingLinkChart(sessions));
  sec.appendChild(lineBlock);

  scrollWrap.appendChild(sec);
}

function renderWeekdayReturnChart(weekdayGrid) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-rating-weekday-chart";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "요일별 집중도");

  const pcts = (weekdayGrid || [])
    .filter((w) => w.count > 0 && w.avgMult != null)
    .map((w) => returnMultToPercent(w.avgMult))
    .filter((p) => p != null);
  let lo = pcts.length ? Math.min(...pcts) : 0;
  let hi = pcts.length ? Math.max(...pcts) : 100;
  /* 격차가 너무 작으면 살짝 벌려 구분 */
  if (hi - lo < 24) {
    const mid = (hi + lo) / 2;
    lo = mid - 12;
    hi = mid + 12;
  }

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
      const pct = returnMultBarHeightPctInRange(w.avgMult, lo, hi, 24);
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

function formatCompactSleepBarLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}시`;
  if (h === 0) return `${m}분`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * 수면 목표 대비 — HTML 막대(집중 시간대 차트와 동일 방식).
 * @param {HTMLElement} canvas
 * @param {Array<{date:string, minutes:number}>} sleepByDay
 */
function renderSleepGoalBarChart(canvas, sleepByDay) {
  const totalDays = sleepByDay.length;
  const recorded = sleepByDay.filter((x) => x.minutes > 0);
  if (!recorded.length) return { scroll: false };

  const targetH = SLEEP_TARGET_MIN / 60;
  const hoursValues = recorded.map((x) => x.minutes / 60);
  const { yMax } = computeSleepYDomain(hoursValues, targetH);
  const scroll = totalDays > 14;
  const showValLabels = totalDays <= 10;
  const targetPct = yMax > 0 ? (targetH / yMax) * 100 : 0;

  const chart = document.createElement("div");
  chart.className = "lp-tr2-sleep-goal-chart";
  chart.setAttribute("role", "img");
  chart.setAttribute(
    "aria-label",
    "날짜별 수면 시간 막대 그래프 · 7시간 목표",
  );

  /* Y축은 3·6·9…만 — 목표 7은 점선·범례로만 (숫자 겹침 방지) */
  const gridStep = yMax <= 9 ? 3 : Math.ceil(yMax / 4 / 3) * 3;
  const tickVals = [];
  for (let v = 0; v <= yMax + 0.01; v += gridStep) tickVals.push(v);

  const yAxis = document.createElement("div");
  yAxis.className = "lp-tr2-sleep-goal-chart-y";
  yAxis.setAttribute("aria-hidden", "true");
  tickVals.forEach((v) => {
    const tick = document.createElement("span");
    tick.className = "lp-tr2-sleep-goal-chart-y-tick";
    tick.textContent = fmtSleepAxisHours(v);
    tick.style.bottom = `${(v / yMax) * 100}%`;
    yAxis.appendChild(tick);
  });

  const valsRow = document.createElement("div");
  valsRow.className = "lp-tr2-sleep-goal-chart-vals";
  const barsRow = document.createElement("div");
  barsRow.className = "lp-tr2-sleep-goal-chart-bars";
  const datesRow = document.createElement("div");
  datesRow.className = "lp-tr2-sleep-goal-chart-dates";
  if (scroll) {
    const minW = `${Math.max(320, totalDays * (totalDays <= 31 ? 28 : 22))}px`;
    valsRow.style.minWidth = minW;
    barsRow.style.minWidth = minW;
    datesRow.style.minWidth = minW;
  }

  /* Y축 눈금 가로 격자 — 몇 시간인지 맞추기 쉽게 */
  const gridLayer = document.createElement("div");
  gridLayer.className = "lp-tr2-sleep-goal-chart-grid";
  gridLayer.setAttribute("aria-hidden", "true");
  tickVals.forEach((v) => {
    const line = document.createElement("div");
    line.className = "lp-tr2-sleep-goal-chart-grid-line";
    if (v === 0) line.classList.add("is-baseline");
    line.style.bottom = `${(v / yMax) * 100}%`;
    gridLayer.appendChild(line);
  });
  barsRow.appendChild(gridLayer);

  /* 7시간 목표 점선 — 그래프 안에 반드시 표시 (Y축 숫자와 별개) */
  const targetLine = document.createElement("div");
  targetLine.className = "lp-tr2-sleep-goal-chart-target";
  targetLine.style.bottom = `${targetPct}%`;
  targetLine.setAttribute("aria-hidden", "true");
  const targetTag = document.createElement("span");
  targetTag.className = "lp-tr2-sleep-goal-chart-target-tag";
  targetTag.textContent = "7h";
  targetLine.appendChild(targetTag);
  barsRow.appendChild(targetLine);

  sleepByDay.forEach(({ date, minutes }, index) => {
    const showDate =
      totalDays <= 10 ||
      index === 0 ||
      index === totalDays - 1 ||
      (totalDays <= 20 && index % 2 === 0) ||
      (totalDays > 20 && index % 3 === 0);

    const valCell = document.createElement("span");
    valCell.className = "lp-tr2-sleep-goal-chart-val";
    const barCell = document.createElement("div");
    barCell.className = "lp-tr2-sleep-goal-chart-bar-cell";
    const dateCell = document.createElement("span");
    dateCell.className = "lp-tr2-sleep-goal-chart-date";
    dateCell.textContent = showDate
      ? sleepChartDateLabel(date, totalDays)
      : "\u00a0";

    if (minutes > 0) {
      const hours = minutes / 60;
      const barPct = Math.max(3, (hours / yMax) * 100);
      const metGoal = minutes >= SLEEP_TARGET_MIN;
      const bar = document.createElement("div");
      bar.className = `lp-tr2-sleep-goal-chart-bar${metGoal ? " is-met" : " is-miss"}`;
      bar.style.height = `${barPct}%`;
      bar.title = `${formatYmdDotsWithWeekdayKo(date)} · ${formatIntegerMinutesDurationKo(minutes)}${metGoal ? " · 목표 달성" : " · 목표 미달"}`;
      barCell.appendChild(bar);
      if (showValLabels) {
        valCell.textContent = formatCompactSleepBarLabel(minutes);
        if (metGoal) valCell.classList.add("is-met");
      } else {
        valCell.textContent = "\u00a0";
      }
    } else {
      valCell.textContent = "\u00a0";
    }

    valsRow.appendChild(valCell);
    barsRow.appendChild(barCell);
    datesRow.appendChild(dateCell);
  });

  const top = document.createElement("div");
  top.className = "lp-tr2-sleep-goal-chart-top";
  const topSpacer = document.createElement("div");
  topSpacer.className = "lp-tr2-sleep-goal-chart-y-spacer";
  topSpacer.setAttribute("aria-hidden", "true");
  top.append(topSpacer, valsRow);

  const mid = document.createElement("div");
  mid.className = "lp-tr2-sleep-goal-chart-mid";
  mid.append(yAxis, barsRow);

  const bottom = document.createElement("div");
  bottom.className = "lp-tr2-sleep-goal-chart-bottom";
  const bottomSpacer = document.createElement("div");
  bottomSpacer.className = "lp-tr2-sleep-goal-chart-y-spacer";
  bottomSpacer.setAttribute("aria-hidden", "true");
  bottom.append(bottomSpacer, datesRow);

  chart.append(top, mid, bottom);
  canvas.appendChild(chart);
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
 * - 취침: 전날 마감 23:59 수면의 시작
 *   · 없으면(밤샘 후 00시 이후 취침) 당일 첫 수면 시작
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
  const first = dayRecs[0];
  const wakeMin = first.endMin;
  /* 1) 전날 마감 23:59 수면의 시작 = 취침 */
  let bedtimeMin = prevNightBedtimeMin(prevDayRecs);
  if (bedtimeMin == null && first.startMin != null && Number.isFinite(first.startMin)) {
    /* 2) 전날 취침 없음 = 밤샘 후 당일 00시 이후 취침 → 첫 수면 시작 */
    bedtimeMin = first.startMin;
  }
  return { wakeMin, bedtimeMin };
}

/** 취침·기상 해석용 — 조회 기간 전후 1일 수면 기록 포함 */
function sleepRowsForReportContext(range, allRows) {
  const padStart = addDaysYmd(range.start, -1);
  const padEnd = addDaysYmd(range.end, 1);
  const src = Array.isArray(allRows) ? allRows : loadTimeRows();
  return src.filter((r) => {
    const d = rowDateYmd(r);
    if (!d || d < padStart || d > padEnd) return false;
    return isSleepLedgerRow(r);
  });
}

function collectSleepRecordsByDate(rows) {
  /** @type {Map<string, { startMin: number|null, endMin: number|null, minutes: number, rating: number|null, goodFactors: string[], poorReasons: string[], startSort: string }[]>} */
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
      goodFactors: normalizeTimeSleepGoodFactorsForRow(r.timeSleepGoodFactors),
      poorReasons: normalizeTimeSleepPoorReasonsForRow(r.timeSleepPoorReasons),
      startSort: rowStartSortKey(r),
    });
  });
  byDate.forEach((recs) => {
    recs.sort((a, b) => a.startSort.localeCompare(b.startSort));
  });
  return byDate;
}

/** @param {Map<string, number>} countsMap @param {number} sessionCount @param {(id:string)=>string} labelFn */
function buildSleepRecipeTagRanking(countsMap, sessionCount, labelFn) {
  return [...(countsMap || new Map()).entries()]
    .map(([id, count]) => ({
      id,
      label: labelFn(id) || id,
      count,
      pct:
        sessionCount > 0 ? Math.round((count / sessionCount) * 100) : 0,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.pct - a.pct ||
        a.label.localeCompare(b.label, "ko"),
    );
}

function buildSleepRecipeKeepOneLiner(tags, fiveStarCount) {
  if (!fiveStarCount) {
    return "수면 평가 5점을 주고 「잘 잔 이유」를 고르면 수면 레시피가 채워집니다.";
  }
  if (!tags.length) {
    return `5점 수면 ${fiveStarCount}건 — 기록할 때 「잘 잔 이유」를 골라 주세요.`;
  }
  const top = tags.slice(0, 3);
  const parts = top.map((t) => `「${t.label}」 ${t.pct}%`);
  return `5점 ${fiveStarCount}건 중 ${parts.join(" · ")}`;
}

function buildSleepRecipeAvoidOneLiner(tags, poorRatedCount) {
  if (!poorRatedCount) {
    return "1~3점 수면이 쌓이면 피하면 좋은 조건이 보입니다.";
  }
  if (!tags.length) {
    return `1~3점 수면 ${poorRatedCount}건 — 「아쉬웠던 이유」를 고르면 피할 항목이 정리됩니다.`;
  }
  const top = tags[0];
  if (!top) return "";
  if (tags.length === 1) {
    return `가장 많은 아쉬움은 「${top.label}」입니다 (${top.count}회).`;
  }
  const second = tags[1];
  if (second && top.count === second.count) {
    return `「${top.label}」·「${second.label}」이(가) 자주 겹칩니다.`;
  }
  return `가장 많은 아쉬움은 「${top.label}」입니다 (${top.count}회 · ${top.pct}%).`;
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
function buildSleepReportSnapshot(rows, range, allRows) {
  const dates = listDatesInclusive(range.start, range.end);
  const recordsByDate = collectSleepRecordsByDate(
    sleepRowsForReportContext(range, allRows),
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
    const goodFactors = [];
    const poorReasons = [];
    dayRecs.forEach((rec) => {
      if (rec.rating === 5) goodFactors.push(...(rec.goodFactors || []));
      /* 모달 shouldCollectTimeSleepPoorReasons(1~3)와 동일 */
      if (rec.rating === 1 || rec.rating === 2 || rec.rating === 3) {
        poorReasons.push(...(rec.poorReasons || []));
      }
    });
    return {
      date,
      minutes,
      bedtimeMin,
      wakeMin,
      rating,
      goodFactors: normalizeTimeSleepGoodFactorsForRow(goodFactors),
      poorReasons: normalizeTimeSleepPoorReasonsForRow(poorReasons),
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

  /** @type {Map<string, number>} */
  const goodCounts = new Map();
  /** @type {Map<string, number>} */
  const poorCounts = new Map();
  let fiveStarCount = 0;
  let poorRatedCount = 0;
  dates.forEach((date) => {
    const dayRecs = recordsByDate.get(date) || [];
    dayRecs.forEach((rec) => {
      if (rec.rating === 5) {
        fiveStarCount += 1;
        const seen = new Set();
        for (const id of rec.goodFactors || []) {
          if (!id || seen.has(id)) continue;
          seen.add(id);
          goodCounts.set(id, (goodCounts.get(id) || 0) + 1);
        }
      } else if (
        rec.rating === 1 ||
        rec.rating === 2 ||
        rec.rating === 3
      ) {
        poorRatedCount += 1;
        const seen = new Set();
        for (const id of rec.poorReasons || []) {
          if (!id || seen.has(id)) continue;
          seen.add(id);
          poorCounts.set(id, (poorCounts.get(id) || 0) + 1);
        }
      }
    });
  });

  const goodFactorRanking = buildSleepRecipeTagRanking(
    goodCounts,
    fiveStarCount,
    timeSleepGoodFactorLabelForId,
  );
  const poorReasonRanking = buildSleepRecipeTagRanking(
    poorCounts,
    poorRatedCount,
    timeSleepPoorReasonLabelForId,
  );
  const sleepRecipe = {
    keepTags: goodFactorRanking,
    avoidTags: poorReasonRanking,
    keepOneLiner: buildSleepRecipeKeepOneLiner(
      goodFactorRanking,
      fiveStarCount,
    ),
    avoidOneLiner: buildSleepRecipeAvoidOneLiner(
      poorReasonRanking,
      poorRatedCount,
    ),
  };

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
    fiveStarCount,
    poorRatedCount,
    goodFactorRanking,
    poorReasonRanking,
    sleepRecipe,
    avgDurationMinutes: daysWithSleep.length
      ? Math.round(total / daysWithSleep.length)
      : 0,
    metDays,
  };
}

function buildSleepFactorChipRow(labels, emptyText) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-sleep-factor-chips";
  const list = (labels || []).filter(Boolean);
  if (!list.length) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = emptyText;
    wrap.appendChild(note);
    return wrap;
  }
  list.forEach((label) => {
    const chip = document.createElement("span");
    chip.className = "lp-tr2-sleep-factor-chip";
    chip.textContent = label;
    wrap.appendChild(chip);
  });
  return wrap;
}

/** 주·달·년 — 수면 레시피(잘 잔 조건 + 피하면 좋은 조건) */
function mountSleepRecipeBlock(sec, snap) {
  const recipe = snap?.sleepRecipe;
  if (!recipe) return;

  const recipeBlock = createRatingBlock(
    "수면 레시피",
    "잘 잔 날의 조건 · 다음에 다시 만들기",
  );

  const summaryParts = [];
  if (snap.bestSleepEstimate) {
    summaryParts.push(
      `추천 수면 ${formatIntegerMinutesDurationKo(snap.bestSleepEstimate.minutes)}`,
    );
  }
  if (snap.avgBedtime != null) {
    summaryParts.push(
      `평균 취침 ${formatClockFromMinutes(snap.avgBedtime)}`,
    );
  }
  if (snap.avgQuality != null) {
    summaryParts.push(`평균 평가 ${Number(snap.avgQuality).toFixed(1)}점`);
  }
  if (summaryParts.length) {
    const summary = document.createElement("p");
    summary.className = "lp-tr2-focus-disruptor-insight";
    summary.textContent = summaryParts.join(" · ");
    recipeBlock.appendChild(summary);
  }

  recipeBlock.appendChild(
    createFocusSubheading(
      "이럴 때 잘 잤음",
      "5점일 때 고른 요소 · 해당 수면에서 자주 함께 있던 순",
    ),
  );
  if (recipe.keepTags?.length) {
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars lp-tr2-bars--sleep-recipe";
    recipe.keepTags.slice(0, 6).forEach((item) => {
      bars.appendChild(createFocusRecipeTagRow(item));
    });
    recipeBlock.appendChild(bars);
  } else {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = recipe.keepOneLiner;
    recipeBlock.appendChild(note);
  }

  recipeBlock.appendChild(
    createFocusSubheading(
      "이럴 때 아쉬웠음",
      "1~3점일 때 고른 아쉬웠던 이유 · 다음에 줄이면 좋은 조건",
    ),
  );
  const avoidInsight = document.createElement("p");
  avoidInsight.className = "lp-tr2-focus-disruptor-insight";
  avoidInsight.textContent = recipe.avoidOneLiner;
  recipeBlock.appendChild(avoidInsight);
  if (recipe.avoidTags?.length) {
    const maxCount = recipe.avoidTags[0]?.count || 1;
    const bars = document.createElement("div");
    /* compact(라벨 2.5rem) 금지 — 이유 문구가 잘림 */
    bars.className = "lp-tr2-bars lp-tr2-bars--sleep-recipe";
    recipe.avoidTags.slice(0, 6).forEach((item, i) => {
      bars.appendChild(
        createFocusDisruptorBarRow(
          `${i + 1}. ${item.label}`,
          Math.round((item.count / maxCount) * 100),
          `${item.count}회 · ${item.pct}%`,
          "#8B5C3A",
        ),
      );
    });
    recipeBlock.appendChild(bars);
  }

  sec.appendChild(recipeBlock);
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
    );
    addStat("기상", day.wakeMin != null ? formatClockFromMinutes(day.wakeMin) : "—");
    addStat(
      "수면 품질",
      day.rating != null ? createSleepRatingStarsEl(day.rating) : "—",
      "",
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
  );
  addStat(
    "평균 품질",
    snap.avgQuality != null
      ? createSleepRatingStarsEl(snap.avgQuality, { showScore: true })
      : "—",
    "",
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

/** @param {Array<{main:string}>} items */
function formatIntakeDayLine(items) {
  return items
    .map((item) => String(item.main || "").trim())
    .filter(Boolean)
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

/**
 * 섭취 로그 — 목록은 식단명(mealDetail)만.
 * healthyCount/unhealthyCount = 조회 기간 기록 건수(식단명 없어도 집계).
 */
function collectIntakeLogs(rows) {
  /** @type {{ date: string, main: string, sub: string, rating: number|null }[]} */
  const healthy = [];
  /** @type {{ date: string, main: string, sub: string, rating: number|null }[]} */
  const unhealthy = [];
  let healthyCount = 0;
  let unhealthyCount = 0;
  rows.forEach((r) => {
    const tn = String(r.taskName || "").trim();
    const date = rowDateYmd(r);
    if (!date) return;
    const isHealthy = isHealthyMealDetailTaskName(tn);
    const isUnhealthy = isUnhealthyMealDetailTaskName(tn);
    if (!isHealthy && !isUnhealthy) return;
    if (isHealthy) healthyCount += 1;
    else unhealthyCount += 1;
    const md = String(r.mealDetail || "").trim();
    if (!md) return;
    const entry = {
      date,
      main: md,
      sub: "",
      rating: normalizeTimeRatingForRow(r.timeRating),
    };
    if (isHealthy) healthy.push(entry);
    else unhealthy.push(entry);
  });
  const sortDesc = (a, b) =>
    b.date.localeCompare(a.date) || a.main.localeCompare(b.main, "ko");
  healthy.sort(sortDesc);
  unhealthy.sort(sortDesc);
  return { healthy, unhealthy, healthyCount, unhealthyCount };
}

/** 건강·비건강 섭취 건수 비율 — 한 줄 가로 막대 */
function renderIntakeHealthRatioBar(healthyCount, unhealthyCount) {
  const h = Math.max(0, Math.round(Number(healthyCount) || 0));
  const u = Math.max(0, Math.round(Number(unhealthyCount) || 0));
  const total = h + u;
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-intake-ratio-bar";
  if (total <= 0) return wrap;

  const hPct = Math.round((h / total) * 100);
  const uPct = 100 - hPct;

  const head = document.createElement("div");
  head.className = "lp-tr2-intake-ratio-bar-head";
  const left = document.createElement("span");
  left.className = "lp-tr2-intake-ratio-bar-head-healthy";
  left.textContent = `건강한 섭취 ${h}건`;
  const right = document.createElement("span");
  right.className = "lp-tr2-intake-ratio-bar-head-unhealthy";
  right.textContent = `비건강 ${u}건`;
  head.append(left, right);

  const track = document.createElement("div");
  track.className = "lp-tr2-intake-ratio-bar-track";
  track.setAttribute(
    "aria-label",
    `건강한 섭취 ${h}건(${hPct}%), 건강하지 않은 섭취 ${u}건(${uPct}%)`,
  );
  if (h > 0) {
    const fillH = document.createElement("div");
    fillH.className = "lp-tr2-intake-ratio-bar-fill lp-tr2-intake-ratio-bar-fill--healthy";
    fillH.style.width = `${hPct}%`;
    fillH.title = `건강한 섭취 ${h}건 · ${hPct}%`;
    track.appendChild(fillH);
  }
  if (u > 0) {
    const fillU = document.createElement("div");
    fillU.className =
      "lp-tr2-intake-ratio-bar-fill lp-tr2-intake-ratio-bar-fill--unhealthy";
    fillU.style.width = `${uPct}%`;
    fillU.title = `건강하지 않은 섭취 ${u}건 · ${uPct}%`;
    track.appendChild(fillU);
  }

  const foot = document.createElement("p");
  foot.className = "lp-tr2-intake-ratio-bar-foot";
  if (h === u) {
    foot.textContent = `이 기간 건강·비건강 섭취 기록이 같습니다 (${hPct}% · ${uPct}%)`;
  } else if (h > u) {
    foot.textContent = `이 기간에는 건강한 섭취 기록이 더 많습니다 (${hPct}%)`;
  } else {
    foot.textContent = `이 기간에는 건강하지 않은 섭취 기록이 더 많습니다 (${uPct}%)`;
  }

  wrap.append(head, track, foot);
  return wrap;
}

/** 하루 = 0:00~23:59(1439분) — DAY_LENGTH_MINUTES 와 동일 */
const AVAIL_DAY_LENGTH_MINUTES = 23 * 60 + 59;

/** rows 한 번으로 날짜별 가용분(하루 − 근무 − 수면) 맵 */
function buildAvailableMinutesByDate(rows) {
  /** @type {Map<string, { work: number, sleep: number }>} */
  const byDate = new Map();
  (rows || []).forEach((r) => {
    const d = rowDateYmd(r);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const hrs = parseTimeToHours(r.timeTracked);
    if (!(hrs > 0) || !Number.isFinite(hrs)) return;
    const cat = String(r.category || "")
      .trim()
      .toLowerCase();
    if (cat !== "work" && cat !== "sleep") return;
    if (!byDate.has(d)) byDate.set(d, { work: 0, sleep: 0 });
    const day = byDate.get(d);
    if (cat === "work") day.work += hrs * 60;
    else day.sleep += hrs * 60;
  });
  /** @type {Map<string, number>} */
  const avail = new Map();
  byDate.forEach((u, d) => {
    avail.set(
      d,
      Math.max(0, Math.round(AVAIL_DAY_LENGTH_MINUTES - u.work - u.sleep)),
    );
  });
  return avail;
}

function getDayAvailableMinutes(ymd, availByDate) {
  if (availByDate instanceof Map && availByDate.has(ymd)) {
    return availByDate.get(ymd) || 0;
  }
  if (availByDate instanceof Map) {
    /* 해당일 근무·수면 없으면 하루 전체 가용 */
    return AVAIL_DAY_LENGTH_MINUTES;
  }
  const s = getTimeReportSummaryGridForDateRange(ymd, ymd);
  return Math.max(
    0,
    Math.round(AVAIL_DAY_LENGTH_MINUTES - s.workMinutes - s.sleepMinutes),
  );
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

/** 연간 미디어 트리맵 — 콘텐츠별 소프트 톤 */
const MEDIA_CONTENT_TREEMAP_COLORS = [
  "#C5D4E8",
  "#E8C4C4",
  "#D0E4F5",
  "#F3E4CC",
  "#DDD6F0",
  "#D0EBD8",
  "#F5DCE4",
  "#D8DCE8",
  "#E8D6E0",
  "#D0EBE2",
  "#E0E6EE",
];

/** 연간 미디어 — 콘텐츠 종류별 트리맵 */
function buildMediaTreemapItems(snap) {
  return (snap?.contentTags || [])
    .filter((t) => (Number(t.minutes) || 0) > 0)
    .map((t) => ({
      name: String(t.label || "(미선택)").trim() || "(미선택)",
      minutes: Math.round(Number(t.minutes) || 0),
    }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "ko"));
}

function renderMediaContentTreemap(items) {
  const layout = layoutMonthTaskTreemap(items);
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-media-treemap";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "콘텐츠 종류별 소비 시간");

  const board = document.createElement("div");
  board.className = "lp-tr2-media-treemap-board";
  const colorByName = new Map();
  items.forEach((it, idx) => {
    colorByName.set(
      it.name,
      MEDIA_CONTENT_TREEMAP_COLORS[idx % MEDIA_CONTENT_TREEMAP_COLORS.length],
    );
  });
  const GAP_RATIO = 0.012;

  layout.forEach((cell) => {
    const gapW = Math.min(0.55, cell.w * GAP_RATIO);
    const gapH = Math.min(0.55, cell.h * GAP_RATIO);
    const w = Math.max(0, cell.w - gapW);
    const h = Math.max(0, cell.h - gapH);
    const el = document.createElement("div");
    el.className = "lp-tr2-media-treemap-cell";
    el.style.left = `${cell.x + gapW / 2}%`;
    el.style.top = `${cell.y + gapH / 2}%`;
    el.style.width = `${w}%`;
    el.style.height = `${h}%`;
    el.style.background =
      colorByName.get(cell.name) || MEDIA_CONTENT_TREEMAP_COLORS[0];
    const metaText = `${formatIntegerMinutesDurationKo(cell.minutes)} · ${cell.pct}%`;
    el.title = `${cell.name} · ${metaText}`;

    const minSide = Math.min(w, h);
    if (minSide < 22 || h < 16 || w < 18) el.classList.add("is-compact");
    if (minSide < 12 || h < 9 || w < 11) el.classList.add("is-tiny");
    if (h < 8 && w >= 8) el.classList.add("is-strip");
    if (h < 6.5 || (h < 9 && w < 10)) el.classList.add("is-meta-hidden");
    if (minSide < 2.8 || (h < 2.4 && w < 4)) el.classList.add("is-micro");

    const nameFs = Math.max(
      0.375,
      Math.min(0.95, 0.26 + minSide * 0.034),
    );
    const metaFs = Math.max(
      0.34,
      Math.min(0.8, 0.22 + minSide * 0.028),
    );
    el.style.setProperty("--tm-name-fs", `${nameFs.toFixed(3)}rem`);
    el.style.setProperty("--tm-meta-fs", `${metaFs.toFixed(3)}rem`);

    const name = document.createElement("span");
    name.className = "lp-tr2-media-treemap-name";
    name.textContent = cell.name;
    const meta = document.createElement("span");
    meta.className = "lp-tr2-media-treemap-meta";
    meta.textContent = metaText;
    el.append(name, meta);
    board.appendChild(el);
  });

  wrap.appendChild(board);
  return wrap;
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

/** 일간: 의식적·무의식적 콘텐츠 소비 한 건씩 (종류·후기) */
function collectMediaDayEntries(rows) {
  /** @type {{ kind: "conscious"|"unconscious", startMin: number|null, startLabel: string, minutes: number, contentLabels: string[], memo: string }[]} */
  const entries = [];
  for (const r of rows || []) {
    const kind = mediaContentKind(r);
    if (!kind) continue;
    const minutes = rowMinutes(r);
    if (!(minutes > 0)) continue;
    const startMin = parseRowClockMinutes(r.startTime);
    const startLabel =
      startMin != null ? formatClockFromMinutes(startMin) : "";
    const contentLabels = rowContentLabels(r)
      .map((label) => contentTypeReportLabel(label) || String(label || "").trim())
      .filter(Boolean);
    entries.push({
      kind,
      startMin,
      startLabel,
      minutes,
      contentLabels,
      memo: ledgerRowUserMemoFeedback(r),
    });
  }
  entries.sort((a, b) => {
    const am = a.startMin == null ? 99 * 60 : a.startMin;
    const bm = b.startMin == null ? 99 * 60 : b.startMin;
    return am - bm;
  });
  return entries;
}

function appendMediaDayJournalEntryRow(tbody, e) {
  const tr = document.createElement("tr");
  tr.className = `lp-tr2-media-day-table-row lp-tr2-media-day-table-row--${e.kind}`;

  const timeTd = document.createElement("td");
  timeTd.className = "lp-tr2-media-day-table-time";
  const startLabel = String(e.startLabel || "").trim();
  const durLabel =
    e.minutes > 0 ? formatIntegerMinutesDurationKo(e.minutes) : "";
  if (startLabel || durLabel) {
    if (startLabel) {
      const startEl = document.createElement("span");
      startEl.className = "lp-tr2-media-day-table-time-start";
      startEl.textContent = startLabel;
      timeTd.appendChild(startEl);
    }
    if (durLabel) {
      const durEl = document.createElement("span");
      durEl.className = "lp-tr2-media-day-table-time-dur";
      durEl.textContent = durLabel;
      timeTd.appendChild(durEl);
    }
  } else {
    timeTd.textContent = "—";
  }

  const contentTd = document.createElement("td");
  contentTd.className = "lp-tr2-media-day-table-content";
  if (e.contentLabels.length) {
    contentTd.textContent = e.contentLabels.join(" · ");
  } else {
    contentTd.textContent = "종류 미선택";
    contentTd.classList.add("is-empty");
  }

  const memoTd = document.createElement("td");
  memoTd.className = "lp-tr2-media-day-table-memo";
  if (e.memo) {
    memoTd.textContent = e.memo;
  } else {
    memoTd.textContent = "후기 없음";
    memoTd.classList.add("is-empty");
  }

  tr.append(timeTd, contentTd, memoTd);
  tbody.appendChild(tr);
}

/** 구분 열 없이 의식적·무의식적 구역으로 나눔 (후기 가로 공간 확보) */
function renderMediaDayJournal(entries) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-media-day-journal";
  const title = document.createElement("p");
  title.className = "lp-tr2-media-day-journal-title";
  title.textContent = "이날의 콘텐츠 기록";
  wrap.appendChild(title);

  if (!entries?.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "표시할 콘텐츠 기록이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  const groups = [
    {
      kind: "conscious",
      label: "의식적",
      rows: entries.filter((e) => e.kind === "conscious"),
    },
    {
      kind: "unconscious",
      label: "무의식적",
      rows: entries.filter((e) => e.kind === "unconscious"),
    },
  ];

  for (const group of groups) {
    if (!group.rows.length) continue;
    const block = document.createElement("section");
    block.className = `lp-tr2-media-day-kind-section lp-tr2-media-day-kind-section--${group.kind}`;
    block.setAttribute("aria-label", group.label);

    const head = document.createElement("p");
    head.className = "lp-tr2-media-day-kind-section-title";
    head.textContent = group.label;
    block.appendChild(head);

    const table = document.createElement("table");
    table.className = "lp-tr2-media-day-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["시간", "콘텐츠", "후기"].forEach((label) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = document.createElement("tbody");
    group.rows.forEach((e) => appendMediaDayJournalEntryRow(tbody, e));
    table.append(thead, tbody);
    block.appendChild(table);
    wrap.appendChild(block);
  }

  return wrap;
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
  const availByDate = buildAvailableMinutesByDate(rows);

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
      const avail = getDayAvailableMinutes(date, availByDate);
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
    contentTags: aggregateContentTypesFromEntries(
      [...consciousEntriesAll, ...unconsciousEntriesAll],
      totalMinutes,
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
  cols.setAttribute("aria-label", "날짜별 의식적·무의식적 미디어 소비 비교");

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
    const emotion = document.createElement("span");
    emotion.className = "lp-tr2-emotion-day-item-emotion-chip";
    emotion.textContent =
      e.subLabel && e.subLabel !== e.categoryLabel
        ? e.subLabel
        : e.categoryLabel;
    emotion.style.setProperty(
      "--lp-emotion-chip",
      getEmotionCategoryChartColor(e.categoryId),
    );
    const meta = document.createElement("span");
    meta.className = "lp-tr2-emotion-day-item-meta";
    const metaParts = [
      e.subLabel && e.subLabel !== e.categoryLabel ? e.categoryLabel : null,
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
      const parsed = parseEmotionReflectMemo(e.memo);
      const showSplit =
        e.polarity !== "positive" &&
        (parsed.isStructured || parsed.fact || parsed.interpretation);
      if (showSplit && (parsed.fact || parsed.interpretation)) {
        const table = document.createElement("table");
        table.className = "lp-tr2-emotion-day-item-reflect-table";
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        const tbody = document.createElement("tbody");
        const bodyRow = document.createElement("tr");
        const addCol = (label, body) => {
          const th = document.createElement("th");
          th.scope = "col";
          th.textContent = label;
          headRow.appendChild(th);
          const td = document.createElement("td");
          td.textContent = body;
          bodyRow.appendChild(td);
        };
        if (parsed.fact) addCol("사실", parsed.fact);
        if (parsed.interpretation) addCol("해석", parsed.interpretation);
        thead.appendChild(headRow);
        tbody.appendChild(bodyRow);
        table.append(thead, tbody);
        li.appendChild(table);
      } else {
        const memo = document.createElement("p");
        memo.className = "lp-tr2-emotion-day-item-memo";
        memo.textContent = e.memo;
        li.appendChild(memo);
      }
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

function appendEmotionPolaritySection(
  scrollWrap,
  range,
  rows,
  polarity,
  hourlyRate,
  pairedSnap,
  prebuiltSnap = null,
) {
  const isPositive = polarity === "positive";
  const snap =
    prebuiltSnap ||
    buildEmotionReportSnapshot(rows, hourlyRate, { polarity });
  const isDay = range.start === range.end;
  const dayCount = listDatesInclusive(range.start, range.end).length;
  const isWeekView = !isDay && dayCount > 1 && dayCount <= 8;
  const sec = createSection(
    isPositive ? "감정 상태 (긍정)" : "감정 상태 (부정)",
    isDay
      ? isPositive
        ? "이날 느낀 긍정 감정과 남긴 메모"
        : "이날 느낀 부정 감정과 남긴 메모"
      : isPositive
        ? "기록으로 보는 「언제 긍정 감정을 느끼는지」 패턴"
        : "기록으로 보는 「언제·어떤 트리거가 부정 감정을 부르는지」 패턴",
  );

  if (!snap.hasData) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      snap.legacyCount > 0
        ? "이 기간에 새 방식 기록이 없습니다. 예전 1~5점 기록만 있습니다."
        : isPositive
          ? "이 기간에 감정적이기 (긍정적) 기록이 없습니다."
          : "이 기간에 감정적이기 (부정적) 기록이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "lp-tr2-card-grid";
  hero.appendChild(
    createStatCard(
      isPositive ? "긍정 감정 시간" : "부정 감정 시간",
      formatIntegerMinutesDurationKo(snap.consumptionMinutes),
      snap.consumptionCount > 0 ? `기록 ${snap.consumptionCount}건` : "",
    ),
  );
  hero.appendChild(
    createStatCard(
      isPositive ? "긍정 감정 가치" : "감정 소비 비용",
      snap.consumptionCostWon > 0
        ? isPositive
          ? formatInvestReclaimWonDisplay(snap.consumptionCostWon)
          : formatLedgerLossKrwDisplay(snap.consumptionCostWon)
        : hourlyRate > 0
          ? isPositive
            ? "+₩0"
            : "₩0"
          : "—",
      hourlyRate > 0
        ? isPositive
          ? "설정한 시급 × 긍정 감정 시간"
          : "설정한 시급 × 부정 감정 시간"
        : "나의 계정에서 시급을 넣으면 표시됩니다",
      isPositive && snap.consumptionCostWon > 0 ? "pos" : "",
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
      isPositive
        ? "0시~24시 · 색=감정 · 길이는 기록 시간"
        : "0시~24시 · 색=감정 대분류 · 길이는 기록 시간",
    );
    timeBlock.appendChild(renderEmotionDayTimeline(snap.entries || []));
    sec.appendChild(timeBlock);
    sec.appendChild(renderEmotionDayJournal(snap.entries || []));
    scrollWrap.appendChild(sec);
    return;
  }

  if (!isPositive) {
    const summaryBlock = createRatingBlock(
      "1. 이번 기간 한 줄",
      "부정·긍정 횟수와 가장 반복된 패턴",
    );
    summaryBlock.appendChild(
      renderEmotionPeriodSummaryLine(snap, pairedSnap),
    );
    sec.appendChild(summaryBlock);

    const patternBlock = createRatingBlock(
      "2. 부정 감정 패턴",
      "언제·어떤 트리거가 부정 감정을 부르는지 (기록 기준)",
    );
    patternBlock.appendChild(renderEmotionSituationPatterns(snap));
    sec.appendChild(patternBlock);

    const distBlock = createRatingBlock(
      "3. 감정 분포",
      "부정 감정이 어떤 종류로 나뉘는지",
    );
    distBlock.appendChild(renderEmotionDistributionTable(snap));
    sec.appendChild(distBlock);

    const freqRow = document.createElement("div");
    freqRow.className = "lp-tr2-emotion-freq-row";
    const emotionPieBlock = createRatingBlock(
      "부정 감정 빈도",
      "조각 = 기록 횟수 비중",
    );
    emotionPieBlock.appendChild(renderEmotionCategoryDonut(snap));
    freqRow.appendChild(emotionPieBlock);
    if (snap.triggerCategories?.length || snap.triggers?.length) {
      const sitPieBlock = createRatingBlock(
        "트리거 대분류 빈도",
        "사람 · 일 · 나 자신 · 몸 · 외부 상황",
      );
      sitPieBlock.appendChild(renderEmotionTriggerDonut(snap));
      freqRow.appendChild(sitPieBlock);
    }
    sec.appendChild(freqRow);
  } else {
    const patternBlock = createRatingBlock(
      "1. 긍정 감정 패턴",
      "어떤 때·무엇 때문에 긍정 감정을 느끼는지 (기록·메모 기준)",
    );
    patternBlock.appendChild(renderEmotionSituationPatterns(snap));
    sec.appendChild(patternBlock);

    const distBlock = createRatingBlock(
      "2. 긍정 감정 분포",
      "횟수와 시간",
    );
    distBlock.appendChild(renderEmotionDistributionTable(snap));
    sec.appendChild(distBlock);

    const emotionPieBlock = createRatingBlock(
      "긍정 감정 빈도",
      "조각 = 기록 횟수 비중",
    );
    emotionPieBlock.appendChild(renderEmotionCategoryDonut(snap));
    sec.appendChild(emotionPieBlock);
  }

  if (!isPositive && !isWeekView && snap.subEmotions?.length) {
    const subBlock = createRatingBlock(
      "세부 감정 Top 5",
      "가장 자주 기록된 세부 감정",
    );
    subBlock.appendChild(renderEmotionSubEmotionBars(snap));
    sec.appendChild(subBlock);
  }

  scrollWrap.appendChild(sec);
}

function mountEmotionSection(scrollWrap, range, rows) {
  const hourlyRate = readReportHourlyRateNumber();
  const negSnap = buildEmotionReportSnapshot(rows, hourlyRate, {
    polarity: "negative",
  });
  const posSnap = buildEmotionReportSnapshot(rows, hourlyRate, {
    polarity: "positive",
  });
  appendEmotionPolaritySection(
    scrollWrap,
    range,
    rows,
    "negative",
    hourlyRate,
    posSnap,
    negSnap,
  );
  appendEmotionPolaritySection(
    scrollWrap,
    range,
    rows,
    "positive",
    hourlyRate,
    null,
    posSnap,
  );
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

  const accomplished = renderMoveAccomplishedBlock(snap);
  if (accomplished) wrap.appendChild(accomplished);
  return wrap;
}

/** 이동 루틴에서 체크한 매일할일 — 이동하면서 이뤄낸 것들 */
function renderMoveAccomplishedBlock(snap) {
  const items = Array.isArray(snap?.accomplishedItems)
    ? snap.accomplishedItems
    : [];
  if (!items.length) return null;

  const block = document.createElement("div");
  block.className = "lp-tr2-move-accomplished";
  const title = document.createElement("p");
  title.className = "lp-tr2-move-accomplished-title";
  title.textContent = "이동하면서 이뤄낸 것들";
  const sub = document.createElement("p");
  sub.className = "lp-tr2-move-accomplished-sub";
  sub.textContent = "이동 루틴에서 체크한 매일할일 · 그 이동에 쓴 시간";
  block.append(title, sub);

  const list = document.createElement("ul");
  list.className = "lp-tr2-move-accomplished-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "lp-tr2-move-accomplished-item";
    const check = document.createElement("span");
    check.className = "lp-tr2-move-accomplished-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    const name = document.createElement("span");
    name.className = "lp-tr2-move-accomplished-name";
    name.textContent = item.text;
    const dur = document.createElement("span");
    dur.className = "lp-tr2-move-accomplished-dur";
    dur.textContent = formatIntegerMinutesDurationKo(item.minutes);
    li.append(check, name, dur);
    list.appendChild(li);
  });
  block.appendChild(list);
  return block;
}

function mountMoveSection(scrollWrap, range, rows) {
  const snap = buildMoveReportSnapshot(rows, range);
  const isDay = range.start === range.end;
  const sec = createSection(
    "이동 시간",
    isDay
      ? "이동시간 가용율 · 이동하면서 이뤄낸 것들"
      : "이동 루틴 · 단순 이동 · 이동하면서 이뤄낸 것들",
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

  const accomplished = renderMoveAccomplishedBlock(snap);
  if (accomplished) sec.appendChild(accomplished);

  const grid = document.createElement("div");
  grid.className = "lp-tr2-card-grid lp-tr2-card-grid--move";
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

function formatHappinessRoutineDurationLabel(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m <= 0) return "—";
  return formatIntegerMinutesDurationKo(m);
}

function appendHappinessRoutineDayView(sec, snap) {
  const routines = [...(snap.routines || [])];
  if (!routines.length) return;
  for (const routine of routines) {
    const dur = formatHappinessRoutineDurationLabel(routine.totalMinutes);
    appendHappinessRoutinePeriodCard(sec, routine, {
      subText: `소요 ${dur} · 체크 ${routine.totalChecks}/${routine.totalOpportunities}`,
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
    const avgDur = formatHappinessRoutineDurationLabel(routine.avgMinutes);
    appendHappinessRoutinePeriodCard(sec, routine, {
      subText: `평균 ${avgDur} · ${done}/${span}일`,
      missedTitle: "평균적으로 잘 안 지킨",
      keptTitle: "평균적으로 잘 지킨",
      missedItems: weak,
      keptItems: strong,
      badgeKind,
    });
  }
}

function mountYearKpiGoalReportSection(scrollWrap, range, rows) {
  const dayCount = listDatesInclusive(range?.start, range?.end).length;
  if (dayCount < 300) return;

  const snap = buildYearKpiGoalReportSnapshot(range, rows);
  const sec = createSection(
    "목표 레포트",
    "KPI별 올해 달성 · 100% 완료 · 잡무·할일 처리",
  );

  if (!snap.hasData) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "올해 집계할 KPI가 없거나, 아직 진행·기록이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  const s = snap.summary;
  const grid = document.createElement("div");
  grid.className = "lp-tr2-card-grid lp-tr2-year-kpi-summary-grid";
  grid.appendChild(
    createStatCard(
      "100% 달성",
      `${s.completedCount}개`,
      `전체 ${s.totalKpis}개 KPI 중`,
    ),
  );
  grid.appendChild(
    createStatCard(
      "평균 달성률",
      `${s.avgProgressPct}%`,
      "잡무 제외 · 진행률 있는 KPI",
    ),
  );
  grid.appendChild(
    createStatCard(
      "잡무 처리",
      `${s.choreYearCount}건`,
      "올해 완료한 잡무",
    ),
  );
  grid.appendChild(
    createStatCard(
      "할일 완료",
      `${s.taskCompletionsYear}건`,
      "태스크완료형 KPI 합계",
    ),
  );
  sec.appendChild(grid);

  if (snap.byCategory.length) {
    const catBlock = createRatingBlock(
      "카테고리별 달성",
      "꿈 · 시급 · 행복 · 건강",
    );
    const catList = document.createElement("div");
    catList.className = "lp-tr2-year-kpi-cat-list";
    snap.byCategory.forEach((c) => {
      const row = document.createElement("div");
      row.className = "lp-tr2-year-kpi-cat-row";
      const lab = document.createElement("span");
      lab.className = "lp-tr2-year-kpi-cat-name";
      lab.textContent = c.category;
      const meta = document.createElement("span");
      meta.className = "lp-tr2-year-kpi-cat-meta";
      meta.textContent = `완료 ${c.completed}/${c.total} · 평균 ${c.avgProgressPct}%`;
      row.append(lab, meta);
      catList.appendChild(row);
    });
    catBlock.appendChild(catList);
    sec.appendChild(catBlock);
  }

  const doneBlock = createRatingBlock(
    "100% 달성한 KPI",
    "목표를 끝낸 과제명",
  );
  if (snap.completedItems.length) {
    const ul = document.createElement("ul");
    ul.className = "lp-tr2-year-kpi-name-list";
    snap.completedItems.forEach((item) => {
      const li = document.createElement("li");
      li.className = "lp-tr2-year-kpi-name-item";
      const name = document.createElement("span");
      name.className = "lp-tr2-year-kpi-name-text";
      name.textContent = item.name;
      const tag = document.createElement("span");
      tag.className = "lp-tr2-year-kpi-name-tag";
      tag.textContent = `${item.category} · ${item.modeLabel}`;
      li.append(name, tag);
      ul.appendChild(li);
    });
    doneBlock.appendChild(ul);
  } else {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "아직 100% 달성한 KPI가 없습니다.";
    doneBlock.appendChild(empty);
  }
  sec.appendChild(doneBlock);

  const allBlock = createRatingBlock(
    "KPI별 목표 달성",
    "진행률 · 올해 기록 요약",
  );
  const list = document.createElement("div");
  list.className = "lp-tr2-year-kpi-progress-list";
  snap.progressItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "lp-tr2-year-kpi-progress-row";
    if (item.completed) row.classList.add("is-done");

    const head = document.createElement("div");
    head.className = "lp-tr2-year-kpi-progress-head";
    const name = document.createElement("span");
    name.className = "lp-tr2-year-kpi-progress-name";
    name.textContent = item.name;
    const pct = document.createElement("span");
    pct.className = "lp-tr2-year-kpi-progress-pct";
    pct.textContent =
      item.progressPct == null
        ? item.isChore
          ? `${item.yearTaskCount}건`
          : "—"
        : `${item.progressPct}%`;
    head.append(name, pct);

    const meta = document.createElement("p");
    meta.className = "lp-tr2-year-kpi-progress-meta";
    meta.textContent = `${item.category} · ${item.modeLabel} · ${item.meta}`;

    row.append(head, meta);

    if (item.progressPct != null) {
      const track = document.createElement("div");
      track.className = "lp-tr2-year-kpi-progress-track";
      const fill = document.createElement("div");
      fill.className = "lp-tr2-year-kpi-progress-fill";
      if (item.completed) fill.classList.add("is-done");
      fill.style.width = `${Math.min(100, Math.max(0, item.progressPct))}%`;
      track.appendChild(fill);
      row.appendChild(track);
    }

    list.appendChild(row);
  });
  allBlock.appendChild(list);
  sec.appendChild(allBlock);

  scrollWrap.appendChild(sec);
}

/** 콘텐츠·미디어 소비·독서와 행복 루틴 사이 — 전체 매일 KPI 습관 점검 구역 */
function mountHabitCheckSection(scrollWrap, range, opts = {}) {
  const isDay = range?.start === range?.end;
  const dayCount = listDatesInclusive(range?.start, range?.end).length;
  const isYear = !isDay && dayCount >= 300;
  const sec = createSection(
    isDay ? "오늘의 행동" : "습관 점검",
    isDay
      ? "그날 하기로 한 것 · 안 한 것 / 한 것"
      : isYear
        ? "습관별 지킨 날 · 실행률"
        : dayCount <= 10
          ? `${dayCount}일 습관 점수판 · 지킨 날 수`
          : "기간 습관 점수판 · 지킨 날 수",
  );
  mountReportHabitScoreboard(sec, range, { skipSync: !!opts.skipSync });
  scrollWrap.appendChild(sec);
}

function mountHappinessRoutineSection(scrollWrap, range, opts = {}) {
  const isDay = range?.start === range?.end;

  const snap = buildHappinessRoutineReportSnapshot(range, {
    skipSync: !!opts.skipSync,
  });
  const dayCount = snap.calendarDayCount || 0;
  const sec = createSection(
    "행복 루틴 점검",
    isDay
      ? "루틴별 소요시간 · 실행율 · 안 지켜진 / 지켜진 매일할일"
      : `${dayCount}일 · 루틴별 평균 소요 · 매일할일 잘 지킨/안 지킨`,
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

/** 생산·비생산 대화 — 종류(비생산만)·말 점검 집계 */
function buildConversationReportSnapshot(rows) {
  /** @type {Map<string, { label: string, count: number, minutes: number }>} */
  const typeMap = new Map();
  /** @type {Map<string, { label: string, count: number, minutes: number }>} */
  const speechMap = new Map();
  /** @type {{ name: string, minutes: number, productive: boolean, types: string[], speechChecks: string[] }[]} */
  const entries = [];
  let totalMinutes = 0;
  let totalCount = 0;
  let unproductiveMinutes = 0;
  let productiveMinutes = 0;
  let unproductiveCount = 0;
  for (const r of rows || []) {
    if (!isConversationDetailTaskName(r?.taskName)) continue;
    const mins = Math.round((parseTimeToHours(r?.timeTracked) || 0) * 60);
    if (mins <= 0) continue;
    totalMinutes += mins;
    totalCount += 1;
    const unprod = isUnproductiveConversationTaskName(r?.taskName);
    if (unprod) {
      unproductiveMinutes += mins;
      unproductiveCount += 1;
    } else {
      productiveMinutes += mins;
    }
    const parsed = parseConversationDetail(r?.mealDetail);
    entries.push({
      name: parsed.name || "",
      minutes: mins,
      productive: !unprod,
      types: parsed.types || [],
      speechChecks: parsed.speechChecks || [],
    });
    /* 대화 종류는 비생산적 대화 + 실제 고른 종류만 */
    if (unprod && parsed.types.length) {
      const typeShare = mins / parsed.types.length;
      for (const label of parsed.types) {
        const prev = typeMap.get(label) || { label, count: 0, minutes: 0 };
        prev.count += 1;
        prev.minutes += typeShare;
        typeMap.set(label, prev);
      }
    }
    const checks = parsed.speechChecks || [];
    if (checks.length) {
      const checkShare = mins / checks.length;
      for (const label of checks) {
        const prev = speechMap.get(label) || { label, count: 0, minutes: 0 };
        prev.count += 1;
        prev.minutes += checkShare;
        speechMap.set(label, prev);
      }
    }
  }
  const typeOrder = new Map(CONVERSATION_TYPE_OPTIONS.map((o, i) => [o, i]));
  const speechOrder = new Map(
    CONVERSATION_SPEECH_CHECK_OPTIONS.map((o, i) => [o, i]),
  );
  const toTags = (map, order, denomMin) =>
    [...map.values()]
      .map((t) => ({
        label: t.label,
        count: t.count,
        minutes: Math.round(t.minutes),
        pct:
          denomMin > 0 ? Math.round((t.minutes / denomMin) * 100) : 0,
      }))
      .sort((a, b) => {
        if (b.minutes !== a.minutes) return b.minutes - a.minutes;
        const ia = order.has(a.label) ? order.get(a.label) : 900;
        const ib = order.has(b.label) ? order.get(b.label) : 900;
        return ia - ib;
      });
  return {
    totalMinutes,
    totalCount,
    unproductiveMinutes,
    productiveMinutes,
    unproductiveCount,
    typeTags: toTags(typeMap, typeOrder, unproductiveMinutes || totalMinutes),
    speechTags: toTags(speechMap, speechOrder, totalMinutes),
    entries,
  };
}

/** 1일 대화 — 글 레포트 (막대 없음) */
function renderConversationDayNarrative(snap) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-conv-report";

  const summary = document.createElement("p");
  summary.className = "lp-tr2-conv-report-p";
  const bits = [
    `이날 대화는 ${formatIntegerMinutesDurationKo(snap.totalMinutes)}(${snap.totalCount}건)이었습니다`,
  ];
  if (snap.productiveMinutes > 0 || snap.unproductiveMinutes > 0) {
    bits.push(
      `생산적 ${formatIntegerMinutesDurationKo(snap.productiveMinutes)}, 비생산적 ${formatIntegerMinutesDurationKo(snap.unproductiveMinutes)}`,
    );
  }
  summary.textContent = `${bits.join(". ")}.`;
  wrap.appendChild(summary);

  if (snap.unproductiveCount > 0) {
    const typeP = document.createElement("p");
    typeP.className = "lp-tr2-conv-report-p";
    if (snap.typeTags.length) {
      const parts = snap.typeTags.map(
        (t) =>
          `「${t.label}」 ${formatIntegerMinutesDurationKo(t.minutes)}(${t.count}회)`,
      );
      typeP.textContent = `비생산적 대화 종류: ${parts.join(", ")}.`;
    } else {
      typeP.textContent =
        "비생산적 대화가 있었으나, 대화 종류는 고르지 않았습니다.";
    }
    wrap.appendChild(typeP);
  }

  const speechP = document.createElement("p");
  speechP.className = "lp-tr2-conv-report-p";
  if (snap.speechTags.length) {
    const parts = snap.speechTags.map((t) => `「${t.label}」(${t.count}회)`);
    speechP.textContent = `말 점검에서 체크된 항목: ${parts.join(", ")}.`;
  } else {
    speechP.textContent = "말 점검 표에 체크한 항목은 없었습니다.";
  }
  wrap.appendChild(speechP);

  const named = (snap.entries || []).filter((e) => e.name);
  if (named.length) {
    const listBlock = document.createElement("div");
    listBlock.className = "lp-tr2-conv-report-entries";
    const h = document.createElement("p");
    h.className = "lp-tr2-conv-report-label";
    h.textContent = "기록한 대화";
    listBlock.appendChild(h);
    const ul = document.createElement("ul");
    ul.className = "lp-tr2-conv-report-list";
    named.forEach((e) => {
      const li = document.createElement("li");
      const kind = e.productive ? "생산적" : "비생산적";
      const typeBit = e.types.length ? ` · ${e.types.join(" · ")}` : "";
      const checkBit = e.speechChecks.length
        ? ` · 말 점검 ${e.speechChecks.join(" · ")}`
        : "";
      li.textContent = `${e.name} (${kind}${typeBit}, ${formatIntegerMinutesDurationKo(e.minutes)}${checkBit})`;
      ul.appendChild(li);
    });
    listBlock.appendChild(ul);
    wrap.appendChild(listBlock);
  }

  return wrap;
}

/** 주간+ — 흑백 목록 (색 막대 블록 없음) */
function renderConversationPeriodList(title, rows) {
  if (!rows.length) return null;
  const block = document.createElement("div");
  block.className = "lp-tr2-conv-report-block";
  const h = document.createElement("p");
  h.className = "lp-tr2-conv-report-label";
  h.textContent = title;
  block.appendChild(h);
  const ul = document.createElement("ul");
  ul.className = "lp-tr2-conv-report-list";
  rows.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = `「${t.label}」 ${formatIntegerMinutesDurationKo(t.minutes)} · ${t.count}회`;
    ul.appendChild(li);
  });
  block.appendChild(ul);
  return block;
}

function mountConversationReportSection(scrollWrap, range, rows) {
  const snap = buildConversationReportSnapshot(rows);
  const isDay = range?.start === range?.end;
  const sec = createSection(
    "대화",
    isDay
      ? "이날 대화 · 생산/비생산 · 말 점검"
      : "생산/비생산 · 비생산 대화 종류 · 말 점검",
  );
  if (snap.totalMinutes <= 0) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "이 기간에 대화 기록이 없습니다.";
    sec.appendChild(empty);
    scrollWrap.appendChild(sec);
    return;
  }

  if (isDay) {
    sec.appendChild(renderConversationDayNarrative(snap));
    scrollWrap.appendChild(sec);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "lp-tr2-card-grid";
  hero.appendChild(
    createStatCard(
      "대화 시간",
      formatIntegerMinutesDurationKo(snap.totalMinutes),
      snap.totalCount > 0 ? `기록 ${snap.totalCount}건` : "",
    ),
  );
  hero.appendChild(
    createStatCard(
      "생산적",
      formatIntegerMinutesDurationKo(snap.productiveMinutes),
      "",
    ),
  );
  hero.appendChild(
    createStatCard(
      "비생산적",
      formatIntegerMinutesDurationKo(snap.unproductiveMinutes),
      "",
    ),
  );
  sec.appendChild(hero);

  const typeList = renderConversationPeriodList(
    "비생산적 대화 종류",
    snap.typeTags,
  );
  if (typeList) sec.appendChild(typeList);
  else if (snap.unproductiveCount > 0) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = "비생산적 대화 종류를 고른 기록이 없습니다.";
    sec.appendChild(note);
  }

  const speechList = renderConversationPeriodList(
    "말 점검 표",
    snap.speechTags,
  );
  if (speechList) sec.appendChild(speechList);
  else {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = "말 점검 표에 체크한 기록이 아직 없습니다.";
    sec.appendChild(note);
  }
  scrollWrap.appendChild(sec);
}

function mountMediaSection(scrollWrap, range, rows) {
  const snap = buildMediaReportSnapshot(rows, range);
  const dayCount = listDatesInclusive(range.start, range.end).length;
  const isDay = range.start === range.end;
  const isYear = dayCount >= 300;
  const sec = createSection(
    "콘텐츠·미디어 소비",
    isDay
      ? "이날 본 콘텐츠와 남긴 후기"
      : isYear
        ? "콘텐츠 종류별 소비 시간"
        : "기록에서 고른 콘텐츠 종류 · 의식적 vs 무의식적 비율",
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
  heroSub.textContent = isDay
    ? `총 ${formatIntegerMinutesDurationKo(snap.totalMinutes)} · 의식적 ${formatIntegerMinutesDurationKo(snap.totalConsciousMinutes)} · 무의식적 ${formatIntegerMinutesDurationKo(snap.totalUnconsciousMinutes)}`
    : `총 ${formatIntegerMinutesDurationKo(snap.totalMinutes)} · 의식적 ${formatIntegerMinutesDurationKo(snap.totalConsciousMinutes)} · 무의식적 ${formatIntegerMinutesDurationKo(snap.totalUnconsciousMinutes)} · ${snap.dayCount}일`;
  hero.appendChild(heroMain);
  hero.appendChild(heroSub);
  sec.appendChild(hero);

  if (isYear) {
    const treemapItems = buildMediaTreemapItems(snap);
    if (treemapItems.length) {
      sec.appendChild(renderMediaContentTreemap(treemapItems));
    }
    scrollWrap.appendChild(sec);
    return;
  }

  if (isDay) {
    sec.appendChild(renderMediaDayJournal(collectMediaDayEntries(rows)));
    scrollWrap.appendChild(sec);
    return;
  }

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
    chartSub.textContent = "하루마다 의식적(붉은)·무의식적(파란) 소비 시간을 나란히 비교";
    chartBlock.appendChild(chartTitle);
    chartBlock.appendChild(chartSub);
    chartBlock.appendChild(renderMediaCompareChart(snap.chartDays));
    sec.appendChild(chartBlock);
  }

  scrollWrap.appendChild(sec);
}

/** 도서명 칸 · (예전) 읽을 예정 체크가 메모에만 들어간 경우 */
function resolveReadingReportBookTitle(row) {
  const fromDetail = String(row?.mealDetail || "").trim();
  if (fromDetail) return fromDetail;
  const fb = String(row?.feedback || "").trim();
  /* 레거시: 체크한 책만 feedback에 넣고 줄바꿈 없는 한 줄로 저장된 경우 */
  if (fb && !fb.includes("\n") && fb.length <= 120) return fb;
  return "";
}

function emptyReadingBookStat() {
  return { minutes: 0, ratingSum: 0, ratingCount: 0 };
}

function addReadingRowToBookStat(stat, row, mins) {
  stat.minutes += mins;
  const rating = normalizeTimeRatingForRow(row?.timeRating);
  if (rating != null) {
    stat.ratingSum += rating;
    stat.ratingCount += 1;
  }
}

function readingBookRatingAvg(stat) {
  if (!stat?.ratingCount) return null;
  return stat.ratingSum / stat.ratingCount;
}

/** @param {ReturnType<typeof loadTimeRows>} rows */
function buildReadingReportSnapshot(rows) {
  let totalMinutes = 0;
  let sessionCount = 0;
  const untitled = emptyReadingBookStat();
  /** @type {Map<string, ReturnType<typeof emptyReadingBookStat>>} */
  const bookStats = new Map();
  for (const r of rows || []) {
    if (!isReadingDetailTaskName(r?.taskName)) continue;
    const mins = rowMinutes(r);
    if (!(mins > 0)) continue;
    sessionCount += 1;
    totalMinutes += mins;
    const title = resolveReadingReportBookTitle(r);
    if (!title) {
      addReadingRowToBookStat(untitled, r, mins);
      continue;
    }
    let stat = bookStats.get(title);
    if (!stat) {
      stat = emptyReadingBookStat();
      bookStats.set(title, stat);
    }
    addReadingRowToBookStat(stat, r, mins);
  }
  const books = [...bookStats.entries()]
    .map(([title, stat]) => ({
      title,
      minutes: stat.minutes,
      ratingAvg: readingBookRatingAvg(stat),
    }))
    .sort(
      (a, b) =>
        b.minutes - a.minutes || a.title.localeCompare(b.title, "ko"),
    );
  return {
    totalMinutes,
    sessionCount,
    untitledMinutes: untitled.minutes,
    untitledRatingAvg: readingBookRatingAvg(untitled),
    books,
  };
}

function mountReadingSection(scrollWrap, rows) {
  const snap = buildReadingReportSnapshot(rows);
  const sec = createSection(
    "독서 기록",
    "독서하기 · 총 독서시간 · 읽은 책 목록",
  );

  if (snap.totalMinutes <= 0) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-media-empty";
    empty.textContent = "이 기간에 독서하기 기록이 없습니다.";
    sec.appendChild(empty);
    scrollWrap.appendChild(sec);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "lp-tr2-media-hero";
  const heroMain = document.createElement("p");
  heroMain.className = "lp-tr2-media-hero-main";
  heroMain.textContent = `총 독서시간 ${formatIntegerMinutesDurationKo(snap.totalMinutes)}`;
  const heroSub = document.createElement("p");
  heroSub.className = "lp-tr2-media-hero-sub";
  const bookCount = snap.books.length + (snap.untitledMinutes > 0 ? 1 : 0);
  heroSub.textContent = `${snap.sessionCount}회 · 책 ${bookCount}권`;
  hero.appendChild(heroMain);
  hero.appendChild(heroSub);
  sec.appendChild(hero);

  const listBlock = createRatingBlock(
    "읽은 책 목록",
    "도서명별로 모은 독서 시간 · 도서 별점",
  );
  if (!snap.books.length && !(snap.untitledMinutes > 0)) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = "도서명을 남기면 여기에 목록이 쌓입니다.";
    listBlock.appendChild(note);
  } else {
    const list = document.createElement("ul");
    list.className = "lp-tr2-reading-book-list";
    list.setAttribute("aria-label", "읽은 책 목록");
    const appendReadingBookRow = (title, minutes, ratingAvg, untitled) => {
      const li = document.createElement("li");
      li.className = untitled
        ? "lp-tr2-reading-book-item lp-tr2-reading-book-item--untitled"
        : "lp-tr2-reading-book-item";
      const name = document.createElement("span");
      name.className = "lp-tr2-reading-book-title";
      name.textContent = untitled ? "📖 (도서명 없음)" : `📖 ${title}`;
      const meta = document.createElement("span");
      meta.className = "lp-tr2-reading-book-meta";
      if (ratingAvg != null) {
        const ratingEl = createSleepRatingStarsEl(ratingAvg, { showScore: true });
        ratingEl.classList.add("lp-tr2-reading-book-rating");
        ratingEl.title = `도서 별점 ${formatRatingAvg(ratingAvg)}점`;
        meta.appendChild(ratingEl);
      }
      const timeEl = document.createElement("span");
      timeEl.className = "lp-tr2-reading-book-time";
      timeEl.textContent = formatIntegerMinutesDurationKo(minutes);
      meta.appendChild(timeEl);
      li.append(name, meta);
      list.appendChild(li);
    };
    snap.books.forEach((book) => {
      appendReadingBookRow(book.title, book.minutes, book.ratingAvg, false);
    });
    if (snap.untitledMinutes > 0) {
      appendReadingBookRow(
        "",
        snap.untitledMinutes,
        snap.untitledRatingAvg,
        true,
      );
    }
    listBlock.appendChild(list);
  }
  sec.appendChild(listBlock);
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

function renderYearAvgActualSchedule(schedule) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-year-avg-schedule";
  wrap.setAttribute("aria-label", "실제 연평균 스케줄");

  const head = document.createElement("div");
  head.className = "lp-tr2-year-avg-schedule-head";
  const mark = document.createElement("span");
  mark.className = "lp-tr2-year-avg-schedule-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "✓";
  const titleWrap = document.createElement("div");
  titleWrap.className = "lp-tr2-year-avg-schedule-titles";
  const title = document.createElement("strong");
  title.className = "lp-tr2-year-avg-schedule-title";
  title.textContent = "실제 (연평균)";
  const sub = document.createElement("p");
  sub.className = "lp-tr2-year-avg-schedule-sub";
  sub.textContent = "자주 반복된 하루 흐름 · 평균 시작·소요";
  titleWrap.append(title, sub);
  head.append(mark, titleWrap);
  wrap.appendChild(head);

  const list = document.createElement("ol");
  list.className = "lp-tr2-year-avg-timeline";
  list.setAttribute("role", "list");
  const items = schedule?.items || [];
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "lp-tr2-year-avg-timeline-item";
    li.setAttribute("role", "listitem");
    if (index === items.length - 1) li.classList.add("is-last");

    const time = document.createElement("span");
    time.className = "lp-tr2-year-avg-timeline-time";
    time.textContent = item.startLabel || "";

    const spine = document.createElement("div");
    spine.className = "lp-tr2-year-avg-timeline-spine";
    spine.setAttribute("aria-hidden", "true");
    const dot = document.createElement("span");
    dot.className = "lp-tr2-year-avg-timeline-dot";
    const line = document.createElement("span");
    line.className = "lp-tr2-year-avg-timeline-line";
    spine.append(dot, line);

    const card = document.createElement("div");
    card.className = "lp-tr2-year-avg-timeline-card";
    const top = document.createElement("div");
    top.className = "lp-tr2-year-avg-timeline-card-top";
    const name = document.createElement("strong");
    name.className = "lp-tr2-year-avg-timeline-name";
    name.textContent = item.taskName || "";
    const dur = document.createElement("span");
    dur.className = "lp-tr2-year-avg-timeline-dur";
    dur.textContent = item.durLabel || "";
    top.append(name, dur);
    const meta = document.createElement("p");
    meta.className = "lp-tr2-year-avg-timeline-meta";
    meta.textContent = `${item.startLabel || ""} ~ ${item.endLabel || ""}`;
    card.append(top, meta);

    li.append(time, spine, card);
    list.appendChild(li);
  });
  wrap.appendChild(list);
  return wrap;
}

function mountPlanAdherenceSection(scrollWrap, range, rows) {
  const snap = buildPlanAdherenceReportSnapshot(range, rows);
  const isYear = !snap.isSingleDay && snap.totalDaysInPeriod >= 300;
  const yearSchedule = isYear
    ? buildAverageActualDaySchedule(range, rows)
    : null;
  const sec = createSection(
    "계획 이행",
    snap.isSingleDay
      ? "과제별 계획 → 실제 · 내일 계획에 참고"
      : isYear
        ? "예상 일정 · 연평균으로 유지된 하루"
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

  if (!snap.isSingleDay && !isYear && snap.planningHabitLine) {
    const habitLine = document.createElement("p");
    habitLine.className = "lp-tr2-plan-est-text";
    habitLine.textContent = snap.planningHabitLine;
    sec.appendChild(habitLine);
  }

  if (!snap.hasPlanData) {
    if (isYear && yearSchedule?.items?.length) {
      sec.appendChild(renderYearAvgActualSchedule(yearSchedule));
      scrollWrap.appendChild(sec);
      return;
    }
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent =
      "이 기간에 실행할 예상 일정(과제·시간)이 없어 이행률은 아직 계산되지 않습니다. 캘린더에서 타임박스를 넣어 보세요.";
    sec.appendChild(note);
    appendPlanRecordAuditBlock(sec, snap, isYear);
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
  } else if (isYear) {
    /* 연간: 「다음에 이만큼」 대신 연평균 유지 스케줄 */
    if (yearSchedule?.items?.length) {
      sec.appendChild(renderYearAvgActualSchedule(yearSchedule));
    } else {
      const note = document.createElement("p");
      note.className = "lp-tr2-chart-note";
      note.textContent =
        "자주 반복된 하루 패턴을 만들기엔 같은 과제의 기록이 아직 부족합니다.";
      sec.appendChild(note);
    }
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

  if (!isYear && snap.leak.minutes > 0) {
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

  if (!snap.isSingleDay && !isYear && snap.estimation) {
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

  appendPlanRecordAuditBlock(sec, snap, isYear);
  scrollWrap.appendChild(sec);
}

/** 계획 이행 하단 — 기록 초과·부족 날 + 마감 23:59(수면 제외) 점검 (연간 제외) */
function appendPlanRecordAuditBlock(sec, snap, isYear) {
  if (isYear) return;
  const audit = snap?.recordAudit;
  if (!audit?.show) return;

  const block = createRatingBlock(
    "기록 점검",
    snap.isSingleDay
      ? "하루가 23:59까지 안 채워진 원인 · 마감이 23:59인 기록"
      : "기록 초과·부족한 날 · 마감이 23:59인 기록",
  );

  if (!snap.isSingleDay) {
    if (audit.overDays?.length) {
      const overP = document.createElement("p");
      overP.className = "lp-tr2-plan-audit-summary lp-tr2-plan-audit-summary--over";
      overP.textContent = `기록 초과 · ${audit.overDays.map((d) => d.dateLabel).join(", ")}`;
      block.appendChild(overP);
    }
    if (audit.underDays?.length) {
      const underP = document.createElement("p");
      underP.className =
        "lp-tr2-plan-audit-summary lp-tr2-plan-audit-summary--under";
      underP.textContent = `기록 부족 · ${audit.underDays.map((d) => d.dateLabel).join(", ")}`;
      block.appendChild(underP);
    }
  }

  const list = document.createElement("ul");
  list.className = "lp-tr2-plan-audit-list";

  for (const day of audit.days || []) {
    const li = document.createElement("li");
    li.className = "lp-tr2-plan-audit-day";

    const head = document.createElement("p");
    head.className = "lp-tr2-plan-audit-day-head";
    if (snap.isSingleDay) {
      const bits = [];
      if (day.isOver) bits.push("기록이 하루(24시간)를 넘었습니다");
      if (day.isUnder) bits.push("하루 기록이 23:59까지 채워지지 않았습니다");
      head.textContent = bits.length
        ? bits.join(" · ")
        : "마감이 23:59인 기록을 확인해 보세요";
    } else {
      const bits = [];
      if (day.isOver) bits.push("기록 초과");
      if (day.isUnder) bits.push("기록 부족");
      const status = bits.length ? ` (${bits.join("·")})` : "";
      head.textContent = `${day.dateLabel} · 이날의 이 기록을 점검해 보세요${status}`;
    }
    li.appendChild(head);

    if (day.endLostRows?.length) {
      const rowList = document.createElement("ul");
      rowList.className = "lp-tr2-plan-audit-rows";
      for (const row of day.endLostRows) {
        const rowLi = document.createElement("li");
        rowLi.className = "lp-tr2-plan-audit-row";
        const tip = snap.isSingleDay
          ? "이 기록을 점검해 보세요"
          : "이날의 이 기록을 점검해 보세요";
        const dur =
          row.minutes > 0 ? ` · ${formatIntegerMinutesDurationKo(row.minutes)}` : "";
        rowLi.textContent = `${tip} · ${row.taskName} ${row.startLabel}~${row.endLabel}${dur}`;
        rowList.appendChild(rowLi);
      }
      li.appendChild(rowList);
    } else if (snap.isSingleDay && (day.isOver || day.isUnder)) {
      const hint = document.createElement("p");
      hint.className = "lp-tr2-plan-audit-hint";
      hint.textContent =
        "겹친 시간·빈 구간·마감 시각을 사용내역에서 확인해 보세요.";
      li.appendChild(hint);
    }

    list.appendChild(li);
  }

  block.appendChild(list);
  sec.appendChild(block);
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

/** 종료 이유 — 막대 옆은 횟수만, 힌트는 아래 한 줄 */
function createFocusEndReasonRow(label, barPct, countMeta, tip, color) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-focus-end-reason-item";

  const row = document.createElement("div");
  row.className = "lp-tr2-bar-row lp-tr2-bar-row--focus-end-reason";
  const lab = document.createElement("span");
  lab.className = "lp-tr2-bar-label";
  lab.textContent = label;
  const track = document.createElement("div");
  track.className = "lp-tr2-bar-track";
  const fill = document.createElement("div");
  fill.className = "lp-tr2-bar-fill";
  const pct = Math.min(100, Math.max(0, Number(barPct) || 0));
  fill.style.width = `${pct}%`;
  fill.style.background = color || "#1e4d7b";
  const val = document.createElement("span");
  val.className = "lp-tr2-bar-value";
  val.textContent = countMeta;
  track.appendChild(fill);
  row.append(lab, track, val);
  wrap.appendChild(row);

  const tipText = String(tip || "").trim();
  if (tipText) {
    const tipEl = document.createElement("p");
    tipEl.className = "lp-tr2-focus-end-reason-tip";
    tipEl.textContent = tipText;
    wrap.appendChild(tipEl);
  }
  return wrap;
}

/** 일간 레포트 — 막대 대신 요약·행동 제안 문구 */
function appendDayReportAdviceLines(parent, lines) {
  const list = (Array.isArray(lines) ? lines : [])
    .map((t) => String(t || "").trim())
    .filter(Boolean);
  if (!list.length || !(parent instanceof HTMLElement)) return;
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-focus-day-advice";
  list.forEach((text) => {
    const p = document.createElement("p");
    p.className = "lp-tr2-focus-end-reason-tip lp-tr2-focus-day-advice-line";
    p.textContent = text;
    wrap.appendChild(p);
  });
  parent.appendChild(wrap);
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
      `아쉬웠던 이유: ${badTags.map((t) => `「${t.label}」`).join(" · ")}`,
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
      "생산적 작업에 「이 시간 평가」·몰입 요소를 남기면, 다음에 더 오래 집중하는 방법이 정리됩니다.",
    ];
  }
  return lines;
}

function mountFocusDisruptorAnalysisBlock(sec, analysis, { isDay = false } = {}) {
  if (!analysis?.show) return;

  const analysisBlock = createRatingBlock(
    "이럴 때 집중이 안 됐음",
    isDay
      ? "오늘 1~3점에서 고른 아쉬웠던 이유 · 다음에 줄이면 좋은 조건"
      : "1~3점일 때 고른 아쉬웠던 이유 · 다음에 줄이면 좋은 조건",
  );

  const insight = document.createElement("p");
  insight.className = "lp-tr2-focus-disruptor-insight";
  insight.textContent = analysis.oneLiner;
  analysisBlock.appendChild(insight);

  if (isDay) {
    const labels = (analysis.ranking || [])
      .slice(0, 5)
      .map((item) => String(item?.label || "").trim())
      .filter(Boolean);
    const advice = [];
    if (labels.length) {
      advice.push(
        `오늘은 「${labels.join("」, 「")}」 때문에 집중이 잘 안 된 편입니다.`,
      );
      advice.push("다음에는 이 조건이 덜한 시간·장소에서 집중 블록을 잡아 보세요.");
    }
    appendDayReportAdviceLines(analysisBlock, advice);
    if (!labels.length && analysis.sessionCount > 0) {
      const note = document.createElement("p");
      note.className = "lp-tr2-chart-note";
      note.textContent =
        "1~3점일 때 아쉬웠던 이유를 고르면, 다음에 줄일 조건이 정리됩니다.";
      analysisBlock.appendChild(note);
    }
    sec.appendChild(analysisBlock);
    return;
  }

  if (analysis.ranking.length) {
    analysisBlock.appendChild(
      createFocusSubheading(
        "몰입을 깬 이유 빈도 순위",
        "1~3점 세션에서 고른 항목 · 많이 고른 순",
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
        "아쉬웠던 이유 카테고리별 비율",
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
    note.textContent = `1~3점 세션 ${analysis.sessionCount}건 — 기록할 때 아쉬웠던 이유를 고르면 순위가 채워집니다.`;
    analysisBlock.appendChild(note);
  }

  sec.appendChild(analysisBlock);
}

function mountNonproductiveBadFeelingReportSection(scrollWrap, range, rows) {
  const snap = buildNonproductiveBadFeelingReportSnapshot(rows);
  if (!snap?.show) return;
  const isDay = range?.start === range?.end;

  const sec = createSection(
    "무기력을 유발하는 행동",
    isDay
      ? "오늘 비생산적 1~3점에서 고른 이유 · 다음에 줄이면 좋은 행동"
      : "비생산적 작업 1~3점에서 고른 «별로였던 이유» · 다음에 줄이면 좋은 행동",
  );
  sec.classList.add("lp-tr2-bad-feeling-section");

  const insight = document.createElement("p");
  insight.className = "lp-tr2-focus-disruptor-insight";
  insight.textContent = snap.oneLiner;
  sec.appendChild(insight);

  if (isDay) {
    const advice = [];
    const behaviors = (snap.behaviors || []).slice(0, 4);
    if (behaviors.length) {
      advice.push(
        `오늘은 「${behaviors.map((b) => b.taskName).join("」, 「")}」에서 무기력한 느낌이 있었습니다.`,
      );
    }
    const reasons = (snap.reasonRanking || [])
      .slice(0, 4)
      .map((r) => r.label)
      .filter(Boolean);
    if (reasons.length) {
      advice.push(`자주 느낀 이유: 「${reasons.join("」, 「")}」`);
      advice.push("다음에는 이 행동이 길어지기 전에 끊거나, 대체 행동을 먼저 잡아 보세요.");
    }
    appendDayReportAdviceLines(sec, advice);
    scrollWrap.appendChild(sec);
    return;
  }

  if (snap.behaviors.length) {
    const block = createRatingBlock(
      "어떤 행동이었는지",
      "1~3점을 준 비생산적 과제 · 시간 많은 순",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars lp-tr2-bars--bad-feeling";
    const maxMin = Math.max(1, ...snap.behaviors.map((b) => b.minutes || 0));
    snap.behaviors.slice(0, 8).forEach((b) => {
      const sub = b.topReasonLabel
        ? `${b.durationLabel} · ${b.topReasonLabel}`
        : b.durationLabel;
      bars.appendChild(
        createFocusDisruptorBarRow(
          b.taskName,
          Math.round((b.minutes / maxMin) * 100),
          sub,
          "#8B5C3A",
        ),
      );
    });
    block.appendChild(bars);
    sec.appendChild(block);
  }

  if (snap.reasonRanking.length) {
    const block = createRatingBlock(
      "자주 느낀 이유",
      "별로였던 이유 · 많이 고른 순",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars lp-tr2-bars--bad-feeling";
    const maxCount = snap.reasonRanking[0]?.count || 1;
    snap.reasonRanking.forEach((item, i) => {
      bars.appendChild(
        createFocusDisruptorBarRow(
          `${i + 1}. ${item.label}`,
          Math.round((item.count / maxCount) * 100),
          `${item.count}회`,
          "#64748B",
        ),
      );
    });
    block.appendChild(bars);
    sec.appendChild(block);
  }

  scrollWrap.appendChild(sec);
}

function mountNonproductiveGoodFeelingReportSection(scrollWrap, range, rows) {
  const snap = buildNonproductiveGoodFeelingReportSnapshot(rows);
  if (!snap?.show) return;
  const isDay = range?.start === range?.end;

  const sec = createSection(
    "회복에 도움이 된 시간",
    isDay
      ? "오늘 비생산적 4~5점에서 고른 좋았던 점"
      : "비생산적 작업 4~5점에서 고른 «좋았던 점»",
  );
  sec.classList.add("lp-tr2-good-feeling-section");

  const insight = document.createElement("p");
  insight.className = "lp-tr2-focus-disruptor-insight";
  insight.textContent = snap.oneLiner;
  sec.appendChild(insight);

  if (isDay) {
    const advice = [];
    const behaviors = (snap.behaviors || []).slice(0, 4);
    if (behaviors.length) {
      advice.push(
        `오늘은 「${behaviors.map((b) => b.taskName).join("」, 「")}」에서 도움이 된 느낌이 있었습니다.`,
      );
    }
    const reasons = (snap.reasonRanking || [])
      .slice(0, 4)
      .map((r) => r.label)
      .filter(Boolean);
    if (reasons.length) {
      advice.push(`자주 고른 좋았던 점: 「${reasons.join("」, 「")}」`);
    }
    appendDayReportAdviceLines(sec, advice);
    scrollWrap.appendChild(sec);
    return;
  }

  if (snap.behaviors.length) {
    const block = createRatingBlock(
      "어떤 행동이었는지",
      "4~5점을 준 비생산적 과제 · 시간 많은 순",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars lp-tr2-bars--bad-feeling";
    const maxMin = Math.max(1, ...snap.behaviors.map((b) => b.minutes || 0));
    snap.behaviors.slice(0, 8).forEach((b) => {
      const sub = b.topReasonLabel
        ? `${b.durationLabel} · ${b.topReasonLabel}`
        : b.durationLabel;
      bars.appendChild(
        createFocusDisruptorBarRow(
          b.taskName,
          Math.round((b.minutes / maxMin) * 100),
          sub,
          "#15803d",
        ),
      );
    });
    block.appendChild(bars);
    sec.appendChild(block);
  }

  if (snap.reasonRanking.length) {
    const block = createRatingBlock(
      "자주 고른 좋았던 점",
      "4~5점 평가 · 많이 고른 순",
    );
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars lp-tr2-bars--bad-feeling";
    const maxCount = snap.reasonRanking[0]?.count || 1;
    snap.reasonRanking.forEach((item, i) => {
      bars.appendChild(
        createFocusDisruptorBarRow(
          `${i + 1}. ${item.label}`,
          Math.round((item.count / maxCount) * 100),
          `${item.count}회`,
          "#64748B",
        ),
      );
    });
    block.appendChild(bars);
    sec.appendChild(block);
  }

  scrollWrap.appendChild(sec);
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
      "시간대별 집중도",
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
      isDay
        ? "오늘 4~5점일 때 함께 있던 조건 · 다음에 비슷하게 만들기"
        : "4~5점일 때 함께 있던 몰입 요소 · 다음에 만들기 좋은 조건",
    );
    if (isDay) {
      const labels = focusSnap.recipeTags
        .slice(0, 5)
        .map((item) => String(item?.label || "").trim())
        .filter(Boolean);
      appendDayReportAdviceLines(recipeBlock, [
        labels.length
          ? `오늘은 「${labels.join("」, 「")}」이(가) 있을 때 집중이 잘 됐습니다.`
          : "",
        "다음에는 이 조건을 먼저 맞춰 두고 집중 블록을 시작해 보세요.",
      ]);
    } else {
      const bars = document.createElement("div");
      bars.className = "lp-tr2-bars";
      focusSnap.recipeTags.slice(0, 6).forEach((item) => {
        bars.appendChild(createFocusRecipeTagRow(item));
      });
      recipeBlock.appendChild(bars);
    }
    sec.appendChild(recipeBlock);
  } else if (focusSnap && focusSnap.highFocusSessionCount > 0) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = focusSnap.recipeOneLiner;
    sec.appendChild(note);
  }

  /* 4) 어떨 때 안 좋았는지 */
  if (focusSnap) {
    mountFocusDisruptorAnalysisBlock(sec, focusSnap.disruptorAnalysis, {
      isDay,
    });
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
      isDay
        ? "오늘 집중이 잘 된 활동 · 다음에 우선해 볼 유형"
        : "과제별 평균 집중도 · 집중이 잘 된 활동 유형",
    );
    if (isDay) {
      const labels = ratingSnap.topTasks
        .slice(0, 5)
        .map((t) => String(t?.name || "").trim())
        .filter(Boolean);
      appendDayReportAdviceLines(block, [
        labels.length
          ? `오늘은 「${labels.join("」, 「")}」에서 집중이 잘 됐습니다.`
          : "",
        "비슷한 활동을 집중이 잘 되는 시간대에 먼저 배치해 보세요.",
      ]);
    } else {
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
    }
    sec.appendChild(block);
  }

  if (ratingSnap?.monthScores?.length > 1) {
    const block = createRatingBlock("월별 집중 추이", "기간이 여러 달일 때");
    const bars = document.createElement("div");
    bars.className = "lp-tr2-bars lp-tr2-bars--month-trend";
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
  /* 근무·수면은 서로 비슷한 초록이 되지 않게 분리 */
  work: "#D4B896",
  sleep: "#8FA8C4",
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
  ].filter((s) => (Number(s.minutes) || 0) > 0);
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

function fitDayHeroDonutCenterText(wrap) {
  const center = wrap.querySelector(".lp-tr2-day-hero-donut-center");
  const totalEl = wrap.querySelector(".lp-tr2-day-hero-donut-total");
  if (!center || !totalEl || !wrap.isConnected) return;
  const maxW = Math.max(0, center.clientWidth - 2);
  if (maxW < 8) return;
  let size = parseFloat(getComputedStyle(totalEl).fontSize) || 12;
  const minSize = 7;
  totalEl.style.fontSize = `${size}px`;
  while (size > minSize && totalEl.scrollWidth > maxW) {
    size -= 0.5;
    totalEl.style.fontSize = `${size}px`;
  }
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
  requestAnimationFrame(() => fitDayHeroDonutCenterText(wrap));
}

/** 하루 기록 구성 — 생산 / 비생산 / 근무 / 수면, 가운데 = 총기록 */
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

/** 연간 등 긴 기간 — 도넛 대신 가로 막대(절대 시간이 잘 보이게) */
function createDayHeroBarRow(label, minutes, pct, color) {
  const row = document.createElement("div");
  row.className = "lp-tr2-bar-row lp-tr2-day-hero-bar-row";
  const dur = formatIntegerMinutesDurationKo(minutes);
  row.title = `${label} · ${dur} · ${pct}%`;
  const lab = document.createElement("span");
  lab.className = "lp-tr2-bar-label";
  lab.textContent = label;
  const track = document.createElement("div");
  track.className = "lp-tr2-bar-track";
  const fill = document.createElement("div");
  fill.className = "lp-tr2-bar-fill";
  fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  fill.style.background = color;
  track.appendChild(fill);
  const val = document.createElement("span");
  val.className = "lp-tr2-bar-value lp-tr2-day-hero-bar-value";
  const durEl = document.createElement("strong");
  durEl.className = "lp-tr2-day-hero-bar-dur";
  durEl.textContent = dur;
  const pctEl = document.createElement("span");
  pctEl.className = "lp-tr2-day-hero-bar-pct";
  pctEl.textContent = `${pct}%`;
  val.append(durEl, pctEl);
  row.appendChild(lab);
  row.appendChild(track);
  row.appendChild(val);
  return row;
}

function renderDayHeroDayBars(parts) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-day-hero-bars";
  wrap.setAttribute(
    "aria-label",
    `총기록 ${formatIntegerMinutesDurationKo(parts.recorded)}, 생산 ${formatIntegerMinutesDurationKo(parts.productive)}, 비생산 ${formatIntegerMinutesDurationKo(parts.waste)}, 근무 ${formatIntegerMinutesDurationKo(parts.work)}, 수면 ${formatIntegerMinutesDurationKo(parts.sleep)}`,
  );

  const total = document.createElement("p");
  total.className = "lp-tr2-day-hero-bars-total";
  const totalStrong = document.createElement("strong");
  totalStrong.textContent = formatIntegerMinutesDurationKo(parts.recorded);
  total.append(
    document.createTextNode("총기록 "),
    totalStrong,
    document.createTextNode(
      parts.dayCount <= 1
        ? ` · ${parts.recordedPct}%`
        : ` · ${parts.dayCount}일 중 ${parts.recordedPct}%`,
    ),
  );
  wrap.appendChild(total);

  const bars = document.createElement("div");
  bars.className = "lp-tr2-bars";
  const rows = [
    {
      label: "생산적",
      minutes: parts.productive,
      pct: parts.prodPct,
      color: DAY_HERO_COLORS.productive,
    },
    {
      label: "비생산",
      minutes: parts.waste,
      pct: parts.wastePct,
      color: DAY_HERO_COLORS.waste,
    },
    {
      label: "근무",
      minutes: parts.work,
      pct: parts.workPct,
      color: DAY_HERO_COLORS.work,
    },
    {
      label: "수면",
      minutes: parts.sleep,
      pct: parts.sleepPct,
      color: DAY_HERO_COLORS.sleep,
    },
  ];
  rows.forEach((r) => {
    bars.appendChild(
      createDayHeroBarRow(r.label, r.minutes, r.pct, r.color),
    );
  });
  wrap.appendChild(bars);
  return wrap;
}

function renderDayHeroAvailableBars(parts) {
  const wrap = document.createElement("div");
  wrap.className =
    "lp-tr2-day-hero-bars lp-tr2-day-hero-bars--available";
  wrap.setAttribute(
    "aria-label",
    `가용 ${formatIntegerMinutesDurationKo(parts.available)} 중 생산 ${formatIntegerMinutesDurationKo(parts.availProd)}, 비생산 ${formatIntegerMinutesDurationKo(parts.availWaste)}`,
  );

  const total = document.createElement("p");
  total.className = "lp-tr2-day-hero-bars-total";
  const totalStrong = document.createElement("strong");
  totalStrong.textContent = formatIntegerMinutesDurationKo(parts.available);
  total.append(
    document.createTextNode("가용시간 "),
    totalStrong,
    document.createTextNode(" · 근무·수면 제외"),
  );
  wrap.appendChild(total);

  const bars = document.createElement("div");
  bars.className = "lp-tr2-bars";
  const rows = [
    {
      label: "생산적",
      minutes: parts.availProd,
      pct: parts.availProdPct,
      color: DAY_HERO_COLORS.productive,
    },
    {
      label: "비생산",
      minutes: parts.availWaste,
      pct: parts.availWastePct,
      color: DAY_HERO_COLORS.waste,
    },
  ];
  if (parts.availLeft > 0) {
    rows.push({
      label: "남는 가용",
      minutes: parts.availLeft,
      pct: parts.availLeftPct,
      color: DAY_HERO_COLORS.rest,
    });
  }
  rows.forEach((r) => {
    bars.appendChild(
      createDayHeroBarRow(r.label, r.minutes, r.pct, r.color),
    );
  });
  wrap.appendChild(bars);
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

function createDayHeroValueRow(label, valueNodeOrText, tone) {
  const row = document.createElement("div");
  row.className = `lp-tr2-day-hero-value-row${tone ? ` lp-tr2-day-hero-value-row--${tone}` : ""}`;
  const lab = document.createElement("span");
  lab.className = "lp-tr2-day-hero-value-label";
  lab.textContent = label;
  let val;
  if (valueNodeOrText instanceof Node) {
    val = valueNodeOrText;
    if (!val.classList.contains("lp-tr2-day-hero-value-amount")) {
      val.classList.add("lp-tr2-day-hero-value-amount");
    }
  } else {
    val = document.createElement("strong");
    val.className = "lp-tr2-day-hero-value-amount";
    val.textContent = valueNodeOrText;
  }
  row.appendChild(lab);
  row.appendChild(val);
  return row;
}

/** 분 → 일자 표기 (연간 요약용) */
function formatDaysFromMinutes(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const days = m / DAY_LENGTH_MINUTES;
  if (days >= 10) return `${Math.round(days)}일`;
  if (days >= 1) return `${days.toFixed(1)}일`;
  const h = m / 60;
  if (h >= 1) return `${h.toFixed(1)}시간`;
  return formatIntegerMinutesDurationKo(m);
}

function createYearHeroRatioBar(segments, ariaLabel) {
  const total = segments.reduce(
    (sum, seg) => sum + Math.max(0, Number(seg.minutes) || 0),
    0,
  );
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-year-hero-bar";
  const track = document.createElement("div");
  track.className = "lp-tr2-year-hero-bar-track";
  track.setAttribute("role", "img");
  track.setAttribute("aria-label", ariaLabel || "비율 막대");
  const active = segments.filter((seg) => (Number(seg.minutes) || 0) > 0);
  active.forEach((seg, i) => {
    const el = document.createElement("div");
    el.className = "lp-tr2-year-hero-bar-seg";
    if (i === 0) el.classList.add("is-first");
    if (i === active.length - 1) el.classList.add("is-last");
    const mins = Number(seg.minutes) || 0;
    el.style.width = `${total > 0 ? (mins / total) * 100 : 0}%`;
    el.style.background = seg.color;
    if (seg.title) el.title = seg.title;
    track.appendChild(el);
  });
  if (total <= 0) track.classList.add("is-empty");
  wrap.appendChild(track);
  return wrap;
}

/** 조회 기간에 포함된 연-월 목록 (YYYY-MM) */
function listYearMonthsInclusive(startYmd, endYmd) {
  const s = String(startYmd || "").replace(/\//g, "-").slice(0, 7);
  const e = String(endYmd || "").replace(/\//g, "-").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(s) || !/^\d{4}-\d{2}$/.test(e) || s > e) return [];
  /** @type {string[]} */
  const out = [];
  let [y, m] = s.split("-").map(Number);
  const [ey, em] = e.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * 월별 투자(=생산)·소비(=비생산) 비율
 * — 근무·수면은 분자에서 제외, 분모는 (하루 − 근무 − 수면) 가용시간
 * @returns {{ ym: string, label: string, investPct: number, consumePct: number }[]}
 */
function buildYearInvestConsumeMonthlySeries(rows, range) {
  const months = listYearMonthsInclusive(range?.start, range?.end);
  const rangeStart = String(range?.start || "").replace(/\//g, "-").slice(0, 10);
  const rangeEnd = String(range?.end || "").replace(/\//g, "-").slice(0, 10);
  /** @type {Map<string, { investHrs: number, wasteMin: number, workSleepByDate: Map<string, { work: number, sleep: number }> }>} */
  const byMonth = new Map();
  months.forEach((ym) => {
    byMonth.set(ym, {
      investHrs: 0,
      wasteMin: 0,
      workSleepByDate: new Map(),
    });
  });

  (rows || []).forEach((r) => {
    const d = rowDateYmd(r);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const ym = d.slice(0, 7);
    const bucket = byMonth.get(ym);
    if (!bucket) return;
    const hrs = parseTimeToHours(r.timeTracked);
    const cat = String(r.category || "")
      .trim()
      .toLowerCase();
    const isWorkOrSleep = cat === "work" || cat === "sleep";

    if (isWorkOrSleep) {
      if (!(hrs > 0) || !Number.isFinite(hrs)) return;
      if (!bucket.workSleepByDate.has(d)) {
        bucket.workSleepByDate.set(d, { work: 0, sleep: 0 });
      }
      const day = bucket.workSleepByDate.get(d);
      if (cat === "work") day.work += hrs * 60;
      else day.sleep += hrs * 60;
      return;
    }

    const pv = getTimeLedgerRowDisplayProductivity(r);
    if (pv === "productive") {
      const h = getLedgerEffectiveHoursForReclaim(r);
      if (h > 0 && Number.isFinite(h)) bucket.investHrs += h;
    } else if (pv === "nonproductive") {
      if (hrs > 0 && Number.isFinite(hrs)) {
        bucket.wasteMin += Math.round(hrs * 60);
      }
    }
  });

  return months.map((ym) => {
    const bucket = byMonth.get(ym);
    const [yy, mm] = ym.split("-").map(Number);
    const monthStart = `${ym}-01`;
    const lastDay = new Date(yy, mm, 0).getDate();
    const monthEnd = `${ym}-${String(lastDay).padStart(2, "0")}`;
    const from = rangeStart > monthStart ? rangeStart : monthStart;
    const to = rangeEnd < monthEnd ? rangeEnd : monthEnd;
    const dates = listDatesInclusive(from, to);

    let avail = 0;
    dates.forEach((d) => {
      const u = bucket?.workSleepByDate.get(d);
      avail += Math.max(
        0,
        Math.round(
          DAY_LENGTH_MINUTES - (u?.work || 0) - (u?.sleep || 0),
        ),
      );
    });

    const investMin = Math.max(0, Math.round((bucket?.investHrs || 0) * 60));
    const wasteMin = Math.max(0, Math.round(bucket?.wasteMin || 0));
    const investPct =
      avail > 0 ? Math.min(100, Math.max(0, Math.round((investMin / avail) * 100))) : 0;
    const consumePct =
      avail > 0 ? Math.min(100, Math.max(0, Math.round((wasteMin / avail) * 100))) : 0;
    const monthNum = Number(ym.slice(5, 7)) || 1;
    return {
      ym,
      label: `${monthNum}월`,
      investPct,
      consumePct,
    };
  });
}

/** Catmull-Rom → cubic Bézier (y는 차트 영역 안으로만 — 0% 아래 오버슈트 방지) */
function buildSmoothLinePath(pts, yClamp) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const clampY = (y) => {
    if (!yClamp) return y;
    return Math.max(yClamp.min, Math.min(yClamp.max, y));
  };
  let d = `M ${pts[0].x} ${clampY(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${clampY(p2.y)}`;
  }
  return d;
}

function buildSmoothAreaPath(pts, yBase, yClamp) {
  const line = buildSmoothLinePath(pts, yClamp);
  if (!line || !pts.length) return "";
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L ${last.x} ${yBase} L ${first.x} ${yBase} Z`;
}

const YEAR_INVEST_LINE_COLOR = "#C98484";
const YEAR_CONSUME_LINE_COLOR = "#7E9FC3";
const YEAR_INVEST_FILL = "rgba(201, 132, 132, 0.22)";
const YEAR_CONSUME_FILL = "rgba(126, 159, 195, 0.2)";

/** 연간 한 장 요약 — 월별 투자·소비 % 곡선 */
function renderYearInvestConsumeChart(series) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-year-invest-chart";
  const title = document.createElement("p");
  title.className = "lp-tr2-year-hero-block-title";
  title.textContent = "월별 투자·소비 시간";
  const sub = document.createElement("p");
  sub.className = "lp-tr2-year-hero-block-sub";
  sub.textContent = "생산적·비생산적 · 근무·수면 제외 · 가용시간 대비";
  wrap.append(title, sub);

  const legend = document.createElement("div");
  legend.className = "lp-tr2-year-invest-chart-legend";
  [
    { color: YEAR_INVEST_LINE_COLOR, label: "투자 시간 (%)" },
    { color: YEAR_CONSUME_LINE_COLOR, label: "소비 시간 (%)" },
  ].forEach(({ color, label }) => {
    const item = document.createElement("span");
    item.className = "lp-tr2-year-invest-chart-legend-item";
    const sw = document.createElement("span");
    sw.className = "lp-tr2-year-invest-chart-legend-swatch";
    sw.style.background = color;
    item.append(sw, document.createTextNode(label));
    legend.appendChild(item);
  });
  wrap.appendChild(legend);

  if (!series.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-year-hero-block-sub";
    empty.textContent = "월별 기록이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  const maxVal = Math.max(
    5,
    ...series.map((p) => Math.max(p.investPct, p.consumePct)),
  );
  const yMax = Math.min(100, Math.ceil((maxVal + 2) / 5) * 5);
  const yTicks = [];
  const step = yMax <= 20 ? 5 : yMax <= 40 ? 5 : 10;
  for (let v = 0; v <= yMax; v += step) yTicks.push(v);
  if (yTicks[yTicks.length - 1] !== yMax) yTicks.push(yMax);

  const W = 420;
  const H = 200;
  const padL = 30;
  const padR = 6;
  const padT = 10;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = series.length;
  const xAt = (i) =>
    padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (pct) =>
    padT + plotH - (Math.max(0, Math.min(yMax, pct)) / yMax) * plotH;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "xMidYMid meet",
    class: "lp-tr2-year-invest-chart-svg",
    role: "img",
    "aria-label": "월별 투자·소비 시간 비율",
  });

  yTicks.forEach((v) => {
    const y = yAt(v);
    svg.appendChild(
      svgEl("line", {
        x1: padL,
        y1: y,
        x2: padL + plotW,
        y2: y,
        stroke: "#e8edf3",
        "stroke-width": 1,
      }),
    );
    const t = svgEl("text", {
      x: padL - 6,
      y: y + 3,
      "text-anchor": "end",
      fill: "#94a3b8",
      "font-size": tr2SvgFontSize(9),
      "font-weight": 600,
    });
    t.textContent = `${v}%`;
    svg.appendChild(t);
  });

  series.forEach((_, i) => {
    const x = xAt(i);
    svg.appendChild(
      svgEl("line", {
        x1: x,
        y1: padT,
        x2: x,
        y2: padT + plotH,
        stroke: "#f1f5f9",
        "stroke-width": 1,
      }),
    );
  });

  const investPts = series.map((p, i) => ({
    x: xAt(i),
    y: yAt(p.investPct),
  }));
  const consumePts = series.map((p, i) => ({
    x: xAt(i),
    y: yAt(p.consumePct),
  }));
  const yBase = padT + plotH;
  /* 곡선이 0% 아래·상단 밖으로 삐져나오지 않게 */
  const yClamp = { min: padT, max: yBase };

  svg.appendChild(
    svgEl("path", {
      d: buildSmoothAreaPath(investPts, yBase, yClamp),
      fill: YEAR_INVEST_FILL,
      stroke: "none",
    }),
  );
  svg.appendChild(
    svgEl("path", {
      d: buildSmoothAreaPath(consumePts, yBase, yClamp),
      fill: YEAR_CONSUME_FILL,
      stroke: "none",
    }),
  );
  svg.appendChild(
    svgEl("path", {
      d: buildSmoothLinePath(investPts, yClamp),
      fill: "none",
      stroke: YEAR_INVEST_LINE_COLOR,
      "stroke-width": 2.2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
  svg.appendChild(
    svgEl("path", {
      d: buildSmoothLinePath(consumePts, yClamp),
      fill: "none",
      stroke: YEAR_CONSUME_LINE_COLOR,
      "stroke-width": 2.2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );

  investPts.forEach((pt, i) => {
    svg.appendChild(
      svgEl("circle", {
        cx: pt.x,
        cy: pt.y,
        r: 3.2,
        fill: "#fff",
        stroke: YEAR_INVEST_LINE_COLOR,
        "stroke-width": 1.8,
      }),
    );
    const tip = svgEl("title", {});
    tip.textContent = `${series[i].label} 투자 ${series[i].investPct}%`;
    svg.lastChild.appendChild(tip);
  });
  consumePts.forEach((pt, i) => {
    svg.appendChild(
      svgEl("circle", {
        cx: pt.x,
        cy: pt.y,
        r: 3.2,
        fill: "#fff",
        stroke: YEAR_CONSUME_LINE_COLOR,
        "stroke-width": 1.8,
      }),
    );
    const tip = svgEl("title", {});
    tip.textContent = `${series[i].label} 소비 ${series[i].consumePct}%`;
    svg.lastChild.appendChild(tip);
  });

  series.forEach((p, i) => {
    const t = svgEl("text", {
      x: xAt(i),
      y: H - 8,
      "text-anchor": "middle",
      fill: "#64748b",
      "font-size": tr2SvgFontSize(n > 8 ? 8 : 9),
      "font-weight": 600,
    });
    t.textContent = p.label;
    svg.appendChild(t);
  });

  wrap.appendChild(svg);
  return wrap;
}

/** 연간 한 장 요약 — 기록/1년 막대 + 구성(일) 막대 + 월별 곡선 + 순가치 카드 */
function renderYearHeroSummary(
  hero,
  { dayCount = 365, rangeLabel = "", rows = [], range = null } = {},
) {
  const parts = buildDayHeroTimeParts(hero, { dayCount });
  const days = parts.dayCount;
  const root = document.createElement("div");
  root.className = "lp-tr2-year-hero";

  /* 1) 365일 중 총 기록 시간 */
  const recBlock = document.createElement("div");
  recBlock.className = "lp-tr2-year-hero-block";
  const recTitle = document.createElement("p");
  recTitle.className = "lp-tr2-year-hero-block-title";
  recTitle.textContent = `${days}일 중 총 기록 시간`;
  const recMeta = document.createElement("p");
  recMeta.className = "lp-tr2-year-hero-block-meta";
  recMeta.textContent = `${formatIntegerMinutesDurationKo(parts.recorded)} · 1년의 ${parts.recordedPct}%`;
  const unrecorded = Math.max(0, parts.periodMin - parts.recorded);
  recBlock.append(
    recTitle,
    recMeta,
    createYearHeroRatioBar(
      [
        {
          label: "기록",
          minutes: parts.recorded,
          color: "#8fa8c4",
          title: `기록 ${formatIntegerMinutesDurationKo(parts.recorded)}`,
        },
        {
          label: "미기록",
          minutes: unrecorded,
          color: "#e8edf3",
          title: `미기록 ${formatIntegerMinutesDurationKo(unrecorded)}`,
        },
      ],
      `${days}일 중 기록 ${parts.recordedPct}%`,
    ),
  );
  root.appendChild(recBlock);

  /* 2) 기록 시간 중 생산·비생산·근무·수면 (일자) */
  const mixBlock = document.createElement("div");
  mixBlock.className = "lp-tr2-year-hero-block";
  const mixTitle = document.createElement("p");
  mixTitle.className = "lp-tr2-year-hero-block-title";
  mixTitle.textContent = "기록 시간 구성";
  const mixSub = document.createElement("p");
  mixSub.className = "lp-tr2-year-hero-block-sub";
  mixSub.textContent = "생산·비생산·근무·수면 · 일자로 환산";
  const mixSegs = [
    {
      label: "생산적",
      minutes: parts.productive,
      color: DAY_HERO_COLORS.productive,
      title: `생산적 ${formatDaysFromMinutes(parts.productive)}`,
    },
    {
      label: "비생산",
      minutes: parts.waste,
      color: DAY_HERO_COLORS.waste,
      title: `비생산 ${formatDaysFromMinutes(parts.waste)}`,
    },
    {
      label: "근무",
      minutes: parts.work,
      color: DAY_HERO_COLORS.work,
      title: `근무 ${formatDaysFromMinutes(parts.work)}`,
    },
    {
      label: "수면",
      minutes: parts.sleep,
      color: DAY_HERO_COLORS.sleep,
      title: `수면 ${formatDaysFromMinutes(parts.sleep)}`,
    },
  ];
  mixBlock.append(
    mixTitle,
    mixSub,
    createYearHeroRatioBar(
      mixSegs,
      "기록 시간 구성 · 생산·비생산·근무·수면",
    ),
  );
  const mixLegend = document.createElement("div");
  mixLegend.className = "lp-tr2-year-hero-legend";
  mixSegs.forEach((seg) => {
    if ((Number(seg.minutes) || 0) <= 0) return;
    const item = document.createElement("span");
    item.className = "lp-tr2-year-hero-legend-item";
    const sw = document.createElement("span");
    sw.className = "lp-tr2-year-hero-legend-swatch";
    sw.style.background = seg.color;
    item.append(sw, document.createTextNode(`${seg.label} ${formatDaysFromMinutes(seg.minutes)}`));
    mixLegend.appendChild(item);
  });
  mixBlock.appendChild(mixLegend);
  root.appendChild(mixBlock);

  /* 나의 1년의 가치 — 순가치만 카드 */
  const netWon = Math.round(Number(hero.netWon) || 0);
  const valueCard = document.createElement("div");
  valueCard.className = `lp-tr2-year-value-card${
    netWon > 0 ? " is-pos" : netWon < 0 ? " is-neg" : ""
  }`;
  const valueTitle = document.createElement("p");
  valueTitle.className = "lp-tr2-year-value-card-title";
  valueTitle.textContent = "나의 1년의 가치";
  if (rangeLabel) {
    const valueSub = document.createElement("p");
    valueSub.className = "lp-tr2-year-value-card-sub";
    valueSub.textContent = rangeLabel;
    valueCard.append(valueTitle, valueSub);
  } else {
    valueCard.appendChild(valueTitle);
  }
  const amount = createDayHeroWonAmountEl(netWon);
  amount.classList.add("lp-tr2-year-value-card-amount");
  valueCard.appendChild(amount);
  root.appendChild(valueCard);

  return root;
}

function renderDayHeroSummary(
  hero,
  { dayCount = 1, rangeLabel = "", rows = [], range = null } = {},
) {
  const parts = buildDayHeroTimeParts(hero, { dayCount });
  const isMultiDay = parts.dayCount > 1;
  if (parts.dayCount >= 300) {
    return renderYearHeroSummary(hero, {
      dayCount: parts.dayCount,
      rangeLabel,
      rows,
      range,
    });
  }
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

  /* 범례 — 생산·비생산·근무·수면만 카드 (미기록「그 외」제외) */
  {
    const dayLegend = document.createElement("div");
    dayLegend.className = "lp-tr2-day-hero-legend lp-tr2-day-hero-legend--cards";
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
    dayLegendItems.forEach((item) => {
      dayLegend.appendChild(
        createDayHeroLegendItem(item.color, item.label, item.minutes, item.pct),
      );
    });
    viz.appendChild(dayLegend);
  }

  root.appendChild(viz);

  const valuePanel = document.createElement("div");
  valuePanel.className = "lp-tr2-day-hero-value";
  const valueTitle = document.createElement("p");
  valueTitle.className = "lp-tr2-day-hero-value-title";
  valueTitle.textContent =
    rangeLabel ||
    (isMultiDay ? "기간의 시간 가치" : "오늘의 시간 가치");
  valuePanel.appendChild(valueTitle);

  const investWon = Math.round(Number(hero.investWon) || 0);
  const wasteWon = Math.round(Number(hero.wasteWon) || 0);
  const netWon = Math.round(Number(hero.netWon) || 0);

  valuePanel.appendChild(
    createDayHeroValueRow(
      "생산적 가치",
      createDayHeroWonAmountEl(investWon > 0 ? investWon : 0),
      "prod",
    ),
  );
  valuePanel.appendChild(
    createDayHeroValueRow(
      "비생산 가치",
      createDayHeroWonAmountEl(wasteWon > 0 ? -wasteWon : 0),
      "waste",
    ),
  );

  const netRow = createDayHeroValueRow(
    "합(순가치)",
    createDayHeroWonAmountEl(netWon),
    netWon > 0 ? "net-pos" : netWon < 0 ? "net-neg" : "net-zero",
  );
  netRow.classList.add("lp-tr2-day-hero-value-row--net");
  valuePanel.appendChild(netRow);

  root.appendChild(valuePanel);
  return root;
}

function mountHeroSection(scrollWrap, range, rows) {
  const hero = getTimeReportHeroSnapshotForDateRange(
    range.start,
    range.end,
    rows,
  );
  const dayCount = listDatesInclusive(range.start, range.end).length;
  const rangeLabel = formatRangeLabel(range.start, range.end);
  const sec = createSection("한 장 요약", rangeLabel);
  /* 일·주·월·연간: 도넛 + 시간 가치 */
  sec.appendChild(
    renderDayHeroSummary(hero, { dayCount, rangeLabel, rows, range }),
  );
  scrollWrap.appendChild(sec);
}

/** 하루 레포트 — 어제 vs 오늘 과제별 시간 비교 그래프 */
function mountDayCompareSection(scrollWrap, range, allRows) {
  if (!range || range.start !== range.end) return;
  const report = buildDayTaskCompareReport(range.start, allRows);
  if (!report.hasData) return;
  const prev = report.prevLabel || "어제";
  const cur = report.curLabel || "오늘";
  const hasBatchim = (w) => {
    const c = String(w || "").charCodeAt(String(w || "").length - 1);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 > 0;
  };
  const sec = createSection(
    `${prev}${hasBatchim(prev) ? "과" : "와"} ${cur} 시간 비교`,
    `근무·수면 등 과제별로 ${prev} 대비 ${cur}${hasBatchim(cur) ? "이" : "가"} 얼마나 늘고 줄었는지`,
  );
  renderDayTaskCompareChart(sec, report);
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

function mountSleepSection(scrollWrap, range, rows, allRows) {
  const snap = buildSleepReportSnapshot(rows, range, allRows);
  const isDay = range.start === range.end;
  const isWeekView = !isDay && snap.dayCount > 1 && snap.dayCount <= 8;
  const isYearView = !isDay && snap.dayCount >= 300;
  const sec = createSection(
    "수면 기록",
    isDay
      ? "취침 ~ 기상 · 7시간 목표 대비"
      : isWeekView
        ? "평균 요약 · 막대=수면 시간 · 점선=7시간 목표"
        : isYearView
          ? "취침·기상·품질 평균 요약"
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
    if ((day?.goodFactors || []).length) {
      const goodBlock = createRatingBlock(
        "잘 잔 이유",
        "5점으로 평가했을 때 고른 요소",
      );
      goodBlock.appendChild(
        buildSleepFactorChipRow(
          (day.goodFactors || []).map(timeSleepGoodFactorLabelForId),
          "아직 고른 이유가 없습니다.",
        ),
      );
      sec.appendChild(goodBlock);
    }
    if ((day?.poorReasons || []).length) {
      const poorBlock = createRatingBlock(
        "아쉬웠던 이유",
        "1~3점으로 평가했을 때 고른 요소",
      );
      poorBlock.appendChild(
        buildSleepFactorChipRow(
          (day.poorReasons || []).map(timeSleepPoorReasonLabelForId),
          "아직 고른 이유가 없습니다.",
        ),
      );
      sec.appendChild(poorBlock);
    }
    scrollWrap.appendChild(sec);
    return;
  }

  /* 연간: 일별 수면 막대 그래프는 생략(요약·상관만) */
  if (!isYearView) {
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
  }

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

  /* 주·달·년: 수면 레시피 (일간은 칩으로 위에서 표시) */
  mountSleepRecipeBlock(sec, snap);

  scrollWrap.appendChild(sec);
}

function mountIntakeSection(scrollWrap, range, rows) {
  const { healthy, unhealthy, healthyCount, unhealthyCount } =
    collectIntakeLogs(rows);
  const dayCount = listDatesInclusive(range.start, range.end).length;
  const isDay = range.start === range.end;
  const isWeekView = !isDay && dayCount > 1 && dayCount <= 8;
  const isMonthView = !isDay && !isWeekView;
  const mealListCount = healthy.length + unhealthy.length;
  const recordCount = healthyCount + unhealthyCount;
  const timeSnap = buildIntakeTimeSnapshot(rows, range);

  const sec = createSection(
    "섭취 기록",
    isDay
      ? "오늘 섭취·준비 시간 · 식단"
      : isWeekView
        ? "하루 평균 섭취·준비 시간 · 식단"
        : "건강·비건강 섭취 비율 · 날짜별 식단",
  );

  if (!timeSnap.hasData && recordCount <= 0 && mealListCount <= 0) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = "이 기간에 섭취 기록이 없습니다.";
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  if (recordCount > 0) {
    sec.appendChild(renderIntakeHealthRatioBar(healthyCount, unhealthyCount));
  }

  if ((isDay || isWeekView) && timeSnap.hasData) {
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
  }

  const dietBlock = createRatingBlock(
    "식단",
    isDay
      ? "건강한·건강하지 않은 섭취 · 옆의 별점이 맛 평가"
      : isWeekView
        ? "건강한·건강하지 않은 섭취 · 옆의 별점이 맛 평가"
        : "날짜별 식단명만 · 길면 패널 안에서 스크롤",
  );
  const panels = document.createElement("div");
  panels.className = "lp-tr2-intake-panels";
  if (isMonthView && (dayCount >= 7 || mealListCount > 8)) {
    panels.classList.add("lp-tr2-intake-panels--scroll");
  }

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
    if (isMonthView) {
      body.appendChild(buildCompactIntakeFeed(entries, "기록 없음", tone));
    } else {
      body.appendChild(
        buildDayIntakeRatedFeed(entries, "기록 없음", tone, {
          showDate: !isDay,
        }),
      );
    }
    panel.appendChild(head);
    panel.appendChild(body);
    return panel;
  };

  panels.appendChild(
    makeDietPanel("건강한 섭취", healthyCount, healthy, "healthy"),
  );
  panels.appendChild(
    makeDietPanel(
      "건강하지 않은 섭취",
      unhealthyCount,
      unhealthy,
      "unhealthy",
    ),
  );
  dietBlock.appendChild(panels);
  sec.appendChild(dietBlock);

  if (isWeekView || isMonthView) {
    appendMealTasteRankBlocks(sec, rows);
  }
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

/**
 * 상반 행동 투자시간 → 앞으로의 방향 확률
 * 시급상승↔시급저하 / 건강↔비건강 / 행복↔(불행+쾌락+미디어)
 */
function fieldTimeProbabilitiesFromDonutSnap(snap) {
  const segments = snap?.segments || [];
  const hours = (key) => hoursForFieldScoreKey(segments, key);
  const wageUp = hours("sideincome");
  const wageDown = hours("moneylosing");
  const healthUp = hours("health");
  const healthDown = hours("unhealthy");
  const happyUp = hours("happiness");
  const happyDown =
    hours("unhappiness") + hours("pleasure") + hours("media_watch");

  const pairPct = (posH, negH) => {
    const total = posH + negH;
    if (!(total > 0)) return null;
    return Math.round((posH / total) * 100);
  };

  return [
    {
      key: "sideincome",
      label: "시급이 오를 확률",
      pct: pairPct(wageUp, wageDown),
      compareHint: `${formatIntegerMinutesDurationKo(Math.round(wageUp * 60))} 상승 · ${formatIntegerMinutesDurationKo(Math.round(wageDown * 60))} 저하`,
      emptyHint: "시급 상승·저하 기록이 없어요",
    },
    {
      key: "health",
      label: "건강해질 확률",
      pct: pairPct(healthUp, healthDown),
      compareHint: `${formatIntegerMinutesDurationKo(Math.round(healthUp * 60))} 건강 · ${formatIntegerMinutesDurationKo(Math.round(healthDown * 60))} 비건강`,
      emptyHint: "건강·비건강 기록이 없어요",
    },
    {
      key: "happiness",
      label: "행복을 더 추구할 확률",
      pct: pairPct(happyUp, happyDown),
      compareHint: `${formatIntegerMinutesDurationKo(Math.round(happyUp * 60))} 행복 · ${formatIntegerMinutesDurationKo(Math.round(happyDown * 60))} 불행·쾌락·미디어`,
      emptyHint: "행복·불행·쾌락·미디어 기록이 없어요",
    },
  ];
}

function mountFieldTimeScoresRow(parent, snap, opts = {}) {
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

  if (!opts.showProbabilities) return;

  const probRow = document.createElement("div");
  probRow.className = "lp-tr2-field-scores lp-tr2-field-scores--prob";
  probRow.setAttribute(
    "aria-label",
    "투자 시간으로 본 앞으로의 방향 확률",
  );
  fieldTimeProbabilitiesFromDonutSnap(snap).forEach((item) => {
    const value =
      item.pct == null ? "—" : `${item.pct}%`;
    const hint =
      item.pct == null ? item.emptyHint : item.compareHint;
    const card = createStatCard(item.label, value, hint);
    card.classList.add("lp-tr2-field-prob-card");
    /* 50% 미만 = 부정 쪽 시간이 더 큼 → 파란 강조 */
    if (item.pct != null && item.pct < 50) {
      card.classList.add("lp-tr2-field-prob-card--low");
    }
    probRow.appendChild(card);
  });
  parent.appendChild(probRow);
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

function isWorkOrSleepTreemapRow(taskName, categoryHint) {
  const name = String(taskName || "").trim();
  if (isWorkBuiltinTaskName(name) || isSleepBuiltinTaskName(name)) return true;
  const key = monthTaskCategoryKey(name, categoryHint);
  return key === "work" || key === "sleep";
}

/** 근무·수면 분 — 시간 분포에서 따로 표시용 */
function sumWorkSleepMinutesFromRows(rows) {
  let work = 0;
  let sleep = 0;
  let total = 0;
  for (const r of rows || []) {
    const mins = rowMinutes(r);
    if (mins <= 0) continue;
    total += mins;
    const name = String(r?.taskName || "").trim();
    const key = monthTaskCategoryKey(name, r?.category);
    if (key === "work" || isWorkBuiltinTaskName(name)) work += mins;
    else if (key === "sleep" || isSleepBuiltinTaskName(name)) sleep += mins;
  }
  return { work, sleep, total };
}

function appendWorkSleepTimeMapSummary(sec, workMin, sleepMin, totalMin) {
  if (workMin <= 0 && sleepMin <= 0) return;
  const grid = document.createElement("div");
  grid.className =
    "lp-tr2-card-grid lp-tr2-plan-summary-grid lp-tr2-time-map-ws-grid";
  const denom = totalMin > 0 ? totalMin : workMin + sleepMin;
  if (workMin > 0) {
    const pct = denom > 0 ? Math.round((workMin / denom) * 100) : 0;
    grid.appendChild(
      createStatCard(
        "근무",
        formatIntegerMinutesDurationKo(workMin),
        `전체 기록의 ${pct}%`,
      ),
    );
  }
  if (sleepMin > 0) {
    const pct = denom > 0 ? Math.round((sleepMin / denom) * 100) : 0;
    grid.appendChild(
      createStatCard(
        "수면",
        formatIntegerMinutesDurationKo(sleepMin),
        `전체 기록의 ${pct}%`,
      ),
    );
  }
  sec.appendChild(grid);
}

/** 연간 — 카테고리별 합산 (버블 차트용) */
function buildCategoryBubbleItems(rows, { excludeWorkSleep = false } = {}) {
  /** @type {Map<string, { key: string, label: string, minutes: number }>} */
  const map = new Map();
  for (const r of rows || []) {
    const mins = rowMinutes(r);
    if (mins <= 0) continue;
    if (
      excludeWorkSleep &&
      isWorkOrSleepTreemapRow(r?.taskName, r?.category)
    ) {
      continue;
    }
    const key = monthTaskCategoryKey(r?.taskName, r?.category);
    const cur = map.get(key) || {
      key,
      label: MONTH_TASK_TREEMAP_CAT_LABELS[key] || key,
      minutes: 0,
    };
    cur.minutes += mins;
    map.set(key, cur);
  }
  const total = [...map.values()].reduce((s, x) => s + x.minutes, 0);
  return [...map.values()]
    .filter((x) => x.minutes > 0)
    .map((x) => ({
      ...x,
      pct: total > 0 ? Math.round((x.minutes / total) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label, "ko"));
}

/** 카테고리 버블 — 원 넓이 ≈ 시간 비율 */
function renderCategoryBubbleChart(items) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-cat-bubbles";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "카테고리별 사용 시간");

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "표시할 카테고리가 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  const maxM = Math.max(...items.map((x) => x.minutes), 1);
  const board = document.createElement("div");
  board.className = "lp-tr2-cat-bubbles-board";

  items.forEach((item) => {
    const t = Math.sqrt(item.minutes / maxM);
    /* 지름 rem — 최소·최대 고정, 면적 느낌은 √비율 */
    const dRem = (3.1 + t * 7.2).toFixed(2);
    const bubble = document.createElement("div");
    bubble.className = "lp-tr2-cat-bubble";
    bubble.style.setProperty("--d", `${dRem}rem`);
    bubble.style.background =
      MONTH_TASK_TREEMAP_COLORS[item.key] || MONTH_TASK_TREEMAP_COLORS.other;
    bubble.title = `${item.label} · ${formatIntegerMinutesDurationKo(item.minutes)} · ${item.pct}%`;

    const name = document.createElement("span");
    name.className = "lp-tr2-cat-bubble-name";
    name.textContent = item.label;
    const meta = document.createElement("span");
    meta.className = "lp-tr2-cat-bubble-meta";
    meta.textContent = `${item.pct}%`;
    const dur = document.createElement("span");
    dur.className = "lp-tr2-cat-bubble-dur";
    dur.textContent = formatIntegerMinutesDurationKo(item.minutes);

    if (t < 0.42) {
      bubble.classList.add("is-sm");
      bubble.append(name, meta);
    } else if (t < 0.62) {
      bubble.classList.add("is-md");
      bubble.append(name, meta);
    } else {
      bubble.append(name, dur, meta);
    }
    board.appendChild(bubble);
  });

  wrap.appendChild(board);
  wrap.appendChild(
    createRatingChartLegend(
      items.map((item) => ({
        swatch:
          MONTH_TASK_TREEMAP_COLORS[item.key] || MONTH_TASK_TREEMAP_COLORS.other,
        label: item.label,
      })),
    ),
  );
  return wrap;
}

/**
 * 기간 안 기록된 과제별 총 시간 — 과제명마다 전부 표시(묶음 없음)
 * @param {{ excludeWorkSleep?: boolean }} [opts]
 */
function buildMonthTaskTreemapItems(rows, { excludeWorkSleep = false } = {}) {
  /** @type {Map<string, { name: string, minutes: number, categoryKey: string }>} */
  const map = new Map();
  for (const r of rows || []) {
    const name = String(r?.taskName || "").trim();
    if (!name) continue;
    const mins = rowMinutes(r);
    if (mins <= 0) continue;
    if (excludeWorkSleep && isWorkOrSleepTreemapRow(name, r.category)) continue;
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

function renderMonthTaskTreemap(items, { ariaLabel = "과제별 사용 시간" } = {}) {
  const layout = layoutMonthTaskTreemap(items);
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-task-treemap";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", ariaLabel);

  const board = document.createElement("div");
  board.className = "lp-tr2-task-treemap-board";

  /* 간격은 고정 %가 아니라 칸 크기에 비례 — 큰 칸 면적 왜곡 줄임 */
  const GAP_RATIO = 0.012;
  layout.forEach((cell) => {
    const el = document.createElement("div");
    el.className = "lp-tr2-task-treemap-cell";
    const gapW = Math.min(0.55, cell.w * GAP_RATIO);
    const gapH = Math.min(0.55, cell.h * GAP_RATIO);
    const w = Math.max(0, cell.w - gapW);
    const h = Math.max(0, cell.h - gapH);
    el.style.left = `${cell.x + gapW / 2}%`;
    el.style.top = `${cell.y + gapH / 2}%`;
    el.style.width = `${w}%`;
    el.style.height = `${h}%`;
    el.style.background =
      MONTH_TASK_TREEMAP_COLORS[cell.categoryKey] ||
      MONTH_TASK_TREEMAP_COLORS.other;
    const metaText = `${formatIntegerMinutesDurationKo(cell.minutes)} · ${cell.pct}%`;
    el.title = `${cell.name} · ${metaText}`;

    /* 칸 면적(%)에 맞춰 글자 크기·표시 조절 — 작은 칸도 폰트만 줄여 표시 */
    const minSide = Math.min(w, h);
    if (minSide < 22 || h < 16 || w < 18) el.classList.add("is-compact");
    if (minSide < 12 || h < 9 || w < 11) el.classList.add("is-tiny");
    /* 가로로 얇은 띠 — 한 줄로 이름 표시 */
    if (h < 8 && w >= 8) el.classList.add("is-strip");
    /* 시간·%는 높이가 너무 낮을 때만 숨김 (이름보다 우선순위 낮음) */
    if (h < 6.5 || (h < 9 && w < 10)) el.classList.add("is-meta-hidden");
    /* 극소 칸만 글자 생략(거의 안 씀) */
    if (minSide < 2.8 || (h < 2.4 && w < 4)) el.classList.add("is-micro");

    const nameFs = Math.max(
      0.375,
      Math.min(0.95, 0.26 + minSide * 0.034),
    );
    const metaFs = Math.max(
      0.34,
      Math.min(0.8, 0.22 + minSide * 0.028),
    );
    el.style.setProperty("--tm-name-fs", `${nameFs.toFixed(3)}rem`);
    el.style.setProperty("--tm-meta-fs", `${metaFs.toFixed(3)}rem`);

    const name = document.createElement("span");
    name.className = "lp-tr2-task-treemap-name";
    name.textContent = cell.name;

    const meta = document.createElement("span");
    meta.className = "lp-tr2-task-treemap-meta";
    meta.textContent = metaText;

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

function formatMinutesAsHhMm(totalMinutes) {
  const n = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const DAY_TASK_DONUT_PALETTE = [
  "#E8A0A0",
  "#7E9FC3",
  "#D4B896",
  "#86C4A3",
  "#E8C48A",
  "#B8A8E0",
  "#E8A8C0",
  "#8BB8D8",
  "#C9A0B4",
  "#A8C4B0",
  "#D8B090",
  "#9AA8C8",
  "#C4B8D8",
  "#B0C8A0",
  "#D0A898",
];

function assignDayTaskDonutColors(items) {
  const used = new Set();
  return (items || []).map((item, index) => {
    const preferred = String(
      MONTH_TASK_TREEMAP_COLORS[item.categoryKey] ||
        MONTH_TASK_TREEMAP_COLORS.other,
    );
    let color = preferred;
    if (used.has(color.toLowerCase())) {
      let guard = 0;
      color = DAY_TASK_DONUT_PALETTE[index % DAY_TASK_DONUT_PALETTE.length];
      while (
        used.has(color.toLowerCase()) &&
        guard < DAY_TASK_DONUT_PALETTE.length
      ) {
        color =
          DAY_TASK_DONUT_PALETTE[
            (index + guard + 1) % DAY_TASK_DONUT_PALETTE.length
          ];
        guard += 1;
      }
    }
    used.add(color.toLowerCase());
    return { ...item, color };
  });
}

/** 1일 — 그 외 시간 도넛(조각 라벨 없음) + 과제 목록 */
function renderDayTaskTimeDonut(items, { ariaLabel = "과제별 사용 시간" } = {}) {
  const total = (items || []).reduce(
    (sum, item) => sum + Math.max(0, Number(item.minutes) || 0),
    0,
  );
  const colored = assignDayTaskDonutColors(items).map((item) => ({
    ...item,
    pct: total > 0 ? Math.round((item.minutes / total) * 100) : 0,
  }));

  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-day-task-donut";

  const body = document.createElement("div");
  body.className = "lp-tr2-day-task-donut-body";

  const viz = document.createElement("div");
  viz.className = "lp-tr2-day-task-donut-viz";
  viz.setAttribute("aria-hidden", "true");

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 98;
  const rInner = 60;
  const svg = svgEl("svg", {
    class: "lp-tr2-day-task-donut-svg",
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
  });
  const gap = colored.length > 1 ? 0.04 : 0;
  const usable = Math.PI * 2 - gap * colored.length;
  let angle = -Math.PI / 2;
  colored.forEach((item) => {
    const mins = Math.max(0, Number(item.minutes) || 0);
    if (mins <= 0 || total <= 0) return;
    const slice = (mins / total) * usable;
    if (slice <= 0) return;
    const d = donutSlicePath(cx, cy, r, rInner, angle, angle + slice);
    if (d) {
      const path = svgEl("path", { d, fill: item.color });
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${item.name} ${formatMinutesAsHhMm(mins)} · ${item.pct}%`;
      path.appendChild(title);
      svg.appendChild(path);
    }
    angle += slice + gap;
  });
  viz.appendChild(svg);

  const center = document.createElement("div");
  center.className = "lp-tr2-day-task-donut-center";
  const cap = document.createElement("span");
  cap.className = "lp-tr2-day-task-donut-cap";
  cap.textContent = "전체";
  const totalEl = document.createElement("strong");
  totalEl.className = "lp-tr2-day-task-donut-total";
  totalEl.textContent = formatMinutesAsHhMm(total);
  center.append(cap, totalEl);
  viz.appendChild(center);

  const list = document.createElement("ul");
  list.className = "lp-tr2-day-task-donut-list";
  list.setAttribute("aria-label", ariaLabel);
  colored.forEach((item) => {
    const li = document.createElement("li");
    li.className = "lp-tr2-day-task-donut-row";
    const bar = document.createElement("span");
    bar.className = "lp-tr2-day-task-donut-bar";
    bar.style.background = item.color;
    bar.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "lp-tr2-day-task-donut-text";
    const name = document.createElement("span");
    name.className = "lp-tr2-day-task-donut-name";
    name.textContent = item.name;
    const meta = document.createElement("span");
    meta.className = "lp-tr2-day-task-donut-meta";
    meta.textContent = `${formatMinutesAsHhMm(item.minutes)} · ${item.pct}%`;
    text.append(name, meta);
    li.append(bar, text);
    list.appendChild(li);
  });

  body.append(viz, list);
  wrap.appendChild(body);
  return wrap;
}

/** 일·주·월·연간 — 과제 트리맵 / 연간은 카테고리 버블 */
function mountTaskTimeMapSection(scrollWrap, range, rows) {
  const isDay = range.start === range.end;
  const dayCount = listDatesInclusive(range.start, range.end).length;
  const isWeek = !isDay && dayCount > 1 && dayCount <= 8;
  const isYear = !isDay && dayCount >= 300;
  const isMonth = !isDay && !isWeek && !isYear;

  const title = isDay
    ? "하루 시간 분포"
    : isWeek
      ? "1주 시간 분포"
      : isYear
        ? "1년 시간 분포"
        : isMonth
          ? "한달 시간 분포"
          : "기간 시간 분포";
  const sec = createSection(
    title,
    "근무·수면은 위에 · 아래는 그 외 과제 비율",
  );

  const { work, sleep, total } = sumWorkSleepMinutesFromRows(rows);
  appendWorkSleepTimeMapSummary(sec, work, sleep, total);

  const items = buildMonthTaskTreemapItems(rows, { excludeWorkSleep: true });
  if (!items.length) {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    if (work > 0 || sleep > 0) {
      note.textContent = "근무·수면 외에 집계할 과제 기록이 없습니다.";
    } else {
      note.textContent = isDay
        ? "이날 집계할 과제 기록이 없습니다."
        : isWeek
          ? "이 주에 집계할 과제 기록이 없습니다."
          : isYear
            ? "이 해에 집계할 과제 기록이 없습니다."
            : "이 기간에 집계할 과제 기록이 없습니다.";
    }
    sec.appendChild(note);
    scrollWrap.appendChild(sec);
    return;
  }

  const restBlock = createRatingBlock(
    "그 외 시간",
    "근무·수면 제외 · 조각 크기 = 과제 시간 비율",
  );
  restBlock.appendChild(
    renderDayTaskTimeDonut(items, {
      ariaLabel: `${title} · 근무·수면 제외 과제별 사용 시간`,
    }),
  );
  sec.appendChild(restBlock);
  scrollWrap.appendChild(sec);
}

function mountDonutSection(scrollWrap, range, rows) {
  const snap = getTimeReportDonutSnapshotForDateRange(
    range.start,
    range.end,
    rows,
  );
  const radarSnap = buildCategoryTimeRadarFromDonutSnap(snap);
  const isDay = range?.start === range?.end;
  const sec = createSection(
    "시간의 방향",
    isDay
      ? "수면·근무 제외 · 카테고리별 기록 시간"
      : "수면·근무 제외 · 점수와 앞으로의 방향 확률",
  );
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-donut-wrap";

  const hasProdNonProd = snap.totalHours > 0;
  const scoreOpts = { showProbabilities: !isDay };

  if (!hasProdNonProd) {
    wrap.appendChild(renderCategoryTimeRadarChart(radarSnap));
    const empty = document.createElement("p");
    empty.className = "lp-tr2-donut-legend-empty";
    empty.textContent = "집계할 생산·비생산 기록이 없습니다.";
    wrap.appendChild(empty);
    mountFieldTimeScoresRow(wrap, snap, scoreOpts);
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

  mountFieldTimeScoresRow(wrap, snap, scoreOpts);
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
  /* 기록은 한 번만 읽고 섹션에 공유 */
  const allRows = loadTimeRows();
  const rows = rowsInRange(range.start, range.end, allRows);
  /* 습관 동기화는 레포트당 1회 — 습관 점검·행복 루틴이 중복 호출하지 않음 */
  try {
    syncHabitTrackerLogs({ throttleMs: 2500 });
  } catch (_) {}

  const mountGen = (scrollWrap._lpTr2MountGen =
    (scrollWrap._lpTr2MountGen || 0) + 1);
  const alive = () =>
    scrollWrap.isConnected && scrollWrap._lpTr2MountGen === mountGen;
  /* remount·청크 추가 중 스크롤이 0으로 튀지 않게 */
  const preserveTop = Math.max(0, Math.round(Number(scrollWrap.scrollTop) || 0));
  const reapplyScroll = () => {
    if (!alive() || preserveTop <= 0) return;
    if (scrollWrap.scrollTop + 2 < preserveTop) {
      scrollWrap.scrollTop = preserveTop;
    }
  };

  scrollWrap.classList.remove("lp-time-report-body--empty");
  scrollWrap.classList.add("lp-tr2-root");

  const flushChunk = (buildFn) => {
    if (!alive()) return;
    const stage = document.createElement("div");
    buildFn(stage);
    while (stage.firstChild) scrollWrap.appendChild(stage.firstChild);
    reapplyScroll();
  };

  /* 1) 상단 요약 먼저 — 로딩이 바로 내용으로 바뀜 */
  scrollWrap.replaceChildren();
  flushChunk((stage) => {
    mountHeroSection(stage, range, rows);
    mountDayCompareSection(stage, range, allRows);
    mountDonutSection(stage, range, rows);
  });
  reapplyScroll();

  const schedule =
    typeof requestAnimationFrame === "function"
      ? (fn) => requestAnimationFrame(fn)
      : (fn) => setTimeout(fn, 0);

  /* 2) 수면·섭취·감정·이동 */
  schedule(() => {
    if (!alive()) return;
    flushChunk((stage) => {
      mountTaskTimeMapSection(stage, range, rows);
      mountSleepSection(stage, range, rows, allRows);
      mountIntakeSection(stage, range, rows);
      mountEmotionSection(stage, range, rows);
      mountMoveSection(stage, range, rows);
    });
    /* 3) 미디어·대화·독서·습관 */
    schedule(() => {
      if (!alive()) return;
      flushChunk((stage) => {
        mountMediaSection(stage, range, rows);
        mountConversationReportSection(stage, range, rows);
        mountReadingSection(stage, rows);
        mountYearKpiGoalReportSection(stage, range, allRows);
        mountHabitCheckSection(stage, range, { skipSync: true });
        mountHappinessRoutineSection(stage, range, { skipSync: true });
      });
      /* 4) 집중·계획 */
      schedule(() => {
        if (!alive()) return;
        flushChunk((stage) => {
          mountFocusReportSection(stage, range, rows);
          mountPlanAdherenceSection(stage, range, rows);
        });
      });
    });
  });
}
