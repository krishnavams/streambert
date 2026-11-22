// HiAnime episode resolver, ported from the desktop app's main process
// (src/ipc/hianime.js) to plain browser fetch.
//
// On a Samsung TV the app's config.xml (<access origin="*">) lets these
// cross-origin requests through. In a normal desktop browser they are blocked
// by CORS, so the player falls back to an embed source there.
//
// Steps (same as ani-cli):
//   1. GET /search?keyword=…                     → show slug
//   2. GET /api/theme/episode/list/{numericId}   → episode ids
//   3. GET /api/theme/episode/servers?episodeId  → ZokoAnime embed (base64)
//   4. embed page ships window.__P = base64(json XOR "otaku-embed-v1")
//   5. json → master .m3u8 + default subtitle

const BASE_URL = "https://hianime.at";
const SERVER_NAME = "ZokoAnime";
const KEY = "otaku-embed-v1";
const TIMEOUT_MS = 12000;

async function get(url, { referer, accept } = {}) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const init = {
      headers: { Accept: accept || "*/*" },
      credentials: "omit",
      signal: ctrl ? ctrl.signal : undefined,
    };
    if (referer) {
      init.referrer = referer;
      init.referrerPolicy = "unsafe-url";
    }
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      // some engines reject a cross-origin `referrer` → retry without it
      if (!referer || (e && e.name === "AbortError")) throw e;
      delete init.referrer;
      delete init.referrerPolicy;
      res = await fetch(url, init);
    }
    const body = await res.text();
    if (/<title>\s*Just a moment/i.test(body)) {
      throw new Error("Blocked by Cloudflare (HiAnime)");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from HiAnime`);
    return body;
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("HiAnime timed out");
    if (e instanceof TypeError) throw new Error("HiAnime unreachable");
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function unwrapApiHtml(body) {
  let text = body;
  try {
    const parts = [];
    const walk = (v) => {
      if (typeof v === "string") parts.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.keys(v).forEach((k) => walk(v[k]));
    };
    walk(JSON.parse(body));
    if (parts.length) text = parts.join("\n");
  } catch {
    // raw HTML
  }
  return text.replace(/\\"/g, '"').replace(/\\\//g, "/").replace(/\\/g, "");
}

function getAttr(tagText, name) {
  const m = tagText.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function deobfuscate(blob) {
  const buf = base64ToBytes(blob);
  const key = new TextEncoder().encode(KEY);
  for (let i = 0; i < buf.length; i++) buf[i] ^= key[i % key.length];
  return new TextDecoder("utf-8").decode(buf);
}

const sanitizeTitle = (t) =>
  t.replace(/[''`´]/g, "").replace(/[:!.]/g, "").replace(/\s+/g, " ").trim();
const normalizeTitle = (t) =>
  String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function searchShows(query) {
  const q = encodeURIComponent(query).replace(/%20/g, "+");
  const html = await get(`${BASE_URL}/search?keyword=${q}`, { accept: "text/html" });
  const main = html.split('id="main-sidebar"')[0];
  const results = [];
  const re = /<h3 class="film-name">([\s\S]*?)<\/h3>/g;
  let m;
  while ((m = re.exec(main))) {
    const anchor = m[1].match(/<a\s+([^>]*)>/);
    if (!anchor) continue;
    const href = getAttr(anchor[1], "href");
    const title = getAttr(anchor[1], "title");
    if (!href || !title) continue;
    const id = href.split("?")[0].replace(/\/+$/, "").split("/").pop();
    if (!id) continue;
    const jname = getAttr(anchor[1], "data-jname");
    results.push({ id, title: decodeEntities(title), jname: jname ? decodeEntities(jname) : null });
  }
  return results;
}

