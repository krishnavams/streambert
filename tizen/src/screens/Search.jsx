import { useEffect, useRef, useState } from "react";
import { search } from "../lib/tmdb";
import { Grid, Spinner } from "../components/ui";
import { ensureFocus } from "../nav/spatial";

// On-screen keyboard: works on every TV and in the browser, no IME quirks.
const KEYS = "abcdefghijklmnopqrstuvwxyz1234567890".split("");

export default function Search({ token, active, nav }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (active) setTimeout(ensureFocus, 0);
  }, [active]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return undefined;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      search(q, token)
        .then((r) => id === seq.current && setResults(r))
        .catch(() => id === seq.current && setResults([]))
        .finally(() => id === seq.current && setLoading(false));
    }, 450);
    return () => clearTimeout(t);
  }, [query, token]);

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
        {!loading && results && results.length === 0 ? (
          <div className="empty">No results for “{query.trim()}”</div>
        ) : null}
        {!loading && results && results.length ? (
          <Grid items={results} onSelect={nav.details} />
        ) : null}
        {!results && !loading ? (
          <div className="empty">Type at least two letters.</div>
        ) : null}
      </div>
    </div>
  );
}
