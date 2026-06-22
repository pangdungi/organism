/** 시간가계부 타임박스 — 주간 7일 격자 · 기간(주·연) 계산 */

import {
  createTimeLedgerDayTimeboxElement,
  refreshTimeLedgerDayTimeboxScroll,
  TIME_LEDGER_TIMEBOX_GRID_ROWS,
} from "./timeLedgerDayTimebox.js";

function parseYmd(ymd) {
  const s = String(ymd || "").trim().slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return {
    y: parseInt(m[1], 10),
    mo: parseInt(m[2], 10) - 1,
    d: parseInt(m[3], 10),
  };
}

function formatYmdFromDate(dt) {
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function dateFromYmd(ymd) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(p.y, p.mo, p.d);
}

/** 월요일=0 기준 요일 */
export function getMondayBasedDow(date) {
  return (date.getDay() + 6) % 7;
}

/** 임의 날짜가 속한 주 — 월요일~일요일(7일) */
export function getWeekRangeContainingYmd(ymd) {
  const fallback = formatYmdFromDate(new Date());
  const anchor = dateFromYmd(ymd) || dateFromYmd(fallback);
  if (!anchor) return { start: fallback, end: fallback };
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - getMondayBasedDow(anchor));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: formatYmdFromDate(monday),
    end: formatYmdFromDate(sunday),
  };
}

/** 주 단위 이동 — start/end는 항상 7일 */
export function shiftWeekRangeByWeeks(startYmd, weeksDelta) {
  const base = dateFromYmd(startYmd) || new Date();
  base.setDate(base.getDate() + weeksDelta * 7);
  return getWeekRangeContainingYmd(formatYmdFromDate(base));
}

export function getYearFromYmd(ymd) {
  const p = parseYmd(ymd);
  return p ? p.y : new Date().getFullYear();
}

export function getYearRangeForYear(year) {
  const y = Math.floor(Number(year) || new Date().getFullYear());
  return {
    start: `${y}-01-01`,
    end: `${y}-12-31`,
  };
}

/** 임의 날짜가 속한 달 — 1일~말일 */
export function getMonthRangeContainingYmd(ymd) {
  const p = parseYmd(ymd);
  const fallback = formatYmdFromDate(new Date());
  if (!p) return { start: fallback, end: fallback };
  const start = formatYmdFromDate(new Date(p.y, p.mo, 1));
  const end = formatYmdFromDate(new Date(p.y, p.mo + 1, 0));
  return { start, end };
}

/** 월 단위 이동 */
export function shiftMonthRangeByMonths(startYmd, monthsDelta) {
  const p = parseYmd(startYmd);
  if (!p) return getMonthRangeContainingYmd(startYmd);
  const anchor = new Date(p.y, p.mo + monthsDelta, 1);
  return getMonthRangeContainingYmd(formatYmdFromDate(anchor));
}

export function formatTimeboxMonthRangeLabel(startYmd) {
  const p = parseYmd(startYmd);
  if (!p) return "";
  return `${p.y}년 ${p.mo + 1}월`;
}

export function formatTimeboxWeekRangeLabel(startYmd, endYmd) {
  const fmt = (ymd) => {
    const p = parseYmd(ymd);
    if (!p) return ymd;
    const dt = new Date(p.y, p.mo, p.d);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const yy = String(p.y).slice(-2);
    const mm = String(p.mo + 1).padStart(2, "0");
    const dd = String(p.d).padStart(2, "0");
    return `${yy}.${mm}.${dd}(${weekdays[dt.getDay()]})`;
  };
  if (!startYmd || !endYmd) return "";
  if (startYmd === endYmd) return fmt(startYmd);
  return `${fmt(startYmd)} ~ ${fmt(endYmd)}`;
}

