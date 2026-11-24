// Browse the whole TMDB catalog with filters: Movies / Series / Anime,
// genre, year or decade, original language and sort order. Results load
// endlessly while the remote moves down the grid.

import { useEffect, useMemo, useState } from "react";
import { storage } from "@shared/storage";
import {
  BROWSE_KINDS,
  BROWSE_SORTS,
  BROWSE_LANGUAGES,
  browseYears,
  fetchGenres,
  discoverPath,
  fetchPage,
} from "../lib/tmdb";
import { usePaged } from "../lib/usePaged";
import { Grid, Picker, Spinner } from "../components/ui";
import { ensureFocus } from "../nav/spatial";

const K_FILTERS = "tv_browseFilters";
const DEFAULTS = { kind: "movie", genre: "", year: "", language: "", sort: "popular" };

function FilterBtn({ id, name, value, isSet, onOpen }) {
  return (
    <button type="button" className={`filter-btn focusable${isSet ? " set" : ""}`} onClick={() => onOpen(id)}>
      <span className="filter-name">{name}</span>
      {value}
    </button>
  );
}

export default function Browse({ token, active, nav, params }) {
  // a preset (e.g. a genre chip on Home) wins over the last used filters
  const [filters, setFilters] = useState(() => ({
    ...DEFAULTS,
    ...(params.filters ? {} : storage.get(K_FILTERS) || {}),
    ...(params.filters || {}),
  }));
  const [genres, setGenres] = useState([]);
  const [picker, setPicker] = useState(null);
  const years = useMemo(browseYears, []);

  useEffect(() => {
    if (!params.filters) storage.set(K_FILTERS, filters);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    fetchGenres(filters.kind, token)
      .then((g) => !cancelled && setGenres(g))
      .catch(() => !cancelled && setGenres([]));
    return () => {
      cancelled = true;
    };
  }, [filters.kind, token]);

  const { path, type } = discoverPath(filters);
  const list = usePaged(path, (page) => fetchPage(path, page, token, type));

  useEffect(() => {
    if (active) setTimeout(ensureFocus, 0);
  }, [active]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const closePicker = () => {
    setPicker(null);
  };

  const label = (opts, id, fallback) => (opts.find((o) => o.id === id) || {}).label || fallback;
  const genreLabel = filters.genre ? label(genres, filters.genre, "Genre") : "Any genre";
  const isAnime = filters.kind === "anime";

  const pickers = {
    genre: {
      title: "Genre",
      options: [{ id: "", label: "Any genre" }].concat(genres),
      value: filters.genre,
    },
    year: { title: "Year", options: years, value: filters.year },
    language: { title: "Original language", options: BROWSE_LANGUAGES, value: filters.language },
    sort: { title: "Sort by", options: BROWSE_SORTS, value: filters.sort },
  };

  return (
    <div className="page browse">
      <div className="browse-head">
        <h1 className="page-title">Browse</h1>
        <div className="filters" data-nav-group data-nav-axis="horizontal">
          <div className="segment">
            {BROWSE_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={`chip focusable${filters.kind === k.id ? " selected active" : ""}`}
                data-nav-default={filters.kind === k.id ? "" : undefined}
                onClick={() => {
                  // movie and TV genre ids differ → reset the genre
                  if (k.id !== filters.kind) set({ kind: k.id, genre: "" });
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
          <FilterBtn onOpen={setPicker} id="genre" name="Genre" value={genreLabel} isSet={!!filters.genre} />
          <FilterBtn onOpen={setPicker} id="year" name="Year" value={label(years, filters.year, "Any")} isSet={!!filters.year} />
          {!isAnime ? (
            <FilterBtn
              onOpen={setPicker}
              id="language"
              name="Language"
              value={label(BROWSE_LANGUAGES, filters.language, "Any")}
              isSet={!!filters.language}
            />
          ) : null}
          <FilterBtn onOpen={setPicker} id="sort" name="Sort" value={label(BROWSE_SORTS, filters.sort, "")} isSet={false} />
        </div>
      </div>

      <div className="browse-grid">
        {list.items.length ? (
          <Grid items={list.items} onSelect={nav.details} onNearEnd={list.loadMore} loading={list.loading} />
        ) : list.loading || list.page === 0 ? (
          <Spinner />
        ) : (
          <div className="empty">
            {list.error ? `Could not load: ${list.error}` : "No titles match these filters."}
          </div>
        )}
        {list.error && list.items.length ? (
          <div className="btn-row" style={{ padding: "1rem" }}>
            <button type="button" className="btn focusable" onClick={list.loadMore}>
              Couldn't load more. Retry
            </button>
          </div>
        ) : null}
      </div>

      {picker ? (
        <Picker
          title={pickers[picker].title}
          options={pickers[picker].options}
          selected={pickers[picker].value}
          onClose={closePicker}
          onPick={(id) => {
            set({ [picker]: id });
            closePicker();
          }}
        />
      ) : null}
    </div>
  );
}
