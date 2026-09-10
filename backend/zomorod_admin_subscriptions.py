"""Zomorod integration backend for PasarGuard.

Two responsibilities live here:

1. Owner-only admin subscription namespaces:
       /sub/<admin-slug>/<native-user-token>
2. Self-service Zomorod profiles for every authenticated PasarGuard admin.

The native PasarGuard user token stays the only subscription secret.  Namespace
requests always verify that the token belongs to the mapped admin.  Per-admin
branding uses PasarGuard's own Admin.profile_title, Admin.support_url and
Admin.custom_variables fields, so reseller preferences live in PasarGuard's
native database rather than in a second Zomorod database.
"""

from __future__ import annotations

import base64
import fcntl
import json
import os
import re
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

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


register_url_convertor("zslug", ZomorodSlugConvertor())

router = APIRouter(tags=["Zomorod"])
subscription_operator = SubscriptionOperation(operator_type=OperatorType.API)

DATA_DIR = Path(os.getenv("ZOMOROD_DATA_DIR", "/var/lib/pasarguard/zomorod"))
ROUTES_FILE = DATA_DIR / "admin-subscriptions.json"
LOCK_FILE = DATA_DIR / ".admin-subscriptions.lock"
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
RESERVED_SLUGS = {"api", "info", "raw", "apps", "usage", "admin", "zomorod"}

VAR_SUPPORT_ID = "ZOMOROD_SUPPORT_ID"
VAR_SHOW_CONFIGS = "ZOMOROD_SHOW_CONFIGS"
VAR_SHOW_WIREGUARD = "ZOMOROD_SHOW_WIREGUARD"
VAR_SHOW_PING = "ZOMOROD_SHOW_PING"
VAR_SHOW_APPS = "ZOMOROD_SHOW_APPS"
VAR_SHOW_ANNOUNCEMENT = "ZOMOROD_SHOW_ANNOUNCEMENT"
VAR_ANNOUNCEMENT_MODE = "ZOMOROD_ANNOUNCEMENT_MODE"
VAR_ANNOUNCEMENT_TIMES = "ZOMOROD_ANNOUNCEMENT_TIMES"
VAR_ANNOUNCEMENT_DURATION = "ZOMOROD_ANNOUNCEMENT_DURATION"
ZOMOROD_VARIABLE_KEYS = {
    VAR_SUPPORT_ID,
    VAR_SHOW_CONFIGS,
    VAR_SHOW_WIREGUARD,
    VAR_SHOW_PING,
    VAR_SHOW_APPS,
    VAR_SHOW_ANNOUNCEMENT,
    VAR_ANNOUNCEMENT_MODE,
    VAR_ANNOUNCEMENT_TIMES,
    VAR_ANNOUNCEMENT_DURATION,
}

PROFILE_DEFAULTS = {
    "show_configs": False,
    "show_wireguard": False,
    "show_ping": True,
    "show_apps": True,
    "show_announcement": False,
    "announcement_mode": "always",
    "announcement_times": "",
    "announcement_duration": 60,
}


class NamespaceUpsert(BaseModel):
    admin_id: int = Field(ge=1)
    slug: str | None = Field(default=None, max_length=32)
    enabled: bool = True


class AdminProfileUpdate(BaseModel):
    store_name: str = Field(min_length=1, max_length=80)
    support_id: str = Field(default="", max_length=256)
    show_configs: bool = PROFILE_DEFAULTS["show_configs"]
    show_wireguard: bool = PROFILE_DEFAULTS["show_wireguard"]
    show_ping: bool = PROFILE_DEFAULTS["show_ping"]
    show_apps: bool = PROFILE_DEFAULTS["show_apps"]
    show_announcement: bool = PROFILE_DEFAULTS["show_announcement"]
    announcement_mode: Literal["always", "scheduled"] = "always"
    announcement_times: str = Field(default="", max_length=256)
    announcement_duration: int = Field(default=60, ge=1, le=1440)


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


