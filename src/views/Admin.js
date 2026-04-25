/**
 * 관리자 전용: user_subscriptions 조회·1년 부여·상태·이용만료일 수정
 * 서버 권한: Supabase RPC lp_is_app_admin (마이그레이션의 관리자 이메일과 일치)
 */

import { isCurrentUserAppAdmin } from "../utils/adminAccess.js";
import {
  adminGrantOneYear,
  adminListSubscriptions,
  adminSetSubscription,
} from "../utils/adminSubscriptionRpc.js";
import { supabase } from "../supabase.js";
import { showToast } from "../utils/showToast.js";

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

/**
 * @param {object} row
 * @param {(r: object) => void} onPatched
 */
function buildRowTr(row, onPatched) {
  const tr = document.createElement("tr");
  tr.className = "admin-subs-tr";
  tr.dataset.userId = String(row.user_id);

  const tdEmail = document.createElement("td");
  tdEmail.className = "admin-subs-td admin-subs-td--email";
  tdEmail.textContent = row.email || "—";
  tr.appendChild(tdEmail);

  const tdUid = document.createElement("td");
  tdUid.className = "admin-subs-td admin-subs-td--uid";
  const uid = String(row.user_id || "");
  tdUid.textContent = uid ? `${uid.slice(0, 8)}…` : "—";
  tdUid.title = uid;
  tr.appendChild(tdUid);

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

  const hint = document.createElement("p");
  hint.className = "admin-view-hint";
  hint.textContent =
    "아래 표에서 구독 상태·이용 만료를 수정할 수 있습니다. (서버 마이그레이션 적용 필요)";
  body.appendChild(hint);

  const toolbar = document.createElement("div");
  toolbar.className = "admin-subs-toolbar";
  const tbLabel = document.createElement("span");
  tbLabel.className = "admin-subs-toolbar-label";
  tbLabel.textContent = "이용권(구독) 목록";
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
  table.innerHTML = `
<colgroup>
  <col class="admin-subs-col" span="1" data-col="email" />
  <col class="admin-subs-col" span="1" data-col="uid" />
  <col class="admin-subs-col" span="1" data-col="signup" />
  <col class="admin-subs-col" span="1" data-col="status" />
  <col class="admin-subs-col" span="1" data-col="until" />
  <col class="admin-subs-col" span="1" data-col="act" />
</colgroup>
<thead>
  <tr>
    <th scope="col">이메일</th>
    <th scope="col">사용자 ID</th>
    <th scope="col">가입(기록)</th>
    <th scope="col">상태</th>
    <th scope="col">이용 만료(까지)</th>
    <th scope="col">처리</th>
  </tr>
</thead>
<tbody class="admin-subs-tbody"></tbody>
  `;
  const tbody = table.querySelector(".admin-subs-tbody");
  wrap.appendChild(table);
  body.appendChild(wrap);
  el.appendChild(body);

  let requestId = 0;

  async function loadList() {
    if (!(await isCurrentUserAppAdmin())) {
      statusLine.textContent = "관리자만 이 목록을 불러올 수 있어요.";
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
        const trErr = document.createElement("tr");
        const tdErr = document.createElement("td");
        tdErr.colSpan = 6;
        const p = document.createElement("p");
        p.className = "admin-subs-err";
        p.innerHTML = `DB에 <code>lp_admin_list_subscriptions</code> 권한/함수가 없을 수 있어요. Supabase SQL에 <code>20260426120000_app_admin_subscriptions_rpcs</code> 마이그레이션을 적용해 주세요. ${escapeHtml(error || "")}`;
        tdErr.appendChild(p);
        trErr.appendChild(tdErr);
        tbody.appendChild(trErr);
      }
      return;
    }
    if (!data.length) {
      statusLine.textContent = "표시할 사용자가 없어요.";
      return;
    }
    statusLine.textContent = `총 ${data.length}명`;

    for (const row of data) {
      const tr = buildRowTr(row, (patched) => {
        applyRowData(tr, patched);
        const tds = tr.querySelectorAll("td");
        if (tds[2] && patched.signup_at) tds[2].textContent = formatKoDateTime(patched.signup_at);
        const em = tr.querySelector(".admin-subs-td--email");
        if (em && patched.email) em.textContent = patched.email;
      });
      tbody.appendChild(tr);
    }
  }

  refresh.addEventListener("click", () => {
    void loadList();
  });

  if (supabase) {
    void (async () => {
      if (!(await isCurrentUserAppAdmin())) return;
      void loadList();
    })();
  } else {
    statusLine.textContent = "Supabase에 연결되지 않았어요.";
  }

  return el;
}
