/**
 * 시간가계부 · 레포트 탭 — AI 시간 건강검진(기존 시간 레포트 메뉴와 동일)
 */

import { fetchTimeReportAiAnalysis } from "./timeReportAiAnalyze.js";
import {
  formatYmdDotsWithWeekdayKo,
  getTimeReportMonthInclusiveRange,
} from "../views/Time.js";

export const LP_TIME_REPORT_RANGE_START_KEY = "lp_time_report_range_start";
export const LP_TIME_REPORT_RANGE_END_KEY = "lp_time_report_range_end";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function normYmd(v) {
  return String(v || "")
    .replace(/\//g, "-")
    .slice(0, 10);
}

function localTodayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function readTimeLedgerReportRangeFromSession(fallbackToday) {
  const today = fallbackToday || localTodayYmd();
  try {
    if (typeof sessionStorage === "undefined") {
      return { start: today, end: today };
    }
    const rs = sessionStorage.getItem(LP_TIME_REPORT_RANGE_START_KEY);
    const re = sessionStorage.getItem(LP_TIME_REPORT_RANGE_END_KEY);
    if (!rs || !YMD_RE.test(rs)) return { start: today, end: today };
    let start = rs;
    let end = re && YMD_RE.test(re) ? re : rs;
    if (start > end) {
      const x = start;
      start = end;
      end = x;
    }
    return { start, end };
  } catch (_) {
    return { start: today, end: today };
  }
}

export function persistTimeLedgerReportRangeToSession(startYmd, endYmd) {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(LP_TIME_REPORT_RANGE_START_KEY, startYmd);
    sessionStorage.setItem(LP_TIME_REPORT_RANGE_END_KEY, endYmd);
  } catch (_) {}
}

export function resetTimeLedgerReportRangeToToday(todayYmd) {
  const t = todayYmd || localTodayYmd();
  persistTimeLedgerReportRangeToSession(t, t);
}

function formatMonthSlashFromYmd(ymd) {
  const n = normYmd(ymd);
  if (!n || n.length < 7) return "";
  return `${n.slice(0, 4)}/${n.slice(5, 7)}`;
}

function timeReportMonthBlockTitle(ymdTen) {
  const ten = normYmd(ymdTen);
  if (!ten || ten.length < 10) return "월별 시간 사용";
  const ymAnchor = ten.slice(0, 7);
  const today = localTodayYmd();
  if (ymAnchor === today.slice(0, 7)) return "이번 달 시간 사용";
  const disp = formatMonthSlashFromYmd(ten);
  return disp ? `${disp} 시간 사용` : "월별 시간 사용";
}

const AI_STATUS_LABEL = {
  good: "양호",
  caution: "주의",
  risk: "위험",
  neutral: "보통",
};

function timeReportAiStatusClass(status) {
  const s = String(status || "neutral").toLowerCase();
  if (s === "good" || s === "caution" || s === "risk") return s;
  return "neutral";
}

function renderTimeReportAiFallbackFacts(card, facts) {
  if (!facts?.scores) return;
  const s = facts.scores;
  const grid = document.createElement("div");
  grid.className = "diary-tr-ai-checkup-fallback-stats";
  const items = [
    ["가용", facts.labels?.available || "—"],
    ["투자", facts.labels?.productive || "—"],
    ["소비(낭비)", facts.labels?.waste || "—"],
    ["점수", `${s.productiveVsAvailablePct ?? 0}점`],
  ];
  items.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "diary-tr-ai-checkup-fallback-stat";
    const lbl = document.createElement("span");
    lbl.className = "diary-tr-ai-checkup-fallback-stat-label";
    lbl.textContent = label;
    const val = document.createElement("span");
    val.className = "diary-tr-ai-checkup-fallback-stat-value";
    val.textContent = value;
    row.appendChild(lbl);
    row.appendChild(val);
    grid.appendChild(row);
  });
  card.appendChild(grid);
}

