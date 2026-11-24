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
    adult: !!raw.adult,
  };
}

// Adult-flagged titles are dropped from every list, whatever endpoint it came from.
const list = (data, type) =>
  (data?.results || []).map((r) => normalize(r, type)).filter((i) => i && !i.adult);

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
      fetchPage(d.path, 1, token, d.type)
        .then((r) => ({ ...d, items: r.items, totalPages: r.totalPages }))
        .catch(() => ({ ...d, items: [], totalPages: 0 })),
    ),
  );
  return results.filter((r) => r.items.length);
}

// One page of a TMDB list endpoint → { items, totalPages }
// (TMDB never serves more than 500 pages)
export async function fetchPage(path, page, token, type) {
  const sep = path.includes("?") ? "&" : "?";
  const data = await tmdbFetch(`${path}${sep}page=${page}`, token);
  return {
    items: list(data, type),
    totalPages: Math.min(data?.total_pages || 1, 500),
  };
}

export async function search(query, token, page = 1) {
  const r = await fetchPage(
    `/search/multi?query=${encodeURIComponent(query)}&include_adult=false`,
    page,
    token,
  );
  return { ...r, items: r.items.filter((i) => i.poster_path || i.backdrop_path) };
}

// ── Browse (discover) ─────────────────────────────────────────────────────────

export const BROWSE_KINDS = [
  { id: "movie", label: "Movies" },
  { id: "tv", label: "Series" },
  { id: "anime", label: "Anime" },
];

export const BROWSE_SORTS = [
  { id: "popular", label: "Most popular" },
  { id: "rated", label: "Top rated" },
  { id: "newest", label: "Newest" },
  { id: "votes", label: "Most voted" },
];

export const BROWSE_LANGUAGES = [
  { id: "", label: "Any language" },
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "te", label: "Telugu" },
  { id: "ta", label: "Tamil" },
  { id: "ml", label: "Malayalam" },
  { id: "kn", label: "Kannada" },
  { id: "ko", label: "Korean" },
  { id: "ja", label: "Japanese" },
  { id: "zh", label: "Chinese" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "it", label: "Italian" },
  { id: "tr", label: "Turkish" },
  { id: "pt", label: "Portuguese" },
];

// Years: "any", the last few single years, then whole decades
export function browseYears() {
  const now = new Date().getFullYear();
  const out = [{ id: "", label: "Any year" }];
  for (let y = now; y > now - 5; y--) out.push({ id: String(y), label: String(y), from: y, to: y });
  for (let d = Math.floor(now / 10) * 10; d >= 1950; d -= 10) {
    out.push({ id: `${d}s`, label: `${d}s`, from: d, to: Math.min(d + 9, now) });
  }
  out.push({ id: "older", label: "Before 1950", from: 1870, to: 1949 });
  return out;
}

const _genreCache = {};
// Genres for a browse kind, in the current metadata language
export async function fetchGenres(kind, token) {
  const type = kind === "movie" ? "movie" : "tv";
  if (!_genreCache[type]) {
    _genreCache[type] = tmdbFetch(`/genre/${type}/list`, token)
      .then((d) => (d.genres || []).map((g) => ({ id: String(g.id), label: g.name })))
      .catch((e) => {
        delete _genreCache[type];
        throw e;
      });
  }
  const genres = await _genreCache[type];
  // anime is always animation, so don't offer it as a filter there
  return kind === "anime" ? genres.filter((g) => g.id !== "16") : genres;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Build a /discover path from browse filters.
 * @param {{kind: "movie"|"tv"|"anime", genre?: string, year?: string, language?: string, sort?: string}} f
 */
export function discoverPath(f) {
  const kind = f.kind || "movie";
  // anime: Japanese animated series (movies are found via kind "movie" + Animation)
  const type = kind === "movie" ? "movie" : "tv";
  const dateField = type === "movie" ? "primary_release_date" : "first_air_date";
  const q = ["include_adult=false"];

  const genres = [];
  if (kind === "anime") genres.push("16");
  if (f.genre) genres.push(f.genre);
  if (genres.length) q.push(`with_genres=${genres.join(",")}`);

  const lang = kind === "anime" ? "ja" : f.language;
  if (lang) q.push(`with_original_language=${lang}`);

  const year = browseYears().find((y) => y.id === f.year);
  let gte = year && year.from ? `${year.from}-01-01` : null;
  let lte = year && year.from ? `${year.to}-12-31` : null;
  // "Newest" must not list announced-but-unreleased titles
  if (f.sort === "newest" && (!lte || lte > today())) lte = today();
  if (gte) q.push(`${dateField}.gte=${gte}`);
  if (lte) q.push(`${dateField}.lte=${lte}`);

  switch (f.sort) {
    case "rated":
      q.push("sort_by=vote_average.desc", "vote_count.gte=200");
      break;
    case "newest":
      q.push(`sort_by=${dateField}.desc`, "vote_count.gte=5");
      break;
    case "votes":
      q.push("sort_by=vote_count.desc");
      break;
    default:
      q.push("sort_by=popularity.desc");
  }
  return { path: `/discover/${type}?${q.join("&")}`, type };
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