def _require_admin(current_admin: AdminDetails | None = Depends(get_current)) -> AdminDetails:
    if current_admin is None or current_admin.id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return current_admin


def _require_owner(current_admin: AdminDetails = Depends(_require_admin)) -> AdminDetails:
    if not current_admin.role or not current_admin.role.is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner access required")
    return current_admin


def _custom_variable_map(admin: Admin) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in admin.custom_variables or []:
        if isinstance(item, dict):
            key = str(item.get("key") or "").upper()
            value = str(item.get("value") or "")
        else:
            key = str(getattr(item, "key", "") or "").upper()
            value = str(getattr(item, "value", "") or "")
        if key:
            result[key] = value
    return result


def _as_bool(value: str | None, fallback: bool) -> bool:
    if value is None or value == "":
        return fallback
    return str(value).strip().lower() not in {"0", "false", "off", "no"}


def _validate_announcement_times(value: str) -> str:
    normalized = ",".join(part.strip() for part in value.split(",") if part.strip())
    if normalized and not all(re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", part) for part in normalized.split(",")):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Announcement times must use HH:MM")
    return normalized


def _normalize_support_id(value: str) -> tuple[str, str | None]:
    raw = value.strip()
    if not raw:
        return "", None
    if any(ord(ch) < 32 for ch in raw):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid support ID")

    username = raw[1:] if raw.startswith("@") else raw
    if re.fullmatch(r"[A-Za-z0-9_]{4,64}", username):
        return f"@{username}", f"https://t.me/{username}"

    if raw.startswith(("https://", "http://", "tg://")):
        return raw, raw

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Support ID must be @username, username, or an http(s)/tg URL",
    )


def _display_support_id(admin: Admin, variables: dict[str, str]) -> str:
    stored = variables.get(VAR_SUPPORT_ID, "").strip()
    if stored:
        return stored
    support_url = str(admin.support_url or "").strip()
    if not support_url:
        return ""
    try:
        parsed = urlparse(support_url)
        if parsed.netloc.lower() in {"t.me", "www.t.me", "telegram.me", "www.telegram.me"}:
            path = parsed.path.strip("/")
            if path and "/" not in path and not path.startswith("+"):
                return f"@{path}"
    except ValueError:
        pass
    return support_url


def _profile_from_admin(admin: Admin) -> dict:
    variables = _custom_variable_map(admin)
    try:
        duration = int(variables.get(VAR_ANNOUNCEMENT_DURATION, PROFILE_DEFAULTS["announcement_duration"]))
    except (TypeError, ValueError):
        duration = PROFILE_DEFAULTS["announcement_duration"]
    duration = max(1, min(1440, duration))
    mode = variables.get(VAR_ANNOUNCEMENT_MODE, "always")
    return {
        "store_name": str(admin.profile_title or admin.username or "زمرد"),
        "support_id": _display_support_id(admin, variables),
        "support_url": str(admin.support_url or ""),
        "show_configs": _as_bool(variables.get(VAR_SHOW_CONFIGS), PROFILE_DEFAULTS["show_configs"]),
        "show_wireguard": _as_bool(variables.get(VAR_SHOW_WIREGUARD), PROFILE_DEFAULTS["show_wireguard"]),
        "show_ping": _as_bool(variables.get(VAR_SHOW_PING), PROFILE_DEFAULTS["show_ping"]),
        "show_apps": _as_bool(variables.get(VAR_SHOW_APPS), PROFILE_DEFAULTS["show_apps"]),
        "show_announcement": _as_bool(variables.get(VAR_SHOW_ANNOUNCEMENT), PROFILE_DEFAULTS["show_announcement"]),
        "announcement_mode": "scheduled" if mode == "scheduled" else "always",
        "announcement_times": variables.get(VAR_ANNOUNCEMENT_TIMES, ""),
        "announcement_duration": duration,
    }


