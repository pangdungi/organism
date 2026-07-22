/**
 * 루틴 트랙커 하단 — 주간 달성률·비교 카드 (실제 잔디 데이터 기준)
 */

import {
  buildHabitTrackerRows,
  getHabitTrackerCellLevel,
  habitTrackerWeekDateKeys,
} from "./habitTrackerPageModel.js";
import {
  buildHabitTrackerTodayDailyRingModel,
  createHabitTrackerTodayRingElement,
} from "./habitTrackerTodayRing.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";

export { habitTrackerWeekDateKeys };

function isDayComplete(level) {
  return Number(level) >= 4;
}

/**
 * @param {{ skipSync?: boolean }} [opts]
 */
export function buildHabitTrackerWeekInsightModel(opts = {}) {
  const weekKeys = habitTrackerWeekDateKeys(timeLedgerLocalTodayYmd());
  const mid = weekKeys[3] || weekKeys[0];
  const ym = mid.match(/^(\d{4})-(\d{2})/);
  const year = ym ? Number(ym[1]) : new Date().getFullYear();
  const month = ym ? Number(ym[2]) : new Date().getMonth() + 1;
  const rows = buildHabitTrackerRows(year, month, {
    skipSync: opts.skipSync !== false,
  });
  const habits = rows.map((row) => {
    /** @type {number[]} */
    const levels = weekKeys.map((dk) => getHabitTrackerCellLevel(row, dk));
    const completeFlags = levels.map((lv) => isDayComplete(lv));
    const doneCount = completeFlags.filter(Boolean).length;
    let maxStreak = 0;
    let cur = 0;
    for (const ok of completeFlags) {
      if (ok) {
        cur += 1;
        if (cur > maxStreak) maxStreak = cur;
      } else cur = 0;
    }
    return {
      id: String(row.id || ""),
      label: String(row.label || "루틴").trim() || "루틴",
      completeFlags,
      doneCount,
      maxStreak,
    };
  });
  return { weekKeys, habits };
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function barToneClass(index, rate) {
  if (rate != null && rate < 30) return "is-low";
  if (rate != null && rate >= 70) return "is-high";
  return index % 2 === 0 ? "is-blue" : "is-mid";
}

/**
 * @param {ReturnType<typeof buildHabitTrackerWeekInsightModel>} model
 * @param {{ skipSync?: boolean }} [opts]
 */
export function createHabitTrackerInsightSection(model, opts = {}) {
  const section = document.createElement("section");
  section.className = "habit-tracker-insight-section";
  section.setAttribute("aria-label", "달성률과 목표 대비");

  const head = document.createElement("h2");
  head.className = "habit-tracker-insight-section-title";
  head.textContent = "달성률 & 목표 대비";
  section.appendChild(head);

  const track = document.createElement("div");
  track.className = "habit-tracker-insight-track";

  const habits = Array.isArray(model?.habits) ? model.habits : [];
  const maxDone = Math.max(1, ...habits.map((h) => h.doneCount), 1);
  const skipSync = opts.skipSync !== false;

  /* 1 — 오늘 루틴 달성 (원형 링) */
  {
    const card = document.createElement("article");
    card.className =
      "habit-tracker-insight-card habit-tracker-insight-card--today-ring";
    const title = document.createElement("h3");
    title.className =
      "habit-tracker-insight-card-title habit-tracker-insight-card-title--violet";
    title.textContent = "오늘 루틴 달성";
    const body = document.createElement("div");
    body.className =
      "habit-tracker-insight-card-body habit-tracker-insight-card-body--today-ring";
    const ringModel = buildHabitTrackerTodayDailyRingModel({ skipSync });
    body.appendChild(createHabitTrackerTodayRingElement(ringModel));
    card.append(title, body);
    track.appendChild(card);
  }

  /* 2 — 달성 횟수 비교 */
  {
    const card = document.createElement("article");
    card.className = "habit-tracker-insight-card";
    const rowsHtml = habits.length
      ? habits
          .slice()
          .sort((a, b) => b.doneCount - a.doneCount)
          .map((h, i) => {
            const pct = Math.round((h.doneCount / maxDone) * 100);
            return `<div class="habit-tracker-insight-bar-row">
              <span class="habit-tracker-insight-bar-label">${escapeHtml(h.label)}</span>
              <div class="habit-tracker-insight-bar-track">
                <div class="habit-tracker-insight-bar-fill ${barToneClass(i, null)}" style="width:${pct}%"></div>
              </div>
              <span class="habit-tracker-insight-bar-value">${h.doneCount}</span>
            </div>`;
          })
          .join("")
      : `<p class="habit-tracker-insight-empty">표시할 루틴이 없습니다.</p>`;
    card.innerHTML = `
      <h3 class="habit-tracker-insight-card-title habit-tracker-insight-card-title--blue">이번주 습관별 달성 비교</h3>
      <div class="habit-tracker-insight-card-body">${rowsHtml}</div>`;
    track.appendChild(card);
  }

  /* 3 — 연속 달성 (이번주 습관 점수판) */
  {
    const card = document.createElement("article");
    card.className = "habit-tracker-insight-card";
    const ranked = habits.slice().sort((a, b) => b.maxStreak - a.maxStreak);
    const streakHtml = ranked.length
      ? ranked
          .map((h) => {
            const streak = Math.max(0, Math.min(7, Number(h.maxStreak) || 0));
            const segs = Array.from({ length: 7 }, (_, i) => {
              const on = i < streak;
              return `<span class="habit-tracker-insight-streak-seg${on ? " is-on" : ""}"></span>`;
            }).join("");
            const tone =
              streak >= 5 ? "is-high" : streak >= 3 ? "is-mid" : streak >= 1 ? "is-low" : "is-zero";
            return `<div class="habit-tracker-insight-streak-row ${tone}">
              <span class="habit-tracker-insight-streak-name">${escapeHtml(h.label)}</span>
              <div class="habit-tracker-insight-streak-bar" aria-hidden="true">${segs}</div>
              <span class="habit-tracker-insight-streak-days">${streak}<span class="habit-tracker-insight-streak-unit">일</span></span>
            </div>`;
          })
          .join("")
      : `<p class="habit-tracker-insight-empty">표시할 루틴이 없습니다.</p>`;
    card.innerHTML = `
      <h3 class="habit-tracker-insight-card-title habit-tracker-insight-card-title--warm">이번주 습관 점수판</h3>
      <div class="habit-tracker-insight-card-body">${streakHtml}</div>`;
    track.appendChild(card);
  }

  section.appendChild(track);

  /* 모바일: 한 장씩 — 점 인디케이터 */
  const dots = document.createElement("div");
  dots.className = "habit-tracker-insight-dots-nav";
  dots.setAttribute("aria-hidden", "true");
  const cards = [...track.querySelectorAll(".habit-tracker-insight-card")];
  cards.forEach((_, i) => {
    const d = document.createElement("span");
    d.className =
      "habit-tracker-insight-dots-nav-item" + (i === 0 ? " is-active" : "");
    dots.appendChild(d);
  });
  section.appendChild(dots);

  const syncDots = () => {
    if (!track.isConnected) return;
    const w = track.clientWidth || 1;
    const idx = Math.round(track.scrollLeft / w);
    dots.querySelectorAll(".habit-tracker-insight-dots-nav-item").forEach((el, i) => {
      el.classList.toggle("is-active", i === idx);
    });
  };
  track.addEventListener("scroll", () => {
    window.requestAnimationFrame(syncDots);
  }, { passive: true });

  return section;
}
