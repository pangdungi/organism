/**
 * 캘린더용 KPI 보기 모달 - 카테고리별(꿈, 부수입, 행복, 건강) KPI 카드 세로 배치
 */

import { formatDeadlineRangeForDisplay } from "./ganttModal.js";
import { getAccumulatedMinutes, minutesToHhMm, hhMmToMinutes } from "./timeKpiSync.js";

const DREAM_MAP_KEY = "kpi-dream-map";
const SIDEINCOME_KEY = "kpi-sideincome-paths";
const HAPPINESS_KEY = "kpi-happiness-map";
const HEALTH_KEY = "kpi-health-map";

function loadJson(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/**
 * 카테고리별 KPI 카드 데이터 수집 (진행률, 목표값 등 포함)
 */
function getKpisByCategory() {
  const dreamData = loadJson(DREAM_MAP_KEY, { dreams: [], kpis: [], kpiLogs: [] });
  const sideData = loadJson(SIDEINCOME_KEY, { paths: [], kpis: [], kpiLogs: [] });
  const happyData = loadJson(HAPPINESS_KEY, { happinesses: [], kpis: [], kpiLogs: [] });
  const healthData = loadJson(HEALTH_KEY, { healths: [], kpis: [], kpiLogs: [] });

  const dreamNames = new Map((dreamData.dreams || []).map((d) => [d.id, d.name || "꿈"]));
  const pathNames = new Map((sideData.paths || []).map((p) => [p.id, p.name || "부수입"]));
  const happyNames = new Map((happyData.happinesses || []).map((h) => [h.id, h.name || "행복"]));
  const healthNames = new Map((healthData.healths || []).map((h) => [h.id, h.name || "건강"]));

  const result = { 꿈: [], 부수입: [], 행복: [], 건강: [] };

  function addKpi(kpi, logs, parentName, category) {
    const latest = getLatestLog(kpi.id, logs);
    const currentVal = latest?.value ? parseNum(latest.value) : 0;
    const targetVal = parseNum(kpi.targetValue);
    const progress = targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    const unitSuffix = kpi.unit ? " " + kpi.unit : "";
    const formatNum = (n) => (n == null || Number.isNaN(n) ? "—" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
    const progressText = `${formatNum(currentVal)} / ${kpi.targetValue ? String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "—"}${unitSuffix}`;
    result[category].push({
      name: kpi.name || "지표",
      parentName,
      targetValue: kpi.targetValue,
      unit: kpi.unit,
      targetStartDate: kpi.targetStartDate,
      targetDeadline: kpi.targetDeadline,
      targetTimeRequired: kpi.targetTimeRequired,
      progress,
      progressText,
    });
  }

  (dreamData.kpis || []).forEach((k) => {
    const parentName = dreamNames.get(k.dreamId) || "꿈";
    addKpi(k, dreamData.kpiLogs || [], parentName, "꿈");
  });
  (sideData.kpis || []).forEach((k) => {
    const parentName = pathNames.get(k.pathId) || "부수입";
    addKpi(k, sideData.kpiLogs || [], parentName, "부수입");
  });
  (happyData.kpis || []).forEach((k) => {
    const parentName = happyNames.get(k.happinessId) || "행복";
    addKpi(k, happyData.kpiLogs || [], parentName, "행복");
  });
  (healthData.kpis || []).forEach((k) => {
    const parentName = healthNames.get(k.healthId) || "건강";
    addKpi(k, healthData.kpiLogs || [], parentName, "건강");
  });

  return result;
}

const CATEGORY_LABELS = { 꿈: "꿈", 부수입: "부수입", 행복: "하면 행복한 일", 건강: "건강" };
const CATEGORY_ICONS = { 꿈: "✨", 부수입: "💰", 행복: "😊", 건강: "💪" };

export function showKpiViewModal() {
  const byCategory = getKpisByCategory();
  const categoryOrder = ["꿈", "건강", "부수입", "행복"];

  let bodyHtml = "";
  categoryOrder.forEach((cat) => {
    const list = byCategory[cat] || [];
    const label = CATEGORY_LABELS[cat] || cat;
    const icon = CATEGORY_ICONS[cat] || "";

    let cardsHtml = "";
    if (list.length === 0) {
      cardsHtml = '<p class="kpi-view-empty">KPI가 없습니다.</p>';
    } else {
      cardsHtml = list
        .map(
          (k) => {
            const targetMins = k.targetTimeRequired ? hhMmToMinutes(k.targetTimeRequired) : 0;
            const accumulatedMins = targetMins > 0 ? getAccumulatedMinutes(k.name) : 0;
            const timeProgress = targetMins > 0 ? Math.min(100, (accumulatedMins / targetMins) * 100) : 0;
            const remainingMins = Math.max(0, targetMins - accumulatedMins);
            const timeCircleHtml =
              targetMins > 0
                ? `
              <div class="dream-kpi-time-circle-wrap">
                <div class="dream-kpi-time-circle" role="progressbar" aria-valuenow="${timeProgress}" aria-valuemin="0" aria-valuemax="100">
                  <svg viewBox="0 0 36 36">
                    <path class="dream-kpi-time-circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path class="dream-kpi-time-circle-fill" stroke-dasharray="${timeProgress}, ${100 - timeProgress}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div class="dream-kpi-time-circle-label">
                    <span class="dream-kpi-time-accumulated">${minutesToHhMm(accumulatedMins)}</span>
                    <span class="dream-kpi-time-sep">/</span>
                    <span class="dream-kpi-time-target">${escapeHtml(k.targetTimeRequired)}</span>
                  </div>
                </div>
                <div class="dream-kpi-time-remaining">남은 ${minutesToHhMm(remainingMins)}</div>
              </div>
            `
                : "";
            return `
          <div class="kpi-view-card dream-kpi-card">
            <div class="dream-kpi-card-inner">
              <div class="dream-kpi-card-name">${escapeHtml(k.name)}</div>
              <div class="dream-kpi-card-target-num">${k.targetValue ? escapeHtml(String(k.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + (k.unit ? '<span class="dream-kpi-card-unit"> ' + escapeHtml(k.unit) + "</span>" : "") : "—"}</div>
              ${(k.targetStartDate || k.targetDeadline) ? `<div class="dream-kpi-card-deadline">목표기한 ${escapeHtml(formatDeadlineRangeForDisplay(k.targetStartDate, k.targetDeadline))}</div>` : ""}
              ${k.targetTimeRequired ? `<div class="dream-kpi-card-time">목표시간 ${escapeHtml(k.targetTimeRequired)}</div>` : ""}
              <div class="dream-kpi-card-progress">
                <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:${k.progress}%"></div></div>
                <div class="dream-kpi-card-progress-text">${escapeHtml(k.progressText)}</div>
              </div>
              ${timeCircleHtml}
            </div>
          </div>
        `;
          }
        )
        .join("");
    }

    bodyHtml += `
      <section class="kpi-view-section kpi-view-accordion-item" data-category="${cat}">
        <button type="button" class="kpi-view-section-title kpi-view-accordion-trigger">
          <span class="kpi-view-accordion-arrow">▼</span>
          <span class="kpi-view-section-icon">${icon}</span>
          ${escapeHtml(label)}
          <span class="kpi-view-section-count">${list.length}</span>
        </button>
        <div class="kpi-view-accordion-content">
          <div class="kpi-view-cards">${cardsHtml}</div>
        </div>
      </section>
    `;
  });

  const modal = document.createElement("div");
  modal.className = "kpi-view-modal";
  modal.innerHTML = `
    <div class="kpi-view-backdrop"></div>
    <div class="kpi-view-panel">
      <div class="kpi-view-header">
        <h3 class="kpi-view-title">KPI 보기</h3>
        <button type="button" class="kpi-view-close" title="닫기">×</button>
      </div>
      <div class="kpi-view-body">${bodyHtml}</div>
    </div>
  `;

  modal.querySelectorAll(".kpi-view-accordion-trigger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.closest(".kpi-view-accordion-item");
      section.classList.toggle("is-collapsed");
    });
  });

  modal.querySelectorAll(".kpi-view-accordion-item").forEach((section) => {
    section.classList.add("is-collapsed");
  });

  const close = () => modal.remove();
  modal.querySelector(".kpi-view-backdrop").addEventListener("click", close);
  modal.querySelector(".kpi-view-close").addEventListener("click", close);
  document.body.appendChild(modal);
}
