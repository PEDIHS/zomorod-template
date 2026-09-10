"""Zomorod owner-only admin subscription namespaces for PasarGuard.

Keeps PasarGuard's native per-user subscription token as the secret and adds a
short admin namespace in front of it:

    /sub/<admin-slug>/<native-user-token>

Each request validates that the resolved user belongs to the mapped admin. A
foreign token returns 404. The custom short-slug path convertor is important:
it prevents these routes from stealing PasarGuard's native /sub/<token>/<format>
URLs, because native tokens contain a dot and do not match the slug convertor.
"""

from __future__ import annotations

import fcntl
import json
import os
import re
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from starlette.convertors import Convertor, register_url_convertor

from app.db import AsyncSession, get_db
from app.db.models import Admin
from app.models.admin import AdminDetails
from app.models.settings import Application, ConfigFormat
from app.models.stats import UserUsageStatsList
from app.models.user import SubscriptionUserResponse
from app.operation import OperatorType
from app.operation.subscription import SubscriptionOperation
from app.routers.authentication import get_current
from app.routers.dependencies import get_subscription_headers, get_subscription_usage_query
from config import subscription_env_settings


class ZomorodSlugConvertor(Convertor[str]):
    regex = r"[a-z0-9][a-z0-9_-]{0,31}"

    def convert(self, value: str) -> str:
        return value.lower()

    def to_string(self, value: str) -> str:
        return value.lower()


# Registration is idempotent in practice for a single app import; overwriting the
# same named convertor during reloads is safe in Starlette.
register_url_convertor("zslug", ZomorodSlugConvertor())

router = APIRouter(tags=["Zomorod"])
subscription_operator = SubscriptionOperation(operator_type=OperatorType.API)

DATA_DIR = Path(os.getenv("ZOMOROD_DATA_DIR", "/var/lib/pasarguard/zomorod"))
ROUTES_FILE = DATA_DIR / "admin-subscriptions.json"
LOCK_FILE = DATA_DIR / ".admin-subscriptions.lock"
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
RESERVED_SLUGS = {"api", "info", "raw", "apps", "usage", "admin", "zomorod"}


class NamespaceUpsert(BaseModel):
    admin_id: int = Field(ge=1)
    slug: str | None = Field(default=None, max_length=32)
    enabled: bool = True


def _empty_state() -> dict:
    return {"version": 1, "routes": {}}


def _load_state() -> dict:
    try:
        data = json.loads(ROUTES_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("routes"), dict):
            return _empty_state()
        return {"version": 1, "routes": data["routes"]}
    except (FileNotFoundError, json.JSONDecodeError, OSError, TypeError):
        return _empty_state()


@contextmanager
def _write_lock():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with LOCK_FILE.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def _save_state(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = ROUTES_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, ROUTES_FILE)


def _normalize_slug(value: str | None, username: str, admin_id: int) -> str:
    raw = (value or username or "").strip().lower()
    slug = re.sub(r"[^a-z0-9_-]+", "-", raw).strip("-_")
    if not slug:
        slug = f"admin-{admin_id}"
    if not SLUG_RE.fullmatch(slug) or slug in RESERVED_SLUGS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid or reserved namespace. Use 1-32 lowercase letters, digits, _ or -.",
        )
    return slug


def _require_owner(current_admin: AdminDetails | None = Depends(get_current)) -> AdminDetails:
    if current_admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if not current_admin.role or not current_admin.role.is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Zomorod settings are owner-only")
    return current_admin


async def _admin_rows(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(Admin.id, Admin.username).order_by(Admin.username.asc()))).all()
    return [{"id": int(admin_id), "username": username} for admin_id, username in rows]


def _public_routes(state: dict) -> list[dict]:
    result = []
    base = f"/{subscription_env_settings.path}"
    for slug, item in sorted(state.get("routes", {}).items()):
        result.append(
            {
                "slug": slug,
                "admin_id": item.get("admin_id"),
                "username": item.get("username"),
                "enabled": item.get("enabled", True),
                "created_at": item.get("created_at"),
                "path_prefix": f"{base}/{slug}",
                "example": f"{base}/{slug}/<subscription-hash>",
            }
        )
    return result


@router.get("/api/zomorod/admin-subscriptions")
async def list_admin_namespaces(
    db: AsyncSession = Depends(get_db),
    _owner: AdminDetails = Depends(_require_owner),
):
    state = _load_state()
    return {
        "version": 1,
        "subscription_path": f"/{subscription_env_settings.path}",
        "admins": await _admin_rows(db),
        "routes": _public_routes(state),
    }


