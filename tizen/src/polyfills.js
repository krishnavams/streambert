// Small runtime polyfills for the Chromium 56-69 engines on 2018-2020 TVs.
// Syntax is transpiled by the build; these cover missing built-ins only.

if (typeof Promise.prototype.finally !== "function") {
  // eslint-disable-next-line no-extend-native
  Promise.prototype.finally = function (fn) {
    return this.then(
      (v) => Promise.resolve(fn()).then(() => v),
      (e) =>
        Promise.resolve(fn()).then(() => {
          throw e;
        }),
    );
  };
}

if (!Array.prototype.flat) {
  // eslint-disable-next-line no-extend-native
  Array.prototype.flat = function (depth = 1) {
    return depth > 0
      ? this.reduce(
          (acc, v) => acc.concat(Array.isArray(v) ? v.flat(depth - 1) : v),
          [],
        )
      : this.slice();
  };
}

if (!Object.fromEntries) {
  Object.fromEntries = (entries) => {
    const o = {};
    for (const [k, v] of entries) o[k] = v;
    return o;
  };
}

if (!String.prototype.replaceAll) {
  // eslint-disable-next-line no-extend-native
  String.prototype.replaceAll = function (search, repl) {
    return typeof search === "string"
      ? this.split(search).join(repl)
      : this.replace(search, repl);
  };
}

if (!String.prototype.padStart) {
  // eslint-disable-next-line no-extend-native
  String.prototype.padStart = function (len, fill = " ") {
    let s = String(this);
    while (s.length < len) s = fill + s;
    return s.slice(-Math.max(len, String(this).length));
  };
}

if (typeof globalThis === "undefined") {
  window.globalThis = window;
}
