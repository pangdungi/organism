/**
 * 아카이브 - 시간기록 메모·태그 목록 (미니멀)
 * 기본: 선택한 날짜 구간만 표시(서버는 entry_date 범위 pull). 검색어가 있으면 구간과 무관하게 전체 기록에서 검색.
 */

import { loadTimeRows, parseTagsFromFeedback } from "./Time.js";
import {
  readTimeLedgerEntriesRaw,
  updateTimeLedgerEntryFeedbackById,
} from "../utils/timeLedgerEntriesModel.js";
import { showToast } from "../utils/showToast.js";
import {
  hydrateTimeLedgerEntriesForArchiveRange,
  pushDirtyTimeLedgerEntriesToSupabase,
} from "../utils/timeLedgerEntriesSupabase.js";

function formatArchiveDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "—";
  const s = dateStr.trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return s;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo - 1, d);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const yy = String(y);
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${yy}. ${mm}. ${dd}(${weekdays[dt.getDay()]})`;
}

function formatArchiveTime(startTime) {
  if (!startTime || typeof startTime !== "string") return "—";
  const m = startTime.match(/[T\s](\d{1,2}):(\d{2})/);
  if (m) return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
  return startTime;
}

/** 기록 날짜 YYYY-MM-DD가 [startYmd, endYmd] 안에 있는지 */
function recordInDateRange(r, startYmd, endYmd) {
  const s = (r.date || "").trim().replace(/\//g, "-").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return s >= startYmd && s <= endYmd;
}

/** 시간가계부–가계부 연결용(동기화), 사용자 메모 아님 → 아카이브에 표시하지 않음 */
const LP_LEDGER_EXPENSE_TAG_PREFIX = "lp-expense:";

function isLedgerExpenseRefMemoTag(tag) {
  return String(tag || "").trim().startsWith(LP_LEDGER_EXPENSE_TAG_PREFIX);
}

/** memo_tags에서 사용자에게 보일 태그만 */
function filterArchiveVisibleTags(memoTags) {
  if (!Array.isArray(memoTags)) return [];
  return memoTags.filter((t) => !isLedgerExpenseRefMemoTag(t));
}

export function render() {
  const el = document.createElement("div");
  const archiveTabAbort = new AbortController();
  el._lpTabAbortController = archiveTabAbort;
  el.className = "app-tab-panel-content archive-view";
  const mobileViewport =
    typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches;
  if (mobileViewport) {
    el.classList.add("archive-view--mobile");
  }

  const header = document.createElement("header");
  header.className = "archive-header dream-view-header-wrap";
  if (!mobileViewport) {
    const label = document.createElement("span");
    label.className = "dream-view-label";
    label.textContent = "ARCHIVE";
    const h = document.createElement("h1");
    h.className = "dream-view-title archive-title";
    h.textContent = "아카이브";
    header.appendChild(label);
    header.appendChild(h);
  }

  const now = new Date();
  const y0 = now.getFullYear();
  const mo0 = now.getMonth();
  const pad2 = (n) => String(n).padStart(2, "0");
  const defaultRangeStart = `${y0}-${pad2(mo0 + 1)}-01`;
  const lastDayOfMonth = new Date(y0, mo0 + 1, 0).getDate();
  const defaultRangeEnd = `${y0}-${pad2(mo0 + 1)}-${pad2(lastDayOfMonth)}`;

  const searchRow = document.createElement("div");
  searchRow.className = "archive-search-row";

  const searchWrap = document.createElement("div");
  searchWrap.className = "archive-search-wrap";
  const searchIcon = document.createElement("span");
  searchIcon.className = "archive-search-icon";
  searchIcon.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
  searchIcon.setAttribute("aria-hidden", "true");
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "archive-search-input";
  searchInput.placeholder = "날짜, 시간, 메모, 태그로 검색";
  searchInput.setAttribute("aria-label", "검색");
  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);

  const dateNavCluster = document.createElement("div");
  dateNavCluster.className = "time-filter-nav-cluster archive-date-nav-cluster";
  const rangeWrap = document.createElement("div");
  rangeWrap.className = "time-filter-range-wrap archive-date-range-filter";
  rangeWrap.setAttribute("data-filter-wrap", "range");
  rangeWrap.innerHTML = `
    <div class="time-filter-date-field">
      <input type="date" class="time-filter-start-date" name="archive-filter-start" aria-label="시작일" />
      <span class="time-filter-date-label time-filter-date-label--start" aria-hidden="true"></span>
      <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
    </div>
    <span class="time-filter-range-sep">~</span>
    <div class="time-filter-date-field">
      <input type="date" class="time-filter-end-date" name="archive-filter-end" aria-label="종료일" />
      <span class="time-filter-date-label time-filter-date-label--end" aria-hidden="true"></span>
      <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
    </div>
  `;
  const startDateInput = rangeWrap.querySelector(".time-filter-start-date");
  const endDateInput = rangeWrap.querySelector(".time-filter-end-date");

  /** 모바일: YYYY-MM-DD → "2026년 4월 1일(수)" */
  function formatArchiveFilterDateKr(dStr) {
    if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
    const [y, mo, d] = dStr.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return `${y}년 ${mo}월 ${d}일(${weekdays[dt.getDay()]})`;
  }
  /** 데스크톱: 시간가계부 필터와 동일 — "2026. 04. 04(토)" (끝 마침표 없음) */
  function formatArchiveFilterDateDotsWithWeekday(dStr) {
    if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
    const [y, mo, d] = dStr.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const yy = String(y);
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${yy}. ${mm}. ${dd}(${weekdays[dt.getDay()]})`;
  }
  function syncArchiveDateLabels() {
    const startLabel = rangeWrap.querySelector(".time-filter-date-label--start");
    const endLabel = rangeWrap.querySelector(".time-filter-date-label--end");
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 48.0625rem)").matches;
    const fmt = isDesktop
      ? formatArchiveFilterDateDotsWithWeekday
      : formatArchiveFilterDateKr;
    if (startLabel) startLabel.textContent = fmt(startDateInput.value || "");
    if (endLabel) endLabel.textContent = fmt(endDateInput.value || "");
  }

  startDateInput.value = defaultRangeStart;
  endDateInput.value = defaultRangeEnd;
  syncArchiveDateLabels();
  startDateInput.addEventListener("input", syncArchiveDateLabels);
  endDateInput.addEventListener("input", syncArchiveDateLabels);
  window.addEventListener("resize", syncArchiveDateLabels, {
    signal: archiveTabAbort.signal,
  });

  if (mobileViewport) {
    const openArchiveRangeDate = (inp) => {
      if (!inp) return;
      try {
        inp.focus({ preventScroll: true });
      } catch (_) {
        inp.focus();
      }
      if (typeof inp.showPicker === "function") {
        try {
          inp.showPicker();
          return;
        } catch (_) {}
      }
      inp.click();
    };
    rangeWrap.querySelectorAll(".time-filter-date-field").forEach((field) => {
      const inp = field.querySelector('input[type="date"]');
      if (!inp) return;
      field.addEventListener("click", () => {
        openArchiveRangeDate(inp);
      });
    });
  }

  dateNavCluster.appendChild(rangeWrap);
  searchRow.appendChild(searchWrap);
  searchRow.appendChild(dateNavCluster);
  header.appendChild(searchRow);
  el.appendChild(header);

  const listSection = document.createElement("section");
  listSection.className = "archive-list-section";
  const listEl = document.createElement("div");
  listEl.className = "archive-list";

  function buildRecords() {
    const rows = loadTimeRows();
    return rows
      .map((r) => {
        const memo = (r.feedback || "").trim();
        const fromFeedbackTags = parseTagsFromFeedback(r.feedback || "");
        const visibleFromMemoTags = filterArchiveVisibleTags(r.memoTags);
        const tags =
          visibleFromMemoTags.length > 0
            ? visibleFromMemoTags
            : fromFeedbackTags;
        return {
          id: String(r.id || "").trim(),
          date: r.date || "",
          startTime: r.startTime || "",
          memo,
          tags,
        };
      })
      .filter((item) => item.memo !== "" || item.tags.length > 0)
      .sort((a, b) => {
        const da = a.date + (a.startTime || "");
        const db = b.date + (b.startTime || "");
        return db.localeCompare(da);
      });
  }

  /** hydrate 완료 전에는 빈 목록 — 첫 화면부터 해당 기간 Supabase 반영 후에만 채움 */
  let fullRecords = [];
  let archiveRangeSyncGen = 0;

  function getFilterRangeYmd() {
    const s = (startDateInput.value || defaultRangeStart).trim();
    const e = (endDateInput.value || defaultRangeEnd).trim();
    return { startYmd: s, endYmd: e };
  }

  function refreshFullRecords() {
    fullRecords = buildRecords();
  }

  function showArchiveListLoading() {
    listEl.classList.add("archive-list--loading");
    listEl.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "archive-list-loading";
    wrap.setAttribute("aria-busy", "true");
    wrap.setAttribute("aria-live", "polite");
    wrap.setAttribute("aria-label", "아카이브 기록 동기화 중");

    const track = document.createElement("div");
    track.className = "archive-list-loading-track";
    const bar = document.createElement("div");
    bar.className = "archive-list-loading-bar";
    track.appendChild(bar);

    const label = document.createElement("p");
    label.className = "archive-list-loading-label";
    label.textContent = "기록 동기화 중";

    const sk = document.createElement("div");
    sk.className = "archive-list-loading-skeleton";
    for (let i = 0; i < 3; i++) {
      const row = document.createElement("div");
      row.className = "archive-list-loading-card";
      sk.appendChild(row);
    }

    wrap.appendChild(track);
    wrap.appendChild(label);
    wrap.appendChild(sk);
    listEl.appendChild(wrap);
  }

  async function loadArchiveRangeThenRender() {
    /* render() 직후에는 아직 app-tab-panel에 안 붙었을 수 있음 → 호출부는 queueMicrotask 권장 */
    if (!el.isConnected) return;
    const { startYmd, endYmd } = getFilterRangeYmd();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) {
      showToast("날짜를 확인해 주세요.");
      return;
    }
    if (startYmd > endYmd) {
      showToast("시작일이 종료일보다 늦을 수 없습니다.");
      return;
    }
    const gen = ++archiveRangeSyncGen;
    showArchiveListLoading();
    try {
      await hydrateTimeLedgerEntriesForArchiveRange(startYmd, endYmd);
    } catch (e) {
      console.warn("[archive] range sync", e);
    } finally {
      if (gen !== archiveRangeSyncGen || !el.isConnected) return;
      listEl.classList.remove("archive-list--loading");
      refreshFullRecords();
      renderList();
    }
  }

  function openArchiveMemoModal(record) {
    const entryId = record.id;
    if (!entryId) {
      showToast("이 기록을 편집할 수 없습니다.", "저장된 행 id가 없어요.");
      return;
    }

    const modal = document.createElement("div");
    modal.className = "todo-list-modal archive-memo-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "archive-memo-modal-title");

    const backdrop = document.createElement("div");
    backdrop.className = "todo-list-modal-backdrop";

    const panel = document.createElement("div");
    panel.className = "todo-list-modal-panel";

    const header = document.createElement("div");
    header.className = "todo-list-modal-header";
    const title = document.createElement("h3");
    title.className = "todo-list-modal-title";
    title.id = "archive-memo-modal-title";
    title.textContent = "메모";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "todo-list-modal-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.textContent = "×";
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "todo-list-modal-body";
    const lbl = document.createElement("p");
    lbl.className = "todo-list-modal-label";
    lbl.textContent = `${formatArchiveDate(record.date)} · ${formatArchiveTime(record.startTime)}`;
    const ta = document.createElement("textarea");
    ta.className = "archive-memo-modal-textarea";
    ta.rows = 4;
    ta.placeholder = "메모";
    ta.value = record.memo || "";
    body.appendChild(lbl);
    body.appendChild(ta);

    const footer = document.createElement("div");
    footer.className = "todo-list-modal-footer archive-memo-modal-footer";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "todo-list-modal-cancel archive-memo-modal-delete";
    delBtn.textContent = "삭제";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "todo-list-modal-confirm";
    saveBtn.textContent = "저장";
    footer.appendChild(delBtn);
    footer.appendChild(saveBtn);

    modal.appendChild(backdrop);
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    modal.appendChild(panel);

    function close() {
      document.removeEventListener("keydown", onDocKey);
      modal.remove();
      el.style.overflow = "";
    }

    function onDocKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }

    function applyResult(res) {
      if (!res.ok) {
        showToast(res.msg || "저장할 수 없습니다.");
        return;
      }
      const { startYmd, endYmd } = getFilterRangeYmd();
      void (async () => {
        try {
          await pushDirtyTimeLedgerEntriesToSupabase({
            rangeStart: startYmd,
            rangeEnd: endYmd,
          });
        } catch (_) {}
        refreshFullRecords();
        renderList();
        close();
      })();
    }

    function save() {
      applyResult(updateTimeLedgerEntryFeedbackById(entryId, ta.value));
    }

    function onDelete() {
      applyResult(updateTimeLedgerEntryFeedbackById(entryId, ""));
    }

    backdrop.addEventListener("click", close);
    closeBtn.addEventListener("click", close);
    saveBtn.addEventListener("click", save);
    delBtn.addEventListener("click", onDelete);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    });

    el.appendChild(modal);
    el.style.overflow = "hidden";
    document.addEventListener("keydown", onDocKey);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }

  function filterRecords(records, query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const dateStr = formatArchiveDate(r.date).toLowerCase();
      const timeStr = formatArchiveTime(r.startTime).toLowerCase();
      const memo = (r.memo || "").toLowerCase();
      const tagsStr = (r.tags || []).join(" ").toLowerCase();
      return (
        dateStr.includes(q) ||
        timeStr.includes(q) ||
        memo.includes(q) ||
        tagsStr.includes(q)
      );
    });
  }

  function getRecordsToDisplay() {
    const q = searchInput.value.trim();
    if (q) {
      return { records: filterRecords(fullRecords, q), mode: "search" };
    }
    const { startYmd, endYmd } = getFilterRangeYmd();
    return {
      records: fullRecords.filter((r) => recordInDateRange(r, startYmd, endYmd)),
      mode: "range",
    };
  }

  function renderList() {
    const { records, mode } = getRecordsToDisplay();
    listEl.innerHTML = "";
    if (records.length === 0) {
      const empty = document.createElement("p");
      empty.className = "archive-empty";
      empty.textContent =
        mode === "search" ? "검색 결과가 없습니다." : "이 기간에 표시할 메모가 없습니다.";
      listEl.appendChild(empty);
      return;
    }
    records.forEach((r) => {
      const card = document.createElement("article");
      card.className = "archive-card archive-card--interactive";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "메모 편집");
      const dateEl = document.createElement("time");
      dateEl.className = "archive-card-date";
      dateEl.textContent = formatArchiveDate(r.date);
      const timeEl = document.createElement("span");
      timeEl.className = "archive-card-time";
      timeEl.textContent = formatArchiveTime(r.startTime);
      const meta = document.createElement("div");
      meta.className = "archive-card-meta";
      meta.appendChild(dateEl);
      meta.appendChild(timeEl);
      const memoEl = document.createElement("p");
      memoEl.className = "archive-card-memo";
      memoEl.textContent = r.memo || "";
      card.appendChild(meta);
      card.appendChild(memoEl);
      if (r.tags && r.tags.length > 0) {
        const tagWrap = document.createElement("div");
        tagWrap.className = "archive-card-tags";
        r.tags.forEach((tag) => {
          const pill = document.createElement("span");
          pill.className = "archive-tag-pill";
          pill.textContent = tag;
          tagWrap.appendChild(pill);
        });
        card.appendChild(tagWrap);
      }
      function openMemo() {
        openArchiveMemoModal(r);
      }
      card.addEventListener("click", openMemo);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openMemo();
        }
      });
      listEl.appendChild(card);
    });
  }

  function onDateRangeChange() {
    syncArchiveDateLabels();
    void loadArchiveRangeThenRender();
  }
  startDateInput.addEventListener("change", onDateRangeChange);
  endDateInput.addEventListener("change", onDateRangeChange);

  searchInput.addEventListener("input", () => {
    renderList();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      renderList();
      searchInput.blur();
    }
  });

  listSection.appendChild(listEl);
  el.appendChild(listSection);

  /* 패널에 붙인 뒤(다음 마이크로태스크)에 hydrate — 그 전에는 el.isConnected 가 false라 목록이 안 그려짐 */
  queueMicrotask(() => {
    void loadArchiveRangeThenRender();
  });

  /*
   * Realtime: App 쪽에서 이미 pullAllTimeLedgerFromCloud 로 로컬이 갱신된 뒤 이벤트가 옴.
   * 여기서 구간 hydrate를 반복 호출하면 Realtime·pull이 겹쳐 불필요한 갱신이 날 수 있음.
   */
  document.addEventListener(
    "lp-time-ledger-remote-updated",
    () => {
      if (!el.isConnected) return;
      refreshFullRecords();
      renderList();
    },
    { signal: archiveTabAbort.signal },
  );

  return el;
}
