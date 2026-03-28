'use strict'

const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------
const PORT = 8765
const PROD_URL = `http://127.0.0.1:${PORT}`
const DEV_URL  = 'http://localhost:5173'

// The exact string run_server.py prints when Waitress is ready.
// Electron waits for this before opening the main window.
const BACKEND_READY_SIGNAL = 'LexiPath ready'

// How long to wait for Django to start before giving up (ms)
const BACKEND_TIMEOUT_MS = 60_000

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
let mainWindow    = null
let backendProcess = null

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Resolve the path to the Django binary inside the packaged app.
 *
 * electron-builder copies the PyInstaller output into:
 *   resources/backend/lexi-path-server/
 *
 * process.resourcesPath always points to the correct `resources/` dir
 * regardless of platform (.app bundle on macOS, dir next to .exe on Windows).
 */
function getBinaryPath() {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(
    process.resourcesPath,
    'backend',
    'lexi-path-server',
    `lexi-path-server${ext}`
  )
}

/**
 * Spawn the Django backend and return a Promise that resolves when it
 * prints BACKEND_READY_SIGNAL, or rejects on error / timeout.
 */
function startBackend() {
  return new Promise((resolve, reject) => {
    const binaryPath = getBinaryPath()

    backendProcess = spawn(binaryPath, [], {
      // stdin: ignore — the server doesn't read from stdin
      // stdout/stderr: pipe — so we can read the ready signal and log errors
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Watch stdout for the ready signal
    backendProcess.stdout.on('data', (data) => {
      const text = data.toString()
      console.log('[backend]', text.trim())
      if (text.includes(BACKEND_READY_SIGNAL)) {
        resolve()
      }
    })

    backendProcess.stderr.on('data', (data) => {
      console.error('[backend stderr]', data.toString().trim())
    })

    // If the binary can't be found or crashes immediately
    backendProcess.on('error', (err) => {
      reject(new Error(`Failed to start backend: ${err.message}`))
    })

    backendProcess.on('exit', (code) => {
      // code === null means the process was killed intentionally (app quit)
      if (code !== null && code !== 0) {
        reject(new Error(`Backend exited unexpectedly with code ${code}`))
      }
    })

    // Safety net: if Django never prints the ready signal, don't hang forever
    setTimeout(
      () => reject(new Error('Backend startup timed out after 60 s')),
      BACKEND_TIMEOUT_MS
    )
  })
}

/**
 * Create (or recreate) the main BrowserWindow and load the given URL.
 */
function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false, // don't flash a blank frame — show after content is ready
    webPreferences: {
      contextIsolation: true,   // default since Electron 12, keep it on
      nodeIntegration: false,   // renderer has no Node.js access (not needed)
    },
  })

  mainWindow.loadURL(url)

  // Show the window once the page has painted — avoids white flash on startup
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Open any <a target="_blank"> or window.open() links in the system browser
  // instead of a new Electron window.  Keeps the user's browser history intact
  // and avoids spawning stray renderer processes.
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ----------------------------------------------------------------------------
// App lifecycle
// ----------------------------------------------------------------------------

app.whenReady().then(async () => {
  if (app.isPackaged) {
    // --- Production / packaged mode ---
    // Show a loading screen immediately so the user sees something,
    // then switch to the real app once Django is ready.
    mainWindow = new BrowserWindow({
      width: 440,
      height: 280,
      frame: false,          // frameless for a clean splash look
      resizable: false,
      center: true,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    mainWindow.loadFile(path.join(__dirname, 'loading.html'))
    mainWindow.once('ready-to-show', () => mainWindow.show())

    try {
      await startBackend()

      // Transition: resize to full app and load the real URL
      mainWindow.setSize(1280, 800)
      mainWindow.setResizable(true)
      mainWindow.setMinimumSize(800, 600)
      mainWindow.center()

      // Disable frame was only for the splash — re-enable normal chrome
      // (We can't toggle frame after creation, so we destroy and recreate)
      mainWindow.close()
      createWindow(PROD_URL)
    } catch (err) {
      console.error(err)
      // Show a basic error dialog and quit — better than hanging silently
      const { dialog } = require('electron')
      dialog.showErrorBox(
        'LexiPath failed to start',
        `The backend could not be started.\n\n${err.message}`
      )
      app.quit()
    }
  } else {
    // --- Development mode ---
    // Vite dev server is expected to be running on :5173.
    // Django dev server should also be running separately.
    // Just open the Vite URL directly — no backend spawn needed.
    createWindow(DEV_URL)
  }

  // macOS: re-create the window when the dock icon is clicked and no windows exist
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(app.isPackaged ? PROD_URL : DEV_URL)
    }
  })
})

// On Windows and Linux: quit when all windows are closed.
// On macOS: leave the app running (standard macOS behaviour).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Kill the Django backend when the app is about to quit.
// Without this, the Waitress process keeps running in the background
// after the user closes LexiPath, occupying port 8765.
app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
})
