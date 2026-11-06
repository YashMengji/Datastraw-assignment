import hashlib
import hmac
import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .ai import DraftGenerator
from .auth import COOKIE_NAME, create_session_token, verify_password
from .config import Settings, get_settings
from .database import get_db
from .dependencies import get_current_agent
from .models import (
    Agent,
    Conversation,
    Customer,
    Draft,
    DraftStatus,
    Message,
    MessageDirection,
    utcnow,
)
from .schemas import (
    AgentConversationResponse,
    AgentResponse,
    ApproveDraftRequest,
    ConversationListItem,
    CustomerConversationResponse,
    CustomerMessageRequest,
    CustomerResponse,
    DraftResponse,
    HealthResponse,
    IngestionResponse,
    LoginRequest,
    MessageResponse,
    WebhookMessage,
    WebhookPayload,
)
from .services import ingest_message, is_retryable, retry_draft


api = APIRouter()


def get_generator(request: Request) -> DraftGenerator:
    return request.app.state.draft_generator


def draft_schema(draft: Draft | None) -> DraftResponse | None:
    if not draft:
        return None
    return DraftResponse(
        id=draft.id,
        content=draft.content,
        status=draft.status,
        error_code=draft.error_code,
        error_message=draft.error_message,
        attempts=draft.attempts,
        model=draft.model,
        attempt_started_at=draft.attempt_started_at,
        updated_at=draft.updated_at,
        retryable=is_retryable(draft),
    )


def message_schema(message: Message, include_draft: bool = True) -> MessageResponse:
    return MessageResponse(
        id=message.id,
        direction=message.direction,
        text=message.text,
        occurred_at=message.occurred_at,
        draft=draft_schema(message.draft) if include_draft else None,
    )


def ingestion_schema(result) -> IngestionResponse:
    return IngestionResponse(
        status="created" if result.created else "duplicate",
        event_id=result.event_id,
        message_id=result.message.id,
        conversation_id=result.conversation.id,
        draft_status=result.draft.status,
    )


