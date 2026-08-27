/**
 * 화면에 붙이기 전에 아이콘만 decode.
 * DOM 풀·Observer·칸 옮기기 없음.
 */

const decoded = new Set();

/**
 * @param {unknown} srcs
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<void>}
 */
export function decodeDisplayIconSrcs(srcs, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs);
  const waitMs = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 800;
  const unique = [];
  const seen = new Set();
  for (const raw of Array.isArray(srcs) ? srcs : []) {
    const s = String(raw || "").trim();
    if (!s || seen.has(s) || decoded.has(s)) continue;
    seen.add(s);
    unique.push(s);
  }
  if (!unique.length) return Promise.resolve();

  return Promise.all(
    unique.map((src) =>
      withTimeout(decodeOne(src), waitMs)
        .then((ok) => {
          if (ok) decoded.add(src);
        })
        .catch(() => {}),
    ),
  ).then(() => {});
}

/**
 * @param {string} src
 * @returns {Promise<boolean>}
 */
function decodeOne(src) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.decoding = "async";
      const done = (ok) => resolve(!!ok);
      img.onerror = () => done(false);
      const afterLoad = () => {
        if (typeof img.decode !== "function") {
          done(img.naturalWidth > 0);
          return;
        }
        img
          .decode()
          .then(() => done(true))
          .catch(() => done(img.naturalWidth > 0));
      };
      img.onload = afterLoad;
      img.src = src;
      if (img.complete && img.naturalWidth > 0) afterLoad();
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * @param {Promise<boolean>} p
 * @param {number} ms
 * @returns {Promise<boolean>}
 */
function withTimeout(p, ms) {
  if (ms <= 0) return p;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(!!ok);
    };
    const t = setTimeout(() => finish(false), ms);
    p.then((ok) => {
      clearTimeout(t);
      finish(ok);
    }).catch(() => {
      clearTimeout(t);
      finish(false);
    });
  });
}
