/**
 * 목표기한을 타임라인/간트 형식으로 보여주는 모달
 * Dream, Sideincome, Happiness의 KPI를 통합 표시
 */

const DREAM_MAP_KEY = "kpi-dream-map";
const SIDEINCOME_KEY = "kpi-sideincome-paths";
const HAPPINESS_KEY = "kpi-happiness-map";
const HEALTH_KEY = "kpi-health-map";

function loadJson(key, defaultVal) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultVal;
  } catch (_) {
    return defaultVal;
  }
}

function parseTargetDeadline(text) {
  if (!text || typeof text !== "string") return null;
  const s = text.trim();
  if (!s) return null;

  const mYmd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mYmd) return new Date(parseInt(mYmd[1], 10), parseInt(mYmd[2], 10) - 1, parseInt(mYmd[3], 10));

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (/오늘/.test(s)) return new Date(y, m, now.getDate());
  if (/다음달|내달/.test(s)) return new Date(y, m + 1, 1);
  if (/이번달|이달/.test(s)) return new Date(y, m, 1);

  const match1 = s.match(/(\d{4})년?\s*(\d{1,2})월/);
  if (match1) return new Date(parseInt(match1[1], 10), parseInt(match1[2], 10) - 1, 1);

  const match2 = s.match(/(\d{4})\.\s*(\d{1,2})\./);
  if (match2) return new Date(parseInt(match2[1], 10), parseInt(match2[2], 10) - 1, 1);

  const match3 = s.match(/(\d{1,2})월/);
  if (match3) return new Date(y, parseInt(match3[1], 10) - 1, 1);

  const match4 = s.match(/(\d{4})년/);
  if (match4) return new Date(parseInt(match4[1], 10), 0, 1);

  return null;
}

