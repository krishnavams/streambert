import { useEffect, useState } from "react";
import { fetchHomeRows, fetchPage, fetchGenres, imgUrl, BROWSE_LANGUAGES } from "../lib/tmdb";
import { usePaged } from "../lib/usePaged";
import { buildSuggestions } from "../lib/suggest";
import { getHistory, getMyList, getProgress, progressFraction } from "../lib/library";
import { Row, Spinner, Chips } from "../components/ui";
import { useAllowed } from "../lib/parental";
import { ensureFocus } from "../nav/spatial";
import { PlayIcon } from "@components/Icons";

// A TMDB row that keeps loading pages while you scroll right
function EndlessRow({ row, token, onSelect }) {
  const list = usePaged(row.path, (page) => fetchPage(row.path, page, token, row.type), row);
  return (
    <Row title={row.title} items={list.items} onSelect={onSelect} onNearEnd={list.loadMore} loading={list.loading} />
  );
}

const LANGUAGE_CHIPS = BROWSE_LANGUAGES.filter((l) => l.id);

const epLabel = (h) => (h.type === "tv" && h.season ? `S${h.season} · E${h.episode}` : null);

export default function Home({ token, active, nav }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  // re-read local lists whenever the screen comes back to the top
  const [history, setHistory] = useState(getHistory);
  const [myList, setMyList] = useState(getMyList);
  const [genres, setGenres] = useState([]);
  const [suggestions, setSuggestions] = useState({ topPicks: [], because: [] });

  // rebuild suggestions when the recent history changes (e.g. after watching)
  const historyKey = history.slice(0, 6).map((h) => `${h.type}:${h.id}`).join(",");
  useEffect(() => {
    let cancelled = false;
    buildSuggestions(token)
      .then((s) => !cancelled && setSuggestions(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [historyKey, token]);

  useEffect(() => {
    fetchGenres("movie", token).then(setGenres, () => setGenres([]));
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    fetchHomeRows(token)
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!active) return;
    setHistory(getHistory());
    setMyList(getMyList());
  }, [active]);

  useEffect(() => {
    if (active && rows) setTimeout(ensureFocus, 0);
  }, [active, rows]);

  // featured title: the first one allowed by the age limit
  const heroPool = useAllowed(rows && rows[0] ? rows[0].items : null, token).items;

  if (error) return <div className="empty">Could not load TMDB: {error}</div>;
  if (!rows) return <Spinner label="Loading…" />;

  const hero = heroPool.find((i) => i.backdrop_path) || null;

  return (
    <div className="page">
      {hero ? (
        <div className="hero">
          <img className="hero-bg" src={imgUrl(hero.backdrop_path, "w1280")} alt="" />
          <div className="hero-shade" />
          <div className="hero-body">
            <div className="hero-kicker">Trending</div>
            <h1 className="hero-title">{hero.title}</h1>
            <div className="meta">
              {hero.year ? <span>{hero.year}</span> : null}
              {hero.rating ? <span>★ {hero.rating}</span> : null}
              <span>{hero.type === "movie" ? "Movie" : "Series"}</span>
            </div>
            <p className="hero-overview">{hero.overview}</p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary focusable"
                data-nav-default
                onClick={() => nav.play(hero)}
              >
                <PlayIcon /> Play
              </button>
              <button type="button" className="btn focusable" onClick={() => nav.details(hero)}>
                More info
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Row
        title="Continue watching"
        items={history}
        onSelect={(h) => nav.details(h, { season: h.season, episode: h.episode })}
        wide
        subtitleFor={epLabel}
        progressFor={(h) => progressFraction(getProgress(h, h.season, h.episode))}
      />
      <Row title="Top picks for you" items={suggestions.topPicks} onSelect={nav.details} />
      <Row title="My List" items={myList} onSelect={nav.details} />
      {suggestions.because.slice(0, 1).map((b) => (
        <Row key={`because-${b.source.type}:${b.source.id}`} title={b.title} items={b.items} onSelect={nav.details} />
      ))}
      {rows.slice(0, 3).map((r) => (
        <EndlessRow key={r.id} row={r} token={token} onSelect={nav.details} />
      ))}
      {suggestions.because.slice(1).map((b) => (
        <Row key={`because-${b.source.type}:${b.source.id}`} title={b.title} items={b.items} onSelect={nav.details} />
      ))}
      <Chips
        title="Movies by genre"
        options={genres}
        onPick={(g) => nav.browse({ kind: "movie", genre: g.id })}
      />
      <Chips
        title="Movies by language"
        options={LANGUAGE_CHIPS}
        onPick={(l) => nav.browse({ kind: "movie", language: l.id })}
      />
      {rows.slice(3).map((r) => (
        <EndlessRow key={r.id} row={r} token={token} onSelect={nav.details} />
      ))}
      <div className="btn-row" style={{ padding: "2rem 3.5rem" }}>
        <button type="button" className="btn focusable" onClick={() => nav.tab("browse")}>
          Browse all movies & series
        </button>
      </div>
    </div>
  );
}
