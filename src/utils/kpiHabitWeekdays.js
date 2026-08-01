/**
 * 매일하기 KPI — 하는 요일 (월=0 … 일=6)
 */

export const HABIT_WEEKDAY_LABELS_MON_SUN = [
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
  "일",
];

export const ALL_HABIT_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** @param {unknown} raw @returns {number[]} */
export function normalizeHabitWeekdays(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...ALL_HABIT_WEEKDAYS];
  }
  const set = new Set();
  for (const x of raw) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  if (!set.size) return [...ALL_HABIT_WEEKDAYS];
  return [...set].sort((a, b) => a - b);
}

/** YYYY-MM-DD → 월=0 … 일=6 */
export function habitWeekdayIndexFromYmd(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return -1;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return -1;
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return -1;
  return (dt.getDay() + 6) % 7;
}

/** @param {{ habitWeekdays?: unknown }|null|undefined} kpi @param {string} ymd */
export function isHabitScheduledOnYmd(kpi, ymd) {
  const idx = habitWeekdayIndexFromYmd(ymd);
  if (idx < 0) return false;
  return normalizeHabitWeekdays(kpi?.habitWeekdays).includes(idx);
}

/** @param {HTMLFormElement|null|undefined} form @returns {number[]} */
export function readHabitWeekdaysFromForm(form) {
  if (!form) return [...ALL_HABIT_WEEKDAYS];
  const boxes = form.querySelectorAll('input[name="habitWeekday"]:checked');
  const picked = [...boxes]
    .map((el) => Number(el.value))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (!picked.length) return [];
  return normalizeHabitWeekdays(picked);
}

/**
 * @param {{ habitWeekdays?: unknown }|null|undefined} kpi
 * @param {boolean} [habitMode]
 */
export function kpiHabitWeekdaysFieldHtml(kpi = null, habitMode = false) {
  const selected = new Set(normalizeHabitWeekdays(kpi?.habitWeekdays));
  const chips = HABIT_WEEKDAY_LABELS_MON_SUN.map((label, i) => {
    const checked = selected.has(i) ? " checked" : "";
    return `<label class="dream-kpi-habit-weekday-chip">
      <input type="checkbox" name="habitWeekday" value="${i}" class="dream-kpi-habit-weekday-input"${checked} />
      <span class="dream-kpi-habit-weekday-text">${label}</span>
    </label>`;
  }).join("");
  return `
    <div class="dream-kpi-field dream-kpi-habit-weekdays-field" data-kpi-habit-weekdays data-legacy="time-add-task-field"${habitMode ? "" : " hidden"}>
      <span class="dream-kpi-goal-mode-caption">하는 요일</span>
      <div class="dream-kpi-habit-weekday-row" role="group" aria-label="하는 요일">
        ${chips}
      </div>
    </div>`;
}
