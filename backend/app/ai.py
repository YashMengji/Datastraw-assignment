import asyncio
import logging
from dataclasses import dataclass

from google import genai
from google.genai import types

from .config import Settings
from .knowledge import SYSTEM_INSTRUCTION

logger = logging.getLogger(__name__)


@dataclass
class DraftGenerationError(Exception):
    code: str
    public_message: str

    def __str__(self) -> str:
        return self.public_message


class DraftGenerator:
    async def generate(self, customer_message: str, context: list[str]) -> str:
        raise NotImplementedError


class GeminiDraftGenerator(DraftGenerator):
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = (
            genai.Client(api_key=settings.gemini_api_key)
            if settings.gemini_api_key
            else None
        )

    async def generate(self, customer_message: str, context: list[str]) -> str:
        if not self._client:
            raise DraftGenerationError(
                "missing_api_key",
                "AI drafting is not configured. Add GEMINI_API_KEY and retry.",
            )

        history = "\n".join(context[-8:]) or "No earlier messages."
        prompt = (
            f"Conversation so far:\n{history}\n\n"
            f"Latest customer message:\n{customer_message}\n\n"
            "Draft the reply now."
        )

        def request() -> str:
            response = self._client.models.generate_content(
                model=self.settings.gemini_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    temperature=0.2,
                    max_output_tokens=240,
                ),
            )
            return (response.text or "").strip()

        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(request),
                timeout=self.settings.gemini_timeout_seconds,
            )
        except TimeoutError as exc:
            raise DraftGenerationError(
                "timeout", "Gemini timed out. The message is safe; retry the draft."
            ) from exc
        except DraftGenerationError:
            raise
        except Exception as exc:
            logger.exception("Gemini draft request failed")
            raise DraftGenerationError(
                "provider_error",
                "Gemini could not generate a draft. The message is safe; retry it.",
            ) from exc

        if not result:
            raise DraftGenerationError(
                "empty_response", "Gemini returned an empty draft. Please retry."
            )
        return result