const _episodeCache = new Map();
async function listEpisodes(showId) {
  const hit = _episodeCache.get(showId);
  if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return hit.episodes;
  const numericId = showId.slice(showId.lastIndexOf("-") + 1);
  if (!/^\d+$/.test(numericId)) throw new Error("Invalid show id");
  const html = unwrapApiHtml(
    await get(`${BASE_URL}/api/theme/episode/list/${numericId}`, { referer: BASE_URL + "/" }),
  );
  const episodes = [];
  for (const chunk of html.split("ep-item").slice(1)) {
    const number = getAttr(chunk, "data-number");
    const epId = getAttr(chunk, "data-id");
    if (!number || !epId || !/^\d+$/.test(epId)) continue;
    if (chunk.indexOf(`/watch/${showId}?ep=`) < 0) continue;
    episodes.push({ epId, number });
  }
  if (episodes.length) _episodeCache.set(showId, { ts: Date.now(), episodes });
  return episodes;
}

function findM3u8(v) {
  if (typeof v === "string") return /\.m3u8/i.test(v) ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = findM3u8(x);
      if (r) return r;
    }
  } else if (v && typeof v === "object") {
    if (typeof v.src === "string" && /\.m3u8/i.test(v.src)) return v.src;
    for (const k of Object.keys(v)) {
      const r = findM3u8(v[k]);
      if (r) return r;
    }
  }
  return null;
}

async function resolveStream(epId, mode) {
  const html = unwrapApiHtml(
    await get(`${BASE_URL}/api/theme/episode/servers?episodeId=${epId}`, {
      referer: BASE_URL + "/",
    }),
  );
  let hash = null;
  for (const chunk of html.split("server-item").slice(1)) {
    if (getAttr(chunk, "data-type") === mode && getAttr(chunk, "data-server-name") === SERVER_NAME) {
      hash = getAttr(chunk, "data-hash");
      if (hash) break;
    }
  }
  if (!hash) throw new Error(`No ${mode === "dub" ? "dubbed" : "subbed"} stream available`);

  const embedUrl = atob(hash).trim();
  if (!/^https?:\/\//i.test(embedUrl)) throw new Error("Invalid embed url");
  const referer = embedUrl.replace(/^(https?:\/\/[^/]*).*$/, "$1/");

  const embedHtml = await get(embedUrl);
  const blob = embedHtml.match(/window\.__P="([^"]*)"/);
  if (!blob) throw new Error("Embed config not found");
  const jsonText = deobfuscate(blob[1]);

  let masterUrl = null;
  let subtitle = null;
  try {
    const cfg = JSON.parse(jsonText);
    masterUrl = findM3u8(cfg);
    const subs = Array.isArray(cfg.subtitles) ? cfg.subtitles : [];
    const def = subs.find((s) => s && s.default) || null;
    subtitle = (def && def.src) || null;
  } catch {
    const m = jsonText.match(/"src":"([^"]*\.m3u8[^"]*)"/);
    masterUrl = m ? m[1] : null;
  }
  if (!masterUrl) throw new Error("No stream in embed config");
  return {
    url: masterUrl.replace(/\\\//g, "/"),
    subtitle: subtitle ? subtitle.replace(/\\\//g, "/") : null,
    referer,
  };
}

// AniList: S2+ of a show is its own HiAnime entry → find the sequel's title
async function anilistSeasonTitle(baseTitle, season) {
  const fallback = { title: baseTitle, romaji: null, episodes: null, nextTitle: null, nextRomaji: null };
  const query = `query($search:String){Media(search:$search,type:ANIME,sort:SEARCH_MATCH){title{english romaji}episodes relations{edges{relationType node{type format title{english romaji}episodes startDate{year}seasonYear}}}}}`;
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { search: baseTitle } }),
    });
    const media = (await res.json())?.data?.Media;
    if (!media) return fallback;
    const sequels = (media.relations?.edges || [])
      .filter(
        (e) =>
          e.relationType === "SEQUEL" &&
          e.node.type === "ANIME" &&
          (e.node.format === "TV" || e.node.format === "TV_SHORT"),
      )
      .sort(
        (a, b) =>
          (a.node.startDate?.year || a.node.seasonYear || 9999) -
          (b.node.startDate?.year || b.node.seasonYear || 9999),
      );
    const t = (n) => n.title?.english || n.title?.romaji || null;
    if (season <= 1) {
      const next = sequels[0]?.node || null;
      return {
        title: media.title?.english || baseTitle,
        romaji: media.title?.romaji || null,
        episodes: media.episodes || null,
        nextTitle: next ? t(next) : null,
        nextRomaji: next ? next.title?.romaji || null : null,
      };
    }
    const target = sequels[season - 2];
    if (!target) return { ...fallback, romaji: media.title?.romaji || null };
    const next = sequels[season - 1]?.node || null;
    return {
      title: t(target.node) || baseTitle,
      romaji: target.node.title?.romaji || media.title?.romaji || null,
      episodes: target.node.episodes || null,
      nextTitle: next ? t(next) : null,
      nextRomaji: next ? next.title?.romaji || null : null,
    };
  } catch {
    return fallback;
  }
}

