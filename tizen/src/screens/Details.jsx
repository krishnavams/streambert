import { useEffect, useState } from "react";
import { fetchDetails, fetchSeason, imgUrl } from "../lib/tmdb";
import { getHistory, getProgress, progressFraction, resumeTime, isInMyList, toggleMyList, mediaKey } from "../lib/library";
import { sourcesFor, preferredSource, setPreferredSource, sourceLabel, getDubMode, setDubMode, HIANIME } from "../lib/sources";
import { Row, Spinner, Picker } from "../components/ui";
import { ensureFocus } from "../nav/spatial";
import { PlayIcon, BookmarkIcon, BookmarkFillIcon, SourceIcon } from "@components/Icons";

const fmtRuntime = (m) => (m ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h ` : ""}${m % 60}m` : null);

export default function Details({ token, active, nav, params }) {
  const { item: initial, season: wantSeason, episode: wantEpisode } = params;
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const [season, setSeason] = useState(null);
  const [episodes, setEpisodes] = useState(null);
  const [selectedEp, setSelectedEp] = useState(null);
  const [inList, setInList] = useState(() => isInMyList(initial));
  const [source, setSource] = useState(() => preferredSource(initial));
  const [dub, setDub] = useState(getDubMode);
  const [picker, setPicker] = useState(null); // "source" | "audio"
  const [, refresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchDetails(initial.type, initial.id, token)
      .then((d) => {
        if (cancelled) return;
        setItem(d);
        setSource(preferredSource(d));
        if (d.type === "tv") {
          const last = getHistory().find((h) => mediaKey(h) === mediaKey(d));
          const s = wantSeason || last?.season || d.seasons[0]?.number || 1;
          setSeason(s);
          setSelectedEp(wantEpisode || (last && last.season === s ? last.episode : 1));
        }
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [initial.type, initial.id, token]);

  useEffect(() => {
    if (!item || item.type !== "tv" || !season) return undefined;
    let cancelled = false;
    setEpisodes(null);
    fetchSeason(item.id, season, token)
      .then((eps) => !cancelled && setEpisodes(eps))
      .catch(() => !cancelled && setEpisodes([]));
    return () => {
      cancelled = true;
    };
  }, [item, season, token]);

  // refresh resume bars when coming back from the player
  useEffect(() => {
    if (active) {
      refresh((n) => n + 1);
      setSource(item ? preferredSource(item) : preferredSource(initial));
    }
  }, [active]);

  useEffect(() => {
    if (active && item) setTimeout(ensureFocus, 0);
  }, [active, item]);

  if (error) return <div className="empty">Could not load details: {error}</div>;
  if (!item) return <Spinner label={initial.title} />;

  const isTv = item.type === "tv";
  const ep = selectedEp || 1;
  const prog = isTv ? getProgress(item, season, ep) : getProgress(item);
  const resuming = resumeTime(prog) > 0;
  const playLabel = `${resuming ? "Resume" : "Play"}${isTv ? ` S${season} E${ep}` : ""}`;
  const sources = sourcesFor(item);

  const play = (s = season, e = ep) => nav.play(item, s, e, episodes);

  return (
    <div className="page details">
      <div className="details-hero">
        {item.backdrop_path ? (
          <img className="hero-bg" src={imgUrl(item.backdrop_path, "w1280")} alt="" />
        ) : null}
        <div className="hero-shade" />
        <div className="hero-body">
          <h1 className="hero-title">{item.title}</h1>
          {item.tagline ? <div className="tagline">{item.tagline}</div> : null}
          <div className="meta">
            {item.year ? <span>{item.year}</span> : null}
            {item.rating ? <span>★ {item.rating}</span> : null}
            {isTv ? <span>{item.seasons.length} season{item.seasons.length === 1 ? "" : "s"}</span> : null}
            {!isTv && item.runtime ? <span>{fmtRuntime(item.runtime)}</span> : null}
            {item.anime ? <span className="pill">Anime</span> : null}
            {item.genres.slice(0, 3).map((g) => (
              <span key={g}>{g}</span>
            ))}
          </div>
          <p className="hero-overview">{item.overview}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary focusable" data-nav-default onClick={() => play()}>
              <PlayIcon /> {playLabel}
            </button>
            <button
              type="button"
              className="btn focusable"
              onClick={() => setInList(toggleMyList(item))}
            >
              {inList ? <BookmarkFillIcon /> : <BookmarkIcon />} {inList ? "In My List" : "My List"}
            </button>
            <button type="button" className="btn focusable" onClick={() => setPicker("source")}>
              <SourceIcon /> {sourceLabel(source)}
            </button>
            {item.anime && source === HIANIME ? (
              <button type="button" className="btn focusable" onClick={() => setPicker("audio")}>
                {dub === "dub" ? "Dub" : "Sub"}
              </button>
            ) : null}
          </div>
          {resuming ? (
            <div className="resume-bar">
              <div style={{ width: `${Math.round(progressFraction(prog) * 100)}%` }} />
            </div>
          ) : null}
        </div>
      </div>

      {isTv ? (
        <>
          <section className="row">
            <h2 className="row-title">Seasons</h2>
            <div className="row-scroll chips" data-nav-group data-nav-axis="horizontal">
              {item.seasons.map((s) => (
                <button
                  key={s.number}
                  type="button"
                  className={`chip focusable${s.number === season ? " selected" : ""}`}
                  onClick={() => {
                    setSeason(s.number);
                    setSelectedEp(1);
                  }}
                >
                  {s.name || `Season ${s.number}`}
                </button>
              ))}
            </div>
          </section>
          <section className="row">
            <h2 className="row-title">Episodes</h2>
            {!episodes ? (
              <Spinner />
            ) : (
              <div className="row-scroll" data-nav-group data-nav-axis="horizontal">
                {episodes.map((e) => {
                  const p = progressFraction(getProgress(item, season, e.number));
                  return (
                    <button
                      key={e.number}
                      type="button"
                      className={`card card-wide episode focusable${e.number === ep ? " selected" : ""}`}
                      onFocus={() => setSelectedEp(e.number)}
                      onClick={() => play(season, e.number)}
                    >
                      <div className="card-img">
                        {e.still_path ? (
                          <img src={imgUrl(e.still_path, "w500")} alt="" loading="lazy" />
                        ) : (
                          <div className="card-fallback">E{e.number}</div>
                        )}
                        {p > 0 ? (
                          <div className="card-progress">
                            <div style={{ width: `${Math.round(p * 100)}%` }} />
                          </div>
                        ) : null}
                      </div>
                      <div className="card-title">
                        {e.number}. {e.name}
                      </div>
                      {e.runtime ? <div className="card-sub">{fmtRuntime(e.runtime)}</div> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      <Row title="More like this" items={item.recommendations} onSelect={nav.details} />

      {picker === "source" ? (
        <Picker
          title="Player source"
          options={sources}
          selected={source}
          onClose={() => {
            setPicker(null);
          }}
          onPick={(id) => {
            setPreferredSource(item, id);
            setSource(id);
            setPicker(null);
          }}
        />
      ) : null}
      {picker === "audio" ? (
        <Picker
          title="Anime audio"
          options={[
            { id: "sub", label: "Japanese with subtitles (Sub)" },
            { id: "dub", label: "English dub (Dub)" },
          ]}
          selected={dub}
          onClose={() => {
            setPicker(null);
          }}
          onPick={(m) => {
            setDubMode(m);
            setDub(m);
            setPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}