def _profile_variables(model: AdminProfileUpdate, normalized_support_id: str) -> dict[str, str]:
    return {
        VAR_SUPPORT_ID: normalized_support_id,
        VAR_SHOW_CONFIGS: "true" if model.show_configs else "false",
        VAR_SHOW_WIREGUARD: "true" if model.show_wireguard else "false",
        VAR_SHOW_PING: "true" if model.show_ping else "false",
        VAR_SHOW_APPS: "true" if model.show_apps else "false",
        VAR_SHOW_ANNOUNCEMENT: "true" if model.show_announcement else "false",
        VAR_ANNOUNCEMENT_MODE: model.announcement_mode,
        VAR_ANNOUNCEMENT_TIMES: _validate_announcement_times(model.announcement_times),
        VAR_ANNOUNCEMENT_DURATION: str(model.announcement_duration),
    }


def _namespace_for_admin(admin_id: int) -> dict | None:
    base = f"/{subscription_env_settings.path}"
    for slug, item in _load_state().get("routes", {}).items():
        if int(item.get("admin_id", 0) or 0) == int(admin_id):
            return {
                "slug": slug,
                "enabled": item.get("enabled", True),
                "path_prefix": f"{base}/{slug}",
                "example": f"{base}/{slug}/<subscription-hash>",
            }
    return None


def _encode_header(value: str) -> str:
    return base64.b64encode(value.encode("utf-8")).decode("ascii")


def _profile_headers(admin: Admin) -> dict[str, str]:
    profile = _profile_from_admin(admin)
    return {
        "x-zomorod-store-name-b64": _encode_header(profile["store_name"]),
        "x-zomorod-support-id-b64": _encode_header(profile["support_id"]),
        "x-zomorod-show-configs": str(profile["show_configs"]).lower(),
        "x-zomorod-show-wireguard": str(profile["show_wireguard"]).lower(),
        "x-zomorod-show-ping": str(profile["show_ping"]).lower(),
        "x-zomorod-show-apps": str(profile["show_apps"]).lower(),
        "x-zomorod-show-announcement": str(profile["show_announcement"]).lower(),
        "x-zomorod-announcement-mode": profile["announcement_mode"],
        "x-zomorod-announcement-times": profile["announcement_times"],
        "x-zomorod-announcement-duration": str(profile["announcement_duration"]),
    }


def _overlay_headers(headers: dict, admin: Admin) -> dict:
    result = dict(headers or {})
    result.update(_profile_headers(admin))
    if admin.support_url:
        result["support-url"] = str(admin.support_url)
    return result


def _overlay_response(response: Response, admin: Admin) -> Response:
    for key, value in _profile_headers(admin).items():
        response.headers[key] = value
    if admin.support_url:
        response.headers["support-url"] = str(admin.support_url)
    return response


async def _get_db_admin(db: AsyncSession, admin_id: int) -> Admin:
    db_admin = (await db.execute(select(Admin).where(Admin.id == admin_id))).scalar_one_or_none()
    if db_admin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    return db_admin


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


@router.get("/api/zomorod/profile")
async def get_my_zomorod_profile(
    db: AsyncSession = Depends(get_db),
    current_admin: AdminDetails = Depends(_require_admin),
):
    db_admin = await _get_db_admin(db, int(current_admin.id))
    return {
        "admin_id": int(db_admin.id),
        "username": db_admin.username,
        "is_owner": bool(current_admin.role and current_admin.role.is_owner),
        "namespace": _namespace_for_admin(int(db_admin.id)),
        "profile": _profile_from_admin(db_admin),
    }


