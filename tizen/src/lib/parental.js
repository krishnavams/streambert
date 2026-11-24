// Age limit + PIN for the TV app.
//
// With an age limit on, a title is shown only if its certification (US or
// Indian rating from TMDB) is at or below the limit. Titles with no known
// rating are hidden too, since they can't be checked. Opening a blocked title
// (from history, a link, a hero button) asks for the PIN first.
//
// The limit and PIN live on this TV only. The PIN is stored as a hash so it
// is not readable in plain text, but it is a family PIN, not real security.

import { useEffect, useState } from "react";
import { tmdbFetch } from "@shared/api";
import { certToMinAge } from "@shared/ageRating";
import { storage } from "@shared/storage";

const K_LIMIT = "tv_ageLimit"; // number, or null/absent = off
const K_PIN = "tv_pin"; // hash string
const K_RATINGS = "tv_ratings"; // { "movie:1": { a: minAge|null, ts } }
const RATING_TTL = 30 * 24 * 60 * 60 * 1000;

// ── settings ─────────────────────────────────────────────────────────────────
export const AGE_LIMITS = [
  { id: "7", label: "7+ (kids)", hint: "G, PG, TV-Y, TV-G, U" },
  { id: "13", label: "13+ (teens)", hint: "adds PG-13, UA 13+" },
  { id: "16", label: "16+", hint: "adds TV-14, UA 16+" },
  { id: "17", label: "17+", hint: "adds R, blocks NC-17, TV-MA, A" },
];

const listeners = new Set();
let notifyTimer = null;
// batched: a screenful of ratings arriving should cause one re-render, not hundreds
const notify = () => {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    listeners.forEach((f) => f());
  }, 120);
};
export const onParentalChange = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export function getAgeLimit() {
  const v = storage.get(K_LIMIT);
  return v === null || v === undefined || v === "" ? null : Number(v);
}
export function setAgeLimit(n) {
  if (n === null || n === undefined) storage.remove(K_LIMIT);
  else storage.set(K_LIMIT, Number(n));
  unlocked.clear();
  notify();
}

