# Changelog

All notable changes to LexiPath Desktop are documented here.

---

## [1.1.1] — 2026-03-29

### Fixed
- **SSL certificate errors in the packaged app** — all HTTPS connections (yt-dlp stream extraction, downloads) failed with `CERTIFICATE_VERIFY_FAILED` inside the PyInstaller bundle. The bundled Python interpreter has no access to system CA certificates. Fixed by adding `certifi` as a dependency and pointing Python's SSL stack to its bundled `cacert.pem` at startup, before any network code runs.

### Technical notes
- `backend/requirements.txt`: added `certifi`
- `backend/run_server.py`: added `_configure_ssl()` — called as the first thing in `main()`, sets `SSL_CERT_FILE` and `REQUESTS_CA_BUNDLE` to `certifi.where()`; uses `setdefault` so it is a no-op in dev mode where the OS already provides certificates
- `backend/lexi-path-server.spec`: added `collect_data_files('certifi')` so the `cacert.pem` bundle is included in the PyInstaller output directory; without this `certifi.where()` would point to a path that does not exist inside the frozen binary

---

## [1.1.0] — 2026-03-29

### Added

#### In-app video streaming
- **Non-downloaded videos now stream directly inside the app** — opening theater mode on a video that hasn't been downloaded no longer shows a static fallback immediately. The player attempts to stream the video in-app first via a yt-dlp proxy; the "Download & Watch" / "Watch on YouTube" options only appear if streaming genuinely fails.
- **DASH video streaming via ffmpeg** — YouTube increasingly serves videos as separate video-only and audio-only DASH streams rather than a single combined file. When a video has no combined format, the backend now invokes ffmpeg to merge the two streams on-the-fly and pipe a fragmented MP4 directly to the browser's `<video>` element. Videos that previously hard-failed now play in-app without downloading. Note: because the output is a live pipe, seeking (scrubbing the progress bar) is not supported for this mode — the video plays from start to end.
- **"Connecting to video…" loading state** — instead of a blank black rectangle while yt-dlp extracts the stream URL (which can take several seconds), the player now shows a spinner with a localized "Connecting to video…" label.

#### Download failure reasons
- **Specific error messages when a download fails** — instead of a generic "Download failed" message, the user now sees a short explanation of why the download could not complete. Reasons covered: bot detection by YouTube, age-restricted content, geo-blocked content, YouTube Premium required, channel members-only content, unavailable or private video, no downloadable format found, and unknown errors.
- Added `download_error` field to the `LearningPathItem` model (migration `0003`) and exposed it through the serializer and download status API.
- Error reasons persist across app restarts and are cleared automatically on a successful download, on retry, on video removal, or when the video URL is changed.

#### Bot detection bypass
- **Automatic browser cookie retry for yt-dlp** — when YouTube's bot detection blocks a download or stream extraction ("Sign in to confirm you're not a bot"), yt-dlp now automatically retries the request using cookies from each installed browser in sequence: Firefox, Brave, Chrome, Chromium, Edge, Opera, Vivaldi, Safari. The first browser whose cookies satisfy YouTube is used; if none work, the operation fails with a clear `bot_detection` error.

#### Native local video protocol (`lexipath://`)
- **Downloaded videos served natively by Electron** — local video files are now served via a custom `lexipath://` URL scheme registered in Electron's main process using `protocol.handle()`. The browser-level `<video>` element fetches the file directly through Node.js (`net.fetch` + `pathToFileURL`), completely bypassing the Python backend for local playback. This eliminates the memory spike that previously caused backend crashes when seeking, and gives the native seeking performance of a local file.

### Fixed

- **Backend crash when seeking a downloaded video** — the previous `VideoServeView` implementation called `f.read(length)` to satisfy range requests, loading the entire requested range (potentially hundreds of MB) into RAM at once. Replaced with `StreamingHttpResponse` and a `_stream_range()` generator that yields 512 KB chunks, making memory usage constant regardless of file size or seek position.
- **Wrong error message for channel members-only videos** — videos restricted to channel members ("Join this channel to get access to members-only content") were incorrectly reported as "This video requires YouTube Premium." Fixed by separating the `members_only` reason code from `premium_required` in `_parse_yt_dlp_error()`, matched by the substrings `'member'` or `'join this channel'` in the exception text.
- **Format detection always failing for DASH-only videos** — when yt-dlp is called without an explicit `format` selector and `download=False`, it populates the `formats[]` list with metadata but leaves each entry's `url` field empty. The previous implementation scanned this list for combined A/V formats and found none (all `url` fields were `None`), incorrectly treating every video as DASH-only. Fixed by using an explicit format selector (`22/18/best[acodec!=none][vcodec!=none]`) which forces yt-dlp to resolve the actual CDN URL for the selected format.
- **`UnboundLocalError` in bot detection retry loop** — Python's `except Exception as e` clause automatically deletes the variable `e` at the end of the block. A subsequent reference to it after the block raised `UnboundLocalError: cannot access local variable 'first_exc' before assignment`. Fixed by assigning `last_exc = None` before the try block and updating it inside the except clause.
- **Delete confirmation buttons misaligned on card hover** — after clicking the trash icon on a card, the "Yes, delete" and "Cancel" buttons were right-aligned (`justify-content: flex-end`) while the "Remove this video?" label above them was centered. The two buttons together appeared off-balance. Fixed by splitting `.card-edit-actions` and `.card-confirm-actions` into separate CSS rules and applying `justify-content: center` to the confirm actions.

