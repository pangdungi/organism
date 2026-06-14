/**
 * 관리자 전용: user_subscriptions 조회·1년 부여·이용 만료·탈퇴 회원
 * 서버 권한: Supabase RPC lp_is_app_admin (마이그레이션의 관리자 이메일과 일치)
 */

import { isCurrentUserAppAdmin } from "../utils/adminAccess.js";
import {
  adminGrantOneYear,
  adminListSubscriptions,
  adminListUserDeletions,
  adminSetSubscription,
} from "../utils/adminSubscriptionRpc.js";
import { supabase } from "../supabase.js";
import { showToast } from "../utils/showToast.js";

const ADMIN_SECTIONS = [
  {
    id: "all",
    label: "전체 목록",
    hint: "모든 회원의 구독 상태·이용 만료를 수정할 수 있습니다.",
    toolbarLabel: "이용권(구독) 목록",
  },
  {
    id: "expired",
    label: "이용 만료",
    hint: "이용 종료일이 지난 회원입니다. 갱신권 구매 확인 후 1년 이용권을 부여하세요.",
    toolbarLabel: "이용 만료 회원",
  },
  {
    id: "withdrawn",
    label: "탈퇴 회원",
    hint: "회원 탈퇴로 삭제된 계정 기록입니다. (탈퇴 기능 적용 이후부터 기록됩니다.)",
    toolbarLabel: "탈퇴 회원 기록",
  },
];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatKoDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

/** input[type=datetime-local] value (로컬) */
function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromDatetimeLocalValue(s) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isRowExpired(row) {
  if (!row?.access_until) return false;
  const endMs = new Date(row.access_until).getTime();
  return !Number.isNaN(endMs) && Date.now() > endMs;
}

function appendUidCell(tr, uid) {
  const tdUid = document.createElement("td");
  tdUid.className = "admin-subs-td admin-subs-td--uid";
  const id = String(uid || "");
  tdUid.textContent = id ? `${id.slice(0, 8)}…` : "—";
  tdUid.title = id;
  tr.appendChild(tdUid);
}

function appendEmailCell(tr, email) {
  const tdEmail = document.createElement("td");
  tdEmail.className = "admin-subs-td admin-subs-td--email";
  tdEmail.textContent = email || "—";
  tr.appendChild(tdEmail);
}

/**
 * @param {object} row
 * @param {(r: object) => void} onPatched
 */
function buildRowTr(row, onPatched) {
  const tr = document.createElement("tr");
  tr.className = "admin-subs-tr";
  if (isRowExpired(row)) tr.classList.add("admin-subs-tr--expired");
  tr.dataset.userId = String(row.user_id);

  appendEmailCell(tr, row.email);

  appendUidCell(tr, row.user_id);

  const tdSignup = document.createElement("td");
  tdSignup.className = "admin-subs-td admin-subs-td--dt";
  tdSignup.textContent = formatKoDateTime(row.signup_at);
  tr.appendChild(tdSignup);

  const tdStatus = document.createElement("td");
  tdStatus.className = "admin-subs-td admin-subs-td--form";
  const statusSel = document.createElement("select");
  statusSel.className = "admin-subs-status";
  statusSel.setAttribute("aria-label", "구독 상태");
  for (const v of ["inactive", "active"]) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v === "active" ? "active (이용중)" : "inactive";
    if (String(row.subscription_status || "").toLowerCase() === v) opt.selected = true;
    statusSel.appendChild(opt);
  }
  tdStatus.appendChild(statusSel);
  tr.appendChild(tdStatus);

  const tdUntil = document.createElement("td");
  tdUntil.className = "admin-subs-td admin-subs-td--form";
  const untilInp = document.createElement("input");
  untilInp.type = "datetime-local";
  untilInp.className = "admin-subs-until";
  untilInp.setAttribute("aria-label", "이용 만료(까지)");
  untilInp.value = toDatetimeLocalValue(row.access_until);
  tdUntil.appendChild(untilInp);
  tr.appendChild(tdUntil);

  const tdActions = document.createElement("td");
  tdActions.className = "admin-subs-td admin-subs-td--actions";
  const actionBtns = document.createElement("div");
  actionBtns.className = "admin-subs-action-btns";
  const btnYear = document.createElement("button");
  btnYear.type = "button";
  btnYear.className = "admin-subs-btn admin-subs-btn--year";
  btnYear.textContent = "1년 이용권 부여";
  btnYear.addEventListener("click", async () => {
    btnYear.disabled = true;
    const r = await adminGrantOneYear(String(row.user_id));
    if (!r.ok) {
      showToast("처리에 실패했어요.", r.error || "");
      btnYear.disabled = false;
      return;
    }
    showToast("가입일 기준 1년으로 설정하고 active로 바꿨어요.");
    if (r.data) onPatched(r.data);
    btnYear.disabled = false;
  });

  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.className = "admin-subs-btn admin-subs-btn--save";
  btnSave.textContent = "상태·만료일 저장";
  btnSave.addEventListener("click", async () => {
    const st = String(statusSel.value).toLowerCase();
    const iso = fromDatetimeLocalValue(untilInp.value);
    if (!iso) {
      showToast("이용 만료일을 확인해 주세요.");
      return;
    }
    btnSave.disabled = true;
    const r2 = await adminSetSubscription(String(row.user_id), st, iso);
    if (!r2.ok) {
      showToast("저장에 실패했어요.", r2.error || "");
      btnSave.disabled = false;
      return;
    }
    showToast("저장했어요.");
    if (r2.data) onPatched(r2.data);
    btnSave.disabled = false;
  });

  actionBtns.appendChild(btnYear);
  actionBtns.appendChild(btnSave);
  tdActions.appendChild(actionBtns);
  tr.appendChild(tdActions);

  return tr;
}

