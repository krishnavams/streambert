import { useEffect, useRef, useState } from "react";
import { useKeys } from "../nav/useKeys";
import { focusFirst, focusEl, ensureFocus } from "../nav/spatial";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "C"];

/**
 * 4-digit PIN entry. Works with the on-screen keys and the remote's number keys.
 * onSubmit(pin) returns an error message to show (and clear), or null to accept.
 */
export default function PinPad({ title, text, onSubmit, onCancel }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const ref = useRef(null);

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

  const press = (d) => {
    setError(null);
    if (d === "⌫") return setPin((p) => p.slice(0, -1));
    if (d === "C") return setPin("");
    setPin((p) => (p.length < 4 ? p + d : p));
  };

  // submit as soon as 4 digits are in
  useEffect(() => {
    if (pin.length !== 4) return;
    const err = onSubmit(pin);
    if (err) setError(err);
    setPin("");
  }, [pin]);

  useKeys((action) => {
    if (action === "back") {
      onCancel();
      return true;
    }
    if (action.indexOf("digit:") === 0) {
      press(action.slice(6));
      return true;
    }
    return false;
  });

  return (
    <div className="modal-backdrop">
      <div className="modal pin-modal" data-nav-scope ref={ref}>
        <h2 className="modal-title">{title}</h2>
        {text ? <p className="modal-text">{text}</p> : null}
        <div className="pin-dots">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`pin-dot${i < pin.length ? " on" : ""}`} />
          ))}
        </div>
        <div className="pin-error">{error || " "}</div>
        <div className="pin-keys" data-nav-group>
          {DIGITS.map((d) => (
            <button
              key={d}
              type="button"
              className="osk-key pin-key focusable"
              data-nav-default={d === "5" ? "" : undefined}
              onClick={() => press(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
