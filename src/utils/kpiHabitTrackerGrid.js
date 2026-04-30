/**
 * KPI 매일 반복 할일 × 날짜 격자 (로그의 dailyCompleted 기반, 읽기 전용)
 */

/** @param {string} val */
function normalizeDateKey(val) {
  if (!val || typeof val !== "string") return "";
  const s = val.trim().replace(/\//g, "-");
  const m = s.match(/(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/);
  if (m)
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return s.slice(0, 10);
}

/** @param {string} dateKey YYYY-MM-DD */
function formatGridColLabel(dateKey) {
  if (!dateKey || dateKey.length < 10) return "";
  const p = dateKey.split("-");
  if (p.length < 3) return dateKey;
  const mo = parseInt(p[1], 10);
  const day = parseInt(p[2], 10);
  if (!Number.isFinite(mo) || !Number.isFinite(day)) return dateKey;
  return `${mo}/${day}`;
}

const MAX_COLS = 40;

/**
 * @param {string} kpiId
 * @param {Array<{id:string,kpiId?:string,text?:string}>} dailyTodos
 * @param {Array<object>} kpiLogs — 해당 KPI 일지 전체(날짜 오름차순 아님 가능)
 * @returns {{ dateKeys: string[], byDate: Map<string, object> }}
 */
export function buildKpiHabitGridModel(kpiId, dailyTodos, kpiLogs) {
  const kid = String(kpiId || "").trim();
  const logs = (kpiLogs || []).filter((l) => String(l.kpiId || "").trim() === kid);
  const sortedLogs = [...logs].sort((a, b) => {
    const da = normalizeDateKey(a.dateRaw || a.date || "");
    const db = normalizeDateKey(b.dateRaw || b.date || "");
    return da.localeCompare(db);
  });
  const dateSet = new Set();
  const byDate = new Map();
  for (const log of sortedLogs) {
    const dk = normalizeDateKey(log.dateRaw || log.date || "");
    if (dk.length < 10) continue;
    dateSet.add(dk);
    byDate.set(dk, log);
  }
  let dateKeys = [...dateSet].sort();
  if (dateKeys.length > MAX_COLS) {
    dateKeys = dateKeys.slice(-MAX_COLS);
  }
  const todoRows = (dailyTodos || []).filter(
    (t) => String(t.kpiId || "").trim() === kid && (t.text || "").trim() !== "",
  );
  return { dateKeys, byDate, todoRows };
}

/**
 * @param {object|null|undefined} log
 * @param {string} todoId
 * @returns {"" | "ok" | "miss"}
 */
export function habitGridCellState(log, todoId) {
  if (!log || typeof log !== "object") return "";
  const tid = String(todoId || "").trim();
  if (!tid) return "";
  const done = new Set(
    (Array.isArray(log.dailyCompleted) ? log.dailyCompleted : [])
      .map((x) => String(x?.id || "").trim())
      .filter(Boolean),
  );
  if (done.has(tid)) return "ok";
  return "miss";
}

/**
 * @param {string} kpiId
 * @param {Array<{id:string,kpiId?:string,text?:string}>} dailyTodos
 * @param {Array<object>} kpiLogs
 * @returns {HTMLDivElement|null}
 */
export function createKpiHabitGridElement(kpiId, dailyTodos, kpiLogs) {
  const { dateKeys, byDate, todoRows } = buildKpiHabitGridModel(
    kpiId,
    dailyTodos,
    kpiLogs,
  );
  if (todoRows.length === 0) return null;

  const wrap = document.createElement("div");
  wrap.className = "dream-kpi-habit-grid-wrap";

  const title = document.createElement("div");
  title.className = "dream-kpi-habit-grid-title";
  title.textContent = "매일 할일 수행 표";
  wrap.appendChild(title);

  const scroll = document.createElement("div");
  scroll.className = "dream-kpi-habit-grid-scroll";
  const table = document.createElement("table");
  table.className = "dream-kpi-habit-grid-table";
  table.setAttribute("role", "grid");

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  const th0 = document.createElement("th");
  th0.className = "dream-kpi-habit-grid-th dream-kpi-habit-grid-th--task";
  th0.textContent = "매일 할일";
  trh.appendChild(th0);
  if (dateKeys.length === 0) {
    const th = document.createElement("th");
    th.className = "dream-kpi-habit-grid-th dream-kpi-habit-grid-th--empty";
    th.textContent = "—";
    trh.appendChild(th);
  } else {
    for (const dk of dateKeys) {
      const th = document.createElement("th");
      th.className = "dream-kpi-habit-grid-th dream-kpi-habit-grid-th--day";
      th.textContent = formatGridColLabel(dk);
      th.title = dk;
      trh.appendChild(th);
    }
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const todo of todoRows) {
    const tr = document.createElement("tr");
    const tdName = document.createElement("td");
    tdName.className = "dream-kpi-habit-grid-td dream-kpi-habit-grid-td--task";
    tdName.textContent = (todo.text || "").trim() || "—";
    tr.appendChild(tdName);
    if (dateKeys.length === 0) {
      const td = document.createElement("td");
      td.className = "dream-kpi-habit-grid-td dream-kpi-habit-grid-td--cell";
      td.textContent = "";
      tr.appendChild(td);
    } else {
      for (const dk of dateKeys) {
        const td = document.createElement("td");
        td.className = "dream-kpi-habit-grid-td dream-kpi-habit-grid-td--cell";
        const log = byDate.get(dk);
        const state = habitGridCellState(log, todo.id);
        if (state === "ok") {
          td.textContent = "O";
          td.classList.add("dream-kpi-habit-cell--ok");
        } else if (state === "miss") {
          td.textContent = "X";
          td.classList.add("dream-kpi-habit-cell--miss");
        } else {
          td.textContent = "";
        }
        tr.appendChild(td);
      }
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);

  return wrap;
}
