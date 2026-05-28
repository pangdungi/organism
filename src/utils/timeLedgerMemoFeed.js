/**
 * 시간가계부 · 메모만 보기 — 미니멀 목록
 */

/**
 * @param {HTMLElement} parentEl
 * @param {import("./diaryTimeReportLogMemos.js").TimeReportLogMemoRow[]} memoRows
 * @param {{ emptyMessage?: string, showDayDividers?: boolean, formatDayLabel?: (ymd: string) => string }} [opts]
 */
export function mountTimeLedgerMemoFeed(parentEl, memoRows, opts = {}) {
  const {
    emptyMessage = "선택 기간에 남긴 과제 메모가 없습니다.",
    showDayDividers = false,
    formatDayLabel = (ymd) => ymd.replace(/-/g, ".").slice(0, 10),
  } = opts;

  const feed = document.createElement("section");
  feed.className = "time-ledger-memo-feed";
  feed.setAttribute("aria-label", "과제 메모");

  if (!memoRows.length) {
    const empty = document.createElement("p");
    empty.className = "time-ledger-memo-feed-empty";
    empty.textContent = emptyMessage;
    feed.appendChild(empty);
    parentEl.appendChild(feed);
    return feed;
  }

  const list = document.createElement("ul");
  list.className = "time-ledger-memo-feed-list";

  let lastDayKey = "";

  for (const row of memoRows) {
    const dayKey = String(row.dateYmd || "").slice(0, 10);
    if (showDayDividers && dayKey && dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      const dayEl = document.createElement("li");
      dayEl.className = "time-ledger-memo-feed-day";
      dayEl.setAttribute("aria-hidden", "true");
      dayEl.textContent = formatDayLabel(dayKey);
      list.appendChild(dayEl);
    }

    const item = document.createElement("li");
    item.className = "time-ledger-memo-feed-item";

    const head = document.createElement("div");
    head.className = "time-ledger-memo-feed-head";

    const timeEl = document.createElement("span");
    timeEl.className = "time-ledger-memo-feed-time";
    timeEl.textContent = row.timeLabel || "—";

    const taskEl = document.createElement("span");
    taskEl.className = "time-ledger-memo-feed-task";
    taskEl.textContent = row.taskName || "과제";

    head.appendChild(timeEl);
    head.appendChild(taskEl);

    const textEl = document.createElement("p");
    textEl.className = "time-ledger-memo-feed-text";
    textEl.textContent = row.memoText;

    item.appendChild(head);
    item.appendChild(textEl);
    list.appendChild(item);
  }

  feed.appendChild(list);
  parentEl.appendChild(feed);
  return feed;
}
