/**
 * 시간 레포트 v2 — 조회 기간 전체 기준, 기록 내용 중심 UI
 */

import {
  isHealthyMealDetailTaskName,
  isUnhealthyMealDetailTaskName,
} from "./timeTaskOptionsConstants.js";
import {
  formatIntegerMinutesDurationKo,
  formatInvestReclaimWonDisplay,
  formatLedgerLossKrwDisplay,
  formatYmdDotsWithWeekdayKo,
  getTimeReportDonutSnapshotForDateRange,
  getTimeReportHeroSnapshotForDateRange,
  getTimeReportSummaryGridForDateRange,
  getTimeReportMonthInclusiveRange,
  loadTimeRows,
  parseTimeToHours,
} from "../views/Time.js";

const SLEEP_TARGET_MIN = 7 * 60;
const CHART_COLORS = {
  sleep: "#818cf8",
  healthy: "#16a34a",
  unhealthy: "#ea580c",
  media: "#9333ea",
};

const DONUT_CAT_COLORS = {
  dream: "#7BAFD4",
  sideincome: "#6B9FD4",
  happiness: "#8FAFD4",
  health: "#A8BED4",
  pleasure: "#C4906A",
  media_watch: "#A67C8A",
  unhappiness: "#8B90A8",
  unhealthy: "#6B7280",
  moneylosing: "#7A8E9A",
  other: "#CBD5E1",
  "": "#CBD5E1",
};

const PROD_CATEGORY_KEYS = new Set([
  "dream",
  "sideincome",
  "happiness",
  "health",
]);

function donutCategoryColor(catKey) {
  const k = String(catKey || "").trim() || "other";
  return DONUT_CAT_COLORS[k] || DONUT_CAT_COLORS.other;
}

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

