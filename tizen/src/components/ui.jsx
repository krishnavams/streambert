import { useEffect, useRef } from "react";
import { imgUrl, getToken } from "../lib/tmdb";
import { useAllowed, getAgeLimit } from "../lib/parental";
import { focusFirst, focusEl, ensureFocus } from "../nav/spatial";
import { useKeys } from "../nav/useKeys";

// With an age limit on, a page of results can shrink to almost nothing. Keep
// loading pages (a few at a time) until there is enough to show or none are left.
function useAutoLoadMore(items, pending, loading, onNearEnd, want) {
  const tries = useRef(0);
  useEffect(() => {
    if (getAgeLimit() === null || !onNearEnd || pending || loading) return;
    if (items.length >= want) {
      tries.current = 0;
      return;
    }
    if (tries.current < 8) {
      tries.current++;
      onNearEnd();
    }
  }, [items.length, pending, loading]);
}

export function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      {label ? <div className="spinner-label">{label}</div> : null}
    </div>
  );
}

// Poster card. `progress` (0..1) draws a resume bar.
export function Card({ item, onSelect, onFocus, progress = 0, subtitle, wide = false }) {
  const img = wide
    ? imgUrl(item.backdrop_path || item.poster_path, "w780")
    : imgUrl(item.poster_path || item.backdrop_path, "w342");
  return (
    <button
      type="button"
      className={`card focusable${wide ? " card-wide" : ""}`}
      onClick={() => onSelect(item)}
      onFocus={onFocus}
    >
      <div className="card-img">
        {img ? (
          <img src={img} alt="" loading="lazy" />
        ) : (
          <div className="card-fallback">{item.title}</div>
        )}
        {item.anime ? <span className="badge">ANIME</span> : null}
        {progress > 0 ? (
          <div className="card-progress">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        ) : null}
      </div>
      <div className="card-title">{item.title}</div>
      {subtitle ? <div className="card-sub">{subtitle}</div> : null}
    </button>
  );
}

// Horizontal row. `onNearEnd` is called when focus gets close to the last
// card, so endless rows can fetch the next page.
export function Row({ title, items: allItems, onSelect, wide = false, progressFor, subtitleFor, onNearEnd, loading = false }) {
  // hide titles above the age limit (no-op when the limit is off)
  const { items, pending } = useAllowed(allItems, getToken());
  useAutoLoadMore(items, pending, loading, onNearEnd, 8);
  if (!items.length) return null;
  return (
    <section className="row">
      <h2 className="row-title">{title}</h2>
      <div className="row-scroll" data-nav-group data-nav-axis="horizontal">
        {items.map((item, i) => (
          <Card
            key={`${item.type}:${item.id}`}
            item={item}
            onSelect={onSelect}
            onFocus={onNearEnd && i >= items.length - 6 ? onNearEnd : undefined}
            wide={wide}
            progress={progressFor ? progressFor(item) : 0}
            subtitle={subtitleFor ? subtitleFor(item) : null}
          />
        ))}
        {loading ? <div className="card card-loading"><div className="spinner" /></div> : null}
      </div>
    </section>
  );
}

// Grid of cards (flex-wrap: CSS grid needs Chromium 57+). `onNearEnd` fires
// when focus reaches the last couple of rows.
export function Grid({ items: allItems, onSelect, progressFor, subtitleFor, onNearEnd, loading = false }) {
  const { items, pending } = useAllowed(allItems, getToken());
  useAutoLoadMore(items, pending, loading, onNearEnd, 14);
  return (
    <div className="grid">
      {items.map((item, i) => (
        <Card
          key={`${item.type}:${item.id}`}
          item={item}
          onSelect={onSelect}
          onFocus={onNearEnd && i >= items.length - 14 ? onNearEnd : undefined}
          progress={progressFor ? progressFor(item) : 0}
          subtitle={subtitleFor ? subtitleFor(item) : null}
        />
      ))}
      {loading ? (
        <div className="grid-loading">
          <div className="spinner" />
        </div>
      ) : null}
    </div>
  );
}

// Horizontal chip row (genres, filters)
export function Chips({ title, options, selected, onPick }) {
  return (
    <section className="row">
      {title ? <h2 className="row-title">{title}</h2> : null}
      <div className="row-scroll chips" data-nav-group data-nav-axis="horizontal">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`chip focusable${o.id === selected ? " selected" : ""}`}
            onClick={() => onPick(o)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

// Focus the modal on open; give focus back to the button that opened it on close
function useModalFocus(ref) {
  useEffect(() => {
    const opener = document.activeElement;
    const t = setTimeout(() => focusFirst(ref.current), 0);
    return () => {
      clearTimeout(t);
      setTimeout(() => {
        if (opener && opener.isConnected && opener.offsetParent !== null) focusEl(opener);
        else ensureFocus();
      }, 0);
    };
  }, []);
}

/**
 * Modal list picker. Traps remote navigation; Back closes it.
 * options: [{ id, label, hint? }]
 */
export function Picker({ title, options, selected, onPick, onClose }) {
  const ref = useRef(null);
  useModalFocus(ref);
  useKeys((action) => {
    if (action === "back") {
      onClose();
      return true;
    }
    return false;
  });
  return (
    <div className="modal-backdrop">
      <div className="modal" data-nav-scope ref={ref}>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-list">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`list-btn focusable${o.id === selected ? " selected" : ""}`}
              data-nav-default={o.id === selected ? "" : undefined}
              onClick={() => onPick(o.id)}
            >
              <span>{o.label}</span>
              {o.hint ? <span className="list-hint">{o.hint}</span> : null}
              {o.id === selected ? <span className="list-check">●</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Confirm({ title, text, confirmLabel = "OK", cancelLabel = "Cancel", onConfirm, onCancel }) {
  const ref = useRef(null);
  useModalFocus(ref);
  useKeys((action) => {
    if (action === "back") {
      onCancel();
      return true;
    }
    return false;
  });
  return (
    <div className="modal-backdrop">
      <div className="modal" data-nav-scope ref={ref}>
        <h2 className="modal-title">{title}</h2>
        {text ? <p className="modal-text">{text}</p> : null}
        <div className="btn-row">
          <button type="button" className="btn focusable" onClick={onCancel} data-nav-default>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary focusable" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
