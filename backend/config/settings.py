from pathlib import Path
from datetime import timedelta
import dj_database_url
from decouple import config, Csv

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY')

DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

# Application definition
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
]

LOCAL_APPS = [
    'apps.users',
    'apps.paths',
    'apps.progress',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise must come directly after SecurityMiddleware and before everything else.
    # It intercepts static file requests early, before any Django processing.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ---------------------------------------------------------------------------
# Database
# Priority order:
#   1. DATABASE_URL env var  → PostgreSQL (staging / production web)
#   2. APP_DATA_DIR env var  → SQLite in OS user data dir (desktop mode)
#   3. fallback              → SQLite next to manage.py (plain dev mode)
# ---------------------------------------------------------------------------
_database_url = config('DATABASE_URL', default=None)
_app_data_dir = config('APP_DATA_DIR', default=None)

if _database_url:
    DATABASES = {'default': dj_database_url.parse(_database_url, conn_max_age=600)}
elif _app_data_dir:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': Path(_app_data_dir) / 'db.sqlite3',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static files (WhiteNoise serves the built React SPA)
# ---------------------------------------------------------------------------
STATIC_URL = 'static/'

# STATIC_ROOT_OVERRIDE is set by run_server.py when frozen by PyInstaller,
# pointing to the staticfiles/ folder bundled inside the executable.
# In dev/plain mode it falls back to staticfiles/ next to manage.py.
STATIC_ROOT = Path(config('STATIC_ROOT_OVERRIDE', default=str(BASE_DIR / 'staticfiles')))

# Include the Vite build output so collectstatic can pick it up.
# We guard with exists() so plain `manage.py runserver` still works
# even before `npm run build` has been executed.
_frontend_dist = BASE_DIR.parent / 'frontend' / 'dist'
STATICFILES_DIRS = [_frontend_dist] if _frontend_dist.exists() else []

# Tell WhiteNoise to serve index.html for the root URL.
# This is what makes the React SPA work — any non-static, non-API request
# falls through to index.html and React Router handles the rest.
WHITENOISE_INDEX_FILE = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
}

# CORS is only needed in development (Vite on :5173, Django on :8000).
# In desktop production, Django serves both API and frontend on the same
# origin (127.0.0.1:8765), so CORS is irrelevant — but keeping it here
# does no harm and avoids breaking the dev workflow.
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:5173',
    cast=Csv(),
)
