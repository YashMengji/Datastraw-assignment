import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class WebhookCustomer(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=3, max_length=32)


class WebhookMessage(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    type: str
    text: str = Field(min_length=1, max_length=4000)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be blank")
        return value


class WebhookPayload(BaseModel):
    event_id: str = Field(min_length=1, max_length=120)
    type: str
    brand_id: str = Field(min_length=1, max_length=80)
    timestamp: datetime
    customer: WebhookCustomer
    message: WebhookMessage


class CustomerMessageRequest(BaseModel):
    customer: WebhookCustomer
    text: str = Field(min_length=1, max_length=4000)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be blank")
        return value


class IngestionResponse(BaseModel):
    status: str
    event_id: str
    message_id: uuid.UUID
    conversation_id: uuid.UUID
    draft_status: str


class DraftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    content: str | None
    status: str
    error_code: str | None
    error_message: str | None
    attempts: int
    model: str
    attempt_started_at: datetime
    updated_at: datetime
    retryable: bool = False


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    direction: str
    text: str
    occurred_at: datetime
    draft: DraftResponse | None = None


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    external_id: str
    name: str
    phone: str


class CustomerConversationResponse(BaseModel):
    customer: CustomerResponse
    conversation_id: uuid.UUID | None
    messages: list[MessageResponse]


class ConversationListItem(BaseModel):
    id: uuid.UUID
    customer: CustomerResponse
    latest_message: str
    latest_message_at: datetime
    pending_drafts: int


class AgentConversationResponse(BaseModel):
    id: uuid.UUID
    customer: CustomerResponse
    messages: list[MessageResponse]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str


class ApproveDraftRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Reply cannot be blank")
        return value


class HealthResponse(BaseModel):
    status: str

