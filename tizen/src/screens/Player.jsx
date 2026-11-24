// Full-screen player.
//
// Two modes:
//  • "hls"   – HiAnime anime streams, played in our own <video> with hls.js.
//              The remote drives it directly (OK = play/pause, ◀ ▶ = seek).
//  • "embed" – every other source, loaded as an iframe. Cross-origin iframes
//              swallow remote keys while focused, so the remote is handed to
//              the embedded player only for a short, visible countdown and
//              then taken back (otherwise Back could never leave the player).

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useKeys } from "../nav/useKeys";
import { focusFirst } from "../nav/spatial";
import { Spinner, Picker } from "../components/ui";
import { resolveHiAnime } from "../lib/hianime";
import { embedUrl, sourcesFor, preferredSource, setPreferredSource, sourceLabel, fallbackEmbedSource, getDubMode, setDubMode, HIANIME, SUB_LANGUAGES, getSubLang, setSubLang, subLangLabel, sourceSupportsSubLang } from "../lib/sources";
import { getProgress, resumeTime, saveProgress, recordWatch } from "../lib/library";
import { storage } from "@shared/storage";

const K_QUALITY = "tv_quality"; // "auto" or a height such as "1080"

// Lock hls.js to the best level at or below `q` ("auto" = adaptive).
// Picks the highest-bitrate level of the chosen height.
function applyQuality(hls, q) {
  if (!hls) return;
  if (q === "auto") {
    hls.currentLevel = -1;
    return;
  }
  const want = parseInt(q, 10);
  const heights = Array.from(new Set(hls.levels.map((l) => l.height).filter(Boolean))).sort((a, b) => b - a);
  const height = heights.find((h) => h <= want) || heights[heights.length - 1];
  let best = -1;
  hls.levels.forEach((l, i) => {
    if (l.height === height && (best < 0 || l.bitrate > hls.levels[best].bitrate)) best = i;
  });
  hls.currentLevel = best;
}

const HAND_OVER_SECONDS = 15;
const CONTROLS_HIDE_MS = 5000;

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
};