const hashPin = (pin) => {
  let h = 2166136261;
  const s = `streambert:${pin}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return String(h);
};
export const hasPin = () => !!storage.get(K_PIN);
export const checkPin = (pin) => storage.get(K_PIN) === hashPin(pin);
export const setPin = (pin) => (pin ? storage.set(K_PIN, hashPin(pin)) : storage.remove(K_PIN));

export const ageLimitLabel = () => {
  const n = getAgeLimit();
  return n === null ? "Off" : `${n}+`;
};

// ── ratings ──────────────────────────────────────────────────────────────────
const IN_AGE = { u: 0, ua: 12, "u/a": 12, "ua 7+": 7, "ua 13+": 13, "ua 16+": 16, a: 18, s: 18 };

function minAgeFor(cert, country) {
  if (!cert) return null;
  // "Not rated" says nothing about the content (the desktop table maps it to 0) → unknown
  if (/^(nr|not rated|unrated|n\/a)$/i.test(cert.trim())) return null;
  if (country === "IN") {
    const v = IN_AGE[cert.trim().toLowerCase()];
    return v === undefined ? null : v;
  }
  return certToMinAge(cert, "US");
}

async function fetchMinAge(item, token) {
  try {
    if (item.type === "tv") {
      const data = await tmdbFetch(`/tv/${item.id}/content_ratings`, token);
      const results = data.results || [];
      for (const country of ["IN", "US"]) {
        const e = results.find((r) => r.iso_3166_1 === country);
        if (e && e.rating && e.rating.trim()) {
          const a = minAgeFor(e.rating, country);
          if (a !== null) return a;
        }
      }
      return null;
    }
    const data = await tmdbFetch(`/movie/${item.id}/release_dates`, token);
    const results = data.results || [];
    for (const country of ["IN", "US"]) {
      const e = results.find((r) => r.iso_3166_1 === country);
      if (!e) continue;
      const dates = (e.release_dates || []).slice().sort((x, y) => (y.type === 3) - (x.type === 3));
      for (const d of dates) {
        if (d.certification && d.certification.trim()) {
          const a = minAgeFor(d.certification, country);
          if (a !== null) return a;
        }
      }
    }
    return null;
  } catch {
    return undefined; // network problem: try again later, don't cache
  }
}

const ratings = new Map(); // "movie:1" -> number | null (unrated)
const inflight = new Map(); // key -> Promise
let loaded = false;
let flushTimer = null;
const keyOf = (i) => `${i.type === "tv" ? "tv" : "movie"}:${i.id}`;

function loadCache() {
  if (loaded) return;
  loaded = true;
  const cache = storage.get(K_RATINGS) || {};
  const now = Date.now();
  Object.keys(cache).forEach((k) => {
    if (now - cache[k].ts <= RATING_TTL) ratings.set(k, cache[k].a);
  });
}
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const out = {};
    const now = Date.now();
    ratings.forEach((a, k) => {
      out[k] = { a, ts: now };
    });
    storage.set(K_RATINGS, out);
  }, 2000);
}

// concurrency-limited queue so a screenful of titles doesn't flood TMDB
const queue = [];
let running = 0;
function pump() {
  while (running < 4 && queue.length) {
    const job = queue.shift();
    running++;
    job().then(() => {
      running--;
      pump();
    });
  }
}

export function ensureRating(item, token) {
  loadCache();
  const k = keyOf(item);
  if (ratings.has(k)) return Promise.resolve(ratings.get(k));
  if (inflight.has(k)) return inflight.get(k);
  const p = new Promise((resolve) => {
    queue.push(async () => {
      const a = await fetchMinAge(item, token);
      if (a !== undefined) {
        ratings.set(k, a);
        scheduleFlush();
      }
      inflight.delete(k);
      notify();
      resolve(a === undefined ? null : a);
    });
    pump();
  });
  inflight.set(k, p);
  return p;
}

// ── decisions ────────────────────────────────────────────────────────────────
const unlocked = new Set(); // titles opened with the PIN this session
export const unlockTitle = (item) => unlocked.add(keyOf(item));

// sync: true = show, false = hide or still unknown
export function isAllowedNow(item) {
  const limit = getAgeLimit();
  if (limit === null) return true;
  loadCache();
  if (unlocked.has(keyOf(item))) return true;
  const a = ratings.get(keyOf(item));
  return a !== undefined && a !== null && a <= limit;
}

// async check for opening a title: { allowed, minAge }
export async function checkTitle(item, token) {
  const limit = getAgeLimit();
  if (limit === null || unlocked.has(keyOf(item))) return { allowed: true, minAge: null };
  if (item.adult) return { allowed: false, minAge: 18 };
  const a = await ensureRating(item, token);
  return { allowed: a !== null && a <= limit, minAge: a };
}

/**
 * Filters a list of titles by the age limit. While ratings are still loading,
 * unchecked titles are left out (so nothing inappropriate flashes up).
 * @returns {{ items: object[], pending: boolean }}
 */
export function useAllowed(items, token) {
  const [, bump] = useState(0);
  useEffect(() => onParentalChange(() => bump((n) => n + 1)), []);
  const limit = getAgeLimit();
  useEffect(() => {
    if (limit === null || !items) return;
    items.forEach((i) => {
      loadCache();
      if (!ratings.has(keyOf(i))) ensureRating(i, token);
    });
  }, [items, limit, token]);
  if (limit === null || !items) return { items: items || [], pending: false };
  loadCache();
  const shown = items.filter(isAllowedNow);
  const pending = items.some((i) => !ratings.has(keyOf(i)) && !unlocked.has(keyOf(i)));
  return { items: shown, pending };
}
