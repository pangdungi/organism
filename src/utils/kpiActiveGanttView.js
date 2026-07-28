/**
 * 진행중 KPI 간트 차트 (시작~마감, 진행률 채움, 오늘 점선)
 */

const GANTT_COLLAPSE_KEY = "lp_goal_gantt_collapsed";

function readGanttCollapsed() {
  try {
    const v = sessionStorage.getItem(GANTT_COLLAPSE_KEY);
    /* 키 없으면 기본 접힘 */
    if (v == null) return true;
    return v === "1";
  } catch (_) {
    return true;
  }
}

/** @param {boolean} collapsed */
function writeGanttCollapsed(collapsed) {
  try {
    sessionStorage.setItem(GANTT_COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch (_) {}
}

/**
 * @param {HTMLElement} container
 * @param {HTMLElement} body
 * @param {{ collapsible?: boolean, title?: string }} opts
 */
function appendGanttFold(container, body, opts = {}) {
  if (opts.collapsible === false) {
    container.appendChild(body);
    return;
  }
  const fold = document.createElement("div");
  fold.className = "dream-kpi-gantt-fold";
  const collapsed = readGanttCollapsed();
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dream-kpi-gantt-fold-toggle";
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  const title = opts.title || "간트 차트";
  toggle.innerHTML = `
    <span class="dream-kpi-gantt-fold-title">${title}</span>
    <span class="dream-kpi-gantt-fold-chevron" aria-hidden="true"></span>
  `;
  const panel = document.createElement("div");
  panel.className = "dream-kpi-gantt-fold-panel";
  panel.hidden = collapsed;
  panel.appendChild(body);
  if (collapsed) fold.classList.add("is-collapsed");

  toggle.addEventListener("click", () => {
    const next = !fold.classList.contains("is-collapsed");
    fold.classList.toggle("is-collapsed", next);
    panel.hidden = next;
    toggle.setAttribute("aria-expanded", next ? "false" : "true");
    writeGanttCollapsed(next);
  });

  fold.append(toggle, panel);
  container.appendChild(fold);
}

function parseYmdLocal(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / ms);
}

function clampPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * @param {object} kpi
 * @param {(kpi: object) => number} getProgressPct
 */
function buildGanttRowModel(kpi, getProgressPct) {
  const name = String(kpi?.name || "").trim() || "KPI";
  const id = String(kpi?.id || "").trim();
  let start = parseYmdLocal(kpi?.targetStartDate);
  let end = parseYmdLocal(kpi?.targetDeadline);
  if (!end && !start) return null;
  if (!start && end) {
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    start.setDate(start.getDate() - 30);
  }
  if (start && !end) {
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    end.setDate(end.getDate() + 30);
  }
  if (end < start) {
    const t = start;
    start = end;
    end = t;
  }
  return {
    id,
    name,
    start,
    end,
    pct: clampPct(getProgressPct?.(kpi)),
    categoryLabel: String(kpi?.__goalTrackerCategory || "").trim(),
  };
}

/**
 * @param {HTMLElement} container
 * @param {object[]} kpis — 이미 진행중만
 * @param {{
 *   getProgressPct: (kpi: object) => number,
 *   onSelect?: (kpiId: string) => void,
 *   emptyMessage?: string,
 *   collapsible?: boolean,
 *   foldTitle?: string,
 * }} opts
 */
export function mountKpiActiveGanttView(container, kpis, opts = {}) {
  if (!container) return;
  const getProgressPct =
    typeof opts.getProgressPct === "function" ? opts.getProgressPct : () => 0;
  const foldOpts = {
    collapsible: opts.collapsible !== false,
    title: opts.foldTitle || "간트 차트",
  };

  const rows = (Array.isArray(kpis) ? kpis : [])
    .map((k) => buildGanttRowModel(k, getProgressPct))
    .filter(Boolean);

  const root = document.createElement("div");
  root.className = "dream-kpi-gantt";

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "dream-goals-empty";
    empty.textContent =
      opts.emptyMessage ||
      "간트에 표시할 시작·마감일이 있는 진행중 행동이 없습니다.";
    root.appendChild(empty);
    appendGanttFold(container, root, foldOpts);
    return;
  }

  let minD = rows[0].start;
  let maxD = rows[0].end;
  for (const r of rows) {
    if (r.start < minD) minD = r.start;
    if (r.end > maxD) maxD = r.end;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let rangeStart = startOfMonth(minD);
  let rangeEnd = endOfMonth(maxD);
  if (today < rangeStart) rangeStart = startOfMonth(today);
  if (today > rangeEnd) rangeEnd = endOfMonth(today);
  const totalDays = Math.max(1, daysBetween(rangeStart, rangeEnd) + 1);

  const months = [];
  {
    let cur = startOfMonth(rangeStart);
    const last = startOfMonth(rangeEnd);
    while (cur <= last) {
      const mStart = cur < rangeStart ? rangeStart : cur;
      const mEndCand = endOfMonth(cur);
      const mEnd = mEndCand > rangeEnd ? rangeEnd : mEndCand;
      const startPct = (daysBetween(rangeStart, mStart) / totalDays) * 100;
      const widthPct = ((daysBetween(mStart, mEnd) + 1) / totalDays) * 100;
      months.push({
        label: `${cur.getMonth() + 1}월`,
        startPct,
        widthPct,
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }

  const todayOffset = daysBetween(rangeStart, today);
  const todayPct =
    todayOffset >= 0 && todayOffset < totalDays
      ? ((todayOffset + 0.5) / totalDays) * 100
      : null;

  const layout = document.createElement("div");
  layout.className = "dream-kpi-gantt-layout";

  const labelsCol = document.createElement("div");
  labelsCol.className = "dream-kpi-gantt-labels";
  const headLabel = document.createElement("div");
  headLabel.className = "dream-kpi-gantt-head-label";
  headLabel.setAttribute("aria-hidden", "true");
  labelsCol.appendChild(headLabel);

  const tracksCol = document.createElement("div");
  tracksCol.className = "dream-kpi-gantt-tracks";

  const headTrack = document.createElement("div");
  headTrack.className = "dream-kpi-gantt-head-track";
  for (const m of months) {
    const cell = document.createElement("div");
    cell.className = "dream-kpi-gantt-month";
    cell.style.left = `${m.startPct}%`;
    cell.style.width = `${m.widthPct}%`;
    cell.textContent = m.label;
    headTrack.appendChild(cell);
  }
  tracksCol.appendChild(headTrack);

  const monthGrid = document.createElement("div");
  monthGrid.className = "dream-kpi-gantt-month-grid";
  monthGrid.setAttribute("aria-hidden", "true");
  for (const m of months) {
    if (m.startPct <= 0) continue;
    const gridLine = document.createElement("div");
    gridLine.className = "dream-kpi-gantt-month-grid-line";
    gridLine.style.left = `${m.startPct}%`;
    monthGrid.appendChild(gridLine);
  }
  tracksCol.appendChild(monthGrid);

  const categoryOrder = [];
  const byCategory = new Map();
  for (const r of rows) {
    const cat = r.categoryLabel || "";
    if (!byCategory.has(cat)) {
      byCategory.set(cat, []);
      categoryOrder.push(cat);
    }
    byCategory.get(cat).push(r);
  }

  function appendRow(r) {
    const label = document.createElement("button");
    label.type = "button";
    label.className = "dream-kpi-gantt-row-label";
    label.dataset.kpiId = r.id;
    label.textContent = r.name;
    label.addEventListener("click", () => {
      if (r.id) opts.onSelect?.(r.id);
    });
    labelsCol.appendChild(label);

    const trackWrap = document.createElement("button");
    trackWrap.type = "button";
    trackWrap.className = "dream-kpi-gantt-row-track";
    trackWrap.dataset.kpiId = r.id;
    trackWrap.setAttribute("aria-label", `${r.name} ${r.pct}%`);

    const barLeft = (daysBetween(rangeStart, r.start) / totalDays) * 100;
    const barWidth = ((daysBetween(r.start, r.end) + 1) / totalDays) * 100;

    const bar = document.createElement("div");
    bar.className = "dream-kpi-gantt-bar";
    bar.style.left = `${Math.max(0, barLeft)}%`;
    bar.style.width = `${Math.max(1.2, barWidth)}%`;
    bar.innerHTML = `
      <div class="dream-kpi-gantt-bar-fill" style="width:${r.pct}%"></div>
      <span class="dream-kpi-gantt-bar-pct">${r.pct}%</span>
    `;
    trackWrap.appendChild(bar);
    trackWrap.addEventListener("click", () => {
      if (r.id) opts.onSelect?.(r.id);
    });
    tracksCol.appendChild(trackWrap);
  }

  for (const cat of categoryOrder) {
    const list = byCategory.get(cat) || [];
    if (!list.length) continue;
    if (cat) {
      const secLabel = document.createElement("div");
      secLabel.className = "dream-kpi-gantt-section-label";
      secLabel.textContent = cat;
      labelsCol.appendChild(secLabel);
      const secTrack = document.createElement("div");
      secTrack.className = "dream-kpi-gantt-section-track";
      secTrack.setAttribute("aria-hidden", "true");
      tracksCol.appendChild(secTrack);
    }
    for (const r of list) appendRow(r);
  }

  if (todayPct != null) {
    const line = document.createElement("div");
    line.className = "dream-kpi-gantt-today-line";
    line.style.left = `${todayPct}%`;
    line.title = "오늘";
    line.setAttribute("aria-hidden", "true");
    tracksCol.appendChild(line);
  }

  const colDivider = document.createElement("div");
  colDivider.className = "dream-kpi-gantt-col-divider";
  colDivider.setAttribute("aria-hidden", "true");

  layout.appendChild(labelsCol);
  layout.appendChild(colDivider);
  layout.appendChild(tracksCol);
  root.appendChild(layout);

  appendGanttFold(container, root, foldOpts);
}

/**
 * @param {object} presentation
 * @param {object} [progressResult]
 */
export function kpiGanttProgressPctFromPresentation(presentation, progressResult) {
  if (presentation && Number.isFinite(Number(presentation.displayProgress))) {
    return clampPct(presentation.displayProgress);
  }
  const p = progressResult || {};
  if (Number.isFinite(Number(p.progress))) return clampPct(p.progress);
  if (Number.isFinite(Number(p.timeProgress))) return clampPct(p.timeProgress);
  return 0;
}
