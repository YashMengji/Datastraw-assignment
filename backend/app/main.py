import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .ai import GeminiDraftGenerator
from .auth import hash_password, verify_password
from .config import get_settings
from .database import SessionLocal
from .models import Agent
from .routes import api


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
settings = get_settings()


async def seed_agent() -> None:
    async with SessionLocal() as db:
        email = str(settings.agent_email).lower()
        agent = await db.scalar(select(Agent).where(Agent.email == email))
        if not agent:
            db.add(
                Agent(
                    email=email,
                    display_name=settings.agent_name,
                    password_hash=hash_password(settings.agent_password),
                )
            )
            await db.commit()
        else:
            changed = False
            if agent.display_name != settings.agent_name:
                agent.display_name = settings.agent_name
                changed = True
            if not verify_password(settings.agent_password, agent.password_hash):
                agent.password_hash = hash_password(settings.agent_password)
                changed = True
            if changed:
                await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await seed_agent()
    yield


app = FastAPI(
    title="Verdant Support Assistant API",
    version="1.0.0",
    description="Webhook ingestion, grounded AI drafts, and agent approval workflow.",
    lifespan=lifespan,
)
app.state.draft_generator = GeminiDraftGenerator(settings)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api)

frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

