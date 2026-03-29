import re
import threading
import uuid
from pathlib import Path

from django.core.cache import cache
from django.http import FileResponse, HttpResponse, StreamingHttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LearningPath, LearningPathItem
from .serializers import LearningPathItemSerializer, LearningPathSerializer
from .utils import get_videos_dir

# Cache key helpers — keep key format in one place
def _progress_key(item_id): return f'download_progress:{item_id}'
def _token_key(token):      return f'video_token:{token}'


# ---------------------------------------------------------------------------
# yt-dlp bot-detection retry
# ---------------------------------------------------------------------------

# Browsers yt-dlp can pull cookies from, tried in order of popularity.
_COOKIE_BROWSERS = ('firefox', 'brave', 'chrome', 'chromium', 'edge', 'opera', 'vivaldi', 'safari')


def _parse_yt_dlp_error(exc: Exception) -> str:
    """
    Map a yt-dlp exception to a short reason code stored in download_error.
    Keeps the frontend simple — it maps codes to localised strings.
    """
    msg = str(exc).lower()
    if 'sign in' in msg or 'bot' in msg:
        return 'bot_detection'
    if 'age' in msg:
        return 'age_restricted'
    if 'country' in msg or 'region' in msg or 'not available in your' in msg:
        return 'geo_blocked'
    if 'member' in msg or 'join this channel' in msg:
        return 'members_only'
    if 'premium' in msg or 'payment' in msg:
        return 'premium_required'
    if 'private' in msg or 'removed' in msg or 'unavailable' in msg or 'deleted' in msg:
        return 'unavailable'
    if 'format' in msg or 'requested format' in msg:
        return 'format_unavailable'
    return 'unknown'


def _is_bot_error(exc: Exception) -> bool:
    """Return True if the error is retryable with a different browser or cookies."""
    msg = str(exc).lower()
    return (
        'sign in' in msg
        or 'bot' in msg
        or 'cookie' in msg          # "could not find … cookies database"
        or 'could not find' in msg  # browser profile directory missing
        or 'failed to load' in msg  # CookieLoadError wrapper
    )


def _yt_extract_info(url: str, ydl_opts: dict, *, download: bool = False):
    """
    Call yt-dlp extract_info, automatically retrying with browser cookies
    if YouTube's bot detection triggers.

    On the first call we omit cookies (fast path — most runs won't need them).
    If we get a bot/sign-in error we iterate through all installed browsers and
    retry with their cookie stores until one works.  Raises the original
    exception when no browser succeeds.
    """
    import yt_dlp

    # Fast path: try without cookies first
    last_exc = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=download)
    except Exception as exc:
        if not _is_bot_error(exc):
            raise  # non-bot error (private video, unavailable, etc.) — surface immediately
        last_exc = exc  # save before Python's except-as clause deletes the binding

    logger = _yt_logger()
    logger.warning('Bot detection on %s — retrying with browser cookies', url)
    for browser in _COOKIE_BROWSERS:
        try:
            opts = {**ydl_opts, 'cookiesfrombrowser': (browser,)}
            with yt_dlp.YoutubeDL(opts) as ydl:
                result = ydl.extract_info(url, download=download)
            logger.info('Bot bypass succeeded using %s cookies', browser)
            return result
        except Exception as exc:
            last_exc = exc
            if not _is_bot_error(exc):
                raise  # something other than bot detection went wrong
            # browser not installed or still bot-detected — try next
            continue

    raise last_exc


def _yt_logger():
    """
    Return a logger that writes to {APP_DATA_DIR}/lexi-debug.log.
    Falls back to the standard Django logger if APP_DATA_DIR is not set.
    """
    import logging
    import os
    logger = logging.getLogger('lexi.yt_dlp')
    if not logger.handlers:
        data_dir = os.environ.get('APP_DATA_DIR', '')
        if data_dir:
            fh = logging.FileHandler(os.path.join(data_dir, 'lexi-debug.log'), encoding='utf-8')
            fh.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
            logger.addHandler(fh)
        logger.setLevel(logging.DEBUG)
    return logger


