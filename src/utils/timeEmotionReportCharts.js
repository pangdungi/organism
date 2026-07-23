/**
 * 감정적이기 레포트 — 도넛·바·트리거·히트맵 DOM
 */

import { formatIntegerMinutesDurationKo } from "../views/Time.js";
import {
  EMOTION_CATEGORIES,
  getEmotionCategoryChartColor,
} from "./timeEmotionTaxonomy.js";

const SVG_NS = "http://www.w3.org/2000/svg";
/** 일간 타임라인과 맞춘 대분류 톤 · 농도(적음→많음). 기준색=두려움(보라) */
const HEATMAP_EMPTY = "#eef2f6";
const HEATMAP_BASE = "#7B6BAE";
const HEATMAP_LEVEL_ALPHA = [0, 0.28, 0.48, 0.68, 0.92];
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function hexToRgba(hex, alpha) {
  const raw = String(hex || "").replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(123, 107, 174, ${alpha})`;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function dominantEmotionCategoryId(cats) {
  let bestId = null;
  let bestN = 0;
  for (const [id, n] of Object.entries(cats || {})) {
    if (n > bestN) {
      bestId = id;
      bestN = n;
    }
  }
  return bestId;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function fullDonutRingPath(cx, cy, r, rInner) {
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

function donutArcPath(cx, cy, r, rInner, startAngle, endAngle) {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
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

function donutSlicePath(cx, cy, r, rInner, startAngle, endAngle) {
  const span = endAngle - startAngle;
  if (span >= Math.PI * 2 - 1e-5) {
    return fullDonutRingPath(cx, cy, r, rInner);
  }
  return donutArcPath(cx, cy, r, rInner, startAngle, endAngle);
}

function appendDonutSliceLabel(
  svg,
  cx,
  cy,
  r,
  rInner,
  midAngle,
  label,
  sliceSpan,
) {
  const innerOk = sliceSpan >= 0.38;
  const labelR = innerOk ? (r + rInner) / 2 : r + 16;
  const tx = cx + labelR * Math.cos(midAngle);
  const ty = cy + labelR * Math.sin(midAngle);
  const text = svgEl("text", {
    x: tx.toFixed(1),
    y: ty.toFixed(1),
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    fill: innerOk ? "#ffffff" : "#333333",
    "font-size": innerOk ? "11" : "10",
    "font-weight": "700",
    class: innerOk
      ? "lp-tr2-emotion-donut-slice-label"
      : "lp-tr2-emotion-donut-slice-label lp-tr2-emotion-donut-slice-label--out",
  });
  text.textContent = label;
  svg.appendChild(text);
}

function appendDonutCenterLabel(svg, cx, cy, label, meta) {
  const title = svgEl("text", {
    x: cx,
    y: cy - 2,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    fill: "#111111",
    "font-size": "14",
    "font-weight": "800",
    class: "lp-tr2-emotion-donut-hole-label",
  });
  title.textContent = label;
  svg.appendChild(title);
  if (meta) {
    const sub = svgEl("text", {
      x: cx,
      y: cy + 13,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      fill: "#666666",
      "font-size": "10",
      "font-weight": "600",
      class: "lp-tr2-emotion-donut-hole-meta",
    });
    sub.textContent = meta;
    svg.appendChild(sub);
  }
}

/**
 * @param {{ categories: Array<{ id: string, label: string, count: number, minutes: number }> }} snap
 */
export function renderEmotionCategoryDonut(snap) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-emotion-donut-wrap";

  const items = (snap.categories || []).filter((c) => c.count > 0);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "대분류 데이터가 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  const total = items.reduce((a, c) => a + c.count, 0);
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 78;
  const rInner = 52;

  const ariaParts = items.map(
    (item) => `${item.label} ${item.count}건`,
  );
  const svg = svgEl("svg", {
    class: "lp-tr2-emotion-donut-svg",
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    role: "img",
    "aria-label": `감정 대분류: ${ariaParts.join(", ")}`,
  });

  let angle = -Math.PI / 2;
  const sliceMeta = [];
  items.forEach((item) => {
    const slice = (item.count / total) * Math.PI * 2;
    if (slice <= 0) return;
    const color = getEmotionCategoryChartColor(item.id);
    const start = angle;
    const end = angle + slice;
    const path = svgEl("path", {
      d: donutSlicePath(cx, cy, r, rInner, start, end),
      fill: color,
    });
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = `${item.label} ${item.count}건`;
    path.appendChild(title);
    svg.appendChild(path);
    sliceMeta.push({ item, slice, midAngle: start + slice / 2 });
    angle = end;
  });

  const singleFull =
    items.length === 1 && sliceMeta[0]?.slice >= Math.PI * 2 - 1e-5;

  if (singleFull) {
    const only = items[0];
    appendDonutCenterLabel(
      svg,
      cx,
      cy,
      only.label,
      `${only.count}건 · 100%`,
    );
  } else {
    sliceMeta.forEach(({ item, slice, midAngle }) => {
      appendDonutSliceLabel(
        svg,
        cx,
        cy,
        r,
        rInner,
        midAngle,
        item.label,
        slice,
      );
    });
    appendDonutCenterLabel(svg, cx, cy, `${total}건`, "전체");
  }

  wrap.appendChild(svg);
  return wrap;
}

/**
 * @param {{ subEmotions: Array<{ label: string, categoryLabel: string, count: number, minutes: number }> }} snap
 */
export function renderEmotionSubEmotionBars(snap) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-bars lp-tr2-emotion-sub-bars";
  const items = snap.subEmotions || [];
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "세부 감정 기록이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }
  const max = Math.max(...items.map((x) => x.count), 1);
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "lp-tr2-bar-row lp-tr2-bar-row--emotion-sub";
    const lab = document.createElement("span");
    lab.className = "lp-tr2-bar-label";
    lab.textContent = item.label;
    lab.title = item.categoryLabel;
    const track = document.createElement("div");
    track.className = "lp-tr2-bar-track";
    const fill = document.createElement("div");
    fill.className = "lp-tr2-bar-fill";
    fill.style.width = `${Math.round((item.count / max) * 100)}%`;
    fill.style.background = "#404040";
    track.appendChild(fill);
    const val = document.createElement("span");
    val.className = "lp-tr2-bar-value";
    val.textContent = `${item.count}회`;
    row.append(lab, track, val);
    wrap.appendChild(row);
  });
  return wrap;
}

/**
 * @param {{ triggers: Array<{ label: string, count: number, totalMinutes: number }> }} snap
 */
export function renderEmotionTriggerList(snap) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-emotion-trigger-chips";
  const items = snap.triggers || [];
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "트리거 기록이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }
  items.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "lp-tr2-emotion-trigger-chip";
    chip.innerHTML = `<span class="lp-tr2-emotion-trigger-chip-label">${item.label}</span><span class="lp-tr2-emotion-trigger-chip-meta">${item.count}회 · ${formatIntegerMinutesDurationKo(item.totalMinutes)}</span>`;
    wrap.appendChild(chip);
  });
  return wrap;
}

function heatmapLevel(count, max) {
  if (!count || max <= 0) return 0;
  const ratio = count / max;
  if (ratio >= 0.85) return 4;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.35) return 2;
  if (ratio >= 0.1) return 1;
  return 1;
}

function cellCount(cell) {
  if (cell == null) return 0;
  if (typeof cell === "number") return cell;
  return Number(cell.count) || 0;
}

/**
 * @param {{ heatmap: Array<Array<number|{count:number,cats:Record<string,number>}>> }} snap
 */
export function renderEmotionTimeHeatmap(snap) {
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-emotion-heatmap-wrap";

  const grid = snap.heatmap || [];
  let max = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = cellCount(grid[d]?.[h]);
      if (v > max) max = v;
    }
  }

  const table = document.createElement("div");
  table.className = "lp-tr2-emotion-heatmap";
  table.setAttribute("role", "grid");
  table.setAttribute("aria-label", "요일·시간대별 감정적이기 빈도");

  const head = document.createElement("div");
  head.className = "lp-tr2-emotion-heatmap-row lp-tr2-emotion-heatmap-row--head";
  const corner = document.createElement("span");
  corner.className = "lp-tr2-emotion-heatmap-day-label";
  head.appendChild(corner);
  for (let h = 0; h < 24; h += 3) {
    const lab = document.createElement("span");
    lab.className = "lp-tr2-emotion-heatmap-hour-label";
    lab.textContent = `${h}시`;
    lab.style.gridColumn = `span 3`;
    head.appendChild(lab);
  }
  table.appendChild(head);

  for (let d = 0; d < 7; d++) {
    const row = document.createElement("div");
    row.className = "lp-tr2-emotion-heatmap-row";
    const dayLab = document.createElement("span");
    dayLab.className = "lp-tr2-emotion-heatmap-day-label";
    dayLab.textContent = WEEKDAY_LABELS[d];
    row.appendChild(dayLab);
    for (let h = 0; h < 24; h++) {
      const raw = grid[d]?.[h];
      const count = cellCount(raw);
      const cats = raw && typeof raw === "object" ? raw.cats || {} : {};
      const catId = dominantEmotionCategoryId(cats);
      const catColor = catId
        ? getEmotionCategoryChartColor(catId)
        : HEATMAP_BASE;
      const cell = document.createElement("span");
      cell.className = "lp-tr2-emotion-heatmap-cell";
      const lv = heatmapLevel(count, max);
      cell.classList.add(`lp-tr2-emotion-heatmap-cell--lv${lv}`);
      if (count > 0) {
        cell.style.background = hexToRgba(
          catColor,
          HEATMAP_LEVEL_ALPHA[lv] || 0.48,
        );
      } else {
        cell.style.background = HEATMAP_EMPTY;
      }
      const catLabel =
        EMOTION_CATEGORIES.find((c) => c.id === catId)?.label || "";
      cell.title =
        count > 0
          ? `${WEEKDAY_LABELS[d]} ${h}시 · ${count}건${catLabel ? ` · ${catLabel}` : ""}`
          : `${WEEKDAY_LABELS[d]} ${h}시`;
      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  wrap.appendChild(table);

  const legend = document.createElement("div");
  legend.className = "lp-tr2-emotion-heatmap-legend";
  const less = document.createElement("span");
  less.textContent = "적음";
  legend.appendChild(less);
  HEATMAP_LEVEL_ALPHA.forEach((alpha, i) => {
    const sw = document.createElement("span");
    sw.className = "lp-tr2-emotion-heatmap-legend-swatch";
    sw.style.background =
      i === 0 ? HEATMAP_EMPTY : hexToRgba(HEATMAP_BASE, alpha);
    legend.appendChild(sw);
  });
  const more = document.createElement("span");
  more.textContent = "많음";
  legend.appendChild(more);
  const catNote = document.createElement("span");
  catNote.className = "lp-tr2-emotion-heatmap-legend-note";
  catNote.textContent = "· 색=감정 대분류";
  legend.appendChild(catNote);
  wrap.appendChild(legend);

  return wrap;
}

export { EMOTION_CATEGORIES };
