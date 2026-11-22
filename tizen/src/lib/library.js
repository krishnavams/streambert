// Watch history, resume positions and "My List" for the TV app.
// Kept in localStorage under the shared "streambert_" prefix, with tv-only keys
// so it never clashes with the desktop app's data format.

import { storage } from "@shared/storage";

const K_LIST = "tv_myList";
const K_HISTORY = "tv_history";
const K_PROGRESS = "tv_progress";
const MAX_HISTORY = 60;
const MAX_PROGRESS = 400;

// Minimal media snapshot stored with list/history entries
export function snapshot(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    poster_path: item.poster_path || null,
    backdrop_path: item.backdrop_path || null,
    year: item.year || null,
    anime: !!item.anime,
  };
}

export const mediaKey = (item) => `${item.type}:${item.id}`;
export const progressKey = (item, season, episode) =>
  item.type === "movie"
    ? `movie:${item.id}`
    : `tv:${item.id}:${season}:${episode}`;

// ── My List ──────────────────────────────────────────────────────────────────
export function getMyList() {
  return storage.get(K_LIST) || [];
}
export function isInMyList(item) {
  const k = mediaKey(item);
  return getMyList().some((m) => mediaKey(m) === k);
}
export function toggleMyList(item) {
  const k = mediaKey(item);
  const list = getMyList();
  const exists = list.some((m) => mediaKey(m) === k);
  const next = exists
    ? list.filter((m) => mediaKey(m) !== k)
    : [snapshot(item), ...list];
  storage.set(K_LIST, next);
  return !exists;
}

// ── History (one entry per title, most recent first) ─────────────────────────
export function getHistory() {
  return storage.get(K_HISTORY) || [];
}
export function recordWatch(item, season, episode) {
  const k = mediaKey(item);
  const entry = {
    ...snapshot(item),
    season: season || null,
    episode: episode || null,
    ts: Date.now(),
  };
  const next = [entry, ...getHistory().filter((m) => mediaKey(m) !== k)];
  storage.set(K_HISTORY, next.slice(0, MAX_HISTORY));
}
export function removeFromHistory(item) {
  const k = mediaKey(item);
  storage.set(
    K_HISTORY,
    getHistory().filter((m) => mediaKey(m) !== k),
  );
}
export function clearHistory() {
  storage.remove(K_HISTORY);
  storage.remove(K_PROGRESS);
}

// ── Resume positions ─────────────────────────────────────────────────────────
let _progress = null;
let _flushTimer = null;

function progressMap() {
  if (!_progress) _progress = storage.get(K_PROGRESS) || {};
  return _progress;
}

export function getProgress(item, season, episode) {
  return progressMap()[progressKey(item, season, episode)] || null;
}

export function saveProgress(item, season, episode, time, duration) {
  if (!(duration > 0) || !(time >= 0)) return;
  const map = progressMap();
  map[progressKey(item, season, episode)] = {
    t: Math.floor(time),
    d: Math.floor(duration),
    ts: Date.now(),
  };
  const keys = Object.keys(map);
  if (keys.length > MAX_PROGRESS) {
    keys
      .sort((a, b) => map[a].ts - map[b].ts)
      .slice(0, keys.length - MAX_PROGRESS)
      .forEach((k) => delete map[k]);
  }
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => storage.set(K_PROGRESS, map), 400);
}

// 0..1, or 0 when unknown
export function progressFraction(p) {
  return p && p.d ? Math.min(1, p.t / p.d) : 0;
}

// Resume time in seconds, ignoring the first and last minute or so
export function resumeTime(p) {
  if (!p || !p.d) return 0;
  if (p.t < 30 || p.t > p.d - 90) return 0;
  return p.t;
}
