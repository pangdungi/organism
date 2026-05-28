/**
 * 모달 날짜 입력 — 할일 수정 모달과 동일: native-wrap + overlay
 */

/** 할일 시작·마감, KPI 시작·달성기한만 날짜 지우기(X) 노출 */
export const MODAL_CLEARABLE_DATE_INPUT_SELECTOR =
  ".todo-task-edit-start, .todo-task-edit-due, input[name=\"targetStartDate\"], input[name=\"targetDeadline\"]";

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
  const clearBtn = wrap.querySelector(".time-task-log-date-clear");
  if (clearBtn) clearBtn.hidden = !has;
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

function shouldEnableModalDateClear(inputEl, opts) {
  if (!(inputEl instanceof HTMLInputElement)) return false;
  if (opts?.clearable === false) return false;
  try {
    return inputEl.matches(MODAL_CLEARABLE_DATE_INPUT_SELECTOR);
  } catch (_) {
    return false;
  }
}

function ensureModalNativeDateClearButton(wrap) {
  if (!wrap) return null;
  let btn = wrap.querySelector(".time-task-log-date-clear");
  if (btn) return btn;
  btn = document.createElement("button");
  btn.type = "button";
  btn.className = "time-task-log-date-clear";
  btn.setAttribute("aria-label", "날짜 지우기");
  btn.title = "날짜 지우기";
  btn.hidden = true;
  btn.innerHTML = '<span aria-hidden="true">×</span>';
  wrap.appendChild(btn);
  return btn;
}

function wireModalNativeDateClearButton(wrap, inputEl) {
  const btn = ensureModalNativeDateClearButton(wrap);
  if (!btn || btn.dataset.lpModalDateClearWired === "1") return;
  btn.dataset.lpModalDateClearWired = "1";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    inputEl.value = "";
    syncModalNativeDateFilled(inputEl);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function enableModalNativeDateClear(wrap, inputEl) {
  if (!wrap || !inputEl) return;
  wrap.classList.add("time-task-log-date-native-wrap--clearable");
  wireModalNativeDateClearButton(wrap, inputEl);
  syncModalNativeDateFilled(inputEl);
}

/** 달력·오버레이 영역 탭 시 시스템 date 피커 열기 */
export function wireModalNativeDateSlot(slotEl, inputEl) {
  if (!(slotEl instanceof HTMLElement) || !inputEl) return;
  if (slotEl.dataset.lpModalDateSlotWired === "1") return;
  slotEl.dataset.lpModalDateSlotWired = "1";
  slotEl.addEventListener("click", (e) => {
    if (e.target.closest(".time-task-log-date-clear")) return;
    openModalNativeDateInput(inputEl);
  });
}

/**
 * @param {HTMLElement|null|undefined} root
 * @param {{ inputs?: HTMLInputElement[], clearable?: boolean }} [opts]
 */
export function initModalNativeDateFieldsIn(root, opts = {}) {
  const list =
    opts.inputs ||
    (root
      ? [...root.querySelectorAll(".time-task-log-date-native-wrap input[type='date']")]
      : []);
  list.forEach((inp) => {
    if (!(inp instanceof HTMLInputElement)) return;
    const wrap = inp.closest(".time-task-log-date-native-wrap");
    if (!wrap) return;

    syncModalNativeDateFilled(inp);

    if (inp.dataset.lpModalDateWired !== "1") {
      inp.dataset.lpModalDateWired = "1";
      const bump = () => syncModalNativeDateFilled(inp);
      inp.addEventListener("input", bump);
      inp.addEventListener("change", bump);
      wireModalNativeDateSlot(wrap, inp);
    }

    if (shouldEnableModalDateClear(inp, opts)) {
      enableModalNativeDateClear(wrap, inp);
    }
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
 * 할일·KPI 모달 — 시작·마감(또는 시작·달성) 날짜 필드 공통 초기화
 * @param {HTMLElement|null|undefined} root
 */
export function initModalStandardDateFields(root) {
  initModalNativeDateFieldsIn(root, { clearable: true });
  if (!root) return;
  const startInput =
    root.querySelector('input[name="targetStartDate"]') ||
    root.querySelector(".todo-task-edit-start");
  const endInput =
    root.querySelector('input[name="targetDeadline"]') ||
    root.querySelector(".todo-task-edit-due");
  if (startInput || endInput) {
    bindModalNativeDateRange(startInput, endInput);
  }
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
