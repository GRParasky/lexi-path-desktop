@echo off
REM =============================================================================
REM LexiPath Desktop — full build script (Windows)
REM
REM Usage: double-click build.bat  OR  run from a terminal in the project root:
REM   scripts\build.bat
REM
REM Prerequisites (must be installed and on PATH before running):
REM   - Node.js + npm
REM   - Python 3.11+ with a virtualenv at backend\venv\
REM     (pip install -r backend\requirements.txt already run)
REM   - PyInstaller  (pip install pyinstaller)
REM   - UPX optional (improves compression — place upx.exe somewhere on PATH)
REM
REM What this script does, in order:
REM   1. Build the React frontend (Vite -> frontend\dist\)
REM   2. Collect Django static files (frontend\dist\ -> backend\staticfiles\)
REM   3. Bundle the Python backend with PyInstaller (-> backend\dist\lexi-path-server\)
REM   4. Install Electron dependencies
REM   5. Package the Electron app with electron-builder (-> electron\dist\)
REM =============================================================================

setlocal enabledelayedexpansion

REM Resolve the project root (one level above scripts\)
set "ROOT=%~dp0.."

echo.
echo === LexiPath build starting ===
echo     Project root: %ROOT%
echo.

REM ---------------------------------------------------------------------------
REM Step 1 — Build React frontend
REM ---------------------------------------------------------------------------
echo --- [1/5] Building React frontend ---
cd /d "%ROOT%\frontend"

call npm install --silent
if errorlevel 1 ( echo ERROR: npm install failed & exit /b 1 )

call npm run build
if errorlevel 1 ( echo ERROR: npm run build failed & exit /b 1 )

echo     Done: frontend\dist\

REM ---------------------------------------------------------------------------
REM Step 2 — Collect Django static files
REM ---------------------------------------------------------------------------
echo.
echo --- [2/5] Collecting Django static files ---
cd /d "%ROOT%\backend"

REM Activate the virtualenv if it exists; otherwise use the system Python
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
)

REM SECRET_KEY is required by Django to start even for management commands
set SECRET_KEY=build-placeholder
python manage.py collectstatic --noinput --clear -v 0
if errorlevel 1 ( echo ERROR: collectstatic failed & exit /b 1 )

echo     Done: backend\staticfiles\

REM ---------------------------------------------------------------------------
REM Step 3 — Bundle Python backend with PyInstaller
REM ---------------------------------------------------------------------------
echo.
echo --- [3/5] Bundling Python backend with PyInstaller ---
cd /d "%ROOT%\backend"

REM Remove previous build artifacts
if exist build\ rmdir /s /q build\
if exist dist\  rmdir /s /q dist\

pyinstaller lexi-path-server.spec --noconfirm
if errorlevel 1 ( echo ERROR: PyInstaller failed & exit /b 1 )

echo     Done: backend\dist\lexi-path-server\

REM ---------------------------------------------------------------------------
REM Step 4 — Install Electron dependencies
REM ---------------------------------------------------------------------------
echo.
echo --- [4/5] Installing Electron dependencies ---
cd /d "%ROOT%\electron"

call npm install --silent
if errorlevel 1 ( echo ERROR: npm install (electron) failed & exit /b 1 )

echo     Done.

REM ---------------------------------------------------------------------------
REM Step 5 — Package Electron app
REM ---------------------------------------------------------------------------
echo.
echo --- [5/5] Packaging Electron app ---
cd /d "%ROOT%\electron"

call npm run build
if errorlevel 1 ( echo ERROR: electron-builder failed & exit /b 1 )

echo     Done: electron\dist\

REM ---------------------------------------------------------------------------
REM Summary
REM ---------------------------------------------------------------------------
echo.
echo === Build complete ===
echo.
echo Output files:
dir /b "%ROOT%\electron\dist\"
echo.
echo Install the app from the file(s) listed above.

endlocal
