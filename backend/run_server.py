"""
Desktop entry point.

Used by PyInstaller and Electron. Responsibilities:
  1. Locate (or create) the user data directory.
  2. Generate a persistent SECRET_KEY on first run and store it there.
  3. Set all required env vars before Django loads.
  4. Run database migrations silently.
  5. Start the Waitress WSGI server.
"""
import os
import sys
import secrets
from pathlib import Path


def _get_data_dir() -> Path:
    """Return (and create) the OS-appropriate user data directory."""
    if sys.platform == 'win32':
        base = Path(os.environ.get('APPDATA', Path.home()))
    elif sys.platform == 'darwin':
        base = Path.home() / 'Library' / 'Application Support'
    else:
        base = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local' / 'share'))
    data_dir = base / 'LexiPath'
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def _get_or_create_secret_key(data_dir: Path) -> str:
    key_file = data_dir / 'secret.key'
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_urlsafe(50)
    key_file.write_text(key)
    return key


def _set_static_root_for_bundle() -> None:
    """
    When frozen by PyInstaller, static files are bundled inside the executable.
    Point STATIC_ROOT_OVERRIDE to the correct location so WhiteNoise can find them.
    """
    if getattr(sys, 'frozen', False):
        bundle_dir = Path(getattr(sys, '_MEIPASS', Path(sys.executable).parent))
        os.environ['STATIC_ROOT_OVERRIDE'] = str(bundle_dir / 'staticfiles')


def main():
    data_dir = _get_data_dir()

    os.environ.setdefault('APP_DATA_DIR', str(data_dir))
    os.environ.setdefault('SECRET_KEY', _get_or_create_secret_key(data_dir))
    os.environ.setdefault('DEBUG', 'False')
    os.environ.setdefault('ALLOWED_HOSTS', 'localhost,127.0.0.1')
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

    _set_static_root_for_bundle()

    import django
    django.setup()

    # Run any pending migrations silently on startup
    from django.core.management import call_command
    call_command('migrate', verbosity=0)

    from waitress import serve
    from config.wsgi import application

    port = int(os.environ.get('PORT', 8765))
    # Print this exact line — Electron's main.js watches for it to know when to open the window
    print(f'LexiPath ready on http://127.0.0.1:{port}', flush=True)
    serve(application, host='127.0.0.1', port=port)


if __name__ == '__main__':
    main()
