/** 건강 목표 로그 — 날짜별 선 그래프 */

const CHART = {
  stroke: "#2563eb",
  strokeWidth: 2.5,
  dotFill: "#2563eb",
  dotStroke: "#ffffff",
  grid: "#e2e8f0",
  axis: "#cbd5e1",
  target: "#f59e0b",
  area: "rgba(37, 99, 235, 0.12)",
  label: "#000000",
  subLabel: "#64748b",
};

export function parseHealthGoalLogDateKey(log) {
  if (log?.dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(String(log.dateRaw))) {
    return String(log.dateRaw);
  }
  const d = String(log?.date || "");
  const m = d.match(/(\d{4})\.?\s*(\d{1,2})\.?\s*(\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return "";
}

export function parseHealthGoalLogNum(str) {
  const n = parseFloat(String(str || "").replace(/[^\d.-]/g, ""));
  return Number.isNaN(n) ? null : n;
}

export function formatHealthGoalChartDateLabel(dateKey) {
  const parts = String(dateKey || "").split("-");
  if (parts.length !== 3) return dateKey || "";
  return `${parseInt(parts[1], 10)}.${parseInt(parts[2], 10)}`;
}

export function formatHealthGoalChartDateLabelLong(dateKey) {
  const parts = String(dateKey || "").split("-");
  if (parts.length !== 3) return dateKey || "";
  return `${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일`;
}

export const HEALTH_GOAL_CHART_RANGES = [
  { id: "week", label: "1주", days: 7 },
  { id: "month", label: "1달", days: 30 },
  { id: "quarter", label: "3달", days: 90 },
  { id: "all", label: "전체", days: null },
];

function shiftDateKey(dateKey, deltaDays) {
  const parts = String(dateKey || "").split("-").map(Number);
  if (parts.length !== 3) return dateKey;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 최근 기록 기준으로 기간 필터 (데이터 없는 날은 건너뜀) */
export function filterHealthGoalChartPoints(points, rangeId) {
  const sorted = [...(points || [])].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  if (!sorted.length || rangeId === "all") return sorted;
  const range = HEALTH_GOAL_CHART_RANGES.find((r) => r.id === rangeId);
  if (!range?.days) return sorted;
  const endKey = sorted[sorted.length - 1].dateKey;
  const startKey = shiftDateKey(endKey, -(range.days - 1));
  return sorted.filter((p) => p.dateKey >= startKey && p.dateKey <= endKey);
}

export function buildHealthGoalChartCaption(points) {
  if (!points.length) return "";
  if (points.length === 1) {
    return `${formatHealthGoalChartDateLabelLong(points[0].dateKey)} · 1건`;
  }
  const first = points[0];
  const last = points[points.length - 1];
  return `${formatHealthGoalChartDateLabelLong(first.dateKey)} ~ ${formatHealthGoalChartDateLabelLong(last.dateKey)} · ${points.length}건`;
}

/** 같은 날짜는 마지막 로그 값 사용, 날짜 오름차순 */
export function buildHealthGoalChartPoints(logs) {
  const byDate = new Map();
  for (const log of logs || []) {
    const dateKey = parseHealthGoalLogDateKey(log);
    const value = parseHealthGoalLogNum(log.value);
    if (!dateKey || value == null) continue;
    byDate.set(dateKey, {
      dateKey,
      value,
      label: formatHealthGoalChartDateLabel(dateKey),
    });
  }
  return [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function fmtAxisNum(n) {
  if (n == null || Number.isNaN(n)) return "";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function computeYDomain(values, target) {
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (target != null) {
    yMin = Math.min(yMin, target);
    yMax = Math.max(yMax, target);
  }
  const center = (yMin + yMax) / 2;
  let span = yMax - yMin;
  const minSpan = Math.max(2, Math.abs(center) * 0.06) || 2;
  if (span < minSpan) {
    yMin = center - minSpan / 2;
    yMax = center + minSpan / 2;
  } else {
    const pad = span * 0.18;
    yMin -= pad;
    yMax += pad;
  }
  return { yMin, yMax, yRange: yMax - yMin || 1 };
}

function el(svgNs, tag, attrs = {}) {
  const node = document.createElementNS(svgNs, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

function addValueLabel(svg, svgNs, x, y, text, above = true) {
  const labelY = above ? y - 10 : y + 16;
  const textW = Math.max(36, text.length * 6.2);
  const bg = el(svgNs, "rect", {
    x: x - textW / 2,
    y: labelY - 11,
    width: textW,
    height: 14,
    rx: 4,
    fill: "#ffffff",
    stroke: "#e2e8f0",
    "stroke-width": 1,
  });
  svg.appendChild(bg);
  const label = el(svgNs, "text", {
    x,
    y: labelY,
    fill: CHART.label,
    "font-size": 10,
    "font-weight": 600,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
  });
  label.textContent = text;
  svg.appendChild(label);
}

function shouldShowValueLabel(index, total) {
  if (total <= 7) return true;
  if (total <= 14) {
    return index === 0 || index === total - 1;
  }
  return false;
}

function shouldShowDateLabel(index, total) {
  if (total <= 10) return true;
  const step = total <= 20 ? 2 : 3;
  return index === 0 || index === total - 1 || index % step === 0;
}

function chartWidthForPoints(count) {
  const minPlotGap = 40;
  const base = 320;
  const padX = 44 + 16;
  if (count <= 1) return base;
  const needed = padX + (count - 1) * minPlotGap + 24;
  return Math.max(base, needed);
}

/**
 * @param {HTMLElement} container
 * @param {{ points: Array<{dateKey:string,value:number,label:string}>, targetValue?: string|null, unit?: string }} opts
 */
export function renderHealthGoalLineChart(container, opts = {}) {
  if (!container) return;
  const points = opts.points || [];
  const unit = (opts.unit || "").trim();
  container.innerHTML = "";

  if (!points.length) {
    const empty = document.createElement("p");
    empty.className = "health-goal-graph-empty";
    empty.textContent = "선택한 기간에 기록이 없습니다.";
    container.appendChild(empty);
    return;
  }

  const W = chartWidthForPoints(points.length);
  const H = 240;
  const pad = { top: 28, right: 16, bottom: 42, left: 44 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const plotBottom = pad.top + plotH;

  const values = points.map((p) => p.value);
  const target = parseHealthGoalLogNum(opts.targetValue);
  const { yMin, yMax, yRange } = computeYDomain(values, target);

  const xAt = (i) =>
    pad.left +
    (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yAt = (v) => pad.top + plotH - ((v - yMin) / yRange) * plotH;

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = el(svgNs, "svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "health-goal-graph-svg",
    role: "img",
    "aria-label": `날짜별 ${unit || "값"} 기록 선 그래프`,
  });

  svg.appendChild(
    el(svgNs, "rect", {
      x: pad.left,
      y: pad.top,
      width: plotW,
      height: plotH,
      fill: "#f8fafc",
      rx: 8,
    }),
  );

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i += 1) {
    const v = yMin + (yRange * i) / gridLines;
    const y = yAt(v);
    svg.appendChild(
      el(svgNs, "line", {
        x1: pad.left,
        x2: W - pad.right,
        y1: y,
        y2: y,
        stroke: CHART.grid,
        "stroke-width": 1,
      }),
    );
    const tick = el(svgNs, "text", {
      x: pad.left - 8,
      y: y + 3,
      fill: CHART.subLabel,
      "font-size": 10,
      "text-anchor": "end",
    });
    tick.textContent = fmtAxisNum(v);
    svg.appendChild(tick);
  }

  svg.appendChild(
    el(svgNs, "line", {
      x1: pad.left,
      x2: pad.left,
      y1: pad.top,
      y2: plotBottom,
      stroke: CHART.axis,
      "stroke-width": 1.25,
    }),
  );
  svg.appendChild(
    el(svgNs, "line", {
      x1: pad.left,
      x2: W - pad.right,
      y1: plotBottom,
      y2: plotBottom,
      stroke: CHART.axis,
      "stroke-width": 1.25,
    }),
  );

  if (target != null) {
    const ty = yAt(target);
    svg.appendChild(
      el(svgNs, "line", {
        x1: pad.left,
        x2: W - pad.right,
        y1: ty,
        y2: ty,
        stroke: CHART.target,
        "stroke-width": 1.5,
        "stroke-dasharray": "6 4",
      }),
    );
  }

  const plotPoints = points.map((p, i) => ({ ...p, x: xAt(i), y: yAt(p.value) }));

  if (plotPoints.length > 1) {
    const areaD = [
      `M ${plotPoints[0].x} ${plotBottom}`,
      ...plotPoints.map((p) => `L ${p.x} ${p.y}`),
      `L ${plotPoints[plotPoints.length - 1].x} ${plotBottom}`,
      "Z",
    ].join(" ");
    svg.appendChild(
      el(svgNs, "path", {
        d: areaD,
        fill: CHART.area,
        stroke: "none",
      }),
    );

    const lineD = plotPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    svg.appendChild(
      el(svgNs, "path", {
        d: lineD,
        fill: "none",
        stroke: CHART.stroke,
        "stroke-width": CHART.strokeWidth,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
  } else if (plotPoints.length === 1) {
    svg.appendChild(
      el(svgNs, "line", {
        x1: pad.left,
        x2: W - pad.right,
        y1: plotPoints[0].y,
        y2: plotPoints[0].y,
        stroke: CHART.stroke,
        "stroke-width": 1.5,
        "stroke-dasharray": "4 4",
        opacity: 0.35,
      }),
    );
  }

  plotPoints.forEach((p, index) => {
    svg.appendChild(
      el(svgNs, "circle", {
        cx: p.x,
        cy: p.y,
        r: 5,
        fill: CHART.dotFill,
        stroke: CHART.dotStroke,
        "stroke-width": 2,
      }),
    );

    const showValue = shouldShowValueLabel(index, plotPoints.length);
    if (showValue) {
      const nearTarget =
        target != null && Math.abs(p.y - yAt(target)) < 18;
      addValueLabel(
        svg,
        svgNs,
        p.x,
        p.y,
        `${fmtAxisNum(p.value)}${unit ? ` ${unit}` : ""}`,
        !nearTarget,
      );
    }

    if (shouldShowDateLabel(index, plotPoints.length)) {
      svg.appendChild(
        el(svgNs, "line", {
          x1: p.x,
          x2: p.x,
          y1: plotBottom,
          y2: plotBottom + 4,
          stroke: CHART.axis,
          "stroke-width": 1,
        }),
      );

      const dateLabel = el(svgNs, "text", {
        x: p.x,
        y: H - 12,
        fill: CHART.subLabel,
        "font-size": 10,
        "text-anchor": "middle",
      });
      dateLabel.textContent = p.label;
      svg.appendChild(dateLabel);
    }
  });

  const scroll = document.createElement("div");
  scroll.className = "health-goal-graph-chart-scroll";
  if (W > 320) scroll.classList.add("health-goal-graph-chart-scroll--wide");
  scroll.appendChild(svg);

  if (opts.caption) {
    const caption = document.createElement("p");
    caption.className = "health-goal-graph-caption";
    caption.textContent = opts.caption;
    container.appendChild(caption);
  }

  container.appendChild(scroll);

  if (W > 320) {
    scroll.scrollLeft = scroll.scrollWidth;
  }

  if (target != null) {
    const legend = document.createElement("div");
    legend.className = "health-goal-graph-legend";
    legend.innerHTML = `<span class="health-goal-graph-legend-line"></span> 목표 ${fmtAxisNum(target)}${unit ? ` ${unit}` : ""}`;
    container.appendChild(legend);
    return;
  }
}
