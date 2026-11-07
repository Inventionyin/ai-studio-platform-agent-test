from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet

from .config import settings

_key = base64.urlsafe_b64encode(hashlib.sha256(settings.app_secret.encode("utf-8")).digest())
_fernet = Fernet(_key)


def encrypt_json(value: dict[str, Any]) -> str:
    return _fernet.encrypt(json.dumps(value, ensure_ascii=False).encode("utf-8")).decode("utf-8")


def decrypt_json(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    return json.loads(_fernet.decrypt(value.encode("utf-8")).decode("utf-8"))