@router.put("/api/zomorod/profile")
async def update_my_zomorod_profile(
    model: AdminProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminDetails = Depends(_require_admin),
):
    db_admin = await _get_db_admin(db, int(current_admin.id))
    normalized_support_id, support_url = _normalize_support_id(model.support_id)
    variables = _profile_variables(model, normalized_support_id)

    preserved: list[dict] = []
    for item in db_admin.custom_variables or []:
        if isinstance(item, dict):
            key = str(item.get("key") or "")
            value = str(item.get("value") or "")
        else:
            key = str(getattr(item, "key", "") or "")
            value = str(getattr(item, "value", "") or "")
        if key and key.upper() not in ZOMOROD_VARIABLE_KEYS:
            preserved.append({"key": key, "value": value})

    preserved.extend({"key": key, "value": value} for key, value in variables.items())
    db_admin.profile_title = model.store_name.strip()
    db_admin.support_url = support_url
    db_admin.custom_variables = preserved
    await db.commit()
    await db.refresh(db_admin)

    return {
        "admin_id": int(db_admin.id),
        "username": db_admin.username,
        "is_owner": bool(current_admin.role and current_admin.role.is_owner),
        "namespace": _namespace_for_admin(int(db_admin.id)),
        "profile": _profile_from_admin(db_admin),
    }


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
    db_admin = await _get_db_admin(db, model.admin_id)
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


async def _validate_namespace(db: AsyncSession, admin_slug: str, token: str) -> Admin:
    state = _load_state()
    mapping = state.get("routes", {}).get(admin_slug.lower())
    if not mapping or not mapping.get("enabled", True):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    db_user = await subscription_operator.get_validated_sub(db, token, load_admin_role=True)
    if int(getattr(db_user, "admin_id", 0) or 0) != int(mapping.get("admin_id", 0) or 0):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    db_admin = getattr(db_user, "admin", None)
    if db_admin is None:
        db_admin = await _get_db_admin(db, int(mapping["admin_id"]))
    return db_admin


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
    db_admin = await _validate_namespace(db, admin_slug, token)
    response = await subscription_operator.user_subscription(
        db,
        token=token,
        accept_header=request.headers.get("Accept", ""),
        user_agent=user_agent,
        ip=request.client.host if request.client else None,
        request_url=str(request.url),
        **headers.model_dump(),
    )
    return _overlay_response(response, db_admin)


@router.head(f"{SUB_PREFIX}/{SCOPE}/{{token}}/")
@router.head(f"{SUB_PREFIX}/{SCOPE}/{{token}}", include_in_schema=False)
async def namespaced_subscription_headers(
    request: Request,
    admin_slug: str,
    token: str,
    db: AsyncSession = Depends(get_db),
    user_agent: str = Header(default=""),
):
    db_admin = await _validate_namespace(db, admin_slug, token)
    response_headers = await subscription_operator.user_subscription_headers(
        db,
        token=token,
        accept_header=request.headers.get("Accept", ""),
        user_agent=user_agent,
        request_url=str(request.url),
    )
    return Response(headers=_overlay_headers(response_headers, db_admin))


@router.get(f"{SUB_PREFIX}/{SCOPE}/{{token}}/info", response_model=SubscriptionUserResponse)
async def namespaced_subscription_info(
    request: Request,
    admin_slug: str,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    db_admin = await _validate_namespace(db, admin_slug, token)
    user_data, response_headers = await subscription_operator.user_subscription_info(
        db, token=token, ip=request.client.host if request.client else None
    )
    return JSONResponse(content=user_data.model_dump(mode="json"), headers=_overlay_headers(response_headers, db_admin))


@router.get(f"{SUB_PREFIX}/{SCOPE}/{{token}}/raw")
async def namespaced_subscription_raw(
    request: Request,
    admin_slug: str,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    db_admin = await _validate_namespace(db, admin_slug, token)
    payload = await subscription_operator.user_subscription_raw(db, token=token, request_url=str(request.url))
    if isinstance(payload, dict):
        payload["headers"] = _overlay_headers(payload.get("headers", {}), db_admin)
    return payload


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
    db_admin = await _validate_namespace(db, admin_slug, token)
    response = await subscription_operator.user_subscription_with_client_type(
        db,
        token=token,
        client_type=client_type,
        request_url=str(request.url),
        **headers.model_dump(),
    )
    return _overlay_response(response, db_admin)
