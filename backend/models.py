from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=60)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    country: Optional[str] = None
    avatar_url: Optional[str] = None
    native_language: Optional[str] = None
    learning_language: Optional[str] = None
    proficiency: Optional[str] = None
    teach_languages: Optional[list[str]] = Field(default=None, max_length=2)
    learning_languages: Optional[list[str]] = Field(default=None, max_length=3)
    age: Optional[int] = Field(default=None, ge=13, le=120)
    interests: Optional[list[str]] = Field(default=None, max_length=20)
    gender: Optional[str] = Field(default=None, pattern="^(male|female)$")
    privacy: Optional[dict] = None


class AvatarUpload(BaseModel):
    image_base64: str = Field(min_length=1)
    mime: str = "image/jpeg"


class MessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ConversationCreate(BaseModel):
    partner_id: str


class MomentCreate(BaseModel):
    text: str = Field(default="", max_length=1000)
    image_base64: Optional[str] = None
    mime: str = "image/jpeg"


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    reply_to: Optional[str] = None


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    target_language: str


class CorrectRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    language: Optional[str] = None


class VoiceMessageCreate(BaseModel):
    audio_base64: str = Field(min_length=1)
    mime: str = "audio/m4a"
    duration_ms: int = 0


class ImageMessageCreate(BaseModel):
    image_base64: str = Field(min_length=1)
    mime: str = "image/jpeg"


class RoomCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    language: str = Field(min_length=2, max_length=8)
    languages: Optional[list[str]] = Field(default=None, max_length=2)


class RoomRoleUpdate(BaseModel):
    user_id: str
    role: str = Field(pattern="^(speaker|listener)$")


class RoomUserAction(BaseModel):
    user_id: str


class RoomMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)


def _learning_list(doc: dict) -> list:
    ll = doc.get("learning_languages")
    if ll:
        return ll
    return [doc["learning_language"]] if doc.get("learning_language") else []


def apply_privacy(card: dict, doc: dict) -> dict:
    """Strip fields the user chose to hide (viewed by others)."""
    p = doc.get("privacy") or {}
    if not p.get("show_age", True):
        card["age"] = None
    if not p.get("show_gender", True):
        card["gender"] = None
    if not p.get("show_interests", True):
        card["interests"] = []
    if not p.get("show_country", True):
        card["country"] = None
    if not p.get("show_online", True):
        card["is_online"] = False
    return card


def user_public(doc: dict) -> dict:
    return {
        "id": doc["_id"],
        "email": doc.get("email"),
        "name": doc.get("name"),
        "bio": doc.get("bio"),
        "country": doc.get("country"),
        "avatar_url": doc.get("avatar_url"),
        "native_language": doc.get("native_language"),
        "learning_language": doc.get("learning_language"),
        "proficiency": doc.get("proficiency"),
        "teach_languages": doc.get("teach_languages") or [],
        "learning_languages": _learning_list(doc),
        "age": doc.get("age"),
        "interests": doc.get("interests") or [],
        "gender": doc.get("gender"),
        "is_vip": doc.get("is_vip", False),
        "privacy": doc.get("privacy") or {},
        "streak_count": doc.get("streak_count", 0),
        "created_at": doc.get("created_at"),
    }


def user_card(doc: dict) -> dict:
    """Lightweight user info embedded in lists/messages."""
    return {
        "id": doc["_id"],
        "name": doc.get("name"),
        "avatar_url": doc.get("avatar_url"),
        "country": doc.get("country"),
        "native_language": doc.get("native_language"),
        "learning_language": doc.get("learning_language"),
        "proficiency": doc.get("proficiency"),
        "teach_languages": doc.get("teach_languages") or [],
        "learning_languages": _learning_list(doc),
        "age": doc.get("age"),
        "interests": doc.get("interests") or [],
        "gender": doc.get("gender"),
        "is_vip": doc.get("is_vip", False),
        "bio": doc.get("bio"),
    }
