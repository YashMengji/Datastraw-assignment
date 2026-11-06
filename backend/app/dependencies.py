import uuid

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import COOKIE_NAME, decode_session_token
from .config import Settings, get_settings
from .database import get_db
from .models import Agent


async def get_current_agent(
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Agent:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required")
    try:
        agent_id: uuid.UUID = decode_session_token(session_token, settings)
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is invalid or expired"
        ) from None

    agent = await db.get(Agent, agent_id)
    if not agent or not agent.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent not found")
    return agent

