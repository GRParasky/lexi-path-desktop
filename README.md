# LexiPath Desktop

A self-contained desktop app for building and following YouTube learning paths — no account, no server, no internet required after download.

Built with Electron + Django + React. Stores all data locally on your machine.

---

## Download

Go to the **[latest release](https://github.com/GRParasky/lexi-path-desktop/releases/latest)** and download the file for your platform:

| Platform | File |
|----------|------|
| 🪟 Windows | `LexiPath-Setup-x.x.x.exe` |
| 🍎 macOS (Apple Silicon) | `LexiPath-x.x.x-arm64.dmg` |
| 🐧 Linux | `LexiPath-x.x.x.AppImage` |

### Windows
Run `LexiPath-Setup-x.x.x.exe` and follow the installer.

### macOS
Open `LexiPath-x.x.x-arm64.dmg`, drag LexiPath to Applications.

### Linux
```bash
chmod +x LexiPath-x.x.x.AppImage
./LexiPath-x.x.x.AppImage
```

---

## Features

- Create learning paths from YouTube videos
- Watch videos in a distraction-free theater mode
- Download videos for offline playback (no internet needed)
- Track your progress through each path
- Share paths via a public link

---

## Contributing / Building from source

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| PyInstaller | latest (`pip install pyinstaller`) |
| UPX (optional) | improves binary compression |

On Manjaro/Arch:
```bash
sudo pacman -S python nodejs npm
pip install pyinstaller
sudo pacman -S upx   # optional
```

### 1. Clone the repo

```bash
git clone https://github.com/your-username/lexi-path-desktop.git
cd lexi-path-desktop
```

### 2. Set up the Python environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install pyinstaller
```

### 3. Configure the dev environment

```bash
cp .env.example .env
```

Open `.env` and set a value for `SECRET_KEY` — any string works for local dev:
```
SECRET_KEY=dev-local-key-replace-me
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

### 4. Run migrations

```bash
cd backend
source venv/bin/activate
python manage.py migrate
```

### 5. Run in development mode

**Terminal 1 — Django backend (port 8765):**
```bash
cd backend
source venv/bin/activate
python run_server.py
```

**Terminal 2 — React frontend (port 5173):**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. The frontend proxies all `/api/` requests to Django on port 8765.

### 6. Build the packaged desktop app

```bash
# Mac / Linux
chmod +x scripts/build.sh
./scripts/build.sh

# Windows
scripts\build.bat
```

The build script runs these steps in order:
1. `npm run build` in `frontend/` — produces `frontend/dist/`
2. `manage.py collectstatic` in `backend/` — copies React build into `backend/staticfiles/`
3. `pyinstaller lexi-path-server.spec` in `backend/` — bundles Python/Django into `backend/dist/lexi-path-server/`
4. `npm install` in `electron/`
5. `electron-builder` in `electron/` — produces installer in `electron/dist/`

### 7. Run the packaged app

```bash
# Linux
chmod +x electron/dist/LexiPath-*.AppImage
./electron/dist/LexiPath-*.AppImage

# macOS — open electron/dist/LexiPath-*.dmg and drag to Applications

# Windows — run electron/dist/LexiPath-*-setup.exe
```

---

## Project structure

```
lexi-path-desktop/
├── backend/                  Django app + PyInstaller spec
│   ├── apps/
│   │   ├── paths/            Learning paths, items, offline video logic
│   │   ├── progress/         Completion tracking
│   │   └── users/            Auth (auto-login for desktop)
│   ├── config/               Django settings, URLs, WSGI
│   ├── run_server.py         Desktop entry point (Waitress on :8765)
│   └── lexi-path-server.spec PyInstaller bundle config
├── electron/                 Electron shell
│   ├── main.js               Spawns Django, manages windows
│   ├── loading.html          Splash screen shown during startup
│   └── package.json          electron-builder config
├── frontend/                 React + Vite SPA
│   └── src/
│       ├── components/       VideoCard (offline download + theater)
│       ├── pages/            Dashboard, PathPage, SharedPath
│       └── store/            Zustand auth store (auto-login)
├── scripts/
│   ├── build.sh              Full build pipeline (Mac/Linux)
│   └── build.bat             Full build pipeline (Windows)
└── context.md                Internal dev notes and architecture decisions
```

---

## Data locations

All user data is stored in the OS user data directory — it survives app updates.

| OS | Location |
|----|----------|
| Windows | `%APPDATA%\LexiPath\` |
| macOS | `~/Library/Application Support/LexiPath/` |
| Linux | `~/.local/share/LexiPath/` |

Contents: `db.sqlite3`, `secret.key`, `videos/`