### Technical notes

**Backend (`backend/apps/paths/views.py`)**
- Added `_parse_yt_dlp_error(exc)` — maps yt-dlp exception messages to one of 8 short reason codes: `bot_detection`, `age_restricted`, `geo_blocked`, `premium_required`, `members_only`, `unavailable`, `format_unavailable`, `unknown`
- Added `_is_bot_error(exc)` — detects retryable bot/cookie errors by checking for `'sign in'`, `'bot'`, `'cookie'`, `'could not find'`, `'failed to load'` in the exception message
- Added `_yt_extract_info(url, opts)` — wraps yt-dlp's `extract_info` with automatic browser cookie retry on bot detection
- Added `_ffmpeg_merge_response(ffmpeg_info)` — spawns `ffmpeg` with separate DASH video/audio CDN URLs and returns a `StreamingHttpResponse` piping the merged fragmented MP4 (`frag_keyframe+empty_moov`)
- `VideoOnlineStreamView` now uses a two-step extraction: Step 1 tries `22/18/best[acodec!=none][vcodec!=none]` (fast, no ffmpeg); Step 2, if Step 1 raises "Requested format is not available", extracts DASH streams and pipes through ffmpeg
- Three cache keys per video: `yt_online_url:{id}` (combined URL, 30 min), `yt_online_ffmpeg:{id}` (DASH CDN URLs, 10 min), `yt_online_dash_only:{id}` (no-ffmpeg fallback, 5 min)
- `VideoTokenView` returns `{"token": "…", "local_path": "/abs/path/or/null"}` — `local_path` is used by the frontend to construct the `lexipath://` URL without an extra API call
- `VideoServeView` range handler replaced with `_stream_range()` generator (512 KB chunks via `StreamingHttpResponse`)
- `_download_video_task` stores `_parse_yt_dlp_error(exc)` in `download_error` on failure; clears it on success
- `VideoDownloadView.post()` clears `download_error` on retry start; `VideoDownloadView.get()` returns `download_error` in the status payload; `VideoDownloadView.delete()` clears `download_error`

**Backend (`backend/apps/paths/models.py`)**
- `LearningPathItem.download_error` — new `CharField(max_length=30, blank=True)` storing the last failure reason code

**Backend (`backend/apps/paths/serializers.py`)**
- `download_error` added to `fields` and `read_only_fields`; cleared in `update()` when `youtube_url` changes

**Frontend (`frontend/src/components/VideoCard.jsx`)**
- Token is now fetched whenever theater opens, regardless of download status — previously only fetched when `hasLocalFile`, which prevented online streaming from being authenticated
- New states: `onlineStreamFailed`, `onlineStreamLoading`, `localPath`, `useNativeProtocol`, `videoError`, `tokenError`, `downloadError`
- Downloaded videos use `lexipath://video?path=…` as the `<video>` src; falls back to Django proxy if the native protocol is unavailable (browser dev mode)
- Non-downloaded videos: shows `<video src="/api/videos/online-stream/{id}/?token=…">` with `onLoadStart`/`onCanPlay`/`onError` handlers; on `onError` the player transitions to the "Download & Watch" / "Watch on YouTube" fallback UI
- `downloadError` state initialized from `item.download_error`, updated by the polling loop, cleared on retry and remove; displayed as a small reason line below the "Download failed" badge

**Electron (`electron/main.js`)**
- `protocol.registerSchemesAsPrivileged` registers `lexipath://` as secure, streaming, CORS-enabled before `app.whenReady()`
- `protocol.handle('lexipath', …)` inside `whenReady` serves local files via `net.fetch(pathToFileURL(filePath))`, forwarding the browser's Range headers for native seeking

**Frontend (`frontend/src/index.css`)**
- `.offline-error-reason` — small muted label rendered below "Download failed" to show the reason code
- `.theater-loading` — converted to `flex-direction: column` with a `.theater-loading__label` child for the "Connecting…" text
- `.card-confirm-actions` — split from `.card-edit-actions`, now uses `justify-content: center`
- `.theater-not-downloaded` and all child classes for the fallback player UI

