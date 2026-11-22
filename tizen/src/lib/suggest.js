// Personal suggestions from the watch history kept on the TV.
//
// "Because you watched X": TMDB's recommendations for a recently watched
// title (falling back to "similar" when TMDB has no recommendations).
// "Top picks for you": the recommendations of several recent titles merged,
// ranked by how many of them suggest a title and how high up.
//
// Only the TMDB ids of watched titles are used in the requests; the history
// itself never leaves the TV.

import { fetchPage } from "./tmdb";
import { getHistory, mediaKey } from "./library";

const BECAUSE_ROWS = 3; // "Because you watched" rows on Home
const PICK_SOURCES = 6; // history titles mixed into "Top picks"
const ROW_SIZE = 20;

const _recCache = new Map(); // "movie:1" -> Promise<items>

function recommendationsFor(item, token) {
  const key = mediaKey(item);
  if (!_recCache.has(key)) {
    const p = fetchPage(`/${item.type}/${item.id}/recommendations`, 1, token, item.type)
      .then((r) =>
        r.items.length
          ? r.items
          : fetchPage(`/${item.type}/${item.id}/similar`, 1, token, item.type).then((s) => s.items),
      )
      .catch(() => {
        _recCache.delete(key);
        return [];
      });
    _recCache.set(key, p);
  }
  return _recCache.get(key);
}

/**
 * Build suggestion rows from the watch history.
 * @returns {Promise<{ topPicks: object[], because: {title: string, source: object, items: object[]}[] }>}
 */
export async function buildSuggestions(token) {
  const history = getHistory();
  if (!history.length) return { topPicks: [], because: [] };

  const watched = new Set(history.map(mediaKey));
  const sources = history.slice(0, Math.max(BECAUSE_ROWS, PICK_SOURCES));
  const lists = await Promise.all(sources.map((h) => recommendationsFor(h, token)));
  const unseen = (items) => items.filter((i) => !watched.has(mediaKey(i)) && (i.poster_path || i.backdrop_path));

  // one row per recent title; skip titles that would repeat a row
  const because = [];
  const shownFirst = new Set();
  for (let i = 0; i < sources.length && because.length < BECAUSE_ROWS; i++) {
    const items = unseen(lists[i]).slice(0, ROW_SIZE);
    if (items.length < 4) continue;
    const lead = mediaKey(items[0]);
    if (shownFirst.has(lead)) continue;
    shownFirst.add(lead);
    because.push({ title: `Because you watched ${sources[i].title}`, source: sources[i], items });
  }

  // top picks: score = sum over lists of (1 / (rank + 3)), recent titles weigh more
  let topPicks = [];
  if (sources.length >= 2) {
    const scores = new Map();
    lists.slice(0, PICK_SOURCES).forEach((items, li) => {
      const recency = 1 - li * 0.08;
      unseen(items).forEach((item, rank) => {
        const k = mediaKey(item);
        const prev = scores.get(k) || { item, score: 0, hits: 0 };
        prev.score += recency / (rank + 3);
        prev.hits += 1;
        scores.set(k, prev);
      });
    });
    topPicks = Array.from(scores.values())
      .filter((s) => s.hits >= 2 || scores.size < 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, ROW_SIZE)
      .map((s) => s.item);
    if (topPicks.length < 6) topPicks = [];
  }

  return { topPicks, because };
}
