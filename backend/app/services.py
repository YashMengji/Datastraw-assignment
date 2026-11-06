import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .ai import DraftGenerationError, DraftGenerator
from .config import Settings
from .models import (
    Conversation,
    Customer,
    Draft,
    DraftStatus,
    Message,
    MessageDirection,
    WebhookEvent,
    utcnow,
)
from .schemas import WebhookPayload

logger = logging.getLogger(__name__)


@dataclass
class IngestionResult:
    event_id: str
    message: Message
    conversation: Conversation
    draft: Draft
    created: bool


async def _existing_result(
    db: AsyncSession, event_id: str
) -> IngestionResult | None:
    event = await db.get(WebhookEvent, event_id)
    if not event or not event.message_id:
        return None
    message = await db.scalar(
        select(Message)
        .where(Message.id == event.message_id)
        .options(selectinload(Message.draft))
    )
    if not message or not message.draft:
        return None
    conversation = await db.get(Conversation, message.conversation_id)
    if not conversation:
        return None
    return IngestionResult(event_id, message, conversation, message.draft, False)


async def ingest_message(
    payload: WebhookPayload,
    db: AsyncSession,
    generator: DraftGenerator,
    settings: Settings,
) -> IngestionResult:
    existing = await _existing_result(db, payload.event_id)
    if existing:
        return existing

    try:
        customer = await db.scalar(
            select(Customer).where(
                Customer.brand_id == payload.brand_id,
                Customer.external_id == payload.customer.id,
            )
        )
        if customer:
            customer.name = payload.customer.name
            customer.phone = payload.customer.phone
            customer.updated_at = utcnow()
        else:
            customer = Customer(
                brand_id=payload.brand_id,
                external_id=payload.customer.id,
                name=payload.customer.name,
                phone=payload.customer.phone,
            )
            db.add(customer)
            await db.flush()

        conversation = await db.scalar(
            select(Conversation).where(Conversation.customer_id == customer.id)
        )
        if not conversation:
            conversation = Conversation(customer_id=customer.id)
            db.add(conversation)
            await db.flush()

        occurred_at = payload.timestamp.astimezone(timezone.utc)
        conversation.updated_at = max(utcnow(), occurred_at)
        message = Message(
            conversation_id=conversation.id,
            external_message_id=payload.message.id,
            direction=MessageDirection.CUSTOMER.value,
            text=payload.message.text,
            occurred_at=occurred_at,
        )
        db.add(message)
        await db.flush()

        draft = Draft(
            source_message_id=message.id,
            status=DraftStatus.GENERATING.value,
            attempts=1,
            model=settings.gemini_model,
            attempt_started_at=utcnow(),
        )
        db.add(draft)
        await db.flush()

        db.add(
            WebhookEvent(
                event_id=payload.event_id,
                brand_id=payload.brand_id,
                payload=payload.model_dump(mode="json"),
                message_id=message.id,
            )
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await _existing_result(db, payload.event_id)
        if existing:
            return existing
        duplicate_message = await db.scalar(
            select(Message)
            .where(Message.external_message_id == payload.message.id)
            .options(selectinload(Message.draft))
        )
        if duplicate_message and duplicate_message.draft:
            conversation = await db.get(Conversation, duplicate_message.conversation_id)
            return IngestionResult(
                payload.event_id,
                duplicate_message,
                conversation,
                duplicate_message.draft,
                False,
            )
        raise

    await generate_draft(draft.id, db, generator)
    await db.refresh(draft)
    return IngestionResult(payload.event_id, message, conversation, draft, True)


async def _conversation_context(db: AsyncSession, message: Message) -> list[str]:
    rows = (
        await db.scalars(
            select(Message)
            .where(
                Message.conversation_id == message.conversation_id,
                Message.occurred_at <= message.occurred_at,
            )
            .order_by(Message.occurred_at.desc(), Message.created_at.desc())
            .limit(8)
        )
    ).all()
    rows.reverse()
    return [f"{row.direction.title()}: {row.text}" for row in rows]


async def generate_draft(
    draft_id: uuid.UUID, db: AsyncSession, generator: DraftGenerator
) -> Draft:
    draft = await db.scalar(
        select(Draft)
        .where(Draft.id == draft_id)
        .options(selectinload(Draft.source_message))
    )
    if not draft:
        raise LookupError("Draft not found")

    context = await _conversation_context(db, draft.source_message)
    try:
        content = await generator.generate(draft.source_message.text, context)
        draft.content = content
        draft.status = DraftStatus.READY.value
        draft.error_code = None
        draft.error_message = None
    except DraftGenerationError as exc:
        draft.status = DraftStatus.FAILED.value
        draft.error_code = exc.code
        draft.error_message = exc.public_message[:300]
        logger.warning(
            "Draft generation failed",
            extra={"draft_id": str(draft.id), "error_code": exc.code},
        )
    draft.updated_at = utcnow()
    await db.commit()
    return draft


def is_retryable(draft: Draft) -> bool:
    if draft.status == DraftStatus.FAILED.value:
        return True
    if draft.status != DraftStatus.GENERATING.value:
        return False
    started = draft.attempt_started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return started < datetime.now(timezone.utc) - timedelta(minutes=2)


async def retry_draft(
    draft: Draft, db: AsyncSession, generator: DraftGenerator
) -> Draft:
    if not is_retryable(draft):
        raise ValueError("Draft is not retryable")
    draft.status = DraftStatus.GENERATING.value
    draft.content = None
    draft.error_code = None
    draft.error_message = None
    draft.attempts += 1
    draft.attempt_started_at = utcnow()
    draft.updated_at = utcnow()
    await db.commit()
    return await generate_draft(draft.id, db, generator)


async def pending_draft_count(db: AsyncSession, conversation_id: uuid.UUID) -> int:
    return int(
        await db.scalar(
            select(func.count(Draft.id))
            .join(Message, Draft.source_message_id == Message.id)
            .where(
                Message.conversation_id == conversation_id,
                Draft.status.in_([DraftStatus.READY.value, DraftStatus.FAILED.value]),
            )
        )
        or 0
    )

