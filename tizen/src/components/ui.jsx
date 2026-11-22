import { useEffect, useRef } from "react";
import { imgUrl } from "../lib/tmdb";
import { focusFirst } from "../nav/spatial";
import { useKeys } from "../nav/useKeys";

export function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      {label ? <div className="spinner-label">{label}</div> : null}
    </div>
  );
}

// Poster card. `progress` (0..1) draws a resume bar.
export function Card({ item, onSelect, progress = 0, subtitle, wide = false }) {
  const img = wide
    ? imgUrl(item.backdrop_path || item.poster_path, "w780")
    : imgUrl(item.poster_path || item.backdrop_path, "w342");
  return (
    <button
      type="button"
      className={`card focusable${wide ? " card-wide" : ""}`}
      onClick={() => onSelect(item)}
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

export function Row({ title, items, onSelect, wide = false, progressFor, subtitleFor }) {
  if (!items || !items.length) return null;
  return (
    <section className="row">
      <h2 className="row-title">{title}</h2>
      <div className="row-scroll" data-nav-group data-nav-axis="horizontal">
        {items.map((item) => (
          <Card
            key={`${item.type}:${item.id}`}
            item={item}
            onSelect={onSelect}
            wide={wide}
            progress={progressFor ? progressFor(item) : 0}
            subtitle={subtitleFor ? subtitleFor(item) : null}
          />
        ))}
      </div>
    </section>
  );
}

// Grid of cards (flex-wrap: CSS grid needs Chromium 57+)
export function Grid({ items, onSelect, progressFor, subtitleFor }) {
  return (
    <div className="grid">
      {items.map((item) => (
        <Card
          key={`${item.type}:${item.id}`}
          item={item}
          onSelect={onSelect}
          progress={progressFor ? progressFor(item) : 0}
          subtitle={subtitleFor ? subtitleFor(item) : null}
        />
      ))}
    </div>
  );
}

/**
 * Modal list picker. Traps remote navigation; Back closes it.
 * options: [{ id, label, hint? }]
 */
export function Picker({ title, options, selected, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => focusFirst(ref.current), 0);
    return () => clearTimeout(t);
  }, []);
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
  useEffect(() => {
    const t = setTimeout(() => focusFirst(ref.current), 0);
    return () => clearTimeout(t);
  }, []);
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
