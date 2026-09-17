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


def _has_profile_route(routes) -> bool:
    return any(getattr(route, "path", None) == PROFILE_ROUTE for route in routes)


def _bootstrap() -> None:
    if not _is_pasarguard_main():
        return

    try:
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
        _log(f"registered {len(added)} routes before native PasarGuard routes")
    except Exception as exc:
        _log(f"FAILED: {type(exc).__name__}: {exc}")
        try:
            traceback.print_exc()
        except Exception:
            pass
        # Never take the whole PasarGuard panel down because an optional addon
        # failed. The installer/doctor can surface bootstrap.log for diagnosis.


_bootstrap()
