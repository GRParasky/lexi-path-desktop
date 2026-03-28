# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for LexiPath desktop backend.
#
# Run from inside backend/ with:
#   pyinstaller lexi-path-server.spec
#
# SPECPATH is automatically set by PyInstaller to the directory that contains
# this spec file — i.e. backend/. All relative paths below are relative to it.

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# UPX compresses individual binaries inside the bundle.
# Enabled on Linux only:
#   - macOS arm64: UPX corrupts binaries on Apple Silicon (binary format incompatibility)
#   - Windows: UPX-compressed executables trigger Windows Defender false positives
#   - Linux: safe and effective
_use_upx = sys.platform == 'linux'

# ---------------------------------------------------------------------------
# Data files
# ---------------------------------------------------------------------------
# collect_data_files() grabs non-.py resource files from installed packages
# (templates, locale files, static assets, etc.).
# Without these Django can't find its admin templates, DRF its browsable-API
# templates, or WhiteNoise its internal assets.
datas = []
datas += collect_data_files('django')
datas += collect_data_files('rest_framework')
datas += collect_data_files('whitenoise')

# Local app migrations — Django reads these at runtime to run `migrate`.
# They are plain .py files but PyInstaller only auto-includes imported modules,
# not files it discovers dynamically. We include them explicitly.
datas += [
    ('apps/users/migrations',    'apps/users/migrations'),
    ('apps/paths/migrations',    'apps/paths/migrations'),
    ('apps/progress/migrations', 'apps/progress/migrations'),
]

# Built React frontend — only present after `npm run build && collectstatic`.
# Guarded so the spec can still be validated before the frontend is built.
_staticfiles = os.path.join(SPECPATH, 'staticfiles')
if os.path.isdir(_staticfiles):
    datas.append((_staticfiles, 'staticfiles'))

# ---------------------------------------------------------------------------
# Hidden imports
# ---------------------------------------------------------------------------
# PyInstaller analyses imports statically. Anything loaded via strings
# (INSTALLED_APPS, MIDDLEWARE, importlib.import_module, etc.) is invisible
# to it and must be listed here explicitly.
hiddenimports = [
    # Django contrib apps (INSTALLED_APPS strings → dynamic imports)
    'django.contrib.admin',
    'django.contrib.admin.apps',
    'django.contrib.auth',
    'django.contrib.auth.apps',
    'django.contrib.contenttypes',
    'django.contrib.contenttypes.apps',
    'django.contrib.sessions',
    'django.contrib.sessions.apps',
    'django.contrib.messages',
    'django.contrib.messages.apps',
    'django.contrib.staticfiles',
    'django.contrib.staticfiles.apps',
    # Django internals loaded at runtime
    'django.core.management.commands.migrate',
    'django.template.defaulttags',
    'django.template.defaultfilters',
    'django.template.loader_tags',
    # Database backends
    'django.db.backends.sqlite3',
    # Third-party packages
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.authentication',
    'corsheaders',
    'corsheaders.middleware',
    'whitenoise',
    'whitenoise.middleware',
    'waitress',
    'waitress.runner',
    'waitress.task',
    'waitress.server',
    'dj_database_url',
    'decouple',
    'sqlparse',
    # Local apps — every module that Django or DRF might import by string
    'apps',
    'apps.users',
    'apps.users.models',
    'apps.users.views',
    'apps.users.serializers',
    'apps.users.urls',
    'apps.users.admin',
    'apps.users.apps',
    'apps.paths',
    'apps.paths.models',
    'apps.paths.views',
    'apps.paths.serializers',
    'apps.paths.urls',
    'apps.paths.utils',
    'apps.paths.admin',
    'apps.paths.apps',
    'apps.progress',
    'apps.progress.models',
    'apps.progress.views',
    'apps.progress.serializers',
    'apps.progress.urls',
    'apps.progress.admin',
    'apps.progress.apps',
    # Django config package
    'config',
    'config.settings',
    'config.urls',
    'config.wsgi',
]

# yt_dlp loads its extractors dynamically — collect_submodules ensures every
# extractor (YouTube, Vimeo, …) is included. Without this most sites fail.
hiddenimports += collect_submodules('yt_dlp')

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
a = Analysis(
    # Entry point lives in backend/ alongside this spec file
    ['run_server.py'],

    # pathex adds backend/ to sys.path so `import config` and `import apps`
    # resolve correctly inside the frozen binary.
    pathex=[SPECPATH],

    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],

    # Safe exclusions — reduces bundle size without breaking anything.
    # tkinter/_tkinter : GUI toolkit — not used anywhere in this stack.
    # Unused network protocols: ftplib, imaplib, poplib, telnetlib, xmlrpc.
    # Development/debugging tools: pdb, lib2to3, doctest.
    # NOTE: unittest must NOT be excluded — rest_framework_simplejwt imports
    # django.test at startup which chains into unittest. Removing it causes
    # ModuleNotFoundError at launch inside the frozen binary.
    excludes=[
        'tkinter', '_tkinter',
        'ftplib', 'imaplib', 'poplib', 'telnetlib', 'xmlrpc',
        'pdb', 'lib2to3', 'doctest',
    ],

    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,  # one-dir mode: binaries go into COLLECT, not the exe
    name='lexi-path-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=_use_upx,
    # console=True is REQUIRED: Electron's main.js reads stdout to detect
    # when Django is ready. A windowed binary would suppress all stdout output.
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# ---------------------------------------------------------------------------
# COLLECT — one-dir mode
# ---------------------------------------------------------------------------
# One-dir mode produces a folder (dist/lexi-path-server/) instead of a single
# file. We choose this over one-file because:
#   1. staticfiles/ must sit alongside the binary so WhiteNoise can find it.
#      One-file mode extracts to a temp dir at startup which changes on every run.
#   2. Startup is faster — no extraction step.
#   3. electron-builder's extraResources can copy the entire directory cleanly.
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=_use_upx,
    upx_exclude=[],
    name='lexi-path-server',
)
