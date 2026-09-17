"""Persistent Zomorod bootstrap for PasarGuard.

PasarGuard recreates its container on a normal panel restart. Runtime `docker cp`
patches therefore cannot be relied on for Python API routes: they can be copied
after the process has already imported `app.routers`, which leaves the Zomorod
UI visible while `/api/zomorod/*` returns 404.

The installer adds this directory to PYTHONPATH. Python imports `sitecustomize`
before executing `main.py`, so the Zomorod router is registered deterministically
before PasarGuard imports the final API router. Other Python invocations such as
Alembic migrations are intentionally ignored.
"""

from __future__ import annotations

import importlib
import os
import sys
import traceback
from pathlib import Path

BOOTSTRAP_LOG = Path("/var/lib/pasarguard/zomorod/bootstrap.log")
PROFILE_ROUTE = "/api/zomorod/profile"


def _log(message: str) -> None:
    line = f"[Zomorod bootstrap] {message}\n"
    try:
        sys.stderr.write(line)
    except Exception:
        pass
    try:
        BOOTSTRAP_LOG.parent.mkdir(parents=True, exist_ok=True)
        with BOOTSTRAP_LOG.open("a", encoding="utf-8") as handle:
            handle.write(line)
    except Exception:
        pass


def _is_pasarguard_main() -> bool:
    try:
        return os.path.basename(sys.argv[0] or "") == "main.py"
    except Exception:
        return False


def _make_pasarguard_importable() -> None:
    """Add the panel working directory before importing app.*.

    sitecustomize runs during Python site initialization, before Python inserts
    the script directory into sys.path. PasarGuard starts with working directory
    /code and then executes `python main.py`, so explicitly add cwd (plus known
    image layouts) when they contain both main.py and app/.
    """
    candidates = [Path.cwd(), Path("/code"), Path("/app"), Path("/opt/pasarguard")]
    seen: set[str] = set()
    for candidate in candidates:
        try:
            resolved = str(candidate.resolve())
        except Exception:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        path = Path(resolved)
        if (path / "main.py").is_file() and (path / "app").is_dir():
            if resolved not in sys.path:
                sys.path.insert(0, resolved)
            return
    raise RuntimeError("PasarGuard application directory was not found before main.py startup")


def _has_profile_route(routes, _seen: set[int] | None = None) -> bool:
    """Support both classic FastAPI routes and newer _IncludedRouter wrappers."""
    seen = _seen if _seen is not None else set()
    for route in routes or []:
        route_id = id(route)
        if route_id in seen:
            continue
        seen.add(route_id)
        if getattr(route, "path", None) == PROFILE_ROUTE:
            return True
        original_router = getattr(route, "original_router", None)
        nested_routes = getattr(original_router, "routes", None) if original_router is not None else None
        if nested_routes is not None and _has_profile_route(nested_routes, seen):
            return True
        direct_nested = getattr(route, "routes", None)
        if direct_nested is not None and _has_profile_route(direct_nested, seen):
            return True
    return False


def _bootstrap() -> None:
    if not _is_pasarguard_main():
        return

    try:
        _make_pasarguard_importable()
        from app.routers import api_router

        if _has_profile_route(api_router.routes):
            _log("router already registered; keeping existing registration")
            return

        backend = importlib.import_module("zomorod_admin_subscriptions")
        before = list(api_router.routes)
        before_ids = {id(route) for route in before}
        api_router.include_router(backend.router)

        added = [route for route in api_router.routes if id(route) not in before_ids]
        if not added or not _has_profile_route(added):
            raise RuntimeError("Zomorod router did not expose the profile route")

        # Custom /sub/<admin>/<token> and owner-scoped standard subscription
        # routes must be checked before PasarGuard's generic /sub/{token}/...
        # routes. Keep all native routes intact, only move our newly added ones
        # to the front of the registry.
        native = [route for route in api_router.routes if id(route) in before_ids]
        api_router.routes[:] = added + native
        _log(f"registered {len(added)} included router(s) before native PasarGuard routes")
    except Exception as exc:
        _log(f"FAILED: {type(exc).__name__}: {exc}")
        try:
            traceback.print_exc()
        except Exception:
            pass
        # Never take the whole PasarGuard panel down because an optional addon
        # failed. The installer/doctor can surface bootstrap.log for diagnosis.


_bootstrap()