function dateToYmd(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toDateInputValue(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = parseTargetDeadline(s);
  return d ? dateToYmd(d) : "";
}

export function formatDeadlineForDisplay(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}년 ${parseInt(m[2], 10)}월 ${parseInt(m[3], 10)}일까지`;
  return s.endsWith("까지") ? s : s + "까지";
}

export function formatDeadlineRangeForDisplay(startStr, endStr) {
  const start = formatDeadlineForDisplay(startStr).replace(/까지$/, "");
  const end = formatDeadlineForDisplay(endStr);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end) return start + "까지";
  return `${start} ~ ${end}`;
}

function parseNum(str) {
  const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function getLatestLog(kpiId, logs) {
  const filtered = (logs || []).filter((l) => l.kpiId === kpiId);
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => {
    const da = a.dateRaw || a.date || "";
    const db = b.dateRaw || b.date || "";
    return db.localeCompare(da);
  });
  return filtered[0];
}

function collectAllKpis() {
  const dreamData = loadJson(DREAM_MAP_KEY, { dreams: [], kpis: [], kpiLogs: [] });
  const sideData = loadJson(SIDEINCOME_KEY, { paths: [], kpis: [], kpiLogs: [] });
  const happyData = loadJson(HAPPINESS_KEY, { happinesses: [], kpis: [], kpiLogs: [] });
  const healthData = loadJson(HEALTH_KEY, { healths: [], kpis: [], kpiLogs: [] });

  const dreamNames = new Map((dreamData.dreams || []).map((d) => [d.id, d.name || "꿈"]));
  const pathNamesSi = new Map((sideData.paths || []).map((p) => [p.id, p.name || "부수입"]));
  const happyNames = new Map((happyData.happinesses || []).map((h) => [h.id, h.name || "행복"]));
  const healthNames = new Map((healthData.healths || []).map((h) => [h.id, h.name || "건강"]));

  const items = [];

  (dreamData.kpis || []).forEach((k) => {
    const parentName = dreamNames.get(k.dreamId) || "꿈";
    const startDate = parseTargetDeadline(k.targetStartDate);
    const targetDate = parseTargetDeadline(k.targetDeadline);
    const logs = dreamData.kpiLogs || [];
    const latest = getLatestLog(k.id, logs);
    const currentVal = latest?.value ? parseNum(latest.value) : 0;
    const targetVal = parseNum(k.targetValue);
    const progress = targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    const today = new Date();
    const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : null;

    items.push({
      category: "꿈",
      categoryId: k.dreamId,
      parentName,
      name: k.name || "지표",
      targetDeadline: k.targetDeadline || "",
      startDate,
      targetDate,
      progress,
      daysLeft,
    });
  });

  (sideData.kpis || []).forEach((k) => {
    const parentName = pathNamesSi.get(k.pathId) || "부수입";
    const startDate = parseTargetDeadline(k.targetStartDate);
    const targetDate = parseTargetDeadline(k.targetDeadline);
    const logs = sideData.kpiLogs || [];
    const latest = getLatestLog(k.id, logs);
    const currentVal = latest?.value ? parseNum(latest.value) : 0;
    const targetVal = parseNum(k.targetValue);
    const progress = targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    const today = new Date();
    const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : null;

    items.push({
      category: "부수입",
      categoryId: k.pathId,
      parentName,
      name: k.name || "지표",
      targetDeadline: k.targetDeadline || "",
      startDate,
      targetDate,
      progress,
      daysLeft,
    });
  });

  (happyData.kpis || []).forEach((k) => {
    const parentName = happyNames.get(k.happinessId) || "행복";
    const startDate = parseTargetDeadline(k.targetStartDate);
    const targetDate = parseTargetDeadline(k.targetDeadline);
    const logs = happyData.kpiLogs || [];
    const latest = getLatestLog(k.id, logs);
    const currentVal = latest?.value ? parseNum(latest.value) : 0;
    const targetVal = parseNum(k.targetValue);
    const progress = targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    const today = new Date();
    const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : null;

    items.push({
      category: "행복",
      categoryId: k.happinessId,
      parentName,
      name: k.name || "지표",
      targetDeadline: k.targetDeadline || "",
      startDate,
      targetDate,
      progress,
      daysLeft,
    });
  });

  (healthData.kpis || []).forEach((k) => {
    const parentName = healthNames.get(k.healthId) || "건강";
    const startDate = parseTargetDeadline(k.targetStartDate);
    const targetDate = parseTargetDeadline(k.targetDeadline);
    const logs = healthData.kpiLogs || [];
    const latest = getLatestLog(k.id, logs);
    const currentVal = latest?.value ? parseNum(latest.value) : 0;
    const targetVal = parseNum(k.targetValue);
    const progress = targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    const today = new Date();
    const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : null;

    items.push({
      category: "건강",
      categoryId: k.healthId,
      parentName,
      name: k.name || "지표",
      targetDeadline: k.targetDeadline || "",
      startDate,
      targetDate,
      progress,
      daysLeft,
    });
  });

  return items;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const CATEGORY_ICONS = { 꿈: "✨", 부수입: "💰", 행복: "😊", 건강: "💪" };
const CATEGORY_COLORS = { 꿈: "#3b82f6", 부수입: "#10b981", 행복: "#f59e0b", 건강: "#22c55e" };

export function showGanttModal() {
  const items = collectAllKpis();

  const now = new Date();
  const year = now.getFullYear();
  const months = [];
  for (let m = 0; m < 12; m++) {
    months.push({ year, month: m, label: `${m + 1}월` });
  }

  const modal = document.createElement("div");
  modal.className = "gantt-modal";

  const monthHeaders = months.map((mo) => `<span class="gantt-month-col">${mo.label}</span>`).join("");

  const grouped = {};
  items.forEach((it) => {
    const key = it.category;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(it);
  });

  const categoryOrder = ["꿈", "부수입", "행복", "건강"];
  let rowsHtml = "";

  categoryOrder.forEach((cat) => {
    const list = grouped[cat] || [];
    if (list.length === 0) return;

    list.forEach((it) => {
      const progress = Math.round(it.progress);
      const daysLeft = it.daysLeft != null ? (it.daysLeft > 0 ? `D-${it.daysLeft}` : it.daysLeft === 0 ? "D-Day" : "기한 지남") : "—";
      const displayName = it.parentName !== it.name ? `${it.name}` : it.name;

      let barLeft = 0;
      let barWidth = 0;
      const year = months[0]?.year;
      if (it.startDate && it.targetDate && year === it.startDate.getFullYear() && year === it.targetDate.getFullYear()) {
        const startIdx = Math.max(0, Math.min(it.startDate.getMonth(), 11));
        const endIdx = Math.max(0, Math.min(it.targetDate.getMonth(), 11));
        const left = Math.min(startIdx, endIdx);
        const right = Math.max(startIdx, endIdx);
        barLeft = (left / 12) * 100;
        barWidth = ((right - left + 1) / 12) * 100;
      } else if (it.targetDate && year === it.targetDate.getFullYear()) {
        const monthIdx = it.targetDate.getMonth();
        barLeft = (monthIdx / 12) * 100;
        barWidth = (1 / 12) * 100;
      } else if (it.startDate && year === it.startDate.getFullYear()) {
        const monthIdx = it.startDate.getMonth();
        barLeft = (monthIdx / 12) * 100;
        barWidth = (1 / 12) * 100;
      }

      const barColor = CATEGORY_COLORS[it.category] || "#3b82f6";
      const barStyle = barWidth > 0
        ? `left: ${barLeft}%; width: ${barWidth}%; background: ${barColor};`
        : "display: none;";

      rowsHtml += `
        <div class="gantt-row">
          <div class="gantt-row-label">
            <span class="gantt-cat-icon">${CATEGORY_ICONS[cat] || ""}</span>
            <span class="gantt-row-name">${escapeHtml(displayName)}</span>
          </div>
          <div class="gantt-row-progress">
            <span class="gantt-progress-pct">${progress}%</span>
            <div class="gantt-progress-bar">
              <div class="gantt-progress-fill" style="width: ${progress}%"></div>
            </div>
          </div>
          <div class="gantt-row-timeline">
            <div class="gantt-timeline-bar" style="${barStyle}"></div>
          </div>
          <div class="gantt-row-days">${escapeHtml(String(daysLeft))}</div>
        </div>
      `;
    });
  });

  if (rowsHtml === "") {
    rowsHtml = '<p class="gantt-empty">목표기한이 있는 KPI가 없습니다.</p>';
  }

  modal.innerHTML = `
    <div class="gantt-backdrop"></div>
    <div class="gantt-panel">
      <div class="gantt-header">
        <h3 class="gantt-title">목표 타임라인</h3>
        <button type="button" class="gantt-close" title="닫기">×</button>
      </div>
      <div class="gantt-timeline-header">
        <span class="gantt-col-label">목표</span>
        <span class="gantt-col-progress">진행률</span>
        <div class="gantt-timeline-months">${monthHeaders}</div>
        <span class="gantt-col-days">D-Day</span>
      </div>
      <div class="gantt-body">${rowsHtml}</div>
    </div>
  `;

  const close = () => modal.remove();
  modal.querySelector(".gantt-backdrop").addEventListener("click", close);
  modal.querySelector(".gantt-close").addEventListener("click", close);
  document.body.appendChild(modal);
}
