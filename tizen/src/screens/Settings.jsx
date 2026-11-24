import { useEffect, useState } from "react";
import { PLAYER_SOURCES, clearTmdbCache } from "@shared/api";
import { storage } from "@shared/storage";
import { getDefaultSource, setDefaultSource, getDubMode, setDubMode, sourceLabel, sourceHint, HIANIME, SUB_LANGUAGES, getSubLang, setSubLang, subLangLabel } from "../lib/sources";
import { clearHistory } from "../lib/library";
import { Picker, Confirm } from "../components/ui";
import PinPad from "../components/PinPad";
import { AGE_LIMITS, getAgeLimit, setAgeLimit, ageLimitLabel, hasPin, checkPin, setPin } from "../lib/parental";
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
  // PIN flows: { t: "verify", then: "picker" | "changepin" } | { t: "create", pin1, limit }
  const [flow, setFlow] = useState(null);

  useEffect(() => {
    if (active) setTimeout(ensureFocus, 0);
  }, [active]);

  const openAgeLimit = () => {
    if (getAgeLimit() === null) setPicker("ageLimit");
    else setFlow({ t: "verify", then: "picker" });
  };

  // returns an error message, or null when the PIN is accepted
  const submitPin = (pin) => {
    if (flow.t === "verify") {
      if (!checkPin(pin)) return "Wrong PIN. Try again.";
      const then = flow.then;
      setFlow(then === "changepin" ? { t: "create", pin1: null, limit: null } : null);
      if (then === "picker") setPicker("ageLimit");
      return null;
    }
    // create: type it twice
    if (!flow.pin1) {
      setFlow({ ...flow, pin1: pin });
      return null;
    }
    if (pin !== flow.pin1) {
      setFlow({ ...flow, pin1: null });
      return "The PINs didn't match. Start again.";
    }
    setPin(pin);
    if (flow.limit !== null) setAgeLimit(flow.limit);
    setFlow(null);
    bump((n) => n + 1);
    return null;
  };

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
    {
      id: "age",
      label: "Age limit (PIN protected)",
      value: ageLimitLabel(),
      onClick: openAgeLimit,
    },
    ...(getAgeLimit() !== null
      ? [{ id: "pin", label: "Change PIN", value: "", onClick: () => setFlow({ t: "verify", then: "changepin" }) }]
      : []),
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
      {picker === "ageLimit" ? (
        <Picker
          title="Age limit"
          options={[{ id: "off", label: "Off", hint: "show everything (adult titles stay hidden)" }].concat(AGE_LIMITS)}
          selected={getAgeLimit() === null ? "off" : String(getAgeLimit())}
          onClose={close}
          onPick={(id) => {
            setPicker(null);
            if (id === "off") {
              setAgeLimit(null);
              setPin(null);
              bump((n) => n + 1);
            } else if (hasPin()) {
              setAgeLimit(Number(id));
              bump((n) => n + 1);
            } else {
              setFlow({ t: "create", pin1: null, limit: Number(id) });
            }
          }}
        />
      ) : null}
      {flow ? (
        <PinPad
          key={flow.t + (flow.pin1 ? "2" : "1")}
          title={flow.t === "verify" ? "Enter your PIN" : flow.pin1 ? "Repeat the PIN" : "Create a 4-digit PIN"}
          text={
            flow.t === "create" && !flow.pin1
              ? "You'll need it to change the age limit or to open blocked titles. Titles with no known rating are hidden."
              : null
          }
          onSubmit={submitPin}
          onCancel={() => setFlow(null)}
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
