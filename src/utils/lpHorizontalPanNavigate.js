/**
 * 가로 이동으로 이전/다음 — 터치 스와이프, 마우스 드래그, 트랙패드·매직마우스 가로 휠(deltaX).
 * 왼쪽으로 밀기(손가락·포인터 dx<0, 휠 deltaX>0) = onNext, 오른쪽 = onPrev.
 */
export function bindLpHorizontalPanNavigate(root, opts) {
  if (!root || typeof opts?.onNext !== "function" || typeof opts?.onPrev !== "function") {
    return () => {};
  }

  const minDx = opts.minDx ?? 48;
  const dominance = opts.dominance ?? 1.2;
  const wheelThreshold = opts.wheelThreshold ?? 36;
  const lockMs = opts.lockMs ?? 900;
  /** 휠로 한 번 넘긴 뒤 이 시간(ms) 동안 휠만 막음(미세 휠이 잠금을 연장하지 않음) */
  const wheelQuietMs = opts.wheelQuietMs ?? 900;
  const enableWheel = opts.enableWheel !== false;
  const enablePointer = opts.enablePointer !== false;

  const ac = new AbortController();
  const signal = opts.signal ?? ac.signal;
  const passive = { passive: true, signal };

  const isActive = () => opts.isActive?.() !== false;
  const shouldIgnore = (target) => opts.shouldIgnoreTarget?.(target) ?? false;

  let panStart = null;
  let activePointerId = null;
  let touchPanActive = false;
  let navLockUntil = 0;
  let wheelNavBlockedUntil = 0;
  let wheelAccum = 0;

  function fireNavigate(dxSign) {
    const now = Date.now();
    if (now < navLockUntil) return;
    if (!isActive()) return;
    navLockUntil = now + lockMs;
    if (dxSign < 0) opts.onNext();
    else opts.onPrev();
  }

  function navigateFromDx(dx, dy) {
    if (!isActive()) return;
    if (Math.abs(dx) < minDx) return;
    if (Math.abs(dx) < Math.abs(dy) * dominance) return;
    fireNavigate(dx < 0 ? -1 : 1);
  }

  function clearPan() {
    panStart = null;
    activePointerId = null;
    touchPanActive = false;
  }

  function onPanStart(clientX, clientY, target) {
    if (!isActive()) return;
    if (shouldIgnore(target)) return;
    panStart = { x: clientX, y: clientY };
  }

  function onPanEnd(clientX, clientY) {
    if (!panStart) return;
    const dx = clientX - panStart.x;
    const dy = clientY - panStart.y;
    clearPan();
    navigateFromDx(dx, dy);
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
      onPanEnd(t.clientX, t.clientY);
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
        try {
          if (panStart && typeof root.setPointerCapture === "function") {
            root.setPointerCapture(e.pointerId);
          }
        } catch (_) {}
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
        if (e.pointerType === "touch") {
          clearPan();
          return;
        }
        if (activePointerId != null && e.pointerId !== activePointerId) return;
        onPanEnd(e.clientX, e.clientY);
        try {
          if (typeof root.releasePointerCapture === "function") {
            root.releasePointerCapture(e.pointerId);
          }
        } catch (_) {}
      },
      passive,
    );
  }

  if (enableWheel) {
    root.addEventListener(
      "wheel",
      (e) => {
        const now = Date.now();
        if (now < wheelNavBlockedUntil) return;
        if (touchPanActive) return;
        if (!isActive()) return;
        if (shouldIgnore(e.target)) return;
        const dx = e.deltaX;
        const dy = e.deltaY;
        if (Math.abs(dx) < Math.abs(dy) * 0.85) return;
        if (Math.abs(dx) < 1) return;

        wheelAccum += dx;
        if (Math.abs(wheelAccum) < wheelThreshold) return;
        const sign = wheelAccum > 0 ? -1 : 1;
        wheelAccum = 0;
        fireNavigate(sign);
        wheelNavBlockedUntil = Date.now() + wheelQuietMs;
      },
      passive,
    );
  }

  return () => ac.abort();
}