class LearningPathViewSet(viewsets.ModelViewSet):
    serializer_class = LearningPathSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Return only the paths that belong to the current user.
        This is the ownership filter — a user never sees another user's paths here.
        (Public access via share_token is a separate endpoint, added later.)
        """
        return LearningPath.objects.filter(
            created_by=self.request.user
        ).prefetch_related('items')

    def perform_create(self, serializer):
        """
        DRF calls perform_create() after validation, just before saving.
        We inject created_by here so the client never needs to send it.
        """
        serializer.save(created_by=self.request.user)

    @action(
        detail=False,          # no {pk} in URL — matches /paths/shared/{token}/
        methods=['get'],
        url_path='shared/(?P<token>[^/.]+)',
        permission_classes=[AllowAny],
    )
    def shared(self, request, token=None):
        """
        Public read-only view of a path via its share_token.
        Anyone with the link can view — no authentication required.
        Only works if is_public=True.
        """
        try:
            path = LearningPath.objects.prefetch_related('items').get(
                share_token=token,
                is_public=True,
            )
        except LearningPath.DoesNotExist:
            return Response(
                {'detail': 'Path not found or not public.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = LearningPathSerializer(path)
        return Response(serializer.data)

    @action(
        detail=True,           # has {pk} in URL — matches /paths/{id}/clone/
        methods=['post'],
        permission_classes=[IsAuthenticated],
    )
    def clone(self, request, pk=None):
        """
        Deep-copy a path to the authenticated user's account.
        Owners can clone their own private paths; public paths can be cloned by anyone.
        Accepts an optional 'title' in the request body to rename the clone.
        """
        from django.db.models import Q
        try:
            source = LearningPath.objects.prefetch_related('items').get(
                Q(is_public=True) | Q(created_by=request.user),
                pk=pk,
            )
        except LearningPath.DoesNotExist:
            return Response(
                {'detail': 'Path not found or not accessible.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        custom_title = request.data.get('title', '').strip()
        clone_title = custom_title if custom_title else f'{source.title} (clone)'

        # Create the new path — pk=None forces Django to INSERT a new row
        new_path = LearningPath.objects.create(
            title=clone_title,
            description=source.description,
            is_public=False,       # clones are private by default
            created_by=request.user,
        )

        # Bulk-copy all items; reset pk to None so Django inserts new rows
        new_items = []
        for item in source.items.all():
            new_items.append(LearningPathItem(
                learning_path=new_path,
                title=item.title,
                youtube_url=item.youtube_url,
                video_id=item.video_id,
                thumbnail_url=item.thumbnail_url,
                position=item.position,
            ))
        LearningPathItem.objects.bulk_create(new_items)

        serializer = LearningPathSerializer(new_path)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def reorder(self, request, pk=None):
        """
        Accepts { "order": [id1, id2, ...] } and reassigns positions in that order.

        Two-pass strategy to avoid unique_together (learning_path, position) conflicts:
          Pass 1 — shift all current positions up by n (0..n-1 → n..2n-1), guaranteed safe.
          Pass 2 — assign final positions (0..n-1), guaranteed safe because current are n..2n-1.
        Both passes run inside a transaction so the DB never sees an inconsistent state.
        """
        from django.db import transaction

        path = self.get_object()
        order = request.data.get('order', [])

        with transaction.atomic():
            items = {item.id: item for item in path.items.all()}
            n = len(items)

            # Pass 1: move every item to a temporary safe position
            for item in items.values():
                item.position = item.position + n
            LearningPathItem.objects.bulk_update(items.values(), ['position'])

            # Pass 2: set final positions according to the requested order
            to_update = []
            for position, item_id in enumerate(order):
                try:
                    item_id = int(item_id)
                except (TypeError, ValueError):
                    continue
                if item_id in items:
                    items[item_id].position = position
                    to_update.append(items[item_id])
            LearningPathItem.objects.bulk_update(to_update, ['position'])

        return Response({'status': 'ok'})


class LearningPathItemViewSet(viewsets.ModelViewSet):
    serializer_class = LearningPathItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Items are always scoped to a specific path, which must belong to the user.
        The path_pk comes from the nested URL: /paths/{path_pk}/items/
        """
        return LearningPathItem.objects.filter(
            learning_path_id=self.kwargs['path_pk'],
            learning_path__created_by=self.request.user,
        )

    def perform_create(self, serializer):
        """
        Resolve the path from the URL, verify ownership, then save.
        """
        path_pk = self.kwargs['path_pk']
        try:
            path = LearningPath.objects.get(pk=path_pk, created_by=self.request.user)
        except LearningPath.DoesNotExist:
            raise PermissionDenied('Learning path not found or not owned by you.')
        serializer.save(learning_path=path)


