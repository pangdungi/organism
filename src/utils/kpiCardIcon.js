import { getFullTaskOptions } from "./timeTaskOptionsModel.js";
import {
  resolveTimeTaskDisplayIconSrc,
  resolveEffectiveTaskIconKey,
} from "./timeTaskIconUrls.js";
import { applyStaticAppIconImg } from "./staticAppIconImg.js";

/** @param {object} kpi */
export function findLinkedTaskOptionForKpi(kpi) {
  const kid = String(kpi?.id || "").trim();
  const opts = getFullTaskOptions();
  if (!kid) return null;
  return opts.find((o) => String(o.kpiId || "").trim() === kid) || null;
}

/**
 * KPI 카드 — 연동 시간가계부 과제와 동일 아이콘 규칙
 * @param {object} kpi
 * @param {"dream"|"sideincome"|"happiness"|"health"} ledgerCategory
 */
export function resolveKpiCardIconSrc(kpi, ledgerCategory) {
  const task = findLinkedTaskOptionForKpi(kpi);
  const name = String(task?.name || kpi?.name || "").trim();
  if (!name) return "";
  const kpiId = String(kpi?.id || task?.kpiId || "").trim();
  const iconKey = resolveEffectiveTaskIconKey({
    iconKey: task?.iconKey,
    kpiId,
    taskName: name,
  });
  return resolveTimeTaskDisplayIconSrc(name, {
    category: task?.category || ledgerCategory || "",
    productivity: task?.productivity || "productive",
    iconKey,
    kpiId,
  });
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * KPI 카드 상단 — 아이콘 + 이름 행(이름 HTML은 호출 측 escapeHtml 적용)
 * @param {object} kpi
 * @param {string} ledgerCategory
 * @param {string} nameInnerHtml
 * @param {{ completed?: boolean }} [opts]
 */
export function kpiCardHeadHtml(kpi, ledgerCategory, nameInnerHtml, opts = {}) {
  const src = resolveKpiCardIconSrc(kpi, ledgerCategory);
  const iconHtml = src
    ? `<span class="dream-kpi-card-icon" aria-hidden="true"><img src="${escapeAttr(src)}" alt="" width="28" height="28" decoding="async" /></span>`
    : "";
  const doneChip = opts.completed
    ? `<span class="dream-kpi-card-done-chip">완료</span>`
    : "";
  return `<div class="dream-kpi-card-head">${iconHtml}<div class="dream-kpi-card-name">${nameInnerHtml}</div>${doneChip}</div>`;
}

/** 진행 수치만 맞출 때 완료 칩도 같이 맞춤 */
export function syncKpiCardDoneChip(card, completed) {
  if (!(card instanceof HTMLElement)) return;
  const head = card.querySelector(".dream-kpi-card-head");
  if (!head) return;
  let chip = head.querySelector(".dream-kpi-card-done-chip");
  if (completed) {
    if (chip) return;
    chip = document.createElement("span");
    chip.className = "dream-kpi-card-done-chip";
    chip.textContent = "완료";
    head.appendChild(chip);
    return;
  }
  chip?.remove();
}

/** innerHTML 삽입 후 KPI 카드 아이콘 img 처리 */
export function wireKpiCardIconsIn(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll(".dream-kpi-card-icon img").forEach((img) => {
    try {
      applyStaticAppIconImg(img);
    } catch (_) {}
  });
}
