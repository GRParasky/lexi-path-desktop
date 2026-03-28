import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse


def extract_youtube_video_id(url: str) -> str | None:
    """
    Extract the YouTube video ID from any common URL format.

    Supported formats:
      - https://www.youtube.com/watch?v=VIDEO_ID
      - https://youtu.be/VIDEO_ID
      - https://www.youtube.com/embed/VIDEO_ID
      - https://www.youtube.com/shorts/VIDEO_ID

    Returns the video ID string, or None if the URL is not a recognised format.
    """
    parsed = urlparse(url)

    # youtu.be/VIDEO_ID  — the ID is the path itself
    if parsed.netloc in ('youtu.be', 'www.youtu.be'):
        video_id = parsed.path.lstrip('/')
        return video_id or None

    # youtube.com/watch?v=VIDEO_ID
    if parsed.netloc in ('youtube.com', 'www.youtube.com'):
        if parsed.path == '/watch':
            params = parse_qs(parsed.query)
            ids = params.get('v', [])
            return ids[0] if ids else None

        # youtube.com/embed/VIDEO_ID  or  /shorts/VIDEO_ID
        path_parts = parsed.path.strip('/').split('/')
        if len(path_parts) >= 2 and path_parts[0] in ('embed', 'shorts'):
            return path_parts[1] or None

    return None


def build_thumbnail_url(video_id: str) -> str:
    """
    Build the high-quality thumbnail URL for a YouTube video.
    This does not require an API key — it is a public CDN endpoint.
    """
    return f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg'


def get_videos_dir() -> Path:
    """
    Return (and create) the directory where offline video files are stored.

    Priority:
      1. APP_DATA_DIR env var (set by run_server.py in desktop mode)
         → {APP_DATA_DIR}/videos/
      2. Fallback for plain dev: a 'videos/' folder next to manage.py

    Using APP_DATA_DIR keeps videos in the OS user data directory, which means
    they survive app updates (PyInstaller rebuilds never touch the data dir).
    """
    app_data_dir = os.environ.get('APP_DATA_DIR')
    if app_data_dir:
        videos_dir = Path(app_data_dir) / 'videos'
    else:
        # Dev fallback: two levels up from this file lands at backend/
        videos_dir = Path(__file__).resolve().parent.parent.parent / 'videos'

    videos_dir.mkdir(parents=True, exist_ok=True)
    return videos_dir
