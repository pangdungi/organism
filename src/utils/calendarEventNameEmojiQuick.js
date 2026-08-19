/**
 * 월별 캘린더 할일/일정 추가 — 이름 칸 이모지 퀵버튼
 */

export const CALENDAR_EVENT_NAME_EMOJI_QUICK = [
  { insert: "◽️", label: "할 일 네모 넣기" },
  { insert: "📙", label: "책 넣기" },
  { insert: "🎬", label: "영화 넣기" },
  { insert: "📍", label: "위치 넣기" },
];

export function buildCalendarEventNameEmojiQuickMarkup() {
  const buttons = CALENDAR_EVENT_NAME_EMOJI_QUICK.map(
    ({ insert, label }) =>
      `<button type="button" class="calendar-event-name-emoji-quick-btn" data-insert="${insert}" aria-label="${label}"><span aria-hidden="true">${insert}</span></button>`,
  ).join("");
  return `<div class="calendar-event-name-emoji-quick" role="group" aria-label="빠른 이모지 입력">${buttons}</div>`;
}

/** @param {HTMLInputElement | HTMLTextAreaElement | null | undefined} el */
export function insertTextAtCaret(el, text) {
  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  if (el.disabled || el.readOnly) return;
  const insert = String(text || "");
  if (!insert) return;
  const value = String(el.value || "");
  let start = Number.isFinite(el.selectionStart)
    ? el.selectionStart
    : value.length;
  let end = Number.isFinite(el.selectionEnd) ? el.selectionEnd : start;
  if (start > end) {
    const t = start;
    start = end;
    end = t;
  }
  el.value = value.slice(0, start) + insert + value.slice(end);
  const caret = start + insert.length;
  try {
    el.focus({ preventScroll: true });
  } catch (_) {
    try {
      el.focus();
    } catch (_) {}
  }
  try {
    el.setSelectionRange(caret, caret);
  } catch (_) {}
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {HTMLInputElement | HTMLTextAreaElement | null | undefined} input
 */
export function wireCalendarEventNameEmojiQuick(root, input) {
  if (!root || !input) return;
  root
    .querySelectorAll(".calendar-event-name-emoji-quick-btn[data-insert]")
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertTextAtCaret(input, btn.getAttribute("data-insert") || "");
      });
    });
}