# ---------------------------------------------------------------------------
# Offline video — download
# ---------------------------------------------------------------------------

def _download_video_task(item_id: int, youtube_url: str, video_id: str) -> None:
    """
    Background thread: download a YouTube video using yt-dlp and update the model.

    Runs in a daemon thread so it doesn't block the HTTP response.
    Uses .filter().update() instead of instance.save() to avoid race conditions
    and to work correctly outside of a request context.

    Format string explained:
      bestvideo+bestaudio  → best quality, requires ffmpeg to merge streams
      /best                → best single-file format (no ffmpeg needed, fallback)

    We do NOT restrict to ext=mp4 because YouTube stopped serving mp4 for many
    videos at best quality. The actual extension is read from yt-dlp's info dict
    after download and stored in local_file_path, so VideoServeView can serve
    the correct MIME type regardless of whether the file is mp4 or webm.
    """
    videos_dir = get_videos_dir()
    # %(ext)s is filled in by yt-dlp with the real extension after download
    output_template = str(videos_dir / f'{video_id}.%(ext)s')

    def _progress_hook(d):
        """Called by yt-dlp on every progress update. Stores percentage in cache.

        YouTube DASH streams (the bestvideo+bestaudio format) download as
        numbered fragments. fragment_index / fragment_count is the most
        reliable progress source for these — bytes and _percent_str are
        often unavailable or report 'Unknown %' on DASH streams.
        """
        if d['status'] != 'downloading':
            return

        pct = None

        # Primary: fragment-based progress (reliable for YouTube DASH streams)
        frag_idx = d.get('fragment_index')
        frag_count = d.get('fragment_count')
        if frag_idx is not None and frag_count:
            pct = min(int(frag_idx / frag_count * 100), 100)

        # Secondary: use yt-dlp's own formatted string e.g. '  45.2%'
        if pct is None:
            pct_str = d.get('_percent_str', '').strip().rstrip('%')
            try:
                pct = min(int(float(pct_str)), 100)
            except (ValueError, TypeError):
                pass

        # Fallback: compute from raw bytes
        if pct is None:
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)
            if total > 0:
                pct = min(int(downloaded / total * 100), 100)

        if pct is not None:
            cache.set(_progress_key(item_id), pct, timeout=3600)

    ydl_opts = {
        'format': 'bestvideo+bestaudio/best',
        'outtmpl': output_template,
        # No merge_output_format: let yt-dlp produce whatever it can.
        # With ffmpeg: merges to mkv/mp4. Without ffmpeg: downloads best single file.
        # noplaylist: same reason as VideoOnlineStreamView — playlist URLs must
        # only download the specific video, not the entire playlist.
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'progress_hooks': [_progress_hook],
    }

    try:
        info = _yt_extract_info(youtube_url, ydl_opts, download=True)

        # Read the actual extension from the info dict — never assume .mp4
        ext = info.get('ext', 'mp4')
        final_path = videos_dir / f'{video_id}.{ext}'
        LearningPathItem.objects.filter(pk=item_id).update(
            local_file_path=str(final_path),
            download_status=LearningPathItem.DOWNLOAD_DONE,
            download_error='',
        )
    except Exception as exc:
        import traceback
        _yt_logger().error(
            'Download failed for item %s (%s): %s\n%s',
            item_id, youtube_url, exc, traceback.format_exc()
        )
        LearningPathItem.objects.filter(pk=item_id).update(
            download_status=LearningPathItem.DOWNLOAD_ERROR,
            download_error=_parse_yt_dlp_error(exc),
        )


