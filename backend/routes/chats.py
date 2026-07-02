import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from auth_utils import CurrentUser
from db import audio_col, conversations_col, follows_col, media_col, messages_col, users_col
from models import (
    ConversationCreate,
    ImageMessageCreate,
    MessageCreate,
    VoiceMessageCreate,
    _vip_active,
    apply_privacy,
    user_card,
)
from ws_manager import manager

router = APIRouter(prefix="/chats", tags=["chats"])


def message_public(doc: dict) -> dict:
    return {
        "id": doc["_id"],
        "conversation_id": doc["conversation_id"],
        "sender_id": doc["sender_id"],
        "text": doc["text"],
        "type": doc.get("type", "text"),
        "audio_id": doc.get("audio_id"),
        "image_id": doc.get("image_id"),
        "duration_ms": doc.get("duration_ms"),
        "created_at": doc["created_at"],
    }


async def conversation_public(doc: dict, viewer_id: str) -> dict:
    partner_id = next((p for p in doc["participant_ids"] if p != viewer_id), viewer_id)
    partner = await users_col.find_one({"_id": partner_id})
    partner_card = None
    if partner:
        partner_card = user_card(partner)
        partner_card["is_online"] = manager.is_online(partner_id)
        apply_privacy(partner_card, partner)
    return {
        "id": doc["_id"],
        "partner": partner_card,
        "last_message": doc.get("last_message"),
        "unread": doc.get("unread", {}).get(viewer_id, 0),
        "updated_at": doc.get("updated_at"),
    }


async def get_owned_conversation(conversation_id: str, user_id: str) -> dict:
    doc = await conversations_col.find_one({"_id": conversation_id})
    if not doc or user_id not in doc["participant_ids"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return doc


@router.post("")
async def create_or_get_conversation(body: ConversationCreate, current_user: CurrentUser):
    if body.partner_id == current_user["_id"]:
        raise HTTPException(status_code=400, detail="Cannot chat with yourself")
    partner = await users_col.find_one({"_id": body.partner_id})
    if not partner:
        raise HTTPException(status_code=404, detail="User not found")
    existing = await conversations_col.find_one(
        {"participant_ids": {"$all": [current_user["_id"], body.partner_id]}}
    )
    if existing:
        return await conversation_public(existing, current_user["_id"])
    # Daily new-partner caps: free users 10/day, VIP 25/day. Mutual follows are exempt.
    is_vip = _vip_active(current_user)
    daily_cap = 25 if is_vip else 10
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    usage = current_user.get("new_chat_usage") or {}
    used_today = usage.get("count", 0) if usage.get("date") == today else 0
    counted = used_today < daily_cap
    if not counted:
        i_follow = await follows_col.find_one(
            {"follower_id": current_user["_id"], "following_id": body.partner_id}
        )
        follows_me = await follows_col.find_one(
            {"follower_id": body.partner_id, "following_id": current_user["_id"]}
        )
        if not (i_follow and follows_me):
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Daily limit reached — you can start chats with {daily_cap} new people per day."
                    + ("" if is_vip else " Upgrade to VIP for 25 per day.")
                    + " Mutual follows can always chat."
                ),
            )
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id": str(uuid.uuid4()),
        "participant_ids": [current_user["_id"], body.partner_id],
        "last_message": None,
        "unread": {current_user["_id"]: 0, body.partner_id: 0},
        "created_at": now,
        "updated_at": now,
    }
    await conversations_col.insert_one(doc)
    if counted:
        await users_col.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"new_chat_usage": {"date": today, "count": used_today + 1}}},
        )
    return await conversation_public(doc, current_user["_id"])


@router.get("")
async def list_conversations(current_user: CurrentUser):
    docs = (
        await conversations_col.find({"participant_ids": current_user["_id"]})
        .sort("updated_at", -1)
        .to_list(100)
    )
    return [await conversation_public(d, current_user["_id"]) for d in docs]


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, current_user: CurrentUser):
    doc = await get_owned_conversation(conversation_id, current_user["_id"])
    return await conversation_public(doc, current_user["_id"])