function renderTimeReportAiCheckupContent(shell, result, ymdTen, granularity, onRetry) {
  shell.replaceChildren();

  const wrap = document.createElement("div");
  wrap.className = "diary-tr-ai-checkup";

  const head = document.createElement("header");
  head.className = "diary-tr-ai-checkup-head";
  const title = document.createElement("h2");
  title.className = "diary-tr-ai-checkup-title";
  title.textContent =
    granularity === "month"
      ? timeReportMonthBlockTitle(ymdTen)
      : formatYmdDotsWithWeekdayKo(ymdTen) || "시간 건강검진";
  const badge = document.createElement("p");
  badge.className = "diary-tr-ai-checkup-badge";
  badge.textContent = "AI 시간 건강검진";
  head.appendChild(badge);
  head.appendChild(title);
  wrap.appendChild(head);

  if (!result.ok) {
    const errCard = document.createElement("div");
    errCard.className = "diary-tr-ai-checkup-card diary-tr-ai-checkup-card--error";
    const errMsg = document.createElement("p");
    errMsg.className = "diary-tr-ai-checkup-error-msg";
    errMsg.textContent = result.msg;
    errCard.appendChild(errMsg);
    renderTimeReportAiFallbackFacts(errCard, result.facts);
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "diary-tr-ai-checkup-retry";
    retryBtn.textContent = "AI 분석 다시 시도";
    retryBtn.addEventListener("click", () => onRetry(true));
    errCard.appendChild(retryBtn);
    wrap.appendChild(errCard);
    shell.appendChild(wrap);
    return;
  }

  const a = result.analysis;
  const heroCard = document.createElement("div");
  heroCard.className = "diary-tr-ai-checkup-card diary-tr-ai-checkup-card--hero";

  const scoreRow = document.createElement("div");
  scoreRow.className = "diary-tr-ai-checkup-score-row";
  const scoreBlock = document.createElement("div");
  scoreBlock.className = "diary-tr-ai-checkup-score-block";
  const grade = document.createElement("p");
  grade.className = "diary-tr-ai-checkup-grade";
  grade.textContent = String(a.grade || "—");
  const scoreNum = document.createElement("p");
  scoreNum.className = "diary-tr-ai-checkup-score-num";
  scoreNum.textContent = `${a.score ?? 0}점`;
  scoreBlock.appendChild(grade);
  scoreBlock.appendChild(scoreNum);

  const headlineWrap = document.createElement("div");
  headlineWrap.className = "diary-tr-ai-checkup-headline-wrap";
  const headline = document.createElement("p");
  headline.className = "diary-tr-ai-checkup-headline";
  headline.textContent = a.headline || "분석 완료";
  const summary = document.createElement("p");
  summary.className = "diary-tr-ai-checkup-summary";
  summary.textContent = a.summary || "";
  headlineWrap.appendChild(headline);
  if (a.summary) headlineWrap.appendChild(summary);

  scoreRow.appendChild(scoreBlock);
  scoreRow.appendChild(headlineWrap);
  heroCard.appendChild(scoreRow);
  wrap.appendChild(heroCard);

  (a.sections || []).forEach((sec) => {
    const secCard = document.createElement("section");
    secCard.className = "diary-tr-ai-checkup-card diary-tr-ai-checkup-card--section";
    const secHead = document.createElement("div");
    secHead.className = "diary-tr-ai-checkup-section-head";
    const secTitle = document.createElement("h3");
    secTitle.className = "diary-tr-ai-checkup-section-title";
    secTitle.textContent = sec.title || "항목";
    const chip = document.createElement("span");
    chip.className =
      "diary-tr-ai-checkup-status diary-tr-ai-checkup-status--" +
      timeReportAiStatusClass(sec.status);
    chip.textContent = AI_STATUS_LABEL[timeReportAiStatusClass(sec.status)] || "보통";
    secHead.appendChild(secTitle);
    secHead.appendChild(chip);
    secCard.appendChild(secHead);

    if (Array.isArray(sec.findings) && sec.findings.length) {
      const ul = document.createElement("ul");
      ul.className = "diary-tr-ai-checkup-list diary-tr-ai-checkup-list--findings";
      sec.findings.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        ul.appendChild(li);
      });
      secCard.appendChild(ul);
    }
    if (Array.isArray(sec.advice) && sec.advice.length) {
      const advTitle = document.createElement("p");
      advTitle.className = "diary-tr-ai-checkup-advice-label";
      advTitle.textContent = "코치 제안";
      secCard.appendChild(advTitle);
      const ul = document.createElement("ul");
      ul.className = "diary-tr-ai-checkup-list diary-tr-ai-checkup-list--advice";
      sec.advice.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        ul.appendChild(li);
      });
      secCard.appendChild(ul);
    }
    wrap.appendChild(secCard);
  });

  function appendBulletBlock(titleText, items, listClass) {
    if (!Array.isArray(items) || !items.length) return;
    const block = document.createElement("div");
    block.className = "diary-tr-ai-checkup-card diary-tr-ai-checkup-card--bullets";
    const h = document.createElement("h3");
    h.className = "diary-tr-ai-checkup-bullets-title";
    h.textContent = titleText;
    block.appendChild(h);
    const ul = document.createElement("ul");
    ul.className = `diary-tr-ai-checkup-list ${listClass}`;
    items.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    });
    block.appendChild(ul);
    wrap.appendChild(block);
  }

  appendBulletBlock("잘한 점", a.highlights, "diary-tr-ai-checkup-list--good");
  appendBulletBlock("주의할 점", a.risks, "diary-tr-ai-checkup-list--risk");
  appendBulletBlock("다음 행동", a.nextSteps, "diary-tr-ai-checkup-list--next");

  const foot = document.createElement("div");
  foot.className = "diary-tr-ai-checkup-foot";
  const note = document.createElement("p");
  note.className = "diary-tr-ai-checkup-foot-note";
  note.textContent = result.fromCache
    ? "캐시된 AI 분석 · 데이터가 바뀌면 자동 갱신됩니다."
    : "투자·소비·예산 기록을 바탕으로 AI가 판단했습니다.";
  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "diary-tr-ai-checkup-retry diary-tr-ai-checkup-retry--subtle";
  refreshBtn.textContent = "새로 분석";
  refreshBtn.addEventListener("click", () => onRetry(true));
  foot.appendChild(note);
  foot.appendChild(refreshBtn);
  wrap.appendChild(foot);

  shell.appendChild(wrap);
}