class VideoDownloadView(APIView):
    """
    Manage offline download of a video item.

    POST   → start the download (returns immediately, runs in background)
    GET    → check current download status
    DELETE → remove the local file and reset status to 'none'
    """
    permission_classes = [IsAuthenticated]

    def _get_item(self, item_id, user):
        try:
            return LearningPathItem.objects.get(
                pk=item_id,
                learning_path__created_by=user,
            )
        except LearningPathItem.DoesNotExist:
            return None

    def post(self, request, item_id):
        item = self._get_item(item_id, request.user)
        if item is None:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

        if item.download_status == LearningPathItem.DOWNLOAD_DOWNLOADING:
            return Response({'status': 'downloading', 'detail': 'Already in progress.'})

        # If already downloaded and file still exists, skip
        if (item.download_status == LearningPathItem.DOWNLOAD_DONE
                and item.local_file_path
                and Path(item.local_file_path).exists()):
            return Response({'status': 'done', 'detail': 'Already downloaded.'})

        item.download_status = LearningPathItem.DOWNLOAD_DOWNLOADING
        item.download_error = ''
        item.save(update_fields=['download_status', 'download_error'])

        # daemon=True: thread dies with the process — no orphan threads if the app quits
        thread = threading.Thread(
            target=_download_video_task,
            args=(item.id, item.youtube_url, item.video_id),
            daemon=True,
        )
        thread.start()

        return Response({'status': 'downloading'}, status=status.HTTP_202_ACCEPTED)

    def get(self, request, item_id):
        item = self._get_item(item_id, request.user)
        if item is None:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'status': item.download_status,
            'has_local_file': bool(item.local_file_path and Path(item.local_file_path).exists()),
            'progress': cache.get(_progress_key(item_id)),
            'download_error': item.download_error or '',
        })

    def delete(self, request, item_id):
        item = self._get_item(item_id, request.user)
        if item is None:
            return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

        if item.local_file_path:
            path = Path(item.local_file_path)
            if path.exists():
                path.unlink()

        LearningPathItem.objects.filter(pk=item.pk).update(
            local_file_path='',
            download_status=LearningPathItem.DOWNLOAD_NONE,
            download_error='',
        )
        return Response({'status': 'none'})


# ---------------------------------------------------------------------------
# Offline video — token + serve
# ---------------------------------------------------------------------------

