from functools import lru_cache

from pydantic import EmailStr, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./verdant.db"
    session_secret: str = Field(
        default="NzX1LEVm20boZQjd8FhLAO9Fd05WjHIfDR5WqR20/RM=", min_length=32
    )
    session_hours: int = 8

    agent_email: EmailStr = "agent@verdant.co"
    agent_password: str = "Agent123!"
    agent_name: str = "Verdant Support"

    webhook_secret: str = "LJUOOyStDJkQfl2UbUaA2B3w+mHYTPl1t75F33D3AkM="
    brand_id: str = "verdant-co"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_timeout_seconds: float = Field(default=15, ge=1, le=60)

    frontend_origin: str = "http://localhost:5173"
    cookie_secure: bool = False

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

