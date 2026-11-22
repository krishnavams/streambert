// Player source selection for the TV app, built on the desktop app's
// PLAYER_SOURCES list so new sources show up here automatically.

import {
  PLAYER_SOURCES,
  getSourceUrl,
  sourceIdType,
  sourceIsMovieOnly,
  fetchImdbId,
  fetchKinopoiskId,
  ANIME_DEFAULT_SOURCE,
  NON_ANIME_DEFAULT_SOURCE,
} from "@shared/api";
import { storage } from "@shared/storage";

const K_SOURCE = "tv_source";
const K_ANIME_SOURCE = "tv_animeSource";
const K_DUB = "hianimeDubMode";

export const HIANIME = "hianime";

// Sources usable for a title. HiAnime (anime-only, resolved in-app) is offered
// only for anime; every embed source works for both.
export function sourcesFor(item) {
  return PLAYER_SOURCES.filter((s) => {
    if (s.id === HIANIME) return !!item.anime;
    if (s.tag) return false; // other anime-only scrapers need the desktop app
    if (item.type === "tv" && sourceIsMovieOnly(s.id)) return false;
    return true;
  }).map((s) => ({ id: s.id, label: s.label }));
}

export function preferredSource(item) {
  const key = item.anime ? K_ANIME_SOURCE : K_SOURCE;
  const fallback = item.anime ? ANIME_DEFAULT_SOURCE : NON_ANIME_DEFAULT_SOURCE;
  const saved = storage.get(key) || fallback;
  const list = sourcesFor(item);
  return list.some((s) => s.id === saved) ? saved : list[0]?.id;
}

export function setPreferredSource(item, id) {
  storage.set(item.anime ? K_ANIME_SOURCE : K_SOURCE, id);
}

export const getDefaultSource = (anime) =>
  storage.get(anime ? K_ANIME_SOURCE : K_SOURCE) ||
  (anime ? ANIME_DEFAULT_SOURCE : NON_ANIME_DEFAULT_SOURCE);
export const setDefaultSource = (anime, id) =>
  storage.set(anime ? K_ANIME_SOURCE : K_SOURCE, id);

export const getDubMode = () => (storage.get(K_DUB) === "dub" ? "dub" : "sub");
export const setDubMode = (m) => storage.set(K_DUB, m === "dub" ? "dub" : "sub");

export const sourceLabel = (id) =>
  PLAYER_SOURCES.find((s) => s.id === id)?.label || id;

// Embed URL for a TMDB title, resolving IMDb/Kinopoisk ids when a source needs them.
export async function embedUrl(sourceId, item, season, episode, token) {
  let id = item.id;
  const idType = sourceIdType(sourceId);
  if (idType === "imdb") id = await fetchImdbId(item.type, item.id, token);
  else if (idType === "kinopoisk") id = await fetchKinopoiskId(item.type, item.id, token);
  const url = getSourceUrl(sourceId, item.type, id, season, episode, {}, "#e50914", null);
  if (!url) throw new Error(`${sourceLabel(sourceId)} can't play this title`);
  return url;
}

// Fallback embed when HiAnime can't be reached
export function fallbackEmbedSource(item) {
  const list = sourcesFor(item).filter((s) => s.id !== HIANIME);
  const nest = list.find((s) => s.id === "vidnest");
  return (nest || list[0])?.id;
}
