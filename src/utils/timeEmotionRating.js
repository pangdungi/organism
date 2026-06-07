/**
 * 감정적이기 과제 — 감정 상태 1~5 (매우 나쁨 ~ 매우 좋음)
 */

import { normalizeTimeRatingForRow } from "./timeLedgerEntriesModel.js";
import { isTaskLogPickerMobile } from "./timeTaskLogPickerDropdown.js";
import { lpSetClasses, lpTokenToggle } from "./timeLedgerClassPolicy.js";

const EMOTION_TRIGGER_FLOATING_Z = 10080;

/** @type {{ value: number, label: string, bg: string, stroke: string }[]} */
export const EMOTION_RATING_OPTIONS = [
  { value: 1, label: "매우 나쁨", bg: "#F8D4D4", stroke: "#C75050" },
  { value: 2, label: "나쁨", bg: "#F8E0CC", stroke: "#D97850" },
  { value: 3, label: "보통", bg: "#E8EDF2", stroke: "#94A3B8" },
  { value: 4, label: "좋음", bg: "#D4ECD4", stroke: "#5CA85C" },
  { value: 5, label: "매우 좋음", bg: "#9FD49F", stroke: "#3D7A3D" },
];

/**
 * @param {number} value
 * @returns {{ value: number, label: string, bg: string, stroke: string } | null}
 */
