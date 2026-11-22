import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setApiErrorHandlers } from "@shared/api";
import { storage, STORAGE_KEYS } from "@shared/storage";
import { registerRemoteKeys, keyAction, exitApp, isTextInput } from "./platform";
import { dispatch } from "./nav/useKeys";
import { move, ensureFocus, focusEl } from "./nav/spatial";
import { getToken, setToken } from "./lib/tmdb";
import { getHistory, mediaKey } from "./lib/library";
import Sidebar from "./components/Sidebar";
import { Confirm, Toast } from "./components/ui";
import Setup from "./screens/Setup";
import Home from "./screens/Home";
import Search from "./screens/Search";
import Details from "./screens/Details";
import Player from "./screens/Player";
import Library from "./screens/Library";
import Settings from "./screens/Settings";

const TABS = ["home", "search", "library", "settings"];
let _key = 0;
const entry = (name, params = {}) => ({ key: ++_key, name, params });

export default function App() {
  const [token, setTokenState] = useState(getToken);
  const [stack, setStack] = useState(() => [entry("home")]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [toast, setToast] = useState(null);
  const lastFocus = useRef(new Map()); // entry key -> element focused when it was covered

  const top = stack[stack.length - 1];

  useEffect(() => {
    registerRemoteKeys();
    setApiErrorHandlers(
      () => setToast("TMDB rejected the token. Change it in Settings."),
      () => setToast("Can't reach TMDB. Check the TV's internet connection."),
    );
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const push = useCallback((name, params) => {
    setStack((s) => {
      lastFocus.current.set(s[s.length - 1].key, document.activeElement);
      return [...s, entry(name, params)];
    });
  }, []);

  const stackRef = useRef(stack);
  stackRef.current = stack;
  const back = useCallback(() => {
    const s = stackRef.current;
    if (s.length > 1) setStack(s.slice(0, -1));
    else if (s[0].name !== "home") setStack([entry("home")]);
    else setConfirmExit(true);
  }, []);

  // restore focus on the screen that is uncovered
  useEffect(() => {
    const el = lastFocus.current.get(top.key);
    lastFocus.current.delete(top.key);
    const t = setTimeout(() => {
      if (el && el.isConnected && el.offsetParent !== null) focusEl(el);
      else ensureFocus();
    }, 0);
    return () => clearTimeout(t);
  }, [top.key]);

  const nav = useMemo(
    () => ({
      back,
      tab: (name) => setStack([entry(name)]),
      details: (item, extra = {}) => push("details", { item, ...extra }),
      // play(item) → movie, or the series' last watched / first episode
      play: (item, season, episode, episodes) => {
        if (item.type === "tv" && !season) {
          const last = getHistory().find((h) => mediaKey(h) === mediaKey(item));
          season = last?.season || 1;
          episode = last?.episode || 1;
        }
        push("player", { item, season, episode, episodes });
      },
      replacePlayer: (params) =>
        setStack((s) => [...s.slice(0, -1), entry("player", params)]),
    }),
    [push, back],
  );

  // ── Remote keys ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const action = keyAction(e);
      if (!action) return;
      const active = document.activeElement;
      const typing = isTextInput(active);

      // inside a text field ◀ ▶ move the caret until it hits the edge
      if (typing && (action === "left" || action === "right")) {
        const atStart = active.selectionStart === 0 && active.selectionEnd === 0;
        const atEnd = active.selectionStart === active.value.length;
        if ((action === "left" && !atStart) || (action === "right" && !atEnd)) return;
      }
      if (typing && action === "enter") return; // the field handles it

      if (dispatch(action, e)) {
        e.preventDefault();
        return;
      }
      switch (action) {
        case "left":
        case "right":
        case "up":
        case "down":
          e.preventDefault();
          move(action);
          break;
        case "enter":
          // native buttons click themselves on Enter
          if (active && active !== document.body && !/^(BUTTON|A|INPUT|SELECT)$/.test(active.tagName)) {
            e.preventDefault();
            active.click();
          }
          break;
        case "back":
          e.preventDefault();
          back();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  if (!token) {
    return (
      <Setup
        onDone={(t) => {
          setToken(t);
          setTokenState(t);
          setStack([entry("home")]);
        }}
      />
    );
  }

  const rootTab = stack[0].name;
  const renderScreen = (e, active) => {
    const common = { token, active, nav, params: e.params };
    switch (e.name) {
      case "home":
        return <Home {...common} />;
      case "search":
        return <Search {...common} />;
      case "library":
        return <Library {...common} />;
      case "settings":
        return (
          <Settings
            {...common}
            onResetToken={() => {
              storage.remove(STORAGE_KEYS.API_KEY);
              setTokenState(null);
            }}
          />
        );
      case "details":
        return <Details key={e.key} {...common} />;
      case "player":
        return <Player key={e.key} {...common} />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      {stack.map((e, i) => {
        const active = i === stack.length - 1 && !confirmExit;
        const isRoot = i === 0 && TABS.includes(e.name);
        return (
          <div
            key={e.key}
            className={`screen${e.name === "player" ? " screen-player" : ""}`}
            style={{ display: i === stack.length - 1 ? "" : "none" }}
          >
            {isRoot || e.name === "details" ? (
              <Sidebar current={isRoot ? rootTab : null} onSelect={nav.tab} />
            ) : null}
            <main className={e.name === "player" ? "" : "content"}>{renderScreen(e, active)}</main>
          </div>
        );
      })}
      <Toast message={toast} />
      {confirmExit ? (
        <Confirm
          title="Exit Streambert?"
          confirmLabel="Exit"
          onCancel={() => {
            setConfirmExit(false);
            setTimeout(ensureFocus, 0);
          }}
          onConfirm={() => {
            setConfirmExit(false);
            if (!exitApp()) setToast("Close the browser tab to exit.");
          }}
        />
      ) : null}
    </div>
  );
}
