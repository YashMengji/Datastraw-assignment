import hashlib
import hmac
import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.app.ai import DraftGenerationError, DraftGenerator
from backend.app.auth import hash_password
from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app.models import Agent


class SuccessfulGenerator(DraftGenerator):
    async def generate(self, customer_message: str, context: list[str]) -> str:
        return "Thanks for reaching out. An agent can help with that request."


class FailingGenerator(DraftGenerator):
    async def generate(self, customer_message: str, context: list[str]) -> str:
        raise DraftGenerationError("provider_error", "Gemini is temporarily unavailable.")


engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    poolclass=StaticPool,
    connect_args={"check_same_thread": False},
)
TestingSession = async_sessionmaker(engine, expire_on_commit=False)


async def override_db():
    async with TestingSession() as session:
        yield session


@pytest_asyncio.fixture(autouse=True)
async def database():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with TestingSession() as session:
        session.add(
            Agent(
                email="agent@verdant.co",
                display_name="Verdant Support",
                password_hash=hash_password("test-password"),
            )
        )
        await session.commit()
    app.dependency_overrides[get_db] = override_db
    app.state.draft_generator = SuccessfulGenerator()
    yield
    app.dependency_overrides.clear()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as value:
        yield value


def webhook_body(event_id: str = "evt_7f3a91c2") -> bytes:
    payload = {
        "event_id": event_id,
        "type": "message.received",
        "brand_id": "verdant-co",
        "timestamp": "2026-11-03T10:15:22Z",
        "customer": {
            "id": "cust_1042",
            "name": "Aisha Khan",
            "phone": "+919800000001",
        },
        "message": {
            "id": "msg_88213",
            "type": "text",
            "text": "What is your return policy?",
        },
    }
    return json.dumps(payload, separators=(",", ":")).encode()


def signature(body: bytes) -> str:
    digest = hmac.new(
        b"verdant-demo-secret-2026", body, hashlib.sha256
    ).hexdigest()
    return f"sha256={digest}"


@pytest.mark.asyncio
async def test_rejects_invalid_webhook_signature_without_writes(client: AsyncClient):
    response = await client.post(
        "/webhook", content=webhook_body(), headers={"X-Signature": "sha256=bad"}
    )
    assert response.status_code == 401

    conversation = await client.get("/api/customer/conversations/cust_1042")
    assert conversation.status_code == 200
    assert conversation.json()["messages"] == []


@pytest.mark.asyncio
async def test_webhook_is_idempotent_and_creates_a_ready_draft(client: AsyncClient):
    body = webhook_body()
    first = await client.post(
        "/webhook", content=body, headers={"X-Signature": signature(body)}
    )
    second = await client.post(
        "/webhook", content=body, headers={"X-Signature": signature(body)}
    )

    assert first.status_code == 200
    assert first.json()["status"] == "created"
    assert first.json()["draft_status"] == "ready"
    assert second.status_code == 200
    assert second.json()["status"] == "duplicate"
    assert second.json()["message_id"] == first.json()["message_id"]


@pytest.mark.asyncio
async def test_full_agent_approval_flow_hides_drafts_from_customer(client: AsyncClient):
    body = webhook_body()
    await client.post(
        "/webhook", content=body, headers={"X-Signature": signature(body)}
    )

    customer_before = (
        await client.get("/api/customer/conversations/cust_1042")
    ).json()
    assert len(customer_before["messages"]) == 1
    assert customer_before["messages"][0]["draft"] is None

    login = await client.post(
        "/api/auth/login",
        json={"email": "agent@verdant.co", "password": "test-password"},
    )
    assert login.status_code == 200

    inbox = (await client.get("/api/agent/conversations")).json()
    assert len(inbox) == 1
    assert inbox[0]["pending_drafts"] == 1

    detail = (await client.get(f"/api/agent/conversations/{inbox[0]['id']}")).json()
    draft_id = detail["messages"][0]["draft"]["id"]
    approved_text = "Returns are accepted within 7 days for unopened products."
    approved = await client.post(
        f"/api/agent/drafts/{draft_id}/approve", json={"text": approved_text}
    )
    assert approved.status_code == 200

    duplicate_approval = await client.post(
        f"/api/agent/drafts/{draft_id}/approve", json={"text": approved_text}
    )
    assert duplicate_approval.status_code == 409

    customer_after = (
        await client.get("/api/customer/conversations/cust_1042")
    ).json()
    assert [message["direction"] for message in customer_after["messages"]] == [
        "customer",
        "agent",
    ]
    assert customer_after["messages"][1]["text"] == approved_text
    assert all(message["draft"] is None for message in customer_after["messages"])


@pytest.mark.asyncio
async def test_ai_failure_is_persisted_and_retryable(client: AsyncClient):
    app.state.draft_generator = FailingGenerator()
    response = await client.post(
        "/api/customer/messages",
        json={
            "customer": {
                "id": "cust_failure",
                "name": "Failure Test",
                "phone": "+919800000099",
            },
            "text": "Can you help with my order?",
        },
    )
    assert response.status_code == 200
    assert response.json()["draft_status"] == "failed"

    await client.post(
        "/api/auth/login",
        json={"email": "agent@verdant.co", "password": "test-password"},
    )
    inbox = (await client.get("/api/agent/conversations")).json()
    detail = (await client.get(f"/api/agent/conversations/{inbox[0]['id']}")).json()
    draft = detail["messages"][0]["draft"]
    assert draft["status"] == "failed"
    assert draft["retryable"] is True
    assert draft["error_code"] == "provider_error"

    app.state.draft_generator = SuccessfulGenerator()
    retried = await client.post(f"/api/agent/drafts/{draft['id']}/retry")
    assert retried.status_code == 200
    assert retried.json()["status"] == "ready"
    assert retried.json()["attempts"] == 2

