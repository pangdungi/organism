/**
 * 캘린더·할일 — calendar_section_tasks 기간 pull 범위 계산
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @param {Date} date */
export function formatDateKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** @param {string} dateKey @param {number} days */
export function addDaysToYmdKey(dateKey, days) {
  const ymd = String(dateKey || "").trim().slice(0, 10);
  if (!YMD_RE.test(ymd)) return "";
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatDateKeyFromDate(dt);
}

/**
 * @param {object} task
 * @param {string} rangeStart
 * @param {string} rangeEnd
 */
export function calendarSectionTaskOverlapsYmdRange(task, rangeStart, rangeEnd) {
  const rs = String(rangeStart || "").trim().slice(0, 10);
  const re = String(rangeEnd || "").trim().slice(0, 10);
  if (!YMD_RE.test(rs) || !YMD_RE.test(re)) return false;
  const start = String(task?.startDate || task?.dueDate || "")
    .trim()
    .slice(0, 10);
  const due = String(task?.dueDate || task?.startDate || "")
    .trim()
    .slice(0, 10);
  if (!start || !due) return false;
  return start <= re && due >= rs;
}

/**
 * @param {number} year
 * @param {number} monthIndex 0-based
 * @param {number} [bufferDays=21]
 */
export function calendarPullRangeYmdForMonth(year, monthIndex, bufferDays = 21) {
  const y = Number(year);
  const m = Number(monthIndex);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    const now = new Date();
    return calendarPullRangeYmdForMonth(
      now.getFullYear(),
      now.getMonth(),
      bufferDays,
    );
  }
  const start = new Date(y, m, 1);
  start.setDate(start.getDate() - bufferDays);
  const end = new Date(y, m + 1, 0);
  end.setDate(end.getDate() + bufferDays);
  return {
    rangeStart: formatDateKeyFromDate(start),
    rangeEnd: formatDateKeyFromDate(end),
  };
}

/** @param {Date[]} weekDates — null 허용 7칸 */
export function calendarPullRangeYmdForWeekDates(weekDates, bufferDays = 7) {
  const keys = (weekDates || [])
    .map((d) => (d ? formatDateKeyFromDate(d) : ""))
    .filter((k) => YMD_RE.test(k));
  if (!keys.length) {
    const now = new Date();
    return calendarPullRangeYmdForMonth(now.getFullYear(), now.getMonth(), 21);
  }
  keys.sort();
  return {
    rangeStart: addDaysToYmdKey(keys[0], -bufferDays),
    rangeEnd: addDaysToYmdKey(keys[keys.length - 1], bufferDays),
  };
}

/** @param {string} centerYmd @param {number} [bufferDays=14] */
export function calendarPullRangeYmdAroundDay(centerYmd, bufferDays = 14) {
  const key = String(centerYmd || "").trim().slice(0, 10);
  if (!YMD_RE.test(key)) {
    const now = new Date();
    return calendarPullRangeYmdForMonth(now.getFullYear(), now.getMonth(), 21);
  }
  return {
    rangeStart: addDaysToYmdKey(key, -bufferDays),
    rangeEnd: addDaysToYmdKey(key, bufferDays),
  };
}

/**
 * @param {string} subViewId
 * @param {{ year?: number, monthIndex?: number, weekDates?: Date[], dayYmd?: string }} [ctx]
 */
export function calendarPullRangeForSubView(subViewId, ctx = {}) {
  const id = String(subViewId || "monthly").trim();
  if (id === "1week" && Array.isArray(ctx.weekDates)) {
    return calendarPullRangeYmdForWeekDates(ctx.weekDates, 7);
  }
  if (id === "1day" && ctx.dayYmd) {
    return calendarPullRangeYmdAroundDay(ctx.dayYmd, 14);
  }
  if (id === "annual") {
    const y = Number(ctx.year);
    const year = Number.isFinite(y) ? y : new Date().getFullYear();
    return {
      rangeStart: `${year}-01-01`,
      rangeEnd: `${year}-12-31`,
    };
  }
  return calendarPullRangeYmdForMonth(ctx.year, ctx.monthIndex, 21);
}

/**
 * @param {Array<Array<Date|null>>} grid — getCalendarGrid 결과
 */
export function calendarPullRangeYmdForMonthGrid(grid, bufferDays = 7) {
  const keys = [];
  (grid || []).forEach((week) => {
    (week || []).forEach((d) => {
      if (!d) return;
      const k = formatDateKeyFromDate(d);
      if (YMD_RE.test(k)) keys.push(k);
    });
  });
  if (!keys.length) {
    const now = new Date();
    return calendarPullRangeYmdForMonth(now.getFullYear(), now.getMonth(), 21);
  }
  keys.sort();
  return {
    rangeStart: addDaysToYmdKey(keys[0], -bufferDays),
    rangeEnd: addDaysToYmdKey(keys[keys.length - 1], bufferDays),
  };
}
