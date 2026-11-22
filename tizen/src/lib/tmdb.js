// TMDB helpers for the TV app, on top of the desktop app's shared tmdbFetch
// (request queue, in-memory cache, language setting).

import { tmdbFetch, imgUrl, isAnimeContent } from "@shared/api";
import { storage, STORAGE_KEYS } from "@shared/storage";

// A token can be baked in at build time (VITE_TMDB_TOKEN in tizen/.env), so
// nobody has to type a 200-character token with a TV remote.
const BUILD_TOKEN = (import.meta.env.VITE_TMDB_TOKEN || "").trim();

export function getToken() {
  return storage.get(STORAGE_KEYS.API_KEY) || BUILD_TOKEN || null;
}
export function setToken(token) {
  storage.set(STORAGE_KEYS.API_KEY, token);
}
export const hasBuildToken = () => !!BUILD_TOKEN;

export { imgUrl };

// Normalize a TMDB movie/tv object into the shape the UI uses
export function normalize(raw, forcedType) {
  if (!raw) return null;
  const type = forcedType || raw.media_type || (raw.first_air_date !== undefined || raw.name ? "tv" : "movie");
  if (type !== "movie" && type !== "tv") return null;
  const date = raw.release_date || raw.first_air_date || "";
  return {
    id: raw.id,
    type,
    title: raw.title || raw.name || raw.original_title || raw.original_name || "",
    overview: raw.overview || "",
    poster_path: raw.poster_path || null,
    backdrop_path: raw.backdrop_path || null,
    year: date ? date.slice(0, 4) : null,
    rating: raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : null,
    anime: isAnimeContent(raw),
  };
}

const list = (data, type) =>
  (data?.results || []).map((r) => normalize(r, type)).filter(Boolean);

export async function fetchHomeRows(token) {
  const defs = [
    { id: "trending", title: "Trending this week", path: "/trending/all/week" },
    { id: "popMovies", title: "Popular movies", path: "/movie/popular", type: "movie" },
    { id: "popTv", title: "Popular TV series", path: "/tv/popular", type: "tv" },
    {
      id: "anime",
      title: "Anime",
      path: "/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc",
      type: "tv",
    },
    { id: "topMovies", title: "Top rated movies", path: "/movie/top_rated", type: "movie" },
    { id: "topTv", title: "Top rated TV series", path: "/tv/top_rated", type: "tv" },
    { id: "nowPlaying", title: "In cinemas", path: "/movie/now_playing", type: "movie" },
  ];
  const results = await Promise.all(
    defs.map((d) =>
      tmdbFetch(d.path, token)
        .then((data) => ({ ...d, items: list(data, d.type) }))
        .catch(() => ({ ...d, items: [] })),
    ),
  );
  return results.filter((r) => r.items.length);
}

export async function search(query, token) {
  const data = await tmdbFetch(
    `/search/multi?query=${encodeURIComponent(query)}&include_adult=false`,
    token,
  );
  return list(data).filter((i) => i.poster_path || i.backdrop_path);
}

export async function fetchDetails(type, id, token) {
  const data = await tmdbFetch(`/${type}/${id}?append_to_response=recommendations`, token);
  const base = normalize(data, type);
  return {
    ...base,
    genres: (data.genres || []).map((g) => g.name),
    runtime: data.runtime || (data.episode_run_time || [])[0] || null,
    tagline: data.tagline || "",
    seasons: (data.seasons || [])
      .filter((s) => s.season_number > 0 && s.episode_count > 0)
      .map((s) => ({ number: s.season_number, name: s.name, episodes: s.episode_count })),
    recommendations: list(data.recommendations).slice(0, 20),
    anime: isAnimeContent(data, data),
  };
}

export async function fetchSeason(tvId, season, token) {
  const data = await tmdbFetch(`/tv/${tvId}/season/${season}`, token);
  return (data.episodes || []).map((e) => ({
    number: e.episode_number,
    name: e.name || `Episode ${e.episode_number}`,
    overview: e.overview || "",
    still_path: e.still_path || null,
    runtime: e.runtime || null,
    airDate: e.air_date || null,
  }));
}

export async function validateToken(token) {
  try {
    await tmdbFetch("/configuration", token);
    return true;
  } catch {
    return false;
  }
}
