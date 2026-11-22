# Streambert for Samsung TV (Tizen)

A remote-friendly version of Streambert that runs as an app on Samsung Smart TVs
(Tizen 4.0+, i.e. 2018 models and newer). It shares the desktop app's TMDB,
AniList and player-source code (`src/utils/api.js`) and adds a 10-foot UI made
for the TV remote.

## What it can do

| Feature | TV app |
|---|---|
| Home rows (trending, popular, top rated, anime, in cinemas) that keep loading as you scroll right | ✅ |
| "Movies by genre" and "Movies by language" shortcuts on Home | ✅ |
| "Top picks for you" and "Because you watched …" rows built from your watch history (TMDB recommendations; the history stays on the TV) | ✅ |
| Browse the whole catalog: Movies / Series / Anime × genre × year or decade × original language × sort (popular, top rated, newest, most voted), endless grid | ✅ |
| Search with an on-screen keyboard, endless results | ✅ |
| Subtitle language for embedded players that support it (VidSrc, Vidfast, Vidrift), in Settings or the player | ✅ |
| Movie / series pages, seasons & episodes, recommendations | ✅ |
| My List, recently watched, resume positions | ✅ (stored on the TV) |
| Anime via HiAnime, ad-free in the app's own player (sub/dub, subtitles, auto next episode) | ✅ |
| Movies & series via embed sources (Vidrift, VidSrc, Vidfast, …) | ⚠️ shows the hoster's player **and its ads** – the desktop app's ad blocker can't run on a TV |
| Downloads, subtitle downloads, Discord, auto-update, PiP | ❌ desktop only |

### Remote control

| Key | Browsing | HiAnime player | Embed player |
|---|---|---|---|
| ◀ ▲ ▶ ▼ | move focus | controls hidden: ◀ ▶ seek 10 s, ▲ ▼ show controls | show controls / move between buttons |
| OK | select | play / pause | select |
| Back | go back (exit prompt on Home) | hide controls, then leave | leave player |
| ⏯ / ▶ / ⏸ | – | play / pause | lend remote to the embedded player |
| ⏩ / ⏪ | – | seek ±30 s | – |
| ⏭ / Channel ▲ | – | next episode | next episode |

**Embedded players and the remote:** an embedded player is a web page from
another site. While it has focus, the TV sends every key to it, including Back.
"Control player" (or ⏯) hands the remote to the embedded player for 15 seconds
so you can press play, pause or seek. After that the app takes the remote back
so Back keeps working.

## Build & install on your TV

You need a computer on the same network as the TV, Node.js ≥ 22.12 and
[Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
with the CLI.

1. **Tizen Studio:** open *Package Manager* and install *Tizen SDK tools*.
   Under *Extension SDK* install *Samsung TV Extensions* and *Samsung Certificate Extension*.
   Add `~/tizen-studio/tools` and `~/tizen-studio/tools/ide/bin` to your `PATH`
   (they provide `sdb` and `tizen`).
2. **Developer mode on the TV:** open *Apps*, type `1 2 3 4 5` on the remote,
   switch *Developer mode* on, enter your computer's IP address, then restart the TV.
3. **Connect:** `sdb connect <TV-IP>`, then check with `sdb devices`.
4. **Certificate:** in Tizen Studio's *Certificate Manager*, create a **Samsung**
   certificate profile named `streambert` (type *TV*). Sign in with a free Samsung account.
   When asked for device IDs, pick the connected TV. The profile is tied to that TV.
5. **TMDB token (recommended):** `cp tizen/.env.example tizen/.env` and paste your
   [TMDB Read Access Token](../tmdb-tutorial.md). Otherwise you'll have to type it with the remote.
6. **Build, sign and install:**
   ```bash
   npm install
   npm run tv:package   # builds tizen/dist and signs tizen/dist/Streambert.wgt
   npm run tv:install   # installs it on the connected TV
   ```
   Streambert then shows up in the TV's app list.

Developer-mode installs are tied to your certificate. When the certificate
expires, create a new one and reinstall. Streambert isn't in Samsung's app store.

## Development

```bash
npm run tv:dev     # http://localhost:5174, arrows / Enter / Esc stand in for the remote
npm run tv:build   # production build into tizen/dist
```

In a normal browser, CORS blocks the HiAnime requests, so anime falls back to an
embed source there. On the TV, `config.xml` (`<access origin="*">`) allows them.
The app also runs in Chrome's device emulation at 1920×1080.

## Compatibility notes

- 2018 TVs ship Chromium 56: the bundle is a classic (non-module) script built
  for `chrome56`. `src/polyfills.js` adds the missing built-ins. The CSS avoids
  grid, flexbox `gap`, `inset`, `aspect-ratio` and `:focus-within`.
- HiAnime's stream host sometimes checks the `Referer` header. The desktop app
  sets it through a local proxy, but a TV web app can't. If anime streams fail
  on your TV, pick another source (the player falls back to Vidnest
  automatically when HiAnime can't be reached).

## Layout

```
tizen/
  config.xml          Tizen manifest (version filled in from package.json)
  vite.config.js      chrome56 IIFE build, emits config.xml + icon.png
  src/
    App.jsx           screen stack, global remote-key handling, exit prompt
    platform.js       Tizen key registration, key mapping, app exit
    nav/spatial.js    spatial focus navigation (rows, sidebar, modals)
    nav/useKeys.js    per-screen key handlers
    lib/              TMDB, HiAnime (browser port), sources, library storage,
                      usePaged (endless lists)
    screens/          Home, Search, Browse, Details, Player, Library, Settings, Setup
```
