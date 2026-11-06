import uuid
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from .config import Settings


password_hash = PasswordHash.recommended()
ALGORITHM = "HS256"
COOKIE_NAME = "verdant_session"


def hash_password(value: str) -> str:
    return password_hash.hash(value)


def verify_password(value: str, encoded: str) -> bool:
    return password_hash.verify(value, encoded)


def create_session_token(agent_id: uuid.UUID, settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(agent_id),
        "iat": now,
        "exp": now + timedelta(hours=settings.session_hours),
        "type": "agent_session",
    }
    return jwt.encode(payload, settings.session_secret, algorithm=ALGORITHM)


def decode_session_token(token: str, settings: Settings) -> uuid.UUID:
    payload = jwt.decode(token, settings.session_secret, algorithms=[ALGORITHM])
    if payload.get("type") != "agent_session":
        raise jwt.InvalidTokenError("Unexpected token type")
    return uuid.UUID(payload["sub"])

