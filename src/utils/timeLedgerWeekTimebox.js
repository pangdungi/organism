/** 시간가계부 타임박스 — 조회 기간(주) 7일치를 나란히 표시 */

import {
  createTimeLedgerDayTimeboxElement,
  refreshTimeLedgerDayTimeboxScroll,
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

function appendWeekDayPanel(parent, ymd, blocks) {
  const dayWrap = document.createElement("section");
  dayWrap.className = "time-ledger-week-timebox-day";
  dayWrap.dataset.ymd = ymd;

  const head = document.createElement("div");
  head.className = "time-ledger-week-timebox-day-head";
  head.textContent = formatWeekDayLabel(ymd);
  dayWrap.appendChild(head);

  const dayScroll = createTimeLedgerDayTimeboxElement(blocks);
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
  const scroll = document.createElement("div");
  scroll.className = "time-ledger-week-timebox-scroll";
  scroll.setAttribute(
    "aria-label",
    "주별 시간박스 — 선택 기간 날짜별 5분 단위 기록",
  );

  const days = enumerateYmdInclusive(rangeStartYmd, rangeEndYmd);
  if (!days.length) {
    const empty = document.createElement("p");
    empty.className = "time-ledger-timebox-multi-day-msg";
    empty.textContent = "조회 기간을 선택해 주세요.";
    scroll.appendChild(empty);
    return scroll;
  }

  days.forEach((ymd) => {
    appendWeekDayPanel(scroll, ymd, blocksByDay?.get?.(ymd) || []);
  });

  return scroll;
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