**Locales (all 6: `en`, `pt-BR`, `es`, `de`, `it`, `fr`)**
- `video.error.{reason}` object — 8 keys: `bot_detection`, `age_restricted`, `geo_blocked`, `premium_required`, `members_only`, `unavailable`, `format_unavailable`, `unknown`
- `video.connecting` — "Connecting to video…" label shown during stream loading
- `video.dashOnlyMessage`, `video.downloadToWatch`, `video.localFileError`, `video.watchOnYouTube`

---

## [1.0.8] — 2026-03-29

### Fixed
- **Playlist URLs now play and download correctly** — when a video URL contains `&list=PLAYLIST_ID`, yt-dlp was processing the entire playlist instead of the individual video, returning a playlist dict instead of a single video URL. Fixed by adding `noplaylist: True` to all yt-dlp calls.
- **yt-dlp format selector corrected** — recent yt-dlp changed `format='best'` to prefer merged DASH streams (`bestvideo*+bestaudio`). When called with `download=False`, merged formats have no single direct URL, triggering a 502. Fixed by using `best[acodec!=none][vcodec!=none]/best[acodec!=none]` to explicitly require a single combined A/V stream.

### Technical notes
- `noplaylist: True` added to both `VideoOnlineStreamView` and `_download_video_task`
- Format selector in `VideoOnlineStreamView` changed to `best[acodec!=none][vcodec!=none]/best[acodec!=none]`
- Three-level URL extraction fallback: `info['url']` → `requested_formats[0]['url']` → scan `formats` list
- Errors written to `{APP_DATA_DIR}/lexi-debug.log` via `_yt_logger()`

---

## [1.0.7] — 2026-03-28

### Fixed
- **Videos now play inside the app** — the "Watch on YouTube" workaround introduced in v1.0.6 is replaced with real in-app playback. Opening theater mode streams the video directly inside LexiPath without any browser redirect, bypassing YouTube's iframe embedding restrictions (Error 153) entirely.

### Technical notes
- New endpoint `GET /api/videos/online-stream/{item_id}/` uses yt-dlp to extract the direct YouTube CDN URL (no file saved to disk) and proxies the bytes through Django — no iframe, no embedding restrictions
- CDN URL cached for 30 minutes; Range requests forwarded so the `<video>` element can seek
- If streaming fails, the theater falls back to a "Watch on YouTube" link
- `VideoCard.jsx` token effect now runs on every theater open; `<video>` chooses `/videos/serve/` (offline) or `/videos/online-stream/` (online) based on `hasLocalFile`; spinner shown while token is fetching
- `LearningPathItemSerializer.update()` clears the cached stream URL when `youtube_url` changes

---

## [1.0.6] — 2026-03-28

### Added
- **Hover actions on video cards** — hovering a card now reveals two icon buttons: ✎ (edit) and ✕ (delete). Both are hidden by default and fade in on hover so the card layout is not cluttered during normal browsing.
- **Quick edit form on card** — clicking ✎ opens an inline overlay directly on the card with pre-filled title and YouTube URL inputs. Escape cancels, Enter or the Save button commits. No need to open the theater modal to fix a typo or wrong URL.
- **Edit video URL** — the URL field in the quick edit form is now fully editable. Changing it re-derives the video ID, thumbnail, and resets the offline download state on the backend (the previous file is orphaned on disk but no longer referenced). A client-side regex validates the URL before the request is sent.
- **Delete confirm on hover** — clicking ✕ shows the same "Remove this video? / Yes, delete / Cancel" confirmation as inside the theater modal, directly on the card.
- **YouTube embed replaced with thumbnail + external link** — the YouTube iframe player is removed from the theater modal. Some videos block embedding (Error 153) and the failure is invisible cross-origin. Instead, the theater now shows the video thumbnail with a red "Watch on YouTube" button that opens the video in the system browser via Electron's `shell.openExternal`.

### Fixed
- Changing a video's YouTube URL now correctly updates the thumbnail shown on the card (previously only the title could be changed and the thumbnail stayed stale).

### Technical notes
- `LearningPathItemSerializer.update()` re-extracts `video_id`, `thumbnail_url`, and resets `download_status`/`local_file_path` whenever `youtube_url` changes; `create()` was already doing this, now `update()` is consistent
- `handleEditTitle` in `PathPage` replaced with `handleEditItem(id, fields)` — always syncs from the API response so backend-derived fields (`video_id`, `thumbnail_url`) land in React state correctly
- Card `onClick` is guarded against opening the theater while the edit form or delete confirm overlay is active
- `common.save`, `video.editVideo`, `video.invalidUrl` added to all 6 locales (EN, PT-BR, ES, DE, IT, FR)
- `.video-card` has `position: relative` so the absolute overlay is clipped by the card's border-radius

---

## [1.0.5] — 2026-03-28

### Performance
- Startup time reduced by 1–3 seconds on every launch after the first. `run_server.py` now hashes all migration filenames across every Django app and skips `migrate` entirely when nothing has changed since the last run. The hash is stored in `.migration_version` in the user data directory and updated only after a successful migrate, so a failed or interrupted migrate always retries on the next launch.

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
