import json
import logging
import os
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException

from auth_utils import CurrentUser
from db import users_col
from models import CorrectRequest, TranslateRequest, _vip_active

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]

FREE_DAILY_TRANSLATIONS = 3

# Safety net when a language *name* is sent instead of an ISO code.
NAME_TO_CODE = {
    "english": "en", "spanish": "es", "french": "fr", "german": "de",
    "italian": "it", "portuguese": "pt", "russian": "ru", "japanese": "ja",
    "korean": "ko", "chinese": "zh", "arabic": "ar", "hindi": "hi",
    "bengali": "bn", "turkish": "tr", "vietnamese": "vi", "thai": "th",
    "indonesian": "id", "dutch": "nl", "polish": "pl", "urdu": "ur",
}


async def _google_translate(text: str, target: str) -> str:
    """Free Google Translate endpoint (no API key needed)."""
    params = {"client": "gtx", "sl": "auto", "tl": target, "dt": "t", "q": text}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            "https://translate.googleapis.com/translate_a/single", params=params
        )
        r.raise_for_status()
        data = r.json()
    return "".join(seg[0] for seg in data[0] if seg and seg[0]).strip()


async def run_llm(system_message: str, text: str) -> str:
    from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"lingua-{uuid.uuid4()}",
        system_message=system_message,
    ).with_model("openai", "gpt-5.2")
    parts: list[str] = []
    async for event in chat.stream_message(UserMessage(text=text)):
        if isinstance(event, TextDelta):
            parts.append(event.content)
        elif isinstance(event, StreamDone):
            break
    return "".join(parts).strip()


def parse_json_response(raw: str) -> dict | None:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    try:
        return json.loads(cleaned.strip())
    except (json.JSONDecodeError, IndexError):
        return None


@router.post("/translate")
async def translate(body: TranslateRequest, current_user: CurrentUser):
    target = (body.target_language or "en").strip()
    if len(target) > 3:
        target = NAME_TO_CODE.get(target.lower(), "en")
    # Free users: 3 translations/day. VIP: unlimited.
    remaining = None
    if not _vip_active(current_user):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        usage = current_user.get("translate_usage") or {}
        count = usage.get("count", 0) if usage.get("date") == today else 0
        if count >= FREE_DAILY_TRANSLATIONS:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Daily translation limit reached ({FREE_DAILY_TRANSLATIONS}/day for free users). "
                    "Upgrade to VIP for unlimited translations."
                ),
            )
        await users_col.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"translate_usage": {"date": today, "count": count + 1}}},
        )
        remaining = FREE_DAILY_TRANSLATIONS - count - 1
    try:
        translated = await _google_translate(body.text, target)
    except Exception:
        # Fallback: LLM translation if the free endpoint is unavailable.
        system = (
            "You are a translation engine for a language exchange app. "
            f"Translate the user's message into the language with ISO code '{target}'. "
            "Reply with ONLY the translated text, nothing else."
        )
        try:
            translated = await run_llm(system, body.text)
        except Exception as e:
            logger.exception("Translation failed")
            raise HTTPException(status_code=502, detail=f"Translation failed: {e}")
    return {"translated": translated, "target_language": target, "remaining": remaining}


@router.post("/correct")
async def correct(body: CorrectRequest, current_user: CurrentUser):
    lang_hint = f" The text is written in {body.language}." if body.language else ""
    system = (
        "You are a friendly language tutor in a language exchange app. "
        f"Correct grammar, spelling and word-choice mistakes in the user's text.{lang_hint} "
        'Respond with ONLY valid JSON: {"corrected": "<corrected text in the same language>", '
        '"explanation": "<one or two short sentences in English explaining the main fixes, '
        "or 'Looks perfect!' if there is nothing to fix>\"}"
    )
    try:
        raw = await run_llm(system, body.text)
    except Exception as e:
        logger.exception("Correction failed")
        raise HTTPException(status_code=502, detail=f"Correction failed: {e}")
    parsed = parse_json_response(raw)
    if parsed and "corrected" in parsed:
        return {"corrected": parsed["corrected"], "explanation": parsed.get("explanation", "")}
    return {"corrected": raw, "explanation": ""}
