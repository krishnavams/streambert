import { useEffect, useState } from "react";
import { PLAYER_SOURCES, clearTmdbCache } from "@shared/api";
import { storage } from "@shared/storage";
import { getDefaultSource, setDefaultSource, getDubMode, setDubMode, sourceLabel, sourceHint, HIANIME, SUB_LANGUAGES, getSubLang, setSubLang, subLangLabel } from "../lib/sources";
import { clearHistory } from "../lib/library";
import { Picker, Confirm } from "../components/ui";
import { ensureFocus } from "../nav/spatial";
import { isTizen } from "../platform";

const LANGUAGES = [
  ["en-US", "English"],
  ["de-DE", "Deutsch"],
  ["fr-FR", "Français"],
  ["es-ES", "Español"],
  ["it-IT", "Italiano"],
  ["pt-BR", "Português (BR)"],
  ["hi-IN", "हिन्दी"],
  ["ja-JP", "日本語"],
  ["ko-KR", "한국어"],
  ["tr-TR", "Türkçe"],
];

export default function Settings({ active, onResetToken }) {
  const [, bump] = useState(0);
  const [picker, setPicker] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (active) setTimeout(ensureFocus, 0);
  }, [active]);

  const close = () => {
    setPicker(null);
    setConfirm(null);
    bump((n) => n + 1);
  };

  const lang = storage.get("tmdbLang") || "en-US";
  const embedSources = PLAYER_SOURCES.filter((s) => !s.tag).map((s) => ({ id: s.id, label: s.label, hint: sourceHint(s) }));
  const hianime = PLAYER_SOURCES.find((s) => s.id === HIANIME);
  const animeSources = (hianime ? [{ id: HIANIME, label: hianime.label, hint: sourceHint(hianime) }] : []).concat(embedSources);

  const rows = [
    {
      id: "source",
      label: "Movies & series source",
      value: sourceLabel(getDefaultSource(false)),
      onClick: () => setPicker("source"),
    },
    {
      id: "animeSource",
      label: "Anime source",
      value: sourceLabel(getDefaultSource(true)),
      onClick: () => setPicker("animeSource"),
    },
    {
      id: "dub",
      label: "Anime audio",
      value: getDubMode() === "dub" ? "Dub" : "Sub",
      onClick: () => setPicker("dub"),
    },
    {
      id: "subLang",
      label: "Subtitle language (embedded players)",
      value: subLangLabel(getSubLang()),
      onClick: () => setPicker("subLang"),
    },
    {
      id: "lang",
      label: "Title & description language",
      value: (LANGUAGES.find((l) => l[0] === lang) || [lang, lang])[1],
      onClick: () => setPicker("lang"),
    },
    { id: "history", label: "Clear watch history", value: "", onClick: () => setConfirm("history") },
    { id: "token", label: "Change TMDB token", value: "", onClick: () => setConfirm("token") },
  ];

  return (
    <div className="page settings">
      <h1 className="page-title">Settings</h1>
      <div className="settings-list" data-nav-group>
        {rows.map((r) => (
          <button key={r.id} type="button" className="list-btn focusable" onClick={r.onClick}>
            <span>{r.label}</span>
            <span className="list-hint">{r.value}</span>
          </button>
        ))}
      </div>
      <div className="about">
        Streambert TV {__APP_VERSION__} · {isTizen ? "Samsung Tizen" : "browser preview"}
        <br />
        Embedded sources show the hoster's own player (and its ads). Anime via HiAnime plays ad-free in the app's own player.
      </div>

      {picker === "source" || picker === "animeSource" ? (
        <Picker
          title={picker === "source" ? "Movies & series source" : "Anime source"}
          options={picker === "source" ? embedSources : animeSources}
          selected={getDefaultSource(picker === "animeSource")}
          onClose={close}
          onPick={(id) => {
            setDefaultSource(picker === "animeSource", id);
            close();
          }}
        />
      ) : null}
      {picker === "dub" ? (
        <Picker
          title="Anime audio"
          options={[
            { id: "sub", label: "Japanese with subtitles (Sub)" },
            { id: "dub", label: "English dub (Dub)" },
          ]}
          selected={getDubMode()}
          onClose={close}
          onPick={(m) => {
            setDubMode(m);
            close();
          }}
        />
      ) : null}
      {picker === "subLang" ? (
        <Picker
          title="Subtitle language"
          options={SUB_LANGUAGES}
          selected={getSubLang()}
          onClose={close}
          onPick={(id) => {
            setSubLang(id);
            close();
          }}
        />
      ) : null}
      {picker === "lang" ? (
        <Picker
          title="Language"
          options={LANGUAGES.map(([id, label]) => ({ id, label }))}
          selected={lang}
          onClose={close}
          onPick={(id) => {
            storage.set("tmdbLang", id);
            clearTmdbCache();
            close();
          }}
        />
      ) : null}
      {confirm === "history" ? (
        <Confirm
          title="Clear watch history?"
          text="Recently watched titles and resume positions will be removed. My List is kept."
          confirmLabel="Clear"
          onCancel={close}
          onConfirm={() => {
            clearHistory();
            close();
          }}
        />
      ) : null}
      {confirm === "token" ? (
        <Confirm
          title="Change TMDB token?"
          text="You'll be asked for a new TMDB read access token."
          confirmLabel="Continue"
          onCancel={close}
          onConfirm={() => {
            setConfirm(null);
            onResetToken();
          }}
        />
      ) : null}
    </div>
  );
}