@router.get("/{conversation_id}/messages")
async def list_messages(conversation_id: str, current_user: CurrentUser):
    await get_owned_conversation(conversation_id, current_user["_id"])
    docs = (
        await messages_col.find({"conversation_id": conversation_id})
        .sort("created_at", 1)
        .to_list(500)
    )
    return [message_public(d) for d in docs]


@router.post("/{conversation_id}/messages", status_code=201)
async def send_message(conversation_id: str, body: MessageCreate, current_user: CurrentUser):
    conv = await get_owned_conversation(conversation_id, current_user["_id"])
    partner_id = next(p for p in conv["participant_ids"] if p != current_user["_id"])
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "sender_id": current_user["_id"],
        "text": body.text,
        "created_at": now,
    }
    await messages_col.insert_one(doc)
    msg = message_public(doc)
    await conversations_col.update_one(
        {"_id": conversation_id},
        {
            "$set": {
                "last_message": {"text": body.text, "sender_id": current_user["_id"], "created_at": now},
                "updated_at": now,
            },
            "$inc": {f"unread.{partner_id}": 1},
        },
    )
    await manager.send_to_user(
        partner_id,
        {
            "type": "new_message",
            "conversation_id": conversation_id,
            "message": msg,
            "sender": user_card(current_user),
        },
    )
    return msg


@router.post("/{conversation_id}/voice", status_code=201)
async def send_voice_message(
    conversation_id: str, body: VoiceMessageCreate, current_user: CurrentUser
):
    conv = await get_owned_conversation(conversation_id, current_user["_id"])
    partner_id = next(p for p in conv["participant_ids"] if p != current_user["_id"])
    try:
        audio_bytes = base64.b64decode(body.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid audio data")
    if len(audio_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio too large (max 10MB)")
    audio_id = str(uuid.uuid4())
    await audio_col.insert_one({"_id": audio_id, "data": audio_bytes, "mime": body.mime})
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "sender_id": current_user["_id"],
        "text": "Voice message",
        "type": "voice",
        "audio_id": audio_id,
        "duration_ms": body.duration_ms,
        "created_at": now,
    }
    await messages_col.insert_one(doc)
    msg = message_public(doc)
    await conversations_col.update_one(
        {"_id": conversation_id},
        {
            "$set": {
                "last_message": {"text": "🎤 Voice message", "sender_id": current_user["_id"], "created_at": now},
                "updated_at": now,
            },
            "$inc": {f"unread.{partner_id}": 1},
        },
    )
    await manager.send_to_user(
        partner_id,
        {
            "type": "new_message",
            "conversation_id": conversation_id,
            "message": msg,
            "sender": user_card(current_user),
        },
    )
    return msg


@router.post("/{conversation_id}/image", status_code=201)
async def send_image_message(
    conversation_id: str, body: ImageMessageCreate, current_user: CurrentUser
):
    conv = await get_owned_conversation(conversation_id, current_user["_id"])
    partner_id = next(p for p in conv["participant_ids"] if p != current_user["_id"])
    try:
        image_bytes = base64.b64decode(body.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")
    if len(image_bytes) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 8MB)")
    media_id = str(uuid.uuid4())
    await media_col.insert_one({"_id": media_id, "data": image_bytes, "mime": body.mime})
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "sender_id": current_user["_id"],
        "text": "Photo",
        "type": "image",
        "image_id": media_id,
        "created_at": now,
    }
    await messages_col.insert_one(doc)
    msg = message_public(doc)
    await conversations_col.update_one(
        {"_id": conversation_id},
        {
            "$set": {
                "last_message": {"text": "📷 Photo", "sender_id": current_user["_id"], "created_at": now},
                "updated_at": now,
            },
            "$inc": {f"unread.{partner_id}": 1},
        },
    )
    await manager.send_to_user(
        partner_id,
        {
            "type": "new_message",
            "conversation_id": conversation_id,
            "message": msg,
            "sender": user_card(current_user),
        },
    )
    return msg


@router.post("/{conversation_id}/read")
async def mark_read(conversation_id: str, current_user: CurrentUser):
    await get_owned_conversation(conversation_id, current_user["_id"])
    await conversations_col.update_one(
        {"_id": conversation_id},
        {"$set": {f"unread.{current_user['_id']}": 0}},
    )
    return {"ok": True}
