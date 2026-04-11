from django.contrib import admin
from django.conf import settings
from django.http import FileResponse, Http404
from django.urls import include, path, re_path
from django.views import View


class SPACatchAllView(View):
    """
    Serves index.html for any route that isn't the API or admin.

    Why this is needed:
    React Router handles navigation client-side (e.g. /dashboard, /paths/3).
    When the user refreshes or deep-links, the browser makes a real HTTP request
    to Django for that URL. Without this catch-all, Django would return 404.
    This view hands those requests back to the SPA so React Router can render
    the right page.

    Only active when STATIC_ROOT/index.html exists (i.e. after `collectstatic`).
    In pure dev mode (Vite on :5173) this view is never reached.
    """

    def get(self, request, *args, **kwargs):
        index = settings.STATIC_ROOT / 'index.html'
        if not index.exists():
            raise Http404('Frontend not built. Run: npm run build && manage.py collectstatic')
        return FileResponse(open(index, 'rb'), content_type='text/html')


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.users.urls')),
    path('api/', include('apps.paths.urls')),
    path('api/progress/', include('apps.progress.urls')),
    path('api/', include('apps.notebooks.urls')),

    # SPA catch-all — must be last so API and admin routes take priority.
    # re_path('') matches any URL not already matched above.
    re_path(r'', SPACatchAllView.as_view(), name='spa'),
]
