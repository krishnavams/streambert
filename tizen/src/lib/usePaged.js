// Endless lists: loads page 1 when `key` changes, more pages on loadMore().
//
//   const list = usePaged(key, (page) => fetchPage(path, page, token), initial)
//   list.items / list.loading / list.done / list.error / list.loadMore()
//
// `initial` ({ items, totalPages }) lets a caller hand over a page it already
// has (e.g. the Home rows), so only later pages are requested.

import { useCallback, useEffect, useRef, useState } from "react";

const itemKey = (i) => `${i.type}:${i.id}`;

export function usePaged(key, fetchPage, initial = null) {
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const fresh = () => ({
    items: initial ? initial.items : [],
    page: initial ? 1 : 0,
    totalPages: initial ? initial.totalPages || 1 : 1,
    loading: false,
    error: null,
  });
  const [state, setState] = useState(fresh);
  const stateRef = useRef(state);
  stateRef.current = state;
  const generation = useRef(0);
  const busy = useRef(false);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (busy.current || s.page >= s.totalPages || key == null) return;
    busy.current = true;
    const gen = generation.current;
    const next = s.page + 1;
    setState((p) => ({ ...p, loading: true, error: null }));
    Promise.resolve(fetchRef.current(next))
      .then((r) => {
        if (gen !== generation.current) return;
        setState((p) => {
          const seen = new Set(p.items.map(itemKey));
          const added = (r.items || []).filter((i) => !seen.has(itemKey(i)));
          return {
            items: p.items.concat(added),
            page: next,
            totalPages: r.totalPages || next,
            loading: false,
            error: null,
          };
        });
      })
      .catch((e) => {
        if (gen !== generation.current) return;
        setState((p) => ({ ...p, loading: false, error: e.message || String(e) }));
      })
      .finally(() => {
        if (gen === generation.current) busy.current = false;
      });
  }, [key]);

  // new query → start over
  useEffect(() => {
    generation.current++;
    busy.current = false;
    const s = fresh();
    stateRef.current = s;
    setState(s);
    if (!initial && key != null) loadMore();
  }, [key]);

  return {
    ...state,
    done: state.page >= state.totalPages,
    loadMore,
  };
}

// Call loadMore when focus is within `threshold` items of the end
export const nearEnd = (index, length, threshold) => index >= length - threshold;
