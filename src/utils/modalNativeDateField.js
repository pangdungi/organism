/**
 * 모달 날짜 입력 — 할일 수정 모달과 동일: native-wrap + overlay
 */

export function formatModalNativeDateOverlayYmd(isoTen) {
  const m = String(isoTen || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const y = m[1];
  const mo = String(parseInt(m[2], 10));
  const da = String(parseInt(m[3], 10));
  return `${y}. ${mo}. ${da}`;
}

export function syncModalNativeDateFilled(inputEl) {
  if (!inputEl) return;
  const v = (inputEl.value || "").trim().slice(0, 10);
  const has = !!v;
  const wrap = inputEl.closest(".time-task-log-date-native-wrap");
  if (!wrap) return;
  wrap.classList.toggle("has-value", has);
  const ov = wrap.querySelector(".time-task-log-date-overlay");
  if (ov) ov.textContent = has ? formatModalNativeDateOverlayYmd(v) : "";
}

/** native date input에 포커스 후 시스템 date 피커 열기 */
export function openModalNativeDateInput(inputEl) {
  if (!inputEl) return;
  try {
    inputEl.focus({ preventScroll: true });
  } catch (_) {
    try {
      inputEl.focus();
    } catch (_) {}
  }
  try {
    if (typeof inputEl.showPicker === "function") inputEl.showPicker();
    else inputEl.click();
  } catch (_) {
    inputEl.click();
  }
}

/** 달력·오버레이 영역 탭 시 시스템 date 피커 열기 */
export function wireModalNativeDateSlot(slotEl, inputEl) {
  if (!(slotEl instanceof HTMLElement) || !inputEl) return;
  slotEl.addEventListener("click", () => {
    openModalNativeDateInput(inputEl);
  });
}

/**
 * @param {HTMLElement|null|undefined} root
 * @param {{ inputs?: HTMLInputElement[] }} [opts]
 */
export function initModalNativeDateFieldsIn(root, opts = {}) {
  const list =
    opts.inputs ||
    (root
      ? [...root.querySelectorAll(".time-task-log-date-native-wrap input[type='date']")]
      : []);
  list.forEach((inp) => {
    if (!(inp instanceof HTMLInputElement)) return;
    syncModalNativeDateFilled(inp);
    const bump = () => syncModalNativeDateFilled(inp);
    inp.addEventListener("input", bump);
    inp.addEventListener("change", bump);
    wireModalNativeDateSlot(inp.closest(".time-task-log-date-native-wrap"), inp);
  });
}

/** 시작·마감(또는 시작·달성) 날짜 min/max 연동 */
export function bindModalNativeDateRange(startInput, endInput) {
  const sync = () => {
    const s = (startInput?.value || "").trim().slice(0, 10);
    const d = (endInput?.value || "").trim().slice(0, 10);
    if (startInput) startInput.max = d || "";
    if (endInput) endInput.min = s || "";
  };
  [startInput, endInput].forEach((inp) => {
    if (!inp) return;
    inp.addEventListener("input", sync);
    inp.addEventListener("change", sync);
  });
  sync();
}

/**
 * KPI·모달 마크업용 (value는 escapeHtml 처리된 문자열)
 * @param {{ name: string, ariaLabel: string, value?: string, inputClass?: string }} spec
 */
export function buildModalNativeDateFieldMarkup(spec) {
  const name = String(spec.name || "");
  const ariaLabel = String(spec.ariaLabel || "");
  const value = String(spec.value || "").slice(0, 10);
  const inputClass = String(spec.inputClass || "").trim();
  const clsAttr = inputClass ? ` class="${inputClass}"` : "";
  return `<div class="time-task-log-date-native-wrap">
      <input type="date" name="${name}"${clsAttr} aria-label="${ariaLabel}" value="${value}" />
      <span class="time-task-log-date-overlay" aria-hidden="true"></span>
    </div>`;
}
