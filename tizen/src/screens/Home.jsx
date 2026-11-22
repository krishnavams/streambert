import { useEffect, useState } from "react";
import { fetchHomeRows, imgUrl } from "../lib/tmdb";
import { getHistory, getMyList, getProgress, progressFraction } from "../lib/library";
import { Row, Spinner } from "../components/ui";
import { ensureFocus } from "../nav/spatial";
import { PlayIcon } from "@components/Icons";

const epLabel = (h) => (h.type === "tv" && h.season ? `S${h.season} · E${h.episode}` : null);

export default function Home({ token, active, nav }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  // re-read local lists whenever the screen comes back to the top
  const [history, setHistory] = useState(getHistory);
  const [myList, setMyList] = useState(getMyList);

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

  if (error) return <div className="empty">Could not load TMDB: {error}</div>;
  if (!rows) return <Spinner label="Loading…" />;

  const hero = rows[0]?.items.find((i) => i.backdrop_path) || null;

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
      <Row title="My List" items={myList} onSelect={nav.details} />
      {rows.map((r) => (
        <Row key={r.id} title={r.title} items={r.items} onSelect={nav.details} />
      ))}
    </div>
  );
}