export function getEmotionRatingOption(value) {
  const n = normalizeTimeRatingForRow(value);
  if (n == null) return null;
  return EMOTION_RATING_OPTIONS.find((o) => o.value === n) ?? null;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function getEmotionRatingLabel(value) {
  return getEmotionRatingOption(value)?.label ?? "";
}

/**
 * @param {number} value
 * @returns {string}
 */
function emotionFaceFeaturesSvg(value) {
  switch (value) {
    case 1:
      return `<path d="M15 20 Q17 17.5 19 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M29 20 Q31 17.5 33 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M14 32 Q24 23 34 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
    case 2:
      return `<circle cx="17" cy="22" r="2" fill="currentColor"/>
<circle cx="31" cy="22" r="2" fill="currentColor"/>
<path d="M16 31 Q24 26 32 31" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    case 3:
      return `<circle cx="17" cy="22" r="2" fill="currentColor"/>
<circle cx="31" cy="22" r="2" fill="currentColor"/>
<path d="M16 29 L32 29" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    case 4:
      return `<circle cx="17" cy="22" r="2" fill="currentColor"/>
<circle cx="31" cy="22" r="2" fill="currentColor"/>
<path d="M16 28 Q24 34 32 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    case 5:
      return `<circle cx="17" cy="22" r="2" fill="currentColor"/>
<circle cx="31" cy="22" r="2" fill="currentColor"/>
<path d="M15 27 Q24 38 33 27" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
    default:
      return "";
  }
}

/**
 * @param {number} value
 * @param {{ size?: number }} [opts]
 * @returns {string}
 */
export function buildEmotionFaceSvgHtml(value, opts = {}) {
  const opt = getEmotionRatingOption(value);
  if (!opt) return "";
  const size = opts.size ?? 40;
  const features = emotionFaceFeaturesSvg(opt.value);
  return `<svg class="lp-emotion-face-svg" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="22" fill="${opt.bg}" stroke="${opt.stroke}" stroke-width="1.5"/><g color="${opt.stroke}">${features}</g></svg>`;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function formatTimeLedgerEmotionRatingHtml(raw) {
  const n = normalizeTimeRatingForRow(raw);
  if (n == null) return null;
  const opt = getEmotionRatingOption(n);
  if (!opt) return null;
  return `<span class="time-ledger-emotion-rating-chip">${buildEmotionFaceSvgHtml(n, { size: 22 })}<span class="time-ledger-emotion-rating-label">${opt.label}</span></span>`;
}

/**
 * 감정적이기 트리거 — 데스크탑: 과제 선택과 동일 드롭다운 / 모바일: 하단 시트
 */
export function buildEmotionTriggerSelect(options = {}) {
  const {
    items = [],
    placeholder = "선택해 주세요",
    sheetTitle = "트리거",
    abortSignal = null,
    onChange = null,
  } = options;

  let value = "";
  let open = false;
  let mobileOverlay = null;

  const wrap = document.createElement("div");
  wrap.className = "time-task-log-task-dropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "time-task-log-task-dropdown-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-label", "트리거 선택");

  const panel = document.createElement("div");
  lpSetClasses(panel, "time-task-log-task-dropdown-panel");
  panel.hidden = true;
  panel.setAttribute("role", "listbox");

  const optionsEl = document.createElement("div");
  lpSetClasses(optionsEl, "time-task-log-task-dropdown-options");
  panel.appendChild(optionsEl);

  function labelFor(v) {
    return items.find((x) => String(x.value) === String(v))?.label || "";
  }

  function syncTrigger() {
    trigger.textContent = labelFor(value) || placeholder;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    lpTokenToggle(trigger, "has-value", !!String(value || "").trim());
  }

  function setOpen(next) {
    open = !!next;
    wrap.classList.toggle("is-open", open);
    syncTrigger();
  }

  function resetFloatingPanel() {
    panel.style.position = "";
    panel.style.left = "";
    panel.style.top = "";
    panel.style.width = "";
    panel.style.maxHeight = "";
    panel.style.zIndex = "";
    panel.style.display = "";
    panel.removeAttribute("data-lp-floating-select-panel");
  }

  function layoutFloatingPanel() {
    const r = trigger.getBoundingClientRect();
    const gap = 4;
    const maxH = Math.max(
      120,
      Math.min(window.innerHeight - r.bottom - gap - 8, 280),
    );
    panel.style.position = "fixed";
    panel.style.left = `${Math.max(8, r.left)}px`;
    panel.style.top = `${r.bottom + gap}px`;
    panel.style.width = `${Math.max(160, r.width)}px`;
    panel.style.maxHeight = `${maxH}px`;
    panel.style.zIndex = String(EMOTION_TRIGGER_FLOATING_Z);
    panel.style.display = "flex";
    panel.setAttribute("data-lp-floating-select-panel", "");
  }

  function renderDesktopOptions() {
    optionsEl.innerHTML = "";
    items.forEach((it) => {
      const selected = String(it.value) === String(value);
      const row = document.createElement("div");
      lpSetClasses(row, "time-task-log-task-dropdown-option");
      row.setAttribute("data-lp-modal-simple-select-item", "");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", selected ? "true" : "false");
      const lab = document.createElement("span");
      lpSetClasses(lab, "time-task-log-task-dropdown-option-label");
      lab.textContent = it.label;
      row.appendChild(lab);
      const pick = () => {
        value = String(it.value);
        closePanel();
        onChange?.(value);
      };
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pick();
      });
      optionsEl.appendChild(row);
    });
  }

  function closeMobileSheet() {
    mobileOverlay?.remove();
    mobileOverlay = null;
    document.documentElement.classList.remove("lp-task-log-mobile-picker-open");
  }

  function closePanel() {
    if (!open) return;
    panel.hidden = true;
    resetFloatingPanel();
    if (panel.parentElement !== wrap) wrap.appendChild(panel);
    closeMobileSheet();
    setOpen(false);
    renderDesktopOptions();
  }

  function openDesktopPanel() {
    renderDesktopOptions();
    panel.hidden = false;
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    layoutFloatingPanel();
    setOpen(true);
  }

  function openMobileSheet() {
    closeMobileSheet();
    mobileOverlay = document.createElement("div");
    mobileOverlay.setAttribute("data-lp-emotion-trigger-overlay", "1");
    mobileOverlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:block;box-sizing:border-box;";

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "닫기");
    backdrop.style.cssText =
      "position:absolute;inset:0;border:none;padding:0;margin:0;background:rgba(21,43,69,0.45);cursor:default;";

    const sheet = document.createElement("div");
    sheet.style.cssText =
      "position:absolute;left:0;right:0;bottom:0;max-height:min(55vh,24rem);background:#fff;border-radius:14px 14px 0 0;box-shadow:0 -10px 32px rgba(0,0,0,0.18);display:flex;flex-direction:column;overflow:hidden;padding-bottom:env(safe-area-inset-bottom,0);box-sizing:border-box;";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;flex-shrink:0;padding:12px 16px;background:#1a3348;color:#fff;";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "닫기";
    closeBtn.style.cssText =
      "border:none;background:transparent;color:#fff;font:inherit;font-size:0.9375rem;cursor:pointer;padding:4px 8px;min-height:2.25rem;";

    const title = document.createElement("span");
    title.textContent = sheetTitle;
    title.style.cssText = "font-size:0.9375rem;font-weight:600;color:#fff;";

    const spacer = document.createElement("span");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.cssText =
      "visibility:hidden;padding:4px 8px;font-size:0.9375rem;min-height:2.25rem;";
    spacer.textContent = "닫기";

    const list = document.createElement("div");
    list.setAttribute("role", "listbox");
    list.style.cssText =
      "flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;";

    items.forEach((it, idx) => {
      const selected = String(it.value) === String(value);
      const row = document.createElement("button");
      row.type = "button";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", selected ? "true" : "false");
      row.textContent = it.label;
      row.style.cssText = [
        "display:block;width:100%;box-sizing:border-box;",
        "border:none;border-bottom:1px solid #e2e8f0;",
        "background:#fff;text-align:left;padding:14px 16px;",
        "font-size:1rem;font-family:inherit;color:#1a3348;",
        "cursor:pointer;min-height:2.85rem;",
        idx === items.length - 1 ? "border-bottom:none;" : "",
        selected ? "font-weight:600;background:rgba(30,77,123,0.06);" : "",
      ].join("");
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        value = String(it.value);
        onChange?.(value);
        closePanel();
      });
      list.appendChild(row);
    });

    const dismiss = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    };
    backdrop.addEventListener("click", dismiss);
    closeBtn.addEventListener("click", dismiss);

    header.append(closeBtn, title, spacer);
    sheet.append(header, list);
    mobileOverlay.append(backdrop, sheet);
    document.body.appendChild(mobileOverlay);
    document.documentElement.classList.add("lp-task-log-mobile-picker-open");
    setOpen(true);
  }

  let mobileActivateLockUntil = 0;

  function activateSelect(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isTaskLogPickerMobile()) {
      const now = Date.now();
      if (now < mobileActivateLockUntil) return;
      mobileActivateLockUntil = now + 450;
      if (open) closePanel();
      else openMobileSheet();
      return;
    }
    if (open) closePanel();
    else openDesktopPanel();
  }

  trigger.addEventListener("click", activateSelect);

  const closePanelOnOutside = (e) => {
    if (isTaskLogPickerMobile()) return;
    if (!open || panel.hidden) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (wrap.contains(t) || panel.contains(t)) return;
    closePanel();
  };

  const listenOpts = { capture: true };
  if (abortSignal) listenOpts.signal = abortSignal;
  document.addEventListener("mousedown", closePanelOnOutside, listenOpts);
  document.addEventListener("touchstart", closePanelOnOutside, listenOpts);
  abortSignal?.addEventListener?.("abort", closePanel);

  wrap.appendChild(trigger);
  wrap.appendChild(panel);

  wrap._getValue = () => value;
  wrap._setValue = (v) => {
    value = v === undefined || v === null ? "" : String(v);
    if (open) closePanel();
    syncTrigger();
    renderDesktopOptions();
  };
  wrap._closePanel = closePanel;
  wrap._isPanelNode = (node) =>
    !!node?.closest?.(
      "[data-lp-emotion-trigger-overlay], [data-lp-floating-select-panel], .time-task-log-task-dropdown-panel, [data-legacy~='time-task-log-task-dropdown-panel']",
    );

  renderDesktopOptions();
  syncTrigger();
  return wrap;
}

export function mountTaskLogEmotionRating(container, onPick) {
  if (!container || container.dataset.built === "1") return;
  container.dataset.built = "1";
  container.setAttribute("role", "group");
  EMOTION_RATING_OPTIONS.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "time-task-log-emotion-rating-btn";
    btn.setAttribute("data-rating-value", String(opt.value));
    btn.setAttribute("aria-label", `${opt.label} ${opt.value}점`);

    const face = document.createElement("span");
    face.className = "time-task-log-emotion-face";
    face.innerHTML = buildEmotionFaceSvgHtml(opt.value, { size: 44 });

    const lab = document.createElement("span");
    lab.className = "time-task-log-emotion-label";
    lab.textContent = opt.label;

    btn.appendChild(face);
    btn.appendChild(lab);
    btn.addEventListener("click", () => onPick(opt.value));
    container.appendChild(btn);
  });
}
