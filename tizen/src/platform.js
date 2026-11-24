// Tizen platform glue: remote key registration, key mapping, app exit.
// Everything degrades gracefully in a normal desktop browser (dev mode),
// where the keyboard stands in for the remote.

export const isTizen =
  typeof window !== "undefined" && typeof window.tizen !== "undefined";

// Keys that must be registered before Tizen delivers them to the app.
// Arrows, OK (Enter) and Back are delivered without registration.
const REMOTE_KEYS = [
  "MediaPlayPause",
  "MediaPlay",
  "MediaPause",
  "MediaStop",
  "MediaFastForward",
  "MediaRewind",
  "MediaTrackNext",
  "MediaTrackPrevious",
  "ChannelUp",
  "ChannelDown",
  "ColorF0Red",
  "ColorF1Green",
  "ColorF2Yellow",
  "ColorF3Blue",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", // PIN entry
];

export function registerRemoteKeys() {
  if (!isTizen) return;
  const dev = window.tizen.tvinputdevice;
  if (!dev) return;
  for (const name of REMOTE_KEYS) {
    try {
      dev.registerKey(name);
    } catch {
      // key not present on this model
    }
  }
}

export function exitApp() {
  if (!isTizen) return false;
  try {
    window.tizen.application.getCurrentApplication().exit();
    return true;
  } catch {
    return false;
  }
}

// keyCode -> action. Tizen remotes send these codes; keyboard equivalents are
// mapped too so the app is usable in a desktop browser during development.
const CODE_ACTIONS = {
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  13: "enter",
  10009: "back", // Tizen Return
  27: "back", // Escape
  8: "back", // Backspace (ignored while typing, see keyAction)
  10252: "playpause",
  415: "play",
  19: "pause",
  413: "stop",
  417: "ff",
  412: "rw",
  10233: "next",
  10232: "prev",
  427: "next", // Channel up
  428: "prev", // Channel down
  403: "red",
  404: "green",
  405: "yellow",
  406: "blue",
  65376: "imeDone",
  65385: "imeCancel",
};
// number keys (remote and keyboard, plain and numpad) → "digit:N"
for (let n = 0; n <= 9; n++) {
  CODE_ACTIONS[48 + n] = `digit:${n}`;
  CODE_ACTIONS[96 + n] = `digit:${n}`;
}

const KEY_ACTIONS = {
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowDown: "down",
  Enter: "enter",
  Escape: "back",
  GoBack: "back",
  MediaPlayPause: "playpause",
  MediaPlay: "play",
  MediaPause: "pause",
  MediaStop: "stop",
  MediaFastForward: "ff",
  MediaRewind: "rw",
  MediaTrackNext: "next",
  MediaTrackPrevious: "prev",
};

export function isTextInput(el) {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const t = (el.type || "text").toLowerCase();
  return ["text", "search", "password", "url", "email", "number", "tel"].includes(t);
}

export function keyAction(e) {
  const action = CODE_ACTIONS[e.keyCode] || KEY_ACTIONS[e.key] || null;
  // Backspace edits text inside inputs; " " (space) toggles play in dev
  if (action === "back" && e.keyCode === 8 && isTextInput(document.activeElement)) {
    return null;
  }
  if (!action && (e.key === " " || e.keyCode === 32) && !isTextInput(document.activeElement)) {
    return "playpause";
  }
  return action;
}