/** 시작·끝 YMD(포함) 사이 날짜 목록 */
export function enumerateYmdInclusive(startYmd, endYmd) {
  const s = parseYmd(startYmd);
  const e = parseYmd(endYmd);
  if (!s || !e) return [];
  const cur = new Date(s.y, s.mo, s.d);
  const end = new Date(e.y, e.mo, e.d);
  if (cur > end) return [];
  const out = [];
  while (cur <= end) {
    out.push(formatYmdFromDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function formatWeekDayLabel(ymd) {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const dt = new Date(p.y, p.mo, p.d);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${p.mo + 1}/${p.d}(${weekdays[dt.getDay()]})`;
}

function createWeekTimeboxHourRail() {
  const rail = document.createElement("div");
  rail.className = "time-ledger-week-timebox-hour-rail";
  rail.setAttribute("aria-hidden", "true");

  const head = document.createElement("div");
  head.className = "time-ledger-week-timebox-hour-rail-head";
  rail.appendChild(head);

  const body = document.createElement("div");
  body.className = "time-ledger-week-timebox-hour-rail-body";
  for (let row = 0; row < TIME_LEDGER_TIMEBOX_GRID_ROWS; row += 1) {
    const label = document.createElement("span");
    label.className = "time-ledger-week-timebox-hour-rail-label";
    label.textContent = String(row).padStart(2, "0");
    body.appendChild(label);
  }
  rail.appendChild(body);

  return rail;
}

function appendWeekDayPanel(parent, ymd, blocks) {
  const dayWrap = document.createElement("section");
  dayWrap.className = "time-ledger-week-timebox-day";
  dayWrap.dataset.ymd = ymd;

  const head = document.createElement("div");
  head.className = "time-ledger-week-timebox-day-head";
  head.textContent = formatWeekDayLabel(ymd);
  dayWrap.appendChild(head);

  const dayScroll = createTimeLedgerDayTimeboxElement(blocks, {
    showEmptyMessage: false,
    showRowLabels: false,
  });
  dayScroll.classList.add("time-ledger-day-timebox-scroll--week-compact");
  dayWrap.appendChild(dayScroll);

  parent.appendChild(dayWrap);
}

/** blocksByDay: Map<ymd, blocks[]> */
export function createTimeLedgerWeekTimeboxElement({
  rangeStartYmd,
  rangeEndYmd,
  blocksByDay,
}) {
  const layout = document.createElement("div");
  layout.className = "time-ledger-week-timebox-layout";
  layout.setAttribute(
    "aria-label",
    "주별 시간박스 — 선택 기간 날짜별 5분 단위 기록",
  );

  const days = enumerateYmdInclusive(rangeStartYmd, rangeEndYmd);
  if (!days.length) {
    const empty = document.createElement("p");
    empty.className = "time-ledger-timebox-multi-day-msg";
    empty.textContent = "조회 기간을 선택해 주세요.";
    layout.appendChild(empty);
    return layout;
  }

  layout.appendChild(createWeekTimeboxHourRail());

  const scroll = document.createElement("div");
  scroll.className = "time-ledger-week-timebox-scroll";
  const daysTrack = document.createElement("div");
  daysTrack.className = "time-ledger-week-timebox-days-track";
  days.forEach((ymd) => {
    appendWeekDayPanel(daysTrack, ymd, blocksByDay?.get?.(ymd) || []);
  });
  scroll.appendChild(daysTrack);
  layout.appendChild(scroll);

  return layout;
}

export function refreshTimeLedgerWeekTimeboxElement(shell, blocksByDay) {
  if (!shell) return;
  shell.querySelectorAll(".time-ledger-week-timebox-day").forEach((dayWrap) => {
    const ymd = dayWrap.dataset.ymd || "";
    const dayScroll = dayWrap.querySelector(".time-ledger-day-timebox-scroll");
    if (!dayScroll) return;
    refreshTimeLedgerDayTimeboxScroll(
      dayScroll,
      blocksByDay?.get?.(ymd) || [],
    );
  });
}