function createBarRow(label, minutes, maxMinutes, color, title) {
  const row = document.createElement("div");
  row.className = "lp-tr2-bar-row";
  if (title) row.title = title;
  const lab = document.createElement("span");
  lab.className = "lp-tr2-bar-label";
  lab.textContent = label;
  const track = document.createElement("div");
  track.className = "lp-tr2-bar-track";
  const fill = document.createElement("div");
  fill.className = "lp-tr2-bar-fill";
  const pct =
    maxMinutes > 0 ? Math.min(100, (minutes / maxMinutes) * 100) : 0;
  fill.style.width = `${pct}%`;
  fill.style.background = color;
  const val = document.createElement("span");
  val.className = "lp-tr2-bar-value";
  val.textContent =
    minutes > 0 ? formatIntegerMinutesDurationKo(minutes) : "—";
  track.appendChild(fill);
  row.appendChild(lab);
  row.appendChild(track);
  row.appendChild(val);
  return row;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
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
  const minSlot = totalDays <= 7 ? 34 : totalDays <= 14 ? 24 : 16;
  const pad = { top: 18, right: 8, bottom: 24, left: 28 };
  const W = Math.max(300, pad.left + pad.right + totalDays * minSlot);
  const H = 128;
  return { W, H, pad, minSlot, scroll: totalDays > 14 };
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
      fill: "#f8fafc",
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
        stroke: isTarget ? "#fde68a" : "#e2e8f0",
        "stroke-width": isTarget ? 1.25 : 1,
      }),
    );
    const tick = svgEl("text", {
      x: pad.left - 5,
      y: y + 3,
      fill: isTarget ? "#d97706" : "#94a3b8",
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
      stroke: "#cbd5e1",
      "stroke-width": 1,
    }),
  );
  svg.appendChild(
    svgEl("line", {
      x1: pad.left,
      x2: W - pad.right,
      y1: plotBottom,
      y2: plotBottom,
      stroke: "#cbd5e1",
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
        fill: "#94a3b8",
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
        fill: metGoal ? "#15803d" : "#475569",
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

function buildSleepStatsGrid(daysWithSleep) {
  const grid = document.createElement("div");
  grid.className = "lp-tr2-sleep-stats";
  const total = daysWithSleep.reduce((a, x) => a + x.minutes, 0);
  const avg = formatIntegerMinutesDurationKo(
    Math.round(total / daysWithSleep.length),
  );
  const mins = daysWithSleep.map((x) => x.minutes);
  const metDays = daysWithSleep.filter(
    (x) => x.minutes >= SLEEP_TARGET_MIN,
  ).length;

  const addStat = (label, value) => {
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
    grid.appendChild(cell);
  };

  addStat("평균", avg);
  if (daysWithSleep.length > 1) {
    addStat("최소", formatIntegerMinutesDurationKo(Math.min(...mins)));
    addStat("최대", formatIntegerMinutesDurationKo(Math.max(...mins)));
  }
  addStat("목표 달성", `${metDays}/${daysWithSleep.length}일`);
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

function mergeMediaEntriesByNote(entries) {
  /** @type {Map<string, number>} */
  const map = new Map();
  entries.forEach(({ note, minutes }) => {
    const key = String(note || "").trim() || "__empty__";
    map.set(key, (map.get(key) || 0) + minutes);
  });
  return [...map.entries()]
    .map(([key, minutes]) => ({
      note: key === "__empty__" ? "" : key,
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

function buildMediaReportSnapshot(rows) {
  /** @type {Map<string, { minutes: number, entries: Array<{ note: string, minutes: number }> }>} */
  const byDate = new Map();
  /** @type {Map<string, number>} */
  const byNote = new Map();
  let totalMinutes = 0;

  rows.forEach((r) => {
    if (String(r.category || "").trim() !== "media_watch") return;
    const date = rowDateYmd(r);
    if (!date) return;
    const mins = rowMinutes(r);
    if (mins <= 0) return;
    const note = rowUserNote(r);

    totalMinutes += mins;

    if (!byDate.has(date)) byDate.set(date, { minutes: 0, entries: [] });
    const day = byDate.get(date);
    day.minutes += mins;
    day.entries.push({ note, minutes: mins });

    const noteKey = note.trim();
    if (noteKey) {
      byNote.set(noteKey, (byNote.get(noteKey) || 0) + mins);
    }
  });

  const days = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, { minutes, entries }]) => {
      const avail = getDayAvailableMinutes(date);
      const pct = avail > 0 ? Math.round((minutes / avail) * 100) : 0;
      return {
        date,
        minutes,
        availableMinutes: avail,
        pct,
        items: mergeMediaEntriesByNote(entries),
      };
    });

  let totalAvailable = 0;
  days.forEach((d) => {
    totalAvailable += d.availableMinutes;
  });
  const periodPct =
    totalAvailable > 0 ? Math.round((totalMinutes / totalAvailable) * 100) : 0;
  const avgDayPct =
    days.length > 0
      ? Math.round(days.reduce((a, d) => a + d.pct, 0) / days.length)
      : 0;

  const topContent = [...byNote.entries()]
    .map(([label, minutes]) => ({
      label,
      minutes,
      pct: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  return {
    totalMinutes,
    periodPct,
    avgDayPct,
    totalAvailableMinutes: totalAvailable,
    days,
    topContent,
    dayCount: days.length,
  };
}

function buildMediaDayCard(day) {
  const card = document.createElement("article");
  card.className = "lp-tr2-media-day-card";

  const head = document.createElement("div");
  head.className = "lp-tr2-media-day-card-head";
  const dateEl = document.createElement("span");
  dateEl.className = "lp-tr2-media-day-card-date";
  dateEl.textContent = formatCompactReportDate(day.date);
  dateEl.title = formatYmdDotsWithWeekdayKo(day.date);
  const timeEl = document.createElement("strong");
  timeEl.className = "lp-tr2-media-day-card-time";
  timeEl.textContent = formatIntegerMinutesDurationKo(day.minutes);
  head.appendChild(dateEl);
  head.appendChild(timeEl);

  const avail = document.createElement("p");
  avail.className = "lp-tr2-media-day-card-avail";
  avail.textContent = `가용 ${formatIntegerMinutesDurationKo(day.availableMinutes)} 중 ${day.pct}%를 시청`;

  const barTrack = document.createElement("div");
  barTrack.className = "lp-tr2-media-day-card-bar";
  barTrack.setAttribute("role", "img");
  barTrack.setAttribute(
    "aria-label",
    `가용시간 대비 ${day.pct}%`,
  );
  const barFill = document.createElement("div");
  barFill.className = "lp-tr2-media-day-card-bar-fill";
  barFill.style.width = `${Math.min(100, Math.max(2, day.pct))}%`;
  barTrack.appendChild(barFill);

  const list = document.createElement("ul");
  list.className = "lp-tr2-media-day-card-list";
  day.items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "lp-tr2-media-day-card-item";
    const lab = document.createElement("span");
    lab.className = "lp-tr2-media-day-card-label";
    lab.textContent = item.note || "메모 없음";
    if (!item.note) lab.classList.add("lp-tr2-media-day-card-label--empty");
    const tm = document.createElement("span");
    tm.className = "lp-tr2-media-day-card-item-time";
    tm.textContent = formatIntegerMinutesDurationKo(item.minutes);
    li.appendChild(lab);
    li.appendChild(tm);
    list.appendChild(li);
  });

  card.appendChild(head);
  card.appendChild(avail);
  card.appendChild(barTrack);
  card.appendChild(list);
  return card;
}

function mountMediaSection(scrollWrap, range, rows) {
  const snap = buildMediaReportSnapshot(rows);
  const rangeDayCount = listDatesInclusive(range.start, range.end).length;
  const sec = createSection(
    "콘텐츠·미디어 시청",
    "날짜별 · 가용시간 대비 얼마나 봤는지 · 무엇을 봤는지",
  );

  if (snap.totalMinutes <= 0) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-media-empty";
    empty.textContent = "미디어 시청 기록이 없습니다.";
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
  heroSub.textContent = `총 ${formatIntegerMinutesDurationKo(snap.totalMinutes)} · ${snap.dayCount}일 기록 · 하루 평균 ${snap.avgDayPct}%`;
  hero.appendChild(heroMain);
  hero.appendChild(heroSub);
  sec.appendChild(hero);

  const dayWrap = document.createElement("div");
  dayWrap.className = "lp-tr2-media-days";
  if (rangeDayCount >= 7 || snap.days.length > 4) {
    dayWrap.classList.add("lp-tr2-media-days--scroll");
  }
  const dayTitle = document.createElement("p");
  dayTitle.className = "lp-tr2-media-days-title";
  dayTitle.textContent = "날짜별 — 이런 걸 이만큼 봤어요";
  dayWrap.appendChild(dayTitle);

  const dayList = document.createElement("div");
  dayList.className = "lp-tr2-media-day-list";
  snap.days.forEach((day) => {
    dayList.appendChild(buildMediaDayCard(day));
  });
  dayWrap.appendChild(dayList);
  sec.appendChild(dayWrap);

  if (snap.topContent.length) {
    const top = document.createElement("div");
    top.className = "lp-tr2-media-top";
    const topTitle = document.createElement("p");
    topTitle.className = "lp-tr2-media-top-title";
    topTitle.textContent = "이 기간에 자주 본 내용";
    top.appendChild(topTitle);
    const topList = document.createElement("ul");
    topList.className = "lp-tr2-media-top-list";
    snap.topContent.forEach(({ label, minutes, pct }) => {
      const li = document.createElement("li");
      li.className = "lp-tr2-media-top-item";
      const lab = document.createElement("span");
      lab.className = "lp-tr2-media-top-label";
      lab.textContent = label;
      const meta = document.createElement("span");
      meta.className = "lp-tr2-media-top-meta";
      meta.textContent = `${formatIntegerMinutesDurationKo(minutes)} · 전체의 ${pct}%`;
      li.appendChild(lab);
      li.appendChild(meta);
      topList.appendChild(li);
    });
    top.appendChild(topList);
    sec.appendChild(top);
  }

  scrollWrap.appendChild(sec);
}

function collectActionLogs(rows, keywords) {
  const kws = keywords.map((k) => String(k).trim()).filter(Boolean);
  if (!kws.length) return [];
  /** @type {{ date: string, main: string, sub: string }[]} */
  const out = [];
  rows.forEach((r) => {
    const tn = String(r.taskName || "").trim();
    if (!tn || !kws.some((k) => tn.includes(k))) return;
    const date = rowDateYmd(r);
    if (!date) return;
    const note = rowUserNote(r);
    const main = note ? `${tn} — ${note}` : tn;
    const mins = rowMinutes(r);
    out.push({
      date,
      main,
      sub: mins > 0 ? formatIntegerMinutesDurationKo(mins) : "",
    });
  });
  out.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || a.main.localeCompare(b.main, "ko"),
  );
  return out;
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

function mountSleepSection(scrollWrap, range) {
  const dates = listDatesInclusive(range.start, range.end);
  const sec = createSection(
    "수면 기록",
    "막대=실제 수면 · 연한 주황=7시간까지 · 점선=목표선",
  );
  const sleepByDay = dates.map((d) => ({
    date: d,
    minutes: getTimeReportSummaryGridForDateRange(d, d).sleepMinutes,
  }));

  const daysWithSleep = sleepByDay.filter((x) => x.minutes > 0);
  if (daysWithSleep.length) {
    const chartWrap = document.createElement("div");
    chartWrap.className = "lp-tr2-sleep-chart-wrap";
    const canvas = document.createElement("div");
    canvas.className = "lp-tr2-sleep-chart-canvas";
    const { scroll } = renderSleepGoalBarChart(canvas, sleepByDay) || {};
    if (scroll) canvas.classList.add("lp-tr2-sleep-chart-canvas--scroll");
    chartWrap.appendChild(canvas);
    chartWrap.appendChild(buildSleepChartLegend());
    sec.appendChild(chartWrap);
    sec.appendChild(buildSleepStatsGrid(daysWithSleep));
  } else {
    const note = document.createElement("p");
    note.className = "lp-tr2-chart-note";
    note.textContent = "이 기간에 수면 기록이 없습니다.";
    sec.appendChild(note);
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

function annularSectorPath(cx, cy, rOut, rIn, a0, a1) {
  const span = a1 - a0;
  if (span <= 1e-9) return "";
  const twoPi = Math.PI * 2;
  if (span >= twoPi - 1e-5) {
    return `${annularSectorPath(cx, cy, rOut, rIn, a0, a0 + Math.PI)} ${annularSectorPath(cx, cy, rOut, rIn, a0 + Math.PI, a0 + twoPi)}`;
  }
  const large = span > Math.PI ? 1 : 0;
  const x1 = cx + rOut * Math.cos(a0);
  const y1 = cy + rOut * Math.sin(a0);
  const x2 = cx + rOut * Math.cos(a1);
  const y2 = cy + rOut * Math.sin(a1);
  const x3 = cx + rIn * Math.cos(a1);
  const y3 = cy + rIn * Math.sin(a1);
  const x4 = cx + rIn * Math.cos(a0);
  const y4 = cy + rIn * Math.sin(a0);
  return `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4} Z`;
}

function mountDonutSection(scrollWrap, range) {
  const snap = getTimeReportDonutSnapshotForDateRange(range.start, range.end);
  const sec = createSection(
    "생산 · 비생산 시간",
    "수면·근무 제외 · 색=카테고리 · 막대=비율",
  );
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-donut-wrap";

  if (!snap.totalHours || snap.totalHours <= 0) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-donut-legend-empty";
    empty.textContent = "집계할 생산·비생산 기록이 없습니다.";
    wrap.appendChild(empty);
    sec.appendChild(wrap);
    scrollWrap.appendChild(sec);
    return;
  }

  const { prod, nonProd, ordered } = orderDonutSegments(snap.segments);
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

  const body = document.createElement("div");
  body.className = "lp-tr2-donut-body";

  const viz = document.createElement("div");
  viz.className = "lp-tr2-donut-viz";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.classList.add("lp-tr2-donut-svg");

  const center = document.createElement("div");
  center.className = "lp-tr2-donut-center";
  const cap = document.createElement("span");
  cap.className = "lp-tr2-donut-cap";
  cap.textContent = "합계";
  const strong = document.createElement("strong");
  strong.className = "lp-tr2-donut-total";
  strong.textContent = formatIntegerMinutesDurationKo(snap.totalMinutesRounded);
  const sub = document.createElement("span");
  sub.className = "lp-tr2-donut-sub";
  sub.textContent = `생산 ${formatPctRounded(prodPct)}`;
  center.appendChild(cap);
  center.appendChild(strong);
  center.appendChild(sub);

  const SEG_GAP = 0.025;
  const GROUP_GAP = prod.length && nonProd.length ? 0.06 : 0;
  const totalGap =
    ordered.length * SEG_GAP + (prod.length && nonProd.length ? GROUP_GAP : 0);
  const availAngle = Math.PI * 2 - totalGap;
  let angle = -Math.PI / 2;

  ordered.forEach((s, i) => {
    if (i > 0 && prod.length && i === prod.length) {
      angle += GROUP_GAP;
    }
    const span = (s.hours / snap.totalHours) * availAngle;
    const color = donutCategoryColor(s.key);
    const d = annularSectorPath(100, 100, 90, 52, angle, angle + span);
    if (d) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", color);
      path.setAttribute("stroke", "#ffffff");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linejoin", "round");
      const titleEl = document.createElementNS(SVG_NS, "title");
      titleEl.textContent = `${s.label} · ${formatIntegerMinutesDurationKo(Math.round(s.hours * 60))} · ${formatPctRounded((s.hours / snap.totalHours) * 100)}`;
      path.appendChild(titleEl);
      svg.appendChild(path);
    }
    angle += span + SEG_GAP;
  });

  viz.appendChild(svg);
  viz.appendChild(center);
  body.appendChild(viz);

  const legend = document.createElement("div");
  legend.className = "lp-tr2-donut-legend";

  const addLegendGroup = (title, items, tone) => {
    if (!items.length) return;
    const head = document.createElement("p");
    head.className = `lp-tr2-donut-legend-group lp-tr2-donut-legend-group--${tone}`;
    head.textContent = title;
    legend.appendChild(head);
    const list = document.createElement("ul");
    list.className = "lp-tr2-donut-legend-list";
    items.forEach((s) => {
      const pct = (s.hours / snap.totalHours) * 100;
      const mins = Math.round(s.hours * 60);
      const color = donutCategoryColor(s.key);
      const li = document.createElement("li");
      li.className = "lp-tr2-donut-legend-item";
      const dot = document.createElement("span");
      dot.className = "lp-tr2-donut-legend-dot";
      dot.style.background = color;
      const bodyEl = document.createElement("div");
      bodyEl.className = "lp-tr2-donut-legend-body";
      const row = document.createElement("div");
      row.className = "lp-tr2-donut-legend-head";
      const lab = document.createElement("span");
      lab.className = "lp-tr2-donut-legend-label";
      lab.textContent = s.label;
      const meta = document.createElement("span");
      meta.className = "lp-tr2-donut-legend-meta";
      meta.textContent = `${formatIntegerMinutesDurationKo(mins)} · ${formatPctRounded(pct)}`;
      row.appendChild(lab);
      row.appendChild(meta);
      const barTrack = document.createElement("div");
      barTrack.className = "lp-tr2-donut-legend-bar";
      const barFill = document.createElement("div");
      barFill.className = "lp-tr2-donut-legend-bar-fill";
      barFill.style.width = `${Math.max(2, pct)}%`;
      barFill.style.background = color;
      barTrack.appendChild(barFill);
      bodyEl.appendChild(row);
      bodyEl.appendChild(barTrack);
      li.appendChild(dot);
      li.appendChild(bodyEl);
      list.appendChild(li);
    });
    legend.appendChild(list);
  };

  addLegendGroup("생산", prod, "prod");
  addLegendGroup("비생산", nonProd, "nonprod");

  body.appendChild(legend);
  wrap.appendChild(body);
  sec.appendChild(wrap);
  scrollWrap.appendChild(sec);
}

function mountActionSections(scrollWrap, range, rows) {
  const hero = getTimeReportHeroSnapshotForDateRange(range.start, range.end);
  const summary = getTimeReportSummaryGridForDateRange(range.start, range.end);

  const blocks = [
    {
      title: "근무하기",
      hint: "총 근무 시간",
      summary: formatIntegerMinutesDurationKo(hero.workMinutes),
      logs: [],
    },
    {
      title: "감정·불행",
      hint: "기록 목록",
      summary: summary.unhappinessMinutes
        ? formatIntegerMinutesDurationKo(summary.unhappinessMinutes)
        : "",
      logs: collectActionLogs(rows, ["불행", "감정"]),
    },
    {
      title: "대화·모임",
      hint: "직접 입력한 내용",
      summary: "",
      logs: collectActionLogs(rows, ["대화", "모임", "회의", "미팅"]),
    },
    {
      title: "이동·통근",
      hint: "기록 목록",
      summary: "",
      logs: collectActionLogs(rows, ["이동", "통근", "걸음"]),
    },
    {
      title: "위생·외모",
      hint: "기록 목록",
      summary: "",
      logs: collectActionLogs(rows, ["샤워", "세면", "스킨", "메이크", "외모"]),
    },
    {
      title: "정리·청소",
      hint: "기록 목록",
      summary: "",
      logs: collectActionLogs(rows, ["청소", "정리", "설거지", "빨래"]),
    },
  ];

  const sec = createSection(
    "구매할 수 있는 행동",
    "행동별로 기록 내용을 모았습니다 · 막대 비교 없음",
  );

  blocks.forEach(({ title, hint, summary, logs }) => {
    const block = document.createElement("article");
    block.className = "lp-tr2-action-block";
    const head = document.createElement("div");
    head.className = "lp-tr2-action-block-head";
    const h = document.createElement("h3");
    h.className = "lp-tr2-action-block-title";
    h.textContent = title;
    head.appendChild(h);
    if (summary) {
      const sum = document.createElement("span");
      sum.className = "lp-tr2-action-block-sum";
      sum.textContent = summary;
      head.appendChild(sum);
    }
    block.appendChild(head);
    if (logs.length) {
      block.appendChild(
        buildJournalList(logs, `${title} 기록이 없습니다.`),
      );
    } else if (summary && summary !== "0분" && summary !== "—") {
      const p = document.createElement("p");
      p.className = "lp-tr2-action-block-only-time";
      p.textContent = `${hint}: ${summary}`;
      block.appendChild(p);
    } else {
      const p = document.createElement("p");
      p.className = "lp-tr2-journal-empty";
      p.textContent = `${title} 기록이 없습니다.`;
      block.appendChild(p);
    }
    sec.appendChild(block);
  });

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
  mountSleepSection(scrollWrap, range);
  mountIntakeSection(scrollWrap, range, rows);
  mountMediaSection(scrollWrap, range, rows);
  mountDonutSection(scrollWrap, range);
  mountActionSections(scrollWrap, range, rows);
}
