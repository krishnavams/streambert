// Remote key dispatch.
//
// One global keydown listener (installed by App) maps the event to an action
// ("left", "enter", "back", "playpause", …) and offers it to the registered
// handlers, newest first. A handler returns true when it consumed the action.
// Unconsumed arrows move focus spatially, unconsumed "back" goes to the router.

import { useEffect, useRef } from "react";

const handlers = [];

export function dispatch(action, event) {
  for (let i = handlers.length - 1; i >= 0; i--) {
    const h = handlers[i];
    if (h.enabled() && h.fn.current(action, event) === true) return true;
  }
  return false;
}

/**
 * Register a key handler while the component is mounted.
 * @param {(action: string, event: KeyboardEvent) => boolean|void} fn
 * @param {boolean} [active=true] only receives keys while active (e.g. the
 *   screen is on top of the stack)
 */
export function useKeys(fn, active = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const entry = { fn: fnRef, enabled: () => activeRef.current };
    handlers.push(entry);
    return () => {
      const i = handlers.indexOf(entry);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, []);
}
