import { useEffect, useState } from "react";
import { search } from "../lib/tmdb";
import { usePaged } from "../lib/usePaged";
import { Grid, Spinner } from "../components/ui";
import { ensureFocus } from "../nav/spatial";

// On-screen keyboard: works on every TV and in the browser, no IME quirks.
const KEYS = "abcdefghijklmnopqrstuvwxyz1234567890".split("");

export default function Search({ token, active, nav }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (active) setTimeout(ensureFocus, 0);
  }, [active]);

  // wait until typing pauses before searching
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(() => setDebounced(q.length >= 2 ? q : ""), 450);
    return () => clearTimeout(t);
  }, [query]);

  const list = usePaged(debounced || null, (page) => search(debounced, token, page));
  const pending = query.trim().length >= 2 && query.trim() !== debounced;
  const loading = pending || (list.loading && !list.items.length);
  const results = debounced && !pending ? list.items : null;

  const type = (ch) => setQuery((q) => (q + ch).slice(0, 60));

  return (
    <div className="page search-page">
      <div className="search-left">
        <div className="search-box">{query || <span className="placeholder">Search movies, series, anime…</span>}</div>
        <div className="osk" data-nav-group>
          {KEYS.map((k) => (
            <button key={k} type="button" className="osk-key focusable" data-nav-default={k === "a" ? "" : undefined} onClick={() => type(k)}>
              {k}
            </button>
          ))}
          <button type="button" className="osk-key osk-wide focusable" onClick={() => type(" ")}>
            Space
          </button>
          <button type="button" className="osk-key osk-wide focusable" onClick={() => setQuery((q) => q.slice(0, -1))}>
            ⌫ Delete
          </button>
          <button type="button" className="osk-key osk-wide focusable" onClick={() => setQuery("")}>
            Clear
          </button>
        </div>
      </div>
      <div className="search-results">
        {loading ? <Spinner /> : null}
        {!loading && results && results.length === 0 && list.page > 0 ? (
          <div className="empty">No results for “{query.trim()}”</div>
        ) : null}
        {!loading && results && results.length ? (
          <Grid items={results} onSelect={nav.details} onNearEnd={list.loadMore} loading={list.loading} />
        ) : null}
        {!results && !loading ? (
          <div className="empty">Type at least two letters.</div>
        ) : null}
      </div>
    </div>
  );
}
