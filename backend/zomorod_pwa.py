"""Optional PWA and Web Push integration, installed alongside Zomorod.

No subscription HTML is cached, no subscription token is persisted in push data,
and clients must opt in to notifications on their own devices.
"""
from __future__ import annotations

import asyncio
import base64
import fcntl
import json
import os
import re
import struct
import zlib
from contextlib import contextmanager
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.db import AsyncSession, get_db
from app.models.admin import AdminDetails
from app.operation import OperatorType
from app.operation.subscription import SubscriptionOperation
from app.routers.authentication import get_current
from config import subscription_env_settings

router = APIRouter(tags=["Zomorod PWA"])
ROOT = Path(os.getenv("ZOMOROD_DATA_DIR", "/var/lib/pasarguard/zomorod"))
CONFIG = ROOT / "pwa-settings.json"
DEVICES = ROOT / "pwa-subscriptions.json"
KEYS = ROOT / "pwa-vapid.pem"
LOCK = ROOT / ".pwa.lock"
SW = ROOT / "python" / "zomorod-sw.js"
SUB_SCOPE = "/" + subscription_env_settings.path.strip("/") + "/"
operator = SubscriptionOperation(operator_type=OperatorType.API)
DEFAULT = {"pwa_enabled": False, "push_enabled": False}