const _showCache = new Map();
async function findShow(candidates) {
  const seen = new Set();
  const unique = candidates.filter((c) => {
    const n = normalizeTitle(c);
    if (!n || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  const cacheKey = Array.from(seen).join("|");
  if (_showCache.has(cacheKey)) return _showCache.get(cacheKey);

  let fallback = null;
  for (const candidate of unique) {
    let results;
    try {
      results = await searchShows(candidate);
    } catch (e) {
      if (/Cloudflare|unreachable/i.test(e.message)) throw e;
      continue;
    }
    if (!results.length) continue;
    const exact = results.find(
      (r) => seen.has(normalizeTitle(r.title)) || (r.jname && seen.has(normalizeTitle(r.jname))),
    );
    if (exact) {
      _showCache.set(cacheKey, exact);
      return exact;
    }
    if (!fallback) fallback = results[0];
  }
  if (fallback) _showCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Resolve a playable HLS stream for an anime episode.
 * @param {{title: string, isMovie: boolean, season?: number, episode?: number, mode?: "sub"|"dub"}} args
 * @param {(stage: string) => void} [onStage]
 * @returns {Promise<{url: string, subtitle: string|null, referer: string, matchedTitle: string}>}
 */
export async function resolveHiAnime(args, onStage = () => {}) {
  const { title, isMovie } = args;
  const season = args.season || 1;
  const episode = args.episode || 1;
  const mode = args.mode === "dub" ? "dub" : "sub";

  onStage("Searching HiAnime…");
  const al = isMovie
    ? { title, romaji: null, episodes: null, nextTitle: null, nextRomaji: null }
    : await anilistSeasonTitle(title, season);

  let searchTitle = al.title;
  let wanted = episode;
  if (!isMovie && al.episodes && episode > al.episodes && al.nextTitle) {
    wanted = episode - al.episodes;
    searchTitle = al.nextTitle;
  }

  const candidates = [
    searchTitle,
    sanitizeTitle(searchTitle),
    searchTitle === al.title ? al.romaji : null,
    searchTitle === al.nextTitle ? al.nextRomaji : null,
    title,
    sanitizeTitle(title),
  ].filter(Boolean);

  const show = await findShow(candidates);
  if (!show) throw new Error(`Not found on HiAnime: ${searchTitle}`);

  onStage("Loading episodes…");
  const episodes = await listEpisodes(show.id);
  if (!episodes.length) throw new Error(`No episodes for ${show.title}`);
  const wantedNumber = isMovie ? "1" : String(wanted);
  const ep =
    episodes.find((e) => e.number === wantedNumber) ||
    episodes.find((e) => parseFloat(e.number) === Number(wantedNumber)) ||
    (isMovie ? episodes[0] : null);
  if (!ep) throw new Error(`Episode ${wantedNumber} not found`);

  onStage("Starting stream…");
  const stream = await resolveStream(ep.epId, mode);
  return { ...stream, matchedTitle: show.title };
}
