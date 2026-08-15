/**
 * 가로 이동으로 이전/다음 — 터치 스와이프, 마우스 드래그, 트랙패드·매직마우스 가로 휠(deltaX).
 * 왼쪽으로 밀기(손가락·포인터 dx<0, 휠 deltaX>0) = onNext, 오른쪽 = onPrev.
 */
let lastLpHorizontalPanNavigateAt = 0;

/** 방금 가로 스와이프·휠로 페이지를 넘겼으면 true — 카드 click 오동작 방지용 */
export function lpHorizontalPanNavigateRecentlyFired(withinMs = 450) {
  return Date.now() - lastLpHorizontalPanNavigateAt < withinMs;
}

export function bindLpHorizontalPanNavigate(root, opts) {
  if (!root || typeof opts?.onNext !== "function" || typeof opts?.onPrev !== "function") {
    return () => {};
  }

  const minDx = opts.minDx ?? 48;
  const touchMinDx = opts.touchMinDx ?? Math.min(minDx, 36);
  const dominance = opts.dominance ?? 1.2;
  /** 터치 가로 잠금·판정은 세로 스크롤보다 관대하게(모바일에서 씹힘 완화) */
  const touchDominance = opts.touchDominance ?? Math.min(dominance, 1.06);
  const lockDetectPx = opts.lockDetectPx ?? 6;
  /** 이 거리 이상 가로로 밀리면 touchend 전에 바로 넘김(0이면 끔) */
  const earlyCommitDx = opts.earlyCommitDx ?? 0;
  const wheelThreshold = opts.wheelThreshold ?? 36;
  const lockMs = opts.lockMs ?? 900;
  /** 휠로 한 번 넘긴 뒤 이 시간(ms) 동안 휠만 막음(미세 휠이 잠금을 연장하지 않음) */
  const wheelQuietMs = opts.wheelQuietMs ?? 900;
  const enableWheel = opts.enableWheel !== false;
  const enablePointer = opts.enablePointer !== false;

  const ac = new AbortController();
  const signal = opts.signal ?? ac.signal;
  const passive = { passive: true, signal };
  const passiveFalse = { passive: false, signal };

  /* iOS PWA: 부모 스크롤이 가로 제스처를 먹지 않게 */
  root.classList.add("lp-horizontal-pan-navigate");
  const prevTouchAction = root.style.touchAction;
  if (!prevTouchAction) root.style.touchAction = "pan-y";

  const isActive = () => opts.isActive?.() !== false;
  const shouldIgnore = (target) => opts.shouldIgnoreTarget?.(target) ?? false;

  let panStart = null;
  let activePointerId = null;
  let touchPanActive = false;
  let touchHorizontalLock = false;
  let pointerHorizontalLock = false;
  let gestureCommitted = false;
  let navLockUntil = 0;
  let wheelNavBlockedUntil = 0;
  let wheelAccum = 0;

  function fireNavigate(dxSign) {
    const now = Date.now();
    if (now < navLockUntil) return;
    if (!isActive()) return;
    navLockUntil = now + lockMs;
    lastLpHorizontalPanNavigateAt = now;
    if (dxSign < 0) opts.onNext();
    else opts.onPrev();
  }

  function navigateFromDx(dx, dy, navOpts = {}) {
    if (!isActive()) return;
    const isTouch = navOpts.isTouch === true;
    const hadHorizontalLock = navOpts.hadHorizontalLock === true;
    const threshold = isTouch ? touchMinDx : minDx;
    const dom = isTouch ? touchDominance : dominance;
    if (Math.abs(dx) < threshold) return;
    if (!hadHorizontalLock && Math.abs(dx) < Math.abs(dy) * dom) return;
    fireNavigate(dx < 0 ? -1 : 1);
  }

  function tryEarlyTouchCommit(clientX) {
    if (!earlyCommitDx || gestureCommitted || !panStart || !touchHorizontalLock) return;
    const dx = clientX - panStart.x;
    if (Math.abs(dx) < earlyCommitDx) return;
    gestureCommitted = true;
    fireNavigate(dx < 0 ? -1 : 1);
    clearPan();
  }

  function clearPan() {
    panStart = null;
    activePointerId = null;
    touchPanActive = false;
    touchHorizontalLock = false;
    pointerHorizontalLock = false;
    gestureCommitted = false;
  }

  function onPanStart(clientX, clientY, target) {
    if (!isActive()) return;
    if (shouldIgnore(target)) return;
    panStart = { x: clientX, y: clientY };
    touchHorizontalLock = false;
    pointerHorizontalLock = false;
    gestureCommitted = false;
  }

  function onPanEnd(clientX, clientY, navOpts = {}) {
    if (!panStart || gestureCommitted) {
      clearPan();
      return;
    }
    const dx = clientX - panStart.x;
    const dy = clientY - panStart.y;
    const hadHorizontalLock = navOpts.hadHorizontalLock === true;
    clearPan();
    navigateFromDx(dx, dy, { ...navOpts, hadHorizontalLock });
  }

  root.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchPanActive = true;
      onPanStart(t.clientX, t.clientY, e.target);
    },
    passive,
  );
  root.addEventListener(
    "touchmove",
    (e) => {
      if (!panStart || e.touches.length !== 1) return;
      if (!isActive()) return;
      const t = e.touches[0];
      const dx = t.clientX - panStart.x;
      const dy = t.clientY - panStart.y;
      if (
        !touchHorizontalLock &&
        Math.abs(dx) > lockDetectPx &&
        Math.abs(dx) > Math.abs(dy) * touchDominance
      ) {
        touchHorizontalLock = true;
      }
      if (touchHorizontalLock) {
        e.preventDefault();
        tryEarlyTouchCommit(t.clientX);
      }
    },
    passiveFalse,
  );
  root.addEventListener("touchcancel", clearPan, passive);
  root.addEventListener(
    "touchend",
    (e) => {
      touchPanActive = false;
      if (!panStart || e.changedTouches.length !== 1) {
        clearPan();
        return;
      }
      const t = e.changedTouches[0];
      onPanEnd(t.clientX, t.clientY, {
        isTouch: true,
        hadHorizontalLock: touchHorizontalLock,
      });
    },
    passive,
  );

  if (enablePointer) {
    root.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "touch") return;
        if (e.button !== 0) return;
        activePointerId = e.pointerId;
        onPanStart(e.clientX, e.clientY, e.target);
        /* 클릭 직후 pointer capture를 잡으면 날짜 셀 click이 씹힘 → 가로 드래그 확정 후에만 capture */
      },
      passive,
    );
    root.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType === "touch") return;
        if (activePointerId == null || e.pointerId !== activePointerId) return;
        if (!panStart || !isActive()) return;
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        if (
          !pointerHorizontalLock &&
          Math.abs(dx) > 10 &&
          Math.abs(dx) > Math.abs(dy) * dominance
        ) {
          pointerHorizontalLock = true;
          try {
            if (typeof root.setPointerCapture === "function") {
              root.setPointerCapture(e.pointerId);
            }
          } catch (_) {}
        }
      },
      passive,
    );
    root.addEventListener(
      "pointercancel",
      (e) => {
        if (activePointerId != null && e.pointerId !== activePointerId) return;
        clearPan();
      },
      passive,
    );
    root.addEventListener(
      "pointerup",
      (e) => {
        /* 터치는 touchend가 처리 — pointerup에서 panStart를 지우면 스와이프가 씹힘 */
        if (e.pointerType === "touch") return;
        if (activePointerId != null && e.pointerId !== activePointerId) return;
        try {
          if (typeof root.releasePointerCapture === "function") {
            root.releasePointerCapture(e.pointerId);
          }
        } catch (_) {}
        onPanEnd(e.clientX, e.clientY);
      },
      passive,
    );
  }

  if (enableWheel) {
    /* passive:false + preventDefault — 맥 트랙패드 가로 스와이프가 브라우저 뒤로가기로 새는 것 차단
     * capture: 자식(날짜 셀 등)에서 가로 휠이 먼저 처리돼도 히스토리 제스처를 막음 */
    root.addEventListener(
      "wheel",
      (e) => {
        const dx = e.deltaX;
        const dy = e.deltaY;
        const horizontal =
          Math.abs(dx) >= 1 && Math.abs(dx) >= Math.abs(dy) * 0.85;
        if (!horizontal) return;

        const now = Date.now();
        if (now < wheelNavBlockedUntil) {
          e.preventDefault();
          return;
        }
        if (touchPanActive) return;
        if (!isActive()) return;
        if (shouldIgnore(e.target)) return;

        e.preventDefault();
        wheelAccum += dx;
        if (Math.abs(wheelAccum) < wheelThreshold) return;
        const sign = wheelAccum > 0 ? -1 : 1;
        wheelAccum = 0;
        fireNavigate(sign);
        wheelNavBlockedUntil = Date.now() + wheelQuietMs;
      },
      { passive: false, capture: true, signal },
    );
  }

  return () => {
    root.classList.remove("lp-horizontal-pan-navigate");
    if (!prevTouchAction) root.style.touchAction = "";
    ac.abort();
  };
}
