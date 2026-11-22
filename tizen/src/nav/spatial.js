// Spatial navigation for the TV remote.
//
// Every element with the `focusable` class takes part. Arrow keys move real DOM
// focus to the nearest focusable element in that direction, measured on screen.
//
//   data-nav-scope   – container that traps navigation (modals, the player).
//                      The last visible scope in the DOM wins.
//   data-nav-group   – a row/list; when focus enters it from outside, the
//                      element focused last inside it is restored.
//   data-nav-default – preferred element when a scope has nothing focused.

const FOCUSABLE = ".focusable";
const lastInGroup = new WeakMap();

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  if (el.disabled) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  if (getComputedStyle(el).visibility === "hidden") return false;
  return el.offsetParent !== null || getComputedStyle(el).position === "fixed";
}

export function currentScope() {
  const scopes = document.querySelectorAll("[data-nav-scope]");
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (isVisible(scopes[i]) || scopes[i].offsetParent !== null) return scopes[i];
  }
  return document.body;
}

function candidates(scope) {
  return Array.prototype.filter.call(scope.querySelectorAll(FOCUSABLE), isVisible);
}

function groupOf(el) {
  return el ? el.closest("[data-nav-group]") : null;
}

// Track the last focused element of every group.
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (e) => {
      const g = groupOf(e.target);
      if (g && e.target.classList && e.target.classList.contains("focusable")) {
        lastInGroup.set(g, e.target);
      }
    },
    true,
  );
}

// Scroll every scrollable ancestor so `el` is comfortably inside it.
// Done by hand because scrollIntoView options need Chromium 61+.
export function ensureVisible(el, margin = 80) {
  let node = el.parentElement;
  const er = el.getBoundingClientRect();
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const scrollY = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const scrollX = /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    if (scrollX || scrollY) {
      const nr = node.getBoundingClientRect();
      if (scrollX) {
        if (er.left < nr.left + margin) node.scrollLeft -= nr.left + margin - er.left;
        else if (er.right > nr.right - margin) node.scrollLeft += er.right - (nr.right - margin);
      }
      if (scrollY) {
        const m = Math.min(margin * 2, nr.height / 4);
        if (er.top < nr.top + m) node.scrollTop -= nr.top + m - er.top;
        else if (er.bottom > nr.bottom - m) node.scrollTop += er.bottom - (nr.bottom - m);
      }
    }
    node = node.parentElement;
  }
}

export function focusEl(el) {
  if (!el) return false;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  ensureVisible(el);
  return true;
}

export function focusFirst(scope = currentScope()) {
  if (!scope) return false;
  const preferred = scope.querySelector("[data-nav-default].focusable");
  if (preferred && isVisible(preferred)) return focusEl(preferred);
  const list = candidates(scope);
  // the side menu is only a fallback when the page has nothing to focus
  const inPage = list.filter((el) => !el.closest("[data-nav-sidebar]"));
  return focusEl(inPage[0] || list[0]);
}

/**
 * Make sure something sensible has focus. Called when a screen appears or
 * finishes loading: if focus is lost, or parked in the side menu while the
 * page was still loading, it moves to the page's default element.
 * @param {Element} [page] the screen's root element
 */
export function ensureFocus(page) {
  const scope = currentScope();
  if (!page) {
    // the visible screen's content area (hidden screens are display:none)
    page = Array.prototype.find.call(document.querySelectorAll("main.content"), (m) => m.offsetParent !== null);
  }
  const a = document.activeElement;
  const valid = a && a !== document.body && scope.contains(a) && isVisible(a);
  if (valid && (!page || page.contains(a) || !a.closest("[data-nav-sidebar]"))) return;
  if (page && scope.contains(page)) focusFirst(page);
  else focusFirst(scope);
}

// Nearest element from `fr` in direction `dir` among `pool`
function pick(pool, from, fr, dir) {
  const fcx = fr.left + fr.width / 2;
  const fcy = fr.top + fr.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of pool) {
    if (el === from || el.contains(from) || from.contains(el)) continue;
    const r = el.getBoundingClientRect();
    let primary, secondary;
    if (dir === "left" || dir === "right") {
      primary = dir === "right" ? r.left - fr.right : fr.left - r.right;
      if (primary < -fr.width / 2) continue;
      const overlap = Math.min(fr.bottom, r.bottom) - Math.max(fr.top, r.top);
      secondary = overlap > 0 ? 0 : Math.abs(r.top + r.height / 2 - fcy);
    } else {
      primary = dir === "down" ? r.top - fr.bottom : fr.top - r.bottom;
      if (primary < -fr.height / 2) continue;
      const overlap = Math.min(fr.right, r.right) - Math.max(fr.left, r.left);
      secondary = overlap > 0 ? 0 : Math.abs(r.left + r.width / 2 - fcx);
    }
    const score = Math.max(primary, 0) + secondary * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

const axisOf = (g) => (g ? g.getAttribute("data-nav-axis") : null);

export function move(dir) {
  const scope = currentScope();
  const from = document.activeElement;
  if (!from || from === document.body || !scope.contains(from) || !isVisible(from)) {
    return focusFirst(scope);
  }
  const fr = from.getBoundingClientRect();
  let pool = candidates(scope);
  const fromGroup = groupOf(from);
  const axis = axisOf(fromGroup);
  const horizontal = dir === "left" || dir === "right";
  let best = null;

  // data-nav-axis: moving along a row/column stays inside it
  if ((axis === "horizontal" && horizontal) || (axis === "vertical" && !horizontal)) {
    best = pick(
      pool.filter((el) => fromGroup.contains(el)),
      from,
      fr,
      dir,
    );
    if (!best && axis === "vertical") return false; // menu ends stop
    if (!best) {
      // end of a row: only leave to something that isn't another row
      pool = pool.filter((el) => axisOf(groupOf(el)) !== "horizontal");
    }
  }
  if (!best) best = pick(pool, from, fr, dir);
  if (!best) return false;

  // Entering a different row → go back to where we were in that row
  const g = groupOf(best);
  if (g && g !== fromGroup) {
    let remembered = lastInGroup.get(g);
    if (!remembered || !g.contains(remembered)) remembered = g.querySelector(".active.focusable");
    if (remembered && isVisible(remembered)) best = remembered;
  }
  return focusEl(best);
}