class VideoTokenView(APIView):
    """
    POST /api/videos/token/{item_id}/  →  { "token": "<uuid>" }

    The browser's native <video> element cannot send custom headers like
    Authorization: Bearer ... — it makes bare HTTP requests managed by the
    browser itself.  To authenticate those requests we issue a short-lived
    UUID token, store it in the cache for 1 hour, and let the frontend
    append it as ?token= to the video src URL.  VideoServeView validates
    it instead of the bearer token when the query param is present.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, item_id):
        try:
            item = LearningPathItem.objects.get(
                pk=item_id,
                learning_path__created_by=request.user,
            )
        except LearningPathItem.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        token = str(uuid.uuid4())
        cache.set(_token_key(token), item_id, timeout=3600)

        # Return the local file path so the Electron renderer can serve it via
        # the native lexipath:// protocol, bypassing Django for local files.
        local_path = None
        if item.local_file_path and Path(item.local_file_path).exists():
            local_path = item.local_file_path

        return Response({'token': token, 'local_path': local_path})


class VideoDiagView(APIView):
    """
    GET /api/videos/diag/{item_id}/   (authenticated)

    Temporary diagnostic endpoint: runs yt-dlp extract_info for a video item
    and returns either the extracted URL info or the full error traceback as
    plain text.  This lets us see exactly what yt-dlp is doing in any
    environment without relying on dev-tools response capture.

    Remove this view once the streaming issue is diagnosed and fixed.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, item_id):
        import traceback
        import yt_dlp

        try:
            item = LearningPathItem.objects.get(
                pk=item_id,
                learning_path__created_by=request.user,
            )
        except LearningPathItem.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        results = {}
        for fmt_label, fmt_string in [
            ('best_combined',    'best[acodec!=none][vcodec!=none]'),
            ('best_with_audio',  'best[acodec!=none]'),
            ('best_fallback',    'best'),
            ('format_18',        '18'),
        ]:
            try:
                ydl_opts = {
                    'format': fmt_string,
                    'noplaylist': True,
                    'quiet': True,
                    'no_warnings': True,
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(item.youtube_url, download=False)
                results[fmt_label] = {
                    'ok': True,
                    'url_present': bool(info.get('url')),
                    'keys': sorted(info.keys()),
                    'ext': info.get('ext'),
                    'height': info.get('height'),
                    'requested_formats_count': len(info.get('requested_formats', [])),
                }
            except Exception as exc:
                results[fmt_label] = {
                    'ok': False,
                    'error': str(exc),
                    'traceback': traceback.format_exc(),
                }

        _yt_logger().info('VideoDiagView results for item %s: %s', item_id, results)
        return Response({'item_id': item_id, 'youtube_url': item.youtube_url, 'results': results})


class VideoOnlineStreamView(APIView):
    """
    Stream a YouTube video in real-time without downloading it.

    Uses yt-dlp to extract the direct CDN URL (format='best' → single combined
    A/V stream, usually ~480p, no ffmpeg merge needed), then proxies the bytes
    through Django.  The frontend uses a plain <video> element pointing at this
    endpoint — no iframe, no embedding restrictions.

    The extracted URL is cached for 30 min.  Range requests are forwarded so
    the browser's media player can seek freely.
    """
    permission_classes = []

    def get(self, request, item_id):
        import urllib.request
        import urllib.error

        # --- Auth (mirrors VideoServeView: Bearer or ?token=) ---
        token = request.query_params.get('token')
        if token:
            cached_id = cache.get(_token_key(token))
            if cached_id != item_id:
                return Response({'detail': 'Invalid or expired token.'}, status=status.HTTP_403_FORBIDDEN)
            try:
                item = LearningPathItem.objects.get(pk=item_id)
            except LearningPathItem.DoesNotExist:
                return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            if not request.user or not request.user.is_authenticated:
                return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
            try:
                item = LearningPathItem.objects.get(
                    pk=item_id,
                    learning_path__created_by=request.user,
                )
            except LearningPathItem.DoesNotExist:
                return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

        # --- Extract stream URL, cached for 30 min ---
        url_cache_key = f'yt_online_url:{item_id}'
        stream_info = cache.get(url_cache_key)
        if not stream_info:
            try:
                logger = _yt_logger()

                ydl_opts = {
                    # No 'format' key: fetch all available formats so we can
                    # pick the best combined A/V one manually without yt-dlp
                    # raising "Requested format is not available" when YouTube
                    # no longer provides legacy combined streams for a video.
                    'noplaylist': True,
                    'quiet': True,
                    'no_warnings': True,
                }
                info = _yt_extract_info(item.youtube_url, ydl_opts)

                mime_map = {
                    'mp4': 'video/mp4',
                    'webm': 'video/webm',
                    'm4v': 'video/mp4',
                    'mov': 'video/quicktime',
                }
                ext = info.get('ext', 'mp4')
                http_headers = info.get('http_headers', {})
                stream_url = None

                formats = info.get('formats', [])

                # Priority 1: legacy progressive formats (single combined A/V file).
                # Format 18 = 360p mp4, format 22 = 720p mp4 — YouTube still
                # provides these for most videos and they have a direct URL.
                for fmt_id in ('22', '18'):
                    fmt = next(
                        (f for f in formats if f.get('format_id') == fmt_id and f.get('url')),
                        None,
                    )
                    if fmt:
                        stream_url = fmt['url']
                        ext = fmt.get('ext', ext)
                        http_headers = fmt.get('http_headers', http_headers)
                        break

                # Priority 2: any other combined A/V format, best quality first.
                if not stream_url:
                    combined = [
                        f for f in formats
                        if f.get('url')
                        and f.get('acodec', 'none') != 'none'
                        and f.get('vcodec', 'none') != 'none'
                    ]
                    if combined:
                        best = max(combined, key=lambda f: (f.get('height') or 0, f.get('tbr') or 0))
                        stream_url = best['url']
                        ext = best.get('ext', ext)
                        http_headers = best.get('http_headers', http_headers)

                # Priority 3: yt-dlp already resolved a top-level url
                if not stream_url:
                    stream_url = info.get('url')

                if not stream_url:
                    # This video only has DASH streams (separate video+audio).
                    # The browser cannot play them without merging — the user
                    # must download the video first.
                    logger.error(
                        'VideoOnlineStreamView: no combined A/V format for item %s '
                        '(DASH-only video). formats count: %d',
                        item_id, len(formats),
                    )
                    return Response(
                        {
                            'type': 'no_combined_format',
                            'detail': 'This video is only available in DASH streams and cannot be played directly. Download it first.',
                        },
                        status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    )

                stream_info = {
                    'url': stream_url,
                    'content_type': mime_map.get(ext, 'video/webm'),
                    'headers': dict(http_headers),
                }
                cache.set(url_cache_key, stream_info, timeout=1800)
            except Exception as exc:
                import traceback
                _yt_logger().error(
                    'VideoOnlineStreamView: yt-dlp extraction failed for item %s: %s\n%s',
                    item_id, exc, traceback.format_exc()
                )
                return Response(
                    {'detail': f'Stream extraction failed: {exc}'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        # --- Proxy the stream ---
        proxy_headers = dict(stream_info.get('headers', {}))
        range_header = request.META.get('HTTP_RANGE', '').strip()
        if range_header:
            proxy_headers['Range'] = range_header

        try:
            req = urllib.request.Request(stream_info['url'], headers=proxy_headers)
            upstream = urllib.request.urlopen(req, timeout=30)
        except (urllib.error.HTTPError, urllib.error.URLError, Exception):
            # URL likely expired — clear cache so next request gets a fresh URL
            cache.delete(url_cache_key)
            return Response({'detail': 'Stream unavailable. Please retry.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        def _iter_content(conn, chunk_size=65536):
            try:
                while True:
                    data = conn.read(chunk_size)
                    if not data:
                        break
                    yield data
            finally:
                conn.close()

        response = StreamingHttpResponse(
            _iter_content(upstream),
            status=upstream.getcode(),
            content_type=stream_info['content_type'],
        )
        for header_name in ('Content-Range', 'Content-Length', 'Accept-Ranges'):
            val = upstream.headers.get(header_name)
            if val:
                response[header_name] = val
        return response


class VideoServeView(APIView):
    """
    Stream a locally downloaded video file to the browser.

    Supports HTTP Range requests, which are required for the browser's
    <video> element to support seeking. Without range support, the video
    plays from the start but the user cannot skip ahead.

    Range request flow:
      Browser sends:  Range: bytes=1048576-
      We reply with:  206 Partial Content
                      Content-Range: bytes 1048576-{end}/{total}
                      Content-Length: {length}
    """
    # Auth is handled manually below — we support both Bearer token (axios)
    # and the ?token= query param (native <video> element).
    permission_classes = []

    def get(self, request, item_id):
        token = request.query_params.get('token')

        if token:
            # Token-based auth: validate the UUID against the cache
            cached_id = cache.get(_token_key(token))
            if cached_id != item_id:
                return Response({'detail': 'Invalid or expired token.'}, status=status.HTTP_403_FORBIDDEN)
            try:
                item = LearningPathItem.objects.get(pk=item_id)
            except LearningPathItem.DoesNotExist:
                return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Standard JWT auth for direct API access
            if not request.user or not request.user.is_authenticated:
                return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
            try:
                item = LearningPathItem.objects.get(
                    pk=item_id,
                    learning_path__created_by=request.user,
                )
            except LearningPathItem.DoesNotExist:
                return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not item.local_file_path:
            return Response({'detail': 'No local file for this item.'}, status=status.HTTP_404_NOT_FOUND)

        file_path = Path(item.local_file_path)
        if not file_path.exists():
            return Response({'detail': 'File not found on disk.'}, status=status.HTTP_404_NOT_FOUND)

        file_size = file_path.stat().st_size
        range_header = request.META.get('HTTP_RANGE', '').strip()

        # Detect MIME type from the actual extension — the file may be webm or
        # mkv if ffmpeg merged the streams, not necessarily mp4.
        ext = file_path.suffix.lower()
        mime_map = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mkv': 'video/x-matroska',
            '.avi': 'video/x-msvideo',
        }
        content_type = mime_map.get(ext, 'video/mp4')

        def _stream_range(filepath, start, length, chunk=512 * 1024):
            """Yield the requested byte range in 512 KB chunks."""
            remaining = length
            with open(filepath, 'rb') as fh:
                fh.seek(start)
                while remaining > 0:
                    data = fh.read(min(chunk, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        if range_header:
            match = re.match(r'bytes=(\d+)-(\d*)', range_header)
            if match:
                start = int(match.group(1))
                end = int(match.group(2)) if match.group(2) else file_size - 1
                end = min(end, file_size - 1)
                length = end - start + 1

                response = StreamingHttpResponse(
                    _stream_range(file_path, start, length),
                    status=206,
                    content_type=content_type,
                )
                response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
                response['Content-Length'] = str(length)
                response['Accept-Ranges'] = 'bytes'
                return response

        response = FileResponse(open(file_path, 'rb'), content_type=content_type)
        response['Content-Length'] = str(file_size)
        response['Accept-Ranges'] = 'bytes'
        return response