function buildWithdrawnRowTr(row) {
  const tr = document.createElement("tr");
  tr.className = "admin-subs-tr admin-subs-tr--withdrawn";

  appendEmailCell(tr, row.email);
  appendUidCell(tr, row.user_id);

  const tdDeleted = document.createElement("td");
  tdDeleted.className = "admin-subs-td admin-subs-td--dt";
  tdDeleted.textContent = formatKoDateTime(row.deleted_at);
  tr.appendChild(tdDeleted);

  return tr;
}

function applyRowData(tr, row) {
  const st = tr.querySelector(".admin-subs-status");
  const un = tr.querySelector(".admin-subs-until");
  if (st) {
    const v = String(row.subscription_status || "").toLowerCase();
    for (const opt of st.querySelectorAll("option")) {
      opt.selected = opt.value === v;
    }
  }
  if (un) un.value = toDatetimeLocalValue(row.access_until);
  tr.classList.toggle("admin-subs-tr--expired", isRowExpired(row));
}

function renderTableError(tbody, colSpan, code, error) {
  const trErr = document.createElement("tr");
  const tdErr = document.createElement("td");
  tdErr.colSpan = colSpan;
  const p = document.createElement("p");
  p.className = "admin-subs-err";
  p.innerHTML = `DB에 <code>${escapeHtml(code)}</code> 권한/함수가 없을 수 있어요. Supabase SQL 마이그레이션을 적용해 주세요. ${escapeHtml(error || "")}`;
  tdErr.appendChild(p);
  trErr.appendChild(tdErr);
  tbody.appendChild(trErr);
}

/**
 * @returns {HTMLElement}
 */