@router.post("/api/zomorod/admin-subscriptions")
async def upsert_admin_namespace(
    model: NamespaceUpsert,
    db: AsyncSession = Depends(get_db),
    _owner: AdminDetails = Depends(_require_owner),
):
    db_admin = (await db.execute(select(Admin).where(Admin.id == model.admin_id))).scalar_one_or_none()
    if db_admin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")

    slug = _normalize_slug(model.slug, db_admin.username, db_admin.id)
    with _write_lock():
        state = _load_state()
        routes = state.setdefault("routes", {})
        existing = routes.get(slug)
        if existing and int(existing.get("admin_id", 0)) != int(db_admin.id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Namespace already belongs to another admin")

        for old_slug, item in list(routes.items()):
            if old_slug != slug and int(item.get("admin_id", 0)) == int(db_admin.id):
                del routes[old_slug]

        routes[slug] = {
            "admin_id": int(db_admin.id),
            "username": db_admin.username,
            "enabled": bool(model.enabled),
            "created_at": existing.get("created_at") if existing else datetime.now(UTC).isoformat(),
        }
        _save_state(state)

    return next(item for item in _public_routes(state) if item["slug"] == slug)


@router.delete("/api/zomorod/admin-subscriptions/{slug}")
async def delete_admin_namespace(
    slug: str,
    _owner: AdminDetails = Depends(_require_owner),
):
    normalized = slug.strip().lower()
    with _write_lock():
        state = _load_state()
        if normalized not in state.get("routes", {}):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Namespace not found")
        del state["routes"][normalized]
        _save_state(state)
    return {"ok": True, "slug": normalized}


async def _validate_namespace(db: AsyncSession, admin_slug: str, token: str) -> None:
    state = _load_state()
    mapping = state.get("routes", {}).get(admin_slug.lower())
    if not mapping or not mapping.get("enabled", True):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    db_user = await subscription_operator.get_validated_sub(db, token, load_admin_role=True)
    if int(getattr(db_user, "admin_id", 0) or 0) != int(mapping.get("admin_id", 0) or 0):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


SUB_PREFIX = f"/{subscription_env_settings.path}"
SCOPE = "{admin_slug:zslug}"


@router.get(f"{SUB_PREFIX}/{SCOPE}/{{token}}/")
@router.get(f"{SUB_PREFIX}/{SCOPE}/{{token}}", include_in_schema=False)
async def namespaced_subscription(
    request: Request,
    admin_slug: str,
    token: str,
    db: AsyncSession = Depends(get_db),
    user_agent: str = Header(default=""),
    headers=Depends(get_subscription_headers),
):
    await _validate_namespace(db, admin_slug, token)
    return await subscription_operator.user_subscription(
        db,
        token=token,
        accept_header=request.headers.get("Accept", ""),
        user_agent=user_agent,
        ip=request.client.host if request.client else None,
        request_url=str(request.url),
        **headers.model_dump(),
    )


@router.head(f"{SUB_PREFIX}/{SCOPE}/{{token}}/")
@router.head(f"{SUB_PREFIX}/{SCOPE}/{{token}}", include_in_schema=False)
async def namespaced_subscription_headers(
    request: Request,
    admin_slug: str,
    token: str,
    db: AsyncSession = Depends(get_db),
    user_agent: str = Header(default=""),
):
    await _validate_namespace(db, admin_slug, token)
    response_headers = await subscription_operator.user_subscription_headers(
        db,
        token=token,
        accept_header=request.headers.get("Accept", ""),
        user_agent=user_agent,
        request_url=str(request.url),
    )
    return Response(headers=response_headers)


@router.get(f"{SUB_PREFIX}/{SCOPE}/{{token}}/info", response_model=SubscriptionUserResponse)
async def namespaced_subscription_info(
    request: Request,
    admin_slug: str,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    await _validate_namespace(db, admin_slug, token)
    user_data, response_headers = await subscription_operator.user_subscription_info(
        db, token=token, ip=request.client.host if request.client else None
    )
    return JSONResponse(content=user_data.model_dump(mode="json"), headers=response_headers)


@router.get(f"{SUB_PREFIX}/{SCOPE}/{{token}}/raw")
async def namespaced_subscription_raw(
    request: Request,
    admin_slug: str,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    await _validate_namespace(db, admin_slug, token)
    return await subscription_operator.user_subscription_raw(db, token=token, request_url=str(request.url))


@router.get(f"{SUB_PREFIX}/{SCOPE}/{{token}}/apps", response_model=list[Application])
async def namespaced_subscription_apps(
    admin_slug: str,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    await _validate_namespace(db, admin_slug, token)
    return await subscription_operator.user_subscription_apps(db, token)


@router.get(f"{SUB_PREFIX}/{SCOPE}/{{token}}/usage", response_model=UserUsageStatsList)
async def namespaced_subscription_usage(
    admin_slug: str,
    token: str,
    query=Depends(get_subscription_usage_query),
    db: AsyncSession = Depends(get_db),
):
    await _validate_namespace(db, admin_slug, token)
    return await subscription_operator.get_user_usage(db, token=token, query=query)


@router.get(f"{SUB_PREFIX}/{SCOPE}/{{token}}/{{client_type}}")
async def namespaced_subscription_client(
    request: Request,
    admin_slug: str,
    token: str,
    client_type: ConfigFormat,
    db: AsyncSession = Depends(get_db),
    headers=Depends(get_subscription_headers),
):
    await _validate_namespace(db, admin_slug, token)
    return await subscription_operator.user_subscription_with_client_type(
        db,
        token=token,
        client_type=client_type,
        request_url=str(request.url),
        **headers.model_dump(),
    )
