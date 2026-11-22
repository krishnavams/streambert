import { useEffect, useRef, useState } from "react";
import { validateToken } from "../lib/tmdb";
import { focusFirst } from "../nav/spatial";
import { useKeys } from "../nav/useKeys";
import logoUrl from "../../../public/logo.svg";

// First-run screen. Typing a ~200 character token on a TV is painful, so the
// recommended path is baking it in at build time (VITE_TMDB_TOKEN); this
// screen is the fallback and uses the TV's own on-screen keyboard (IME).
export default function Setup({ onDone }) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    setTimeout(() => focusFirst(rootRef.current), 0);
  }, []);

  const submit = async () => {
    const token = value.trim();
    if (!token) return;
    setChecking(true);
    setError(null);
    const ok = await validateToken(token);
    setChecking(false);
    if (ok) onDone(token);
    else setError("TMDB rejected that token. Use the API Read Access Token (the long one).");
  };

  useKeys((action) => {
    // TV keyboard "Done" key
    if (action === "imeDone" && document.activeElement === inputRef.current) {
      inputRef.current.blur();
      submit();
      return true;
    }
    return false;
  });

  return (
    <div className="setup" ref={rootRef} data-nav-scope>
      <img className="setup-logo" src={logoUrl} alt="" />
      <h1>Welcome to Streambert</h1>
      <p>
        Enter your free TMDB API Read Access Token. Get one at themoviedb.org → Settings → API.
      </p>
      <input
        ref={inputRef}
        className="input focusable"
        type="text"
        value={value}
        placeholder="eyJhbGciOiJIUzI1NiJ9…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.keyCode === 13) submit();
        }}
        data-nav-default
        autoComplete="off"
        spellCheck={false}
      />
      {error ? <div className="error-text">{error}</div> : null}
      <div className="btn-row">
        <button type="button" className="btn btn-primary focusable" onClick={submit} disabled={checking}>
          {checking ? "Checking…" : "Continue"}
        </button>
      </div>
      <p className="setup-tip">
        Tip: typing the token with a remote is slow. Put it in <code>tizen/.env</code> as{" "}
        <code>VITE_TMDB_TOKEN=…</code> before building and this screen is skipped.
      </p>
    </div>
  );
}
