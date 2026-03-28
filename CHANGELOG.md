# Changelog

All notable changes to LexiPath Desktop are documented here.

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
