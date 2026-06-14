import { signOut } from "../auth.js";
import { supabase } from "../supabase.js";
import { deleteMyAccountViaEdgeFunction } from "./deleteMyAccount.js";
import { showToast } from "./showToast.js";
import {
  resolveLpModalStackZIndex,
  syncBodyOverflowAfterModalClose,
} from "./lpModalStack.js";

/**
 * 회원 탈퇴 확인 모달.
 * @param {{ zIndex?: number }} [options]
 * @returns {Promise<{ deleted: boolean }>}
 */
export function openDeleteAccountModal(options = {}) {
  const { zIndex = resolveLpModalStackZIndex() + 10 } = options;

  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "idea-delete-account-modal";
    wrap.innerHTML = `
      <div class="idea-delete-account-modal-backdrop" aria-hidden="true"></div>
      <div class="idea-delete-account-modal-panel" role="dialog" aria-modal="true" aria-labelledby="idea-delete-account-title">
        <div class="idea-delete-account-modal-header">
          <h3 class="idea-delete-account-modal-title" id="idea-delete-account-title">회원 탈퇴</h3>
          <button type="button" class="idea-delete-account-modal-close" aria-label="닫기">×</button>
        </div>
        <div class="idea-delete-account-modal-body">
          <p class="idea-delete-account-modal-warn">탈퇴 시 이 계정의 <strong>모든 서버 데이터</strong>가 삭제됩니다. 되돌릴 수 없습니다.</p>
          <p class="idea-delete-account-modal-label">비밀번호 확인</p>
          <input type="password" class="idea-form-input idea-delete-account-modal-pw" autocomplete="current-password" placeholder="현재 비밀번호" />
        </div>
        <div class="idea-delete-account-modal-footer">
          <button type="button" class="idea-delete-account-modal-cancel">취소</button>
          <button type="button" class="idea-delete-account-modal-submit">탈퇴하기</button>
        </div>
      </div>
    `;

    function finish(deleted) {
      wrap.remove();
      syncBodyOverflowAfterModalClose();
      resolve({ deleted });
    }

    wrap.querySelector(".idea-delete-account-modal-close").addEventListener("click", () => finish(false));
    wrap.querySelector(".idea-delete-account-modal-cancel").addEventListener("click", () => finish(false));
    const pwInput = wrap.querySelector(".idea-delete-account-modal-pw");
    const submitBtn = wrap.querySelector(".idea-delete-account-modal-submit");
    submitBtn.addEventListener("click", async () => {
      if (!supabase) {
        showToast("연결되지 않았습니다.");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email?.trim();
      const pw = pwInput?.value || "";
      if (!email) {
        showToast("세션을 확인할 수 없습니다.");
        return;
      }
      if (!pw) {
        showToast("비밀번호를 입력해 주세요.");
        return;
      }
      submitBtn.disabled = true;
      try {
        const { error: reAuthErr } = await supabase.auth.signInWithPassword({
          email,
          password: pw,
        });
        if (reAuthErr) {
          showToast("비밀번호가 일치하지 않습니다.");
          return;
        }
        const del = await deleteMyAccountViaEdgeFunction();
        if (!del.ok) {
          showToast(del.msg || "탈퇴에 실패했습니다.");
          return;
        }
        showToast("탈퇴가 완료되었습니다.");
        await signOut();
        finish(true);
      } finally {
        submitBtn.disabled = false;
      }
    });

    wrap.style.zIndex = String(zIndex);
    document.body.appendChild(wrap);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      pwInput?.focus({ preventScroll: true });
    });
  });
}