export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content admin-view";

  const header = document.createElement("header");
  header.className = "admin-view-header dream-view-header-wrap";
  const h1 = document.createElement("h1");
  h1.className = "dream-view-title admin-view-title";
  h1.textContent = "관리자전용";
  header.appendChild(h1);
  el.appendChild(header);

  const body = document.createElement("div");
  body.className = "admin-view-body admin-subs-page";

  const nav = document.createElement("nav");
  nav.className = "admin-section-nav";
  nav.setAttribute("aria-label", "관리자 메뉴");
  const navBtns = new Map();

  const hint = document.createElement("p");
  hint.className = "admin-view-hint";
  body.appendChild(hint);

  const toolbar = document.createElement("div");
  toolbar.className = "admin-subs-toolbar";
  const tbLabel = document.createElement("span");
  tbLabel.className = "admin-subs-toolbar-label";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "admin-subs-refresh";
  refresh.textContent = "새로고침";
  toolbar.appendChild(tbLabel);
  toolbar.appendChild(refresh);
  body.appendChild(toolbar);

  const statusLine = document.createElement("p");
  statusLine.className = "admin-subs-statusline";
  statusLine.setAttribute("aria-live", "polite");
  body.appendChild(statusLine);

  const wrap = document.createElement("div");
  wrap.className = "admin-subs-table-wrap";
  const table = document.createElement("table");
  table.className = "admin-subs-table";
  table.setAttribute("role", "grid");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  tbody.className = "admin-subs-tbody";
  table.appendChild(thead);
  table.appendChild(tbody);
  wrap.appendChild(table);
  body.appendChild(wrap);

  for (const section of ADMIN_SECTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "admin-section-nav-btn";
    btn.dataset.section = section.id;
    btn.textContent = section.label;
    btn.setAttribute("aria-pressed", "false");
    navBtns.set(section.id, btn);
    nav.appendChild(btn);
  }
  body.insertBefore(nav, hint);

  el.appendChild(body);

  let activeSection = "all";
  let requestId = 0;
  let cachedSubsRows = [];

  function getSectionMeta(id) {
    return ADMIN_SECTIONS.find((s) => s.id === id) || ADMIN_SECTIONS[0];
  }

  function setTableHead(sectionId) {
    thead.innerHTML = "";
    const tr = document.createElement("tr");
    if (sectionId === "withdrawn") {
      for (const label of ["이메일", "사용자 ID", "탈퇴 일시"]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        tr.appendChild(th);
      }
    } else {
      for (const label of [
        "이메일",
        "사용자 ID",
        "가입(기록)",
        "상태",
        "이용 만료(까지)",
        "처리",
      ]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        tr.appendChild(th);
      }
    }
    thead.appendChild(tr);
  }

  function setActiveSection(sectionId) {
    activeSection = sectionId;
    for (const [id, btn] of navBtns) {
      const on = id === sectionId;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    const meta = getSectionMeta(sectionId);
    hint.textContent = meta.hint;
    tbLabel.textContent = meta.toolbarLabel;
    setTableHead(sectionId);
  }

  function patchCachedRow(patched) {
    const idx = cachedSubsRows.findIndex((r) => String(r.user_id) === String(patched.user_id));
    if (idx >= 0) cachedSubsRows[idx] = { ...cachedSubsRows[idx], ...patched };
  }

  function renderSubscriptionRows(rows) {
    tbody.innerHTML = "";
    if (!rows.length) {
      statusLine.textContent =
        activeSection === "expired" ? "이용 만료 회원이 없어요." : "표시할 사용자가 없어요.";
      return;
    }
    statusLine.textContent = `총 ${rows.length}명`;
    for (const row of rows) {
      const tr = buildRowTr(row, (patched) => {
        applyRowData(tr, patched);
        patchCachedRow(patched);
        const tds = tr.querySelectorAll("td");
        if (tds[2] && patched.signup_at) tds[2].textContent = formatKoDateTime(patched.signup_at);
        const em = tr.querySelector(".admin-subs-td--email");
        if (em && patched.email) em.textContent = patched.email;
      });
      tbody.appendChild(tr);
    }
  }

  function renderWithdrawnRows(rows) {
    tbody.innerHTML = "";
    if (!rows.length) {
      statusLine.textContent = "탈퇴 기록이 없어요.";
      return;
    }
    statusLine.textContent = `총 ${rows.length}명`;
    for (const row of rows) {
      tbody.appendChild(buildWithdrawnRowTr(row));
    }
  }

  async function loadSubscriptions(force = false) {
    if (!(await isCurrentUserAppAdmin())) {
      statusLine.textContent = "관리자만 이 목록을 불러올 수 있어요.";
      return;
    }
    if (!force && cachedSubsRows.length && activeSection !== "withdrawn") {
      const rows =
        activeSection === "expired"
          ? cachedSubsRows.filter(isRowExpired)
          : cachedSubsRows;
      renderSubscriptionRows(rows);
      return;
    }
    const myId = ++requestId;
    statusLine.textContent = "불러오는 중…";
    tbody.innerHTML = "";
    const { ok, data, error } = await adminListSubscriptions();
    if (myId !== requestId) return;
    if (!ok) {
      statusLine.textContent = "";
      showToast("목록을 불러오지 못했어요.", error || "");
      if (
        /permission denied|42501|P0001|function.*does not exist|not find/i.test(
          String(error || ""),
        )
      ) {
        renderTableError(tbody, 6, "lp_admin_list_subscriptions", error);
      }
      return;
    }
    cachedSubsRows = data || [];
    const rows =
      activeSection === "expired"
        ? cachedSubsRows.filter(isRowExpired)
        : cachedSubsRows;
    renderSubscriptionRows(rows);
  }

  async function loadWithdrawn() {
    if (!(await isCurrentUserAppAdmin())) {
      statusLine.textContent = "관리자만 이 목록을 불러올 수 있어요.";
      return;
    }
    const myId = ++requestId;
    statusLine.textContent = "불러오는 중…";
    tbody.innerHTML = "";
    const { ok, data, error } = await adminListUserDeletions();
    if (myId !== requestId) return;
    if (!ok) {
      statusLine.textContent = "";
      showToast("탈퇴 목록을 불러오지 못했어요.", error || "");
      if (
        /permission denied|42501|P0001|function.*does not exist|not find/i.test(
          String(error || ""),
        )
      ) {
        renderTableError(tbody, 3, "lp_admin_list_user_deletions", error);
      }
      return;
    }
    renderWithdrawnRows(data || []);
  }

  async function loadActiveSection(force = false) {
    setActiveSection(activeSection);
    if (activeSection === "withdrawn") {
      await loadWithdrawn();
      return;
    }
    await loadSubscriptions(force);
  }

  for (const [id, btn] of navBtns) {
    btn.addEventListener("click", () => {
      if (activeSection === id) {
        void loadActiveSection(true);
        return;
      }
      activeSection = id;
      void loadActiveSection(false);
    });
  }

  refresh.addEventListener("click", () => {
    void loadActiveSection(true);
  });

  if (supabase) {
    void (async () => {
      if (!(await isCurrentUserAppAdmin())) return;
      setActiveSection("all");
      void loadActiveSection(true);
    })();
  } else {
    statusLine.textContent = "Supabase에 연결되지 않았어요.";
  }

  return el;
}