@contextmanager
def _locked():
    ROOT.mkdir(parents=True, exist_ok=True)
    with LOCK.open("a+") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _read(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(path: Path, data: dict):
    ROOT.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + "." + str(os.getpid()) + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def _config() -> dict:
    return {**DEFAULT, **_read(CONFIG)}


def _owner(admin: AdminDetails | None = Depends(get_current)) -> AdminDetails:
    if not admin or not admin.role or not admin.role.is_owner:
        raise HTTPException(403, "Owner access required")
    return admin


def _admin(admin: AdminDetails | None = Depends(get_current)) -> AdminDetails:
    if not admin or admin.id is None:
        raise HTTPException(401, "Authentication required")
    return admin


@lru_cache(maxsize=1)
def _vapid_keys() -> tuple[str, str]:
    with _locked():
        if not KEYS.exists():
            key = ec.generate_private_key(ec.SECP256R1())
            data = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                     serialization.NoEncryption())
            fd = os.open(str(KEYS), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as file:
                file.write(data)
        key = serialization.load_pem_private_key(KEYS.read_bytes(), password=None)
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(public).rstrip(b"=").decode("ascii"), str(KEYS)


def _public_config() -> dict:
    settings = _config()
    result = {"pwa_enabled": bool(settings["pwa_enabled"]),
              "push_enabled": bool(settings["push_enabled"]) and bool(settings["pwa_enabled"]),
              "scope": SUB_SCOPE, "sw_url": "/api/zomorod/pwa/sw.js",
              "manifest_url": "/api/zomorod/pwa/manifest.webmanifest"}
    if result["push_enabled"]:
        result["vapid_public_key"] = _vapid_keys()[0]
    return result


@router.get("/api/zomorod/pwa/config")
async def pwa_public_config():
    return JSONResponse(_public_config(), headers={"Cache-Control": "no-store"})


@router.get("/api/zomorod/pwa/admin")
async def pwa_admin_config(_current: AdminDetails = Depends(_admin)):
    result = _public_config()
    devices = _read(DEVICES).get("devices", [])
    result["subscribers"] = len(devices) if _current.role and _current.role.is_owner else sum(
        int(d.get("admin_id", 0)) == int(_current.id) for d in devices
    )
    result["delivery_ready"] = _can_send()
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


class PwaSettings(BaseModel):
    pwa_enabled: bool = True
    push_enabled: bool = True


@router.put("/api/zomorod/pwa/admin")
async def pwa_save_settings(settings: PwaSettings, _current: AdminDetails = Depends(_owner)):
    with _locked():
        _write(CONFIG, settings.model_dump())
    return _public_config()


@router.get("/api/zomorod/pwa/sw.js")
async def pwa_service_worker():
    if not _config()["pwa_enabled"] or not SW.is_file():
        raise HTTPException(404, "PWA disabled")
    return Response(SW.read_bytes(), media_type="text/javascript", headers={
        "Service-Worker-Allowed": SUB_SCOPE, "Cache-Control": "no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
    })


@router.get("/api/zomorod/pwa/manifest.webmanifest")
async def pwa_manifest(start: str = ""):
    if not _config()["pwa_enabled"]:
        raise HTTPException(404, "PWA disabled")
    # Manifest paths are always same-origin and constrained to subscription URLs.
    if not start.startswith(SUB_SCOPE) or start.startswith("//") or any(x in start for x in "?#\\"):
        start = SUB_SCOPE
    return JSONResponse({
        "id": "/zomorod", "name": "زمرد", "short_name": "زمرد",
        "lang": "fa", "dir": "rtl", "display": "standalone", "orientation": "any",
        "start_url": start, "scope": SUB_SCOPE,
        "background_color": "#0F1211", "theme_color": "#064C38",
        "icons": [
            {"src": "/api/zomorod/pwa/icon/192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "/api/zomorod/pwa/icon/512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
    }, headers={"Cache-Control": "no-store"})


@lru_cache(maxsize=2)
def _icon_png(size: int) -> bytes:
    rows = []
    mid = size / 2
    for y in range(size):
        row = bytearray()
        for x in range(size):
            distance = abs(x - mid) + abs(y - mid)
            border = size * .24 < distance < size * .28
            highlight = abs(x - mid) < size * .023 and size * .29 < abs(y - mid) < size * .34
            if border or highlight:
                row.extend((201, 153, 45, 255))
            else:
                row.extend((6, 76, 56, 255))
        rows.append(b"\0" + row)
    def chunk(tag, payload):
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"".join(rows), 8)) + chunk(b"IEND", b"")


@router.get("/api/zomorod/pwa/icon/{size}.png")
async def pwa_icon(size: int):
    if size not in (192, 512):
        raise HTTPException(404)
    return Response(_icon_png(size), media_type="image/png", headers={"Cache-Control": "public, max-age=604800"})


class DeviceSubscription(BaseModel):
    endpoint: str = Field(min_length=30, max_length=2048)
    expirationTime: int | None = None
    keys: dict[str, str]


def _validated_push_endpoint(url: str):
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    known = (
        host == "fcm.googleapis.com"
        or host == "updates.push.services.mozilla.com"
        or host == "push.services.mozilla.com"
        or host == "web.push.apple.com"
        or (host.endswith(".push.apple.com") and host != ".push.apple.com")
    )
    if parts.scheme != "https" or not known or parts.username or parts.password:
        raise HTTPException(422, "Unrecognized push service")


def _validate_device(model: DeviceSubscription):
    _validated_push_endpoint(model.endpoint)
    for name in ("p256dh", "auth"):
        value = str(model.keys.get(name, ""))
        if not 8 <= len(value) <= 200 or not re.fullmatch("[A-Za-z0-9_-]+={0,2}", value):
            raise HTTPException(422, "Invalid push subscription keys")


async def _token_user(db: AsyncSession, token: str):
    user = await operator.get_validated_sub(db, token, load_admin_role=True)
    await operator.validated_user(user)
    return user


@router.post("/api/zomorod/pwa/subscribe/{token}")
async def pwa_subscribe(token: str, model: DeviceSubscription, request: Request,
                        db: AsyncSession = Depends(get_db)):
    cfg = _public_config()
    if not cfg["push_enabled"]:
        raise HTTPException(403, "Push disabled")
    origin = request.headers.get("origin", "")
    if not origin or urlsplit(origin).netloc != request.url.netloc or urlsplit(origin).scheme not in {"https", "http"}:
        raise HTTPException(403, "Same-origin required")
    _validate_device(model)
    user = await _token_user(db, token)
    now = datetime.now(UTC).isoformat()
    with _locked():
        data = _read(DEVICES)
        devices = [d for d in data.get("devices", []) if d.get("endpoint") != model.endpoint]
        uid = int(user.id)
        mine = [d for d in devices if int(d.get("user_id", -1)) == uid]
        if len(mine) >= 8:
            stale = {d["endpoint"] for d in mine[:len(mine) - 7]}
            devices = [d for d in devices if d.get("endpoint") not in stale]
        devices.append({"user_id": uid, "admin_id": int(user.admin_id),
                        "subscription": model.model_dump(exclude_none=True), "endpoint": model.endpoint,
                        "created_at": now})
        _write(DEVICES, {"devices": devices[-20000:]})
    return {"ok": True}


@router.delete("/api/zomorod/pwa/subscribe/{token}")
async def pwa_unsubscribe(token: str, model: DeviceSubscription, request: Request,
                          db: AsyncSession = Depends(get_db)):
    origin = request.headers.get("origin", "")
    if not origin or urlsplit(origin).netloc != request.url.netloc or urlsplit(origin).scheme != request.url.scheme:
        raise HTTPException(403, "Same-origin required")
    user = await _token_user(db, token)
    with _locked():
        data = _read(DEVICES)
        devices = [d for d in data.get("devices", []) if not (
            d.get("endpoint") == model.endpoint and int(d.get("user_id", -1)) == int(user.id)
        )]
        _write(DEVICES, {"devices": devices})
    return {"ok": True}


def _can_send() -> bool:
    try:
        from pywebpush import webpush  # noqa: F401
        return True
    except ImportError:
        return False


class Broadcast(BaseModel):
    title: str = Field(min_length=1, max_length=70)
    body: str = Field(min_length=1, max_length=180)


def _send_one(device: dict, message: str, contact: str) -> int:
    from pywebpush import WebPushException, webpush
    try:
        webpush(subscription_info=device["subscription"], data=message,
                vapid_private_key=_vapid_keys()[1], vapid_claims={"sub": contact},
                timeout=8)
        return 200
    except WebPushException as exc:
        return getattr(getattr(exc, "response", None), "status_code", 502) or 502
    except Exception:
        return 502


@router.post("/api/zomorod/pwa/broadcast")
async def pwa_broadcast(payload: Broadcast, request: Request,
                        _current: AdminDetails = Depends(_owner)):
    if not _public_config()["push_enabled"]:
        raise HTTPException(403, "Push disabled")
    if not _can_send():
        raise HTTPException(503, "Web Push dependency unavailable")
    devices = _read(DEVICES).get("devices", [])[:500]
    if not devices:
        return {"total": 0, "sent": 0, "failed": 0}
    message = json.dumps({"title": payload.title, "body": payload.body,
                          "url": SUB_SCOPE}, ensure_ascii=False)
    contact = str(request.base_url).rstrip("/")
    semaphore = asyncio.Semaphore(6)
    async def run(device):
        async with semaphore:
            return await asyncio.to_thread(_send_one, device, message, contact)
    results = await asyncio.gather(*(run(d) for d in devices))
    gone = {d["endpoint"] for d, code in zip(devices, results) if code in (404, 410)}
    if gone:
        with _locked():
            data = _read(DEVICES)
            _write(DEVICES, {"devices": [d for d in data.get("devices", []) if d.get("endpoint") not in gone]})
    return {"total": len(devices), "sent": results.count(200) + results.count(201),
            "failed": sum(code not in (200, 201) for code in results)}
