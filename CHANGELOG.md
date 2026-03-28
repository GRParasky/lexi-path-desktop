# Changelog

All notable changes to LexiPath Desktop are documented here.

---

## [1.0.4] — 2026-03-28

### Fixed
- Learning paths (and all other API calls) would silently fail after the JWT access token expired (60-minute lifetime). The axios response interceptor now re-authenticates transparently on 401: it calls `GET /api/auth/auto-login/`, stores the fresh token pair, and retries the original request — the user never sees an error or loses their work in progress.

### Technical notes
- The retry uses bare `axios` (not the `client` instance) to call `auto-login`, ensuring the interceptor does not trigger itself recursively
- A `_retry` flag on the original request config prevents infinite loops if `auto-login` itself returns an unexpected error
- Covers all expiry scenarios: token expiring mid-session and stale tokens on app re-open (e.g. using the app again after more than an hour)

---

## [1.0.3] — 2026-03-28

### Added
- Full internationalisation (i18n) support — the app is now fully translated into 6 languages: English (default), Brazilian Portuguese, Spanish, German, Italian, and French
- Language selector in the top-right corner of the dashboard — persists the chosen language across sessions via `localStorage`
- ~96 user-facing strings translated across all pages and components: Dashboard, Path, Shared Path, Video Card, and Progress Bar

### Technical notes
- Library: `react-i18next` + `i18next`
- Translation files live in `frontend/src/locales/{en,pt-BR,es,de,it,fr}.json`
- Shared strings (cancel, delete, clone dialog) live under a `common` namespace to avoid duplication between components
- Pluralization uses i18next `_one`/`_other` keys backed by `Intl.PluralRules` — each language gets correct pluralization automatically
- The delete dialog description uses the `Trans` component to safely interpolate a `<strong>` tag around the path title without `dangerouslySetInnerHTML`
- i18n initialises in `main.jsx` before any component renders, ensuring the first paint already uses the correct language

---

## [1.0.2] — 2026-03-28

### Changed
- `yt-dlp` bumped from `2025.3.31` to `2026.3.17` — YouTube regularly changes its format; older versions break silently

### Performance
- `electron/package.json`: `"compression": "maximum"` — electron-builder now uses LZMA/xz maximum compression on all targets, reducing installer size
- `backend/lexi-path-server.spec`: added safe stdlib excludes (`ftplib`, `imaplib`, `poplib`, `telnetlib`, `xmlrpc`, `pdb`, `lib2to3`, `doctest`) — unused modules removed from the PyInstaller bundle
- UPX compression enabled on Linux builds only — UPX corrupts macOS arm64 binaries and triggers Windows Defender false positives on Windows; Linux is unaffected by either issue

---

## [1.0.1] — 2026-03-27

### Fixed
- Videos left in `downloading` state when the app was closed mid-download would stay stuck forever on next launch. On startup, `run_server.py` now resets all `downloading` items to `error` after migrations run — the Retry button in the UI handles re-downloading from scratch

### Added
- GitHub Actions CI pipeline (`.github/workflows/build.yml`) — triggers on version tag push (`v*`); builds on `windows-latest`, `macos-latest`, and `ubuntu-latest` in parallel; uploads installers to GitHub Releases automatically
- `finalize` CI job runs after all three builds succeed — sets a user-friendly release description with a per-platform download table and publishes the draft automatically
- `electron-updater` integration — on every launch the app silently checks GitHub Releases for a newer version
  - Windows / Linux: downloads the update in the background and prompts the user to restart
  - macOS: shows a dialog with a direct link to the GitHub Releases page (auto-install requires code signing, which is not yet set up)
- `GH_TOKEN` fine-grained secret (Contents: Read/Write on this repo) used by CI to publish releases — no broader repository access required

### Technical notes
- `SECRET_KEY` env var must be set for both the `collectstatic` and `PyInstaller` steps in CI — PyInstaller's Django hook runs `django.setup()` during analysis, which reads `settings.py` and triggers `python-decouple` to look for the key
- Version is passed to electron-builder via `--config.extraMetadata.version=${GITHUB_REF_NAME#v}` — the git tag is the single source of truth; `package.json` version never needs to be bumped manually
- `fail-fast: false` on the build matrix — all three OS jobs complete even if one fails

---

## [1.0.0] — 2026-03-27

First release of the desktop app. Forked from the LexiPath web version and adapted to run entirely locally — no server, no account, no internet required after install.

### Added

#### Desktop shell
- Electron wrapper that spawns the Django backend on startup and opens the app window
- Splash screen shown while Django initialises (avoids blank window during 1–3s startup)
- External links open in the system browser instead of a new Electron window
- Backend process is killed cleanly when the app closes (frees port 8765)
- Packaged with electron-builder: `.exe` (Windows NSIS), `.dmg` (macOS), `.AppImage` (Linux)

#### Backend
- `run_server.py` — desktop entry point; creates the user data directory, generates a persistent `SECRET_KEY` on first run, runs migrations, starts Waitress on port 8765
- Waitress replaces gunicorn as the WSGI server (cross-platform; gunicorn does not work on Windows)
- WhiteNoise serves the built React SPA directly from Django — no separate frontend server needed
- SQLite database stored in the OS user data directory (survives app updates)
- PyInstaller spec bundles the entire Python/Django stack into a standalone binary (one-dir mode)

#### Offline video playback
- Download any YouTube video in a learning path for offline playback via yt-dlp
- Download progress shown as a percentage in the theater modal, updated every 2 seconds
- Progress tracking uses fragment-based counting (`fragment_index / fragment_count`), which works correctly for YouTube DASH streams that don't report `Content-Length`
- Downloaded videos are streamed from Django with HTTP Range request support, enabling seeking in the browser's native `<video>` element
- Short-lived UUID token system authenticates video stream requests (browser's native `<video>` cannot send `Authorization` headers)
- Videos are stored in `{data_dir}/videos/` — not next to the binary, so they survive app updates
- Offline badge on card thumbnails; four-state UI in theater footer: idle / downloading+% / done+Remove / error+Retry
- Video format: `bestvideo+bestaudio/best` with no extension restriction; actual extension is read from yt-dlp after download and stored, so the correct MIME type is served regardless of format

#### Auto-login
- No login or registration screen — the app creates a single local user on first launch and signs in automatically
- `GET /api/auth/auto-login/` endpoint gets or creates the desktop user and returns a JWT token pair without requiring a password
- Session is restored transparently on subsequent launches from localStorage; auto-login is called again if the token has expired
- App renders a blank frame during the ~100ms session establishment to prevent any flash of unauthenticated content

#### Build pipeline
- `scripts/build.sh` (Mac/Linux) and `scripts/build.bat` (Windows) run the full 5-step build in the correct order: frontend → collectstatic → PyInstaller → Electron install → electron-builder
- Scripts abort on any failure and clean previous build artifacts before PyInstaller runs

### Technical notes
- `STATIC_URL = 'static/'` with Vite `base: '/static/'` for production builds — ensures WhiteNoise serves assets at the paths Vite generates in `index.html`; `STATIC_URL = '/'` is rejected by Django 5 due to `MEDIA_URL` normalisation
- `unittest` is kept in the PyInstaller bundle — `rest_framework_simplejwt` imports `django.test` at startup, which chains into `unittest`; excluding it causes a crash at launch
- Port 8765 chosen to avoid conflict with Django's default dev server on 8000
