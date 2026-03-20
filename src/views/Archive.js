/**
 * 아카이브 - 시간기록 메모·태그 목록 (미니멀)
 */

import { loadTimeRows, parseTagsFromFeedback } from "./Time.js";

function formatArchiveDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "—";
  const s = dateStr.trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return `${m[1]}. ${parseInt(m[2], 10)}. ${parseInt(m[3], 10)}.`;
  return s;
}

function formatArchiveTime(startTime) {
  if (!startTime || typeof startTime !== "string") return "—";
  const m = startTime.match(/[T\s](\d{1,2}):(\d{2})/);
  if (m) return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
  return startTime;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content archive-view";

  const header = document.createElement("header");
  header.className = "archive-header dream-view-header-wrap";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "ARCHIVE";
  const h = document.createElement("h1");
  h.className = "dream-view-title archive-title";
  h.textContent = "아카이브";
  header.appendChild(label);
  header.appendChild(h);

  const searchWrap = document.createElement("div");
  searchWrap.className = "archive-search-wrap";
  const searchIcon = document.createElement("span");
  searchIcon.className = "archive-search-icon";
  searchIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
  searchIcon.setAttribute("aria-hidden", "true");
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "archive-search-input";
  searchInput.placeholder = "날짜, 시간, 메모, 태그로 검색";
  searchInput.setAttribute("aria-label", "검색");
  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);
  header.appendChild(searchWrap);
  el.appendChild(header);

  const listSection = document.createElement("section");
  listSection.className = "archive-list-section";
  const listEl = document.createElement("div");
  listEl.className = "archive-list";

  function buildRecords() {
    const rows = loadTimeRows();
    return rows
      .filter(
        (r) =>
          (r.feedback || "").trim() !== "" ||
          (Array.isArray(r.memoTags) && r.memoTags.length > 0),
      )
      .map((r) => ({
        date: r.date || "",
        startTime: r.startTime || "",
        memo: (r.feedback || "").trim(),
        tags:
          Array.isArray(r.memoTags) && r.memoTags.length > 0
            ? r.memoTags
            : parseTagsFromFeedback(r.feedback || ""),
      }))
      .sort((a, b) => {
        const da = a.date + (a.startTime || "");
        const db = b.date + (b.startTime || "");
        return db.localeCompare(da);
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

  function renderList(records) {
    listEl.innerHTML = "";
    if (records.length === 0) {
      const empty = document.createElement("p");
      empty.className = "archive-empty";
      empty.textContent = "메모가 없습니다.";
      listEl.appendChild(empty);
      return;
    }
    records.forEach((r) => {
      const card = document.createElement("article");
      card.className = "archive-card";
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
      listEl.appendChild(card);
    });
  }

  let allRecords = buildRecords();
  renderList(allRecords);

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    const filtered = filterRecords(allRecords, q);
    renderList(filtered);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      renderList(allRecords);
      searchInput.blur();
    }
  });

  listSection.appendChild(listEl);
  el.appendChild(listSection);

  return el;
}