@api.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@api.post("/webhook", response_model=IngestionResponse, tags=["webhook"])
async def webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    generator: DraftGenerator = Depends(get_generator),
) -> IngestionResponse:
    raw_body = await request.body()
    supplied = request.headers.get("X-Signature", "")
    expected = "sha256=" + hmac.new(
        settings.webhook_secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = WebhookPayload.model_validate_json(raw_body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    validate_webhook_payload(payload, settings)
    result = await ingest_message(payload, db, generator, settings)
    return ingestion_schema(result)


def validate_webhook_payload(payload: WebhookPayload, settings: Settings) -> None:
    if payload.type != "message.received":
        raise HTTPException(status_code=400, detail="Unsupported event type")
    if payload.message.type != "text":
        raise HTTPException(status_code=400, detail="Only text messages are supported")
    if payload.brand_id != settings.brand_id:
        raise HTTPException(status_code=400, detail="Unknown brand")


@api.post(
    "/api/customer/messages",
    response_model=IngestionResponse,
    tags=["customer"],
)
async def customer_message(
    body: CustomerMessageRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    generator: DraftGenerator = Depends(get_generator),
) -> IngestionResponse:
    now = datetime.now(timezone.utc)
    payload = WebhookPayload(
        event_id=f"demo_evt_{uuid.uuid4().hex}",
        type="message.received",
        brand_id=settings.brand_id,
        timestamp=now,
        customer=body.customer,
        message=WebhookMessage(
            id=f"demo_msg_{uuid.uuid4().hex}", type="text", text=body.text
        ),
    )
    result = await ingest_message(payload, db, generator, settings)
    return ingestion_schema(result)


@api.get(
    "/api/customer/conversations/{external_customer_id}",
    response_model=CustomerConversationResponse,
    tags=["customer"],
)
async def customer_conversation(
    external_customer_id: str,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> CustomerConversationResponse:
    customer = await db.scalar(
        select(Customer)
        .where(
            Customer.brand_id == settings.brand_id,
            Customer.external_id == external_customer_id,
        )
        .options(
            selectinload(Customer.conversation)
            .selectinload(Conversation.messages)
            .selectinload(Message.draft)
        )
    )
    if not customer:
        return CustomerConversationResponse(
            customer=CustomerResponse(
                id=uuid.uuid4(),
                external_id=external_customer_id,
                name="New customer",
                phone="Not provided",
            ),
            conversation_id=None,
            messages=[],
        )
    conversation = customer.conversation
    messages = [] if not conversation else sorted(
        conversation.messages, key=lambda item: (item.occurred_at, item.created_at)
    )
    return CustomerConversationResponse(
        customer=CustomerResponse.model_validate(customer),
        conversation_id=conversation.id if conversation else None,
        messages=[message_schema(message, include_draft=False) for message in messages],
    )


@api.post("/api/auth/login", response_model=AgentResponse, tags=["auth"])
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AgentResponse:
    agent = await db.scalar(select(Agent).where(Agent.email == body.email.lower()))
    if not agent or not agent.is_active or not verify_password(body.password, agent.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")

    token = create_session_token(agent.id, settings)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_hours * 3600,
        path="/",
    )
    return AgentResponse.model_validate(agent)


@api.post("/api/auth/logout", status_code=204, tags=["auth"])
async def logout(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


@api.get("/api/auth/me", response_model=AgentResponse, tags=["auth"])
async def me(agent: Agent = Depends(get_current_agent)) -> AgentResponse:
    return AgentResponse.model_validate(agent)


async def load_agent_conversation(
    db: AsyncSession, conversation_id: uuid.UUID
) -> Conversation | None:
    return await db.scalar(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(
            selectinload(Conversation.customer),
            selectinload(Conversation.messages).selectinload(Message.draft),
        )
    )


@api.get(
    "/api/agent/conversations",
    response_model=list[ConversationListItem],
    tags=["agent"],
)
async def list_conversations(
    _agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> list[ConversationListItem]:
    conversations = (
        await db.scalars(
            select(Conversation)
            .order_by(Conversation.updated_at.desc())
            .options(
                selectinload(Conversation.customer),
                selectinload(Conversation.messages).selectinload(Message.draft),
            )
        )
    ).all()
    result: list[ConversationListItem] = []
    for conversation in conversations:
        if not conversation.messages:
            continue
        latest = max(
            conversation.messages, key=lambda item: (item.occurred_at, item.created_at)
        )
        pending = sum(
            1
            for message in conversation.messages
            if message.draft
            and message.draft.status
            in (DraftStatus.READY.value, DraftStatus.FAILED.value)
        )
        result.append(
            ConversationListItem(
                id=conversation.id,
                customer=CustomerResponse.model_validate(conversation.customer),
                latest_message=latest.text,
                latest_message_at=latest.occurred_at,
                pending_drafts=pending,
            )
        )
    return result


@api.get(
    "/api/agent/conversations/{conversation_id}",
    response_model=AgentConversationResponse,
    tags=["agent"],
)
async def get_agent_conversation(
    conversation_id: uuid.UUID,
    _agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentConversationResponse:
    conversation = await load_agent_conversation(db, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = sorted(
        conversation.messages, key=lambda item: (item.occurred_at, item.created_at)
    )
    return AgentConversationResponse(
        id=conversation.id,
        customer=CustomerResponse.model_validate(conversation.customer),
        messages=[message_schema(message) for message in messages],
    )


@api.post(
    "/api/agent/drafts/{draft_id}/approve",
    response_model=MessageResponse,
    tags=["agent"],
)
async def approve_draft(
    draft_id: uuid.UUID,
    body: ApproveDraftRequest,
    _agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    draft = await db.scalar(
        select(Draft)
        .where(Draft.id == draft_id)
        .with_for_update()
        .options(selectinload(Draft.source_message))
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status != DraftStatus.READY.value:
        raise HTTPException(status_code=409, detail="Only a ready draft can be approved")

    reply = Message(
        conversation_id=draft.source_message.conversation_id,
        direction=MessageDirection.AGENT.value,
        text=body.text,
        occurred_at=utcnow(),
        in_reply_to_message_id=draft.source_message_id,
        approved_from_draft_id=draft.id,
    )
    db.add(reply)
    draft.content = body.text
    draft.status = DraftStatus.USED.value
    draft.used_at = utcnow()
    draft.updated_at = utcnow()
    conversation = await db.get(Conversation, draft.source_message.conversation_id)
    conversation.updated_at = reply.occurred_at
    await db.commit()
    await db.refresh(reply)
    return message_schema(reply, include_draft=False)


@api.post(
    "/api/agent/drafts/{draft_id}/retry",
    response_model=DraftResponse,
    tags=["agent"],
)
async def retry_failed_draft(
    draft_id: uuid.UUID,
    _agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
    generator: DraftGenerator = Depends(get_generator),
) -> DraftResponse:
    draft = await db.get(Draft, draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    try:
        draft = await retry_draft(draft, db, generator)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return draft_schema(draft)