/**
 * 조회 시작·마감일 → AI 레포트 granularity·앵커 날짜
 * @returns {{ ymdTen: string, granularity: "day"|"month" }}
 */
export function resolveTimeReportTargetFromRange(startYmd, endYmd) {
  let s = normYmd(startYmd);
  let e = normYmd(endYmd);
  if (!YMD_RE.test(s)) s = localTodayYmd();
  if (!YMD_RE.test(e)) e = s;
  if (s > e) {
    const x = s;
    s = e;
    e = x;
  }
  if (s === e) return { ymdTen: s, granularity: "day" };
  if (s.slice(0, 7) === e.slice(0, 7)) {
    const monthRng = getTimeReportMonthInclusiveRange(s);
    if (monthRng && monthRng.start === s && monthRng.end === e) {
      return { ymdTen: s, granularity: "month" };
    }
  }
  return { ymdTen: e, granularity: "day" };
}

/**
 * @param {HTMLElement} scrollWrap
 * @param {{ ymdTen: string, granularity: "day"|"month" }} opts
 */
export function mountTimeLedgerAiReport(scrollWrap, { ymdTen, granularity }) {
  const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  scrollWrap.dataset.lpAiReportReq = reqId;

  const shell = document.createElement("div");
  shell.className = "diary-tr-ai-checkup-shell";
  shell.setAttribute("aria-busy", "true");
  shell.setAttribute("aria-label", "AI 시간 건강검진 분석 중");

  const loading = document.createElement("div");
  loading.className = "diary-tr-ai-checkup-loading";
  const loadingTitle = document.createElement("p");
  loadingTitle.className = "diary-tr-ai-checkup-loading-title";
  loadingTitle.textContent = "시간 건강검진 분석 중…";
  const loadingSub = document.createElement("p");
  loadingSub.className = "diary-tr-ai-checkup-loading-sub";
  loadingSub.textContent = "투자·소비·예산 기록을 AI가 읽고 있습니다.";
  loading.appendChild(loadingTitle);
  loading.appendChild(loadingSub);
  shell.appendChild(loading);
  scrollWrap.appendChild(shell);

  const runAnalysis = async (force) => {
    const result = await fetchTimeReportAiAnalysis({
      ymdTen,
      granularity,
      force: !!force,
    });
    if (scrollWrap.dataset.lpAiReportReq !== reqId) return;
    shell.setAttribute("aria-busy", "false");
    renderTimeReportAiCheckupContent(shell, result, ymdTen, granularity, (f) => {
      shell.replaceChildren();
      const loading2 = loading.cloneNode(true);
      shell.appendChild(loading2);
      shell.setAttribute("aria-busy", "true");
      void runAnalysis(f);
    });
  };

  void runAnalysis(false);
}
