"""
Desktop entry point.

Used by PyInstaller and Electron. Responsibilities:
  1. Locate (or create) the user data directory.
  2. Generate a persistent SECRET_KEY on first run and store it there.
  3. Set all required env vars before Django loads.
  4. Run database migrations (skipped if nothing changed since last run).
  5. Start the Waitress WSGI server.
"""
import hashlib
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


def _compute_migration_hash() -> str:
    """
    Return a short hash of all migration filenames across every Django app.

    Only filenames are hashed (not file contents) because the set of
    migrations that exist is what determines whether 'migrate' needs to run.
    Adding or removing a migration file changes the hash; editing a migration
    that was already applied has no effect on the DB schema anyway.

    Requires django.setup() to have been called first so that
    apps.get_app_configs() is populated.
    """
    from django.apps import apps as django_apps

    names = []
    for app_config in django_apps.get_app_configs():
        migrations_dir = Path(app_config.path) / 'migrations'
        if migrations_dir.is_dir():
            for f in sorted(migrations_dir.glob('[0-9]*.py')):
                names.append(f'{app_config.label}/{f.name}')

    return hashlib.sha256('\n'.join(names).encode()).hexdigest()[:16]


def _migrations_changed(data_dir: Path) -> bool:
    """
    Return True when migrations need to run.

    Conservative by design: any error (missing file, import failure, etc.)
    causes this to return True so that 'migrate' always runs as a fallback.
    """
    hash_file = data_dir / '.migration_version'
    try:
        current = _compute_migration_hash()
        return not hash_file.exists() or hash_file.read_text().strip() != current
    except Exception:
        return True


def _save_migration_hash(data_dir: Path) -> None:
    """Persist the current migration hash. Called only after a successful migrate."""
    try:
        (data_dir / '.migration_version').write_text(_compute_migration_hash())
    except Exception:
        pass  # Non-critical — worst case, migrate runs again next launch


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

    # Run migrations only when the set of migration files has changed.
    # On a typical launch (no app update) this saves 1-3 seconds.
    from django.core.management import call_command
    if _migrations_changed(data_dir):
        call_command('migrate', verbosity=0)
        _save_migration_hash(data_dir)

    # Reset any items that were left in 'downloading' state from a previous session.
    # This can happen if the app was closed while a download was in progress.
    from apps.paths.models import LearningPathItem
    LearningPathItem.objects.filter(download_status='downloading').update(download_status='error')

    from waitress import serve
    from config.wsgi import application

    port = int(os.environ.get('PORT', 8765))
    # Print this exact line — Electron's main.js watches for it to know when to open the window
    print(f'LexiPath ready on http://127.0.0.1:{port}', flush=True)
    serve(application, host='127.0.0.1', port=port)


if __name__ == '__main__':
    main()