export default function Player({ token, nav, params }) {
  const { item, season, episode, episodes } = params;
  const isTv = item.type === "tv";
  const [source, setSource] = useState(() => params.source || preferredSource(item));
  const [dub, setDub] = useState(getDubMode);
  const [subLang, setSubLangState] = useState(getSubLang);
  const [mode, setMode] = useState(null); // "hls" | "embed"
  const [url, setUrl] = useState(null);
  const [subtitle, setSubtitle] = useState(null);
  const [stage, setStage] = useState("Loading…");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [picker, setPicker] = useState(null);
  const [controls, setControls] = useState(true);
  const [handOver, setHandOver] = useState(0); // seconds left with the remote in the iframe
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState({ t: 0, d: 0 });
  const [subsOn, setSubsOn] = useState(true);
  const [heights, setHeights] = useState([]); // qualities offered by the stream, best first
  const [quality, setQuality] = useState(() => storage.get(K_QUALITY) || "auto");
  const [curHeight, setCurHeight] = useState(0); // what is playing right now

  const hlsRef = useRef(null);
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const rootRef = useRef(null);
  const hideTimer = useRef(null);
  const handTimer = useRef(null);

  const nextEpisode = isTv && episodes ? episodes.find((e) => e.number === episode + 1) : null;
  const heading = isTv ? `${item.title} · S${season} E${episode}` : item.title;

  // ── Resolve the stream ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setUrl(null);
    setMode(null);
    recordWatch(item, season, episode);

    const loadEmbed = async (id, why) => {
      setStage(`Loading ${sourceLabel(id)}…`);
      const u = await embedUrl(id, item, season, episode, token);
      if (cancelled) return;
      if (why) setNotice(why);
      setMode("embed");
      setUrl(u);
    };

    (async () => {
      try {
        if (source === HIANIME) {
          try {
            const s = await resolveHiAnime(
              { title: item.title, isMovie: !isTv, season, episode, mode: dub },
              (msg) => !cancelled && setStage(msg),
            );
            if (cancelled) return;
            setMode("hls");
            setSubtitle(s.subtitle);
            setUrl(s.url);
          } catch (e) {
            const fb = fallbackEmbedSource(item);
            if (!fb) throw e;
            await loadEmbed(fb, `HiAnime failed (${e.message}). Using ${sourceLabel(fb)} instead.`);
          }
        } else {
          await loadEmbed(source);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, dub, subLang, item.id, season, episode]);

  // ── hls.js wiring ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "hls" || !url) return undefined;
    const video = videoRef.current;
    const start = resumeTime(getProgress(item, season, episode));
    let hls = null;
    const onMeta = () => {
      if (start) video.currentTime = start;
      const p = video.play();
      if (p && p.catch) p.catch(() => setPaused(true));
    };
    if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30, backBufferLength: 30 });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const hs = Array.from(new Set(hls.levels.map((l) => l.height).filter(Boolean))).sort((a, b) => b - a);
        setHeights(hs);
        applyQuality(hls, qualityRef.current);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const l = hls.levels[data.level];
        setCurHeight(l ? l.height || 0 : 0);
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setError(`Stream error (${data.details}). Try another source.`);
        }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url; // native HLS
    }
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      if (hls) hls.destroy();
      hlsRef.current = null;
      setHeights([]);
      setCurHeight(0);
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // ignore
      }
    };
  }, [mode, url]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !v.textTracks) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode = subsOn ? "showing" : "hidden";
    }
  }, [subsOn, subtitle, mode]);

  // Progress from embedded players that post their time (vidfast, vidlove, …)
  useEffect(() => {
    if (mode !== "embed") return undefined;
    const onMsg = (e) => {
      let d = e.data;
      if (typeof d === "string") {
        try {
          d = JSON.parse(d);
        } catch {
          return;
        }
      }
      const inner = d && (d.data || d);
      const t = Number(inner && (inner.currentTime ?? inner.time));
      const dur = Number(inner && inner.duration);
      if (t > 0 && dur > 0) saveProgress(item, season, episode, t, dur);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [mode, item.id, season, episode]);

  // ── Controls visibility ─────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      // keep controls up while paused in HLS mode
      if (v && v.paused && mode === "hls") return;
      setControls(false);
    }, CONTROLS_HIDE_MS);
  }, [mode]);

  useEffect(() => {
    showControls();
    return () => clearTimeout(hideTimer.current);
  }, [mode, url]);

  useEffect(() => {
    if (url) setTimeout(() => focusFirst(rootRef.current), 0);
  }, [url]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  // ── Hand the remote to the embedded player for a while ─────────────────────
  const takeBack = useCallback(() => {
    clearInterval(handTimer.current);
    handTimer.current = null;
    setHandOver(0);
    try {
      window.focus();
    } catch {
      // ignore
    }
    showControls();
    setTimeout(() => focusFirst(rootRef.current), 0);
  }, [showControls]);

  const giveRemote = () => {
    const frame = iframeRef.current;
    if (!frame) return;
    setControls(false);
    let left = HAND_OVER_SECONDS;
    setHandOver(left);
    try {
      frame.focus();
      if (frame.contentWindow) frame.contentWindow.focus();
    } catch {
      // cross-origin: focusing the element is enough
    }
    clearInterval(handTimer.current);
    handTimer.current = setInterval(() => {
      left -= 1;
      if (left <= 0) takeBack();
      else setHandOver(left);
    }, 1000);
  };
  useEffect(() => () => clearInterval(handTimer.current), []);

  // A mouse/pointer click inside the embedded player moves keyboard focus into
  // it, and from then on the TV sends every key there, Back included. Unless
  // the remote was handed over on purpose ("Control player"), take focus back
  // right away. The click itself still reaches the player.
  useEffect(() => {
    if (mode !== "embed") return undefined;
    let timer = null;
    const reclaim = () => {
      timer = null;
      if (handTimer.current) return; // deliberate hand-over, its countdown handles it
      if (document.activeElement !== iframeRef.current) return;
      const root = rootRef.current;
      if (!root) return;
      try {
        root.focus({ preventScroll: true });
      } catch {
        root.focus();
      }
    };
    const onBlur = () => {
      clearTimeout(timer);
      timer = setTimeout(reclaim, 600);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      clearTimeout(timer);
    };
  }, [mode]);

  // ── HLS helpers ─────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };
  const seek = (delta) => {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + delta));
    setTime({ t: v.currentTime, d: v.duration });
  };
  const goNext = () => {
    if (!nextEpisode) return;
    nav.replacePlayer({ ...params, episode: nextEpisode.number, source });
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setTime({ t: v.currentTime, d: v.duration || 0 });
    if (Math.floor(v.currentTime) % 5 === 0) saveProgress(item, season, episode, v.currentTime, v.duration);
  };

  // ── Remote keys ─────────────────────────────────────────────────────────────
  useKeys((action) => {
    if (picker) return false; // the picker handles its own keys
    const wasHidden = !controls;
    showControls();

    if (action === "back") {
      if (mode === "hls" && !wasHidden) {
        setControls(false);
        return true;
      }
      return false; // router pops the player
    }

    if (mode === "hls") {
      const v = videoRef.current;
      switch (action) {
        case "playpause":
          togglePlay();
          return true;
        case "play":
          if (v) v.play();
          return true;
        case "pause":
          if (v) v.pause();
          return true;
        case "ff":
          seek(30);
          return true;
        case "rw":
          seek(-30);
          return true;
        case "next":
          goNext();
          return true;
        case "stop":
          nav.back();
          return true;
        default:
          break;
      }
      // with controls hidden the arrows/OK drive playback directly
      if (wasHidden) {
        if (action === "left") seek(-10);
        else if (action === "right") seek(10);
        else if (action === "enter") togglePlay();
        if (action === "up" || action === "down") setTimeout(() => focusFirst(rootRef.current), 0);
        return true;
      }
      return false;
    }

    if (mode === "embed") {
      if (action === "next") {
        goNext();
        return true;
      }
      if (action === "playpause" || action === "play" || action === "pause") {
        giveRemote();
        return true;
      }
      if (wasHidden && ["left", "right", "up", "down", "enter"].includes(action)) {
        // first key press only brings the controls back
        setTimeout(() => focusFirst(rootRef.current), 0);
        return true;
      }
    }
    return false;
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  const sources = sourcesFor(item);
  const pct = time.d ? (time.t / time.d) * 100 : 0;

  return (
    <div className="player" ref={rootRef} data-nav-scope tabIndex={-1} onMouseMove={showControls}>
      {mode === "hls" && url ? (
        <video
          ref={videoRef}
          className="player-video"
          crossOrigin="anonymous"
          onTimeUpdate={onTimeUpdate}
          onPause={() => {
            setPaused(true);
            showControls();
          }}
          onPlay={() => setPaused(false)}
          onEnded={() => (nextEpisode ? goNext() : nav.back())}
          onClick={togglePlay}
        >
          {subtitle ? <track kind="subtitles" src={subtitle} srcLang="en" label="English" default /> : null}
        </video>
      ) : null}

      {mode === "embed" && url ? (
        <iframe
          ref={iframeRef}
          className="player-frame"
          src={url}
          title={heading}
          tabIndex={-1}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
        />
      ) : null}

      {/* mouse over the top edge brings back Exit / Source (the iframe itself
          never reports mouse moves to the app) */}
      {mode === "embed" && url && !(controls && !handOver) ? (
        <div className="player-hotzone" onMouseMove={showControls} onClick={showControls} />
      ) : null}

      {!url && !error ? <Spinner label={stage} /> : null}

      {error ? (
        <div className="player-error">
          <h2>Can't play this</h2>
          <p>{error}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary focusable" data-nav-default onClick={() => setPicker("source")}>
              Try another source
            </button>
            <button type="button" className="btn focusable" onClick={nav.back}>
              Back
            </button>
          </div>
        </div>
      ) : null}

      {handOver > 0 ? (
        <div className="handover">
          Remote controls the player · back in {handOver}s
        </div>
      ) : null}

      {notice ? <div className="toast">{notice}</div> : null}

      {url && !error ? (
        <div className={`player-ui${controls && !handOver ? " visible" : ""}`}>
          <div className="player-top">
            <div className="player-title">{heading}</div>
            <div className="player-source">{sourceLabel(mode === "hls" ? HIANIME : source)}{mode === "hls" ? ` · ${dub === "dub" ? "Dub" : "Sub"}` : ""}</div>
          </div>
          <div className="player-bottom">
            {mode === "hls" ? (
              <div className="seekbar">
                <span>{fmt(time.t)}</span>
                <div className="seek-track">
                  <div className="seek-fill" style={{ width: `${pct}%` }} />
                </div>
                <span>{fmt(time.d)}</span>
              </div>
            ) : null}
            <div className="btn-row">
              {mode === "hls" ? (
                <>
                  <button type="button" className="btn btn-primary focusable" data-nav-default onClick={togglePlay}>
                    {paused ? "▶ Play" : "❚❚ Pause"}
                  </button>
                  <button type="button" className="btn focusable" onClick={() => seek(-10)}>
                    ⟲ 10s
                  </button>
                  <button type="button" className="btn focusable" onClick={() => seek(10)}>
                    10s ⟳
                  </button>
                  {subtitle ? (
                    <button type="button" className="btn focusable" onClick={() => setSubsOn((s) => !s)}>
                      Subtitles {subsOn ? "on" : "off"}
                    </button>
                  ) : null}
                  <button type="button" className="btn focusable" onClick={() => setPicker("audio")}>
                    {dub === "dub" ? "Dub" : "Sub"}
                  </button>
                  {heights.length > 1 ? (
                    <button type="button" className="btn focusable" onClick={() => setPicker("quality")}>
                      Quality: {quality === "auto" ? `Auto${curHeight ? ` (${curHeight}p)` : ""}` : `${quality}p`}
                    </button>
                  ) : null}
                </>
              ) : (
                <button type="button" className="btn btn-primary focusable" data-nav-default onClick={giveRemote}>
                  Control player
                </button>
              )}
              {mode === "embed" && sourceSupportsSubLang(source) ? (
                <button type="button" className="btn focusable" onClick={() => setPicker("subLang")}>
                  Subtitles: {subLangLabel(subLang)}
                </button>
              ) : null}
              {nextEpisode ? (
                <button type="button" className="btn focusable" onClick={goNext}>
                  Next episode ▸
                </button>
              ) : null}
              <button type="button" className="btn focusable" onClick={() => setPicker("source")}>
                Source: {sourceLabel(mode === "hls" ? HIANIME : source)}
              </button>
              <button type="button" className="btn focusable" onClick={nav.back}>
                Exit
              </button>
            </div>
            {mode === "embed" ? (
              <div className="player-hint">
                “Control player” lends the remote to the video player for {HAND_OVER_SECONDS} seconds (play, pause, seek).
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {picker === "source" ? (
        <Picker
          title="Player source"
          options={sources}
          selected={source}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            setPicker(null);
            setPreferredSource(item, id);
            setSource(id);
          }}
        />
      ) : null}
      {picker === "subLang" ? (
        <Picker
          title="Subtitle language"
          options={SUB_LANGUAGES}
          selected={subLang}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            setPicker(null);
            setSubLang(id);
            setSubLangState(id); // reloads the embedded player with the new language
          }}
        />
      ) : null}
      {picker === "quality" ? (
        <Picker
          title="Video quality"
          options={[{ id: "auto", label: "Auto", hint: "adapts to your Wi-Fi speed" }].concat(
            heights.map((h) => ({ id: String(h), label: `${h}p`, hint: h >= 1080 ? "best, needs fast Wi-Fi" : "" })),
          )}
          selected={quality}
          onClose={() => setPicker(null)}
          onPick={(q) => {
            setPicker(null);
            storage.set(K_QUALITY, q);
            setQuality(q);
            applyQuality(hlsRef.current, q);
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
          onClose={() => setPicker(null)}
          onPick={(m) => {
            setPicker(null);
            setDubMode(m);
            setDub(m);
          }}
        />
      ) : null}
    </div>
  );
}

