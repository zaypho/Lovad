import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from auth_utils import CurrentUser
from config_utils import get_app_config
from db import moments_col, room_messages_col, rooms_col, users_col
from models import (
    RoomCreate,
    RoomGiftCreate,
    RoomMessageCreate,
    RoomRoleUpdate,
    RoomUserAction,
    _vip_active,
    user_card,
)
from ws_manager import manager

router = APIRouter(prefix="/rooms", tags=["rooms"])

# Simple emoji gift catalog for voice rooms — prices in coins.
GIFT_CATALOG = [
    {"id": "rose", "emoji": "🌹", "name": "Rose", "price": 10},
    {"id": "heart", "emoji": "💖", "name": "Heart", "price": 20},
    {"id": "star", "emoji": "⭐", "name": "Star", "price": 30},
    {"id": "crown", "emoji": "👑", "name": "Crown", "price": 100},
]
GIFT_MAP = {g["id"]: g for g in GIFT_CATALOG}


@router.get("/gift-catalog")
async def gift_catalog(current_user: CurrentUser):
    return {"coins": current_user.get("coins", 0), "gifts": GIFT_CATALOG}


def _message_public(d: dict) -> dict:
    return {
        "id": d["_id"],
        "room_id": d["room_id"],
        "sender": d.get("sender"),
        "text": d["text"],
        "type": d.get("type", "text"),
        "gift": d.get("gift"),
        "created_at": d["created_at"],
    }


async def room_detail(doc: dict) -> dict:
    member_ids = list(doc.get("members", {}).keys())
    user_docs = await users_col.find({"_id": {"$in": member_ids}}).to_list(100)
    users_by_id = {u["_id"]: u for u in user_docs}
    members = []
    for uid, m in doc.get("members", {}).items():
        u = users_by_id.get(uid)
        if u:
            members.append({**user_card(u), "role": m["role"], "mic_on": m["mic_on"], "hand_raised": m["hand_raised"]})
    host = users_by_id.get(doc["host_id"])
    gift_totals = doc.get("gift_totals") or {}
    # "most_gifted" = the room's most celebrated members — ranked by gifts
    # they RECEIVED (not sent), shown with a crown badge in the room UI.
    most_gifted = []
    for uid, coins in sorted(gift_totals.items(), key=lambda kv: kv[1], reverse=True)[:2]:
        u = users_by_id.get(uid)
        if u and coins > 0:
            most_gifted.append({**user_card(u), "coins": coins})
    return {
        "id": doc["_id"],
        "title": doc["title"],
        "language": doc["language"],
        "languages": doc.get("languages") or [doc["language"]],
        "topic": doc.get("topic"),
        "mode": doc.get("mode", "chat"),
        "is_private": bool(doc.get("is_private")),
        "background": doc.get("background"),
        "host": user_card(host) if host else None,
        "host_level": max(1, (host or {}).get("streak_count") or 1),
        "is_live": doc["is_live"],
        "members": members,
        "member_count": len(members),
        "chat_muted": bool(doc.get("chat_muted")),
        "most_gifted": most_gifted,
        "created_at": doc["created_at"],
    }


def room_summary(doc: dict, host: dict | None, user_map: dict | None = None) -> dict:
    user_map = user_map or {}
    member_ids = list(doc.get("members", {}).keys())
    preview = [user_card(user_map[uid]) for uid in member_ids[:4] if uid in user_map]
    return {
        "id": doc["_id"],
        "title": doc["title"],
        "language": doc["language"],
        "languages": doc.get("languages") or [doc["language"]],
        "topic": doc.get("topic"),
        "mode": doc.get("mode", "chat"),
        "is_private": bool(doc.get("is_private")),
        "background": doc.get("background"),
        "host": user_card(host) if host else None,
        "member_count": len(doc.get("members", {})),
        "members_preview": preview,
        "created_at": doc["created_at"],
    }


async def get_live_room(room_id: str) -> dict:
    doc = await rooms_col.find_one({"_id": room_id, "is_live": True})
    if not doc:
        raise HTTPException(status_code=404, detail="Room not found or has ended")
    return doc


async def broadcast_room(doc: dict, extra: dict | None = None):
    detail = await room_detail(doc)
    event = {"type": "room_update", "room": detail}
    if extra:
        event.update(extra)
    await manager.broadcast(list(doc.get("members", {}).keys()), event)


@router.get("")
async def list_rooms(current_user: CurrentUser):
    docs = (
        await rooms_col.find({"is_live": True, "is_private": {"$ne": True}})
        .sort("created_at", -1)
        .to_list(50)
    )
    preview_ids = {d["host_id"] for d in docs}
    for d in docs:
        preview_ids.update(list(d.get("members", {}).keys())[:5])
    users = (
        await users_col.find({"_id": {"$in": list(preview_ids)}}).to_list(len(preview_ids))
        if preview_ids
        else []
    )
    user_map = {u["_id"]: u for u in users}
    return [room_summary(d, user_map.get(d["host_id"]), user_map) for d in docs]


async def _share_room_to_moments(doc: dict, user_id: str) -> None:
    moment_doc = {
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "text": f"🎙️ Live voice room — join and chat: \"{doc['title']}\"",
        "image_id": None,
        "room_id": doc["_id"],
        "likes": [],
        "comment_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await moments_col.insert_one(moment_doc)


@router.post("/{room_id}/share-to-moments", status_code=201)
async def share_room_to_moments(room_id: str, current_user: CurrentUser):
    """Host can (re)share the live room to their Moments feed as many times
    as they like, e.g. to bring in more people after the room quiets down."""
    doc = await get_live_room(room_id)
    if doc["host_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the host can share this room")
    if doc.get("is_private"):
        raise HTTPException(status_code=400, detail="Private rooms can't be shared")
    await _share_room_to_moments(doc, current_user["_id"])
    return {"shared": True}


@router.post("", status_code=201)
async def create_room(body: RoomCreate, current_user: CurrentUser):
    # Free users: configurable rooms/day; VIP hosts unlimited rooms.
    if not _vip_active(current_user):
        limit = (await get_app_config())["free_rooms_per_day"]
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        usage = current_user.get("host_usage") or {}
        count = usage.get("count", 0) if usage.get("date") == today else 0
        if count >= limit:
            raise HTTPException(
                status_code=403,
                detail=f"Free users can host {limit} room(s) per day. Upgrade to VIP for unlimited rooms.",
            )
        await users_col.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"host_usage": {"date": today, "count": count + 1}}},
        )
    languages = (body.languages or [body.language])[:2]
    doc = {
        "_id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "language": languages[0],
        "languages": languages,
        "topic": (body.topic or "").strip() or None,
        "mode": body.mode,
        "is_private": body.is_private,
        "background": body.background,
        "host_id": current_user["_id"],
        "is_live": True,
        "members": {
            current_user["_id"]: {"role": "host", "mic_on": True, "hand_raised": False}
        },
        "chat_muted": False,
        "gift_totals": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await rooms_col.insert_one(doc)
    if body.share_to_moments and not body.is_private:
        await _share_room_to_moments(doc, current_user["_id"])
    return await room_detail(doc)


@router.get("/{room_id}")
async def get_room(room_id: str, current_user: CurrentUser):
    doc = await get_live_room(room_id)
    return await room_detail(doc)


@router.post("/{room_id}/join")
async def join_room(room_id: str, current_user: CurrentUser):
    doc = await get_live_room(room_id)
    uid = current_user["_id"]
    if uid in doc.get("banned", []):
        raise HTTPException(
            status_code=403, detail="You have been removed from this room by the host"
        )
    if uid not in doc["members"]:
        doc["members"][uid] = {"role": "listener", "mic_on": False, "hand_raised": False}
        await rooms_col.update_one(
            {"_id": room_id}, {"$set": {f"members.{uid}": doc["members"][uid]}}
        )
        welcome = {
            "_id": str(uuid.uuid4()),
            "room_id": room_id,
            "sender": None,
            "text": f"Welcome {current_user.get('name', 'a new member')} to the room! 🎉",
            "type": "system",
            "gift": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await room_messages_col.insert_one(welcome)
        await broadcast_room(doc, {"joined": user_card(current_user)})
        await manager.broadcast(
            list(doc["members"].keys()),
            {"type": "room_message", "message": _message_public(welcome)},
        )
    return await room_detail(doc)


@router.post("/{room_id}/leave")
async def leave_room(room_id: str, current_user: CurrentUser):
    doc = await get_live_room(room_id)
    uid = current_user["_id"]
    if uid == doc["host_id"]:
        return await end_room(room_id, current_user)
    if uid in doc["members"]:
        doc["members"].pop(uid)
        await rooms_col.update_one({"_id": room_id}, {"$unset": {f"members.{uid}": ""}})
        await broadcast_room(doc)
        await manager.send_to_user(uid, {"type": "room_left", "room_id": room_id})
    return {"ok": True}


@router.post("/{room_id}/end")
async def end_room(room_id: str, current_user: CurrentUser):
    doc = await get_live_room(room_id)
    if doc["host_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the host can end the room")
    await rooms_col.update_one({"_id": room_id}, {"$set": {"is_live": False}})
    await manager.broadcast(
        list(doc["members"].keys()), {"type": "room_ended", "room_id": room_id}
    )
    return {"ok": True}


@router.post("/{room_id}/hand")
async def toggle_hand(room_id: str, current_user: CurrentUser):
    doc = await get_live_room(room_id)
    uid = current_user["_id"]
    member = doc["members"].get(uid)
    if not member:
        raise HTTPException(status_code=403, detail="Join the room first")
    member["hand_raised"] = not member["hand_raised"]
    await rooms_col.update_one(
        {"_id": room_id}, {"$set": {f"members.{uid}.hand_raised": member["hand_raised"]}}
    )
    await broadcast_room(doc)
    return {"hand_raised": member["hand_raised"]}


@router.post("/{room_id}/mic")
async def toggle_mic(room_id: str, current_user: CurrentUser):
    doc = await get_live_room(room_id)
    uid = current_user["_id"]
    member = doc["members"].get(uid)
    if not member:
        raise HTTPException(status_code=403, detail="Join the room first")
    if member["role"] not in ("host", "speaker"):
        raise HTTPException(status_code=403, detail="Only speakers can use the mic")
    member["mic_on"] = not member["mic_on"]
    await rooms_col.update_one(
        {"_id": room_id}, {"$set": {f"members.{uid}.mic_on": member["mic_on"]}}
    )
    await broadcast_room(doc)
    return {"mic_on": member["mic_on"]}


@router.post("/{room_id}/role")
async def change_role(room_id: str, body: RoomRoleUpdate, current_user: CurrentUser):
    doc = await get_live_room(room_id)
    if doc["host_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the host can change roles")
    member = doc["members"].get(body.user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not in room")
    if body.user_id == doc["host_id"]:
        raise HTTPException(status_code=400, detail="Cannot change the host's role")
    member["role"] = body.role
    member["hand_raised"] = False
    if body.role == "listener":
        member["mic_on"] = False
    await rooms_col.update_one(
        {"_id": room_id}, {"$set": {f"members.{body.user_id}": member}}
    )
    await broadcast_room(doc)
    return {"ok": True}


@router.post("/{room_id}/kick")
async def kick_member(room_id: str, body: RoomUserAction, current_user: CurrentUser):
    """Host removes (and bans) a member from the room — HelloTalk style."""
    doc = await get_live_room(room_id)
    if doc["host_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the host can remove members")
    if body.user_id == doc["host_id"]:
        raise HTTPException(status_code=400, detail="The host cannot be removed")
    if body.user_id in doc["members"]:
        doc["members"].pop(body.user_id)
        await rooms_col.update_one(
            {"_id": room_id},
            {
                "$unset": {f"members.{body.user_id}": ""},
                "$addToSet": {"banned": body.user_id},
            },
        )
        await manager.send_to_user(
            body.user_id, {"type": "room_kicked", "room_id": room_id}
        )
        await broadcast_room(doc)
    return {"ok": True}


@router.post("/{room_id}/hand/dismiss")
async def dismiss_hand(room_id: str, body: RoomUserAction, current_user: CurrentUser):
    """Host rejects a raise-hand request (lowers the member's hand)."""
    doc = await get_live_room(room_id)
    if doc["host_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the host can dismiss requests")
    member = doc["members"].get(body.user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not in room")
    member["hand_raised"] = False
    await rooms_col.update_one(
        {"_id": room_id}, {"$set": {f"members.{body.user_id}.hand_raised": False}}
    )
    await broadcast_room(doc)
    return {"ok": True}


@router.post("/{room_id}/chat-mute")
async def toggle_chat_mute(room_id: str, current_user: CurrentUser):
    """Host toggles muting text chat for everyone except the host."""
    doc = await get_live_room(room_id)
    if doc["host_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the host can mute room chat")
    muted = not doc.get("chat_muted")
    await rooms_col.update_one({"_id": room_id}, {"$set": {"chat_muted": muted}})
    doc["chat_muted"] = muted
    await broadcast_room(doc)
    return {"chat_muted": muted}


@router.get("/{room_id}/messages")
async def list_room_messages(room_id: str, current_user: CurrentUser):
    docs = (
        await room_messages_col.find({"room_id": room_id})
        .sort("created_at", 1)
        .to_list(200)
    )
    return [_message_public(d) for d in docs]


@router.post("/{room_id}/messages", status_code=201)
async def send_room_message(room_id: str, body: RoomMessageCreate, current_user: CurrentUser):
    doc = await get_live_room(room_id)
    if current_user["_id"] not in doc["members"]:
        raise HTTPException(status_code=403, detail="Join the room first")
    if doc.get("chat_muted") and current_user["_id"] != doc["host_id"]:
        raise HTTPException(status_code=403, detail="Chat has been muted by the host")
    msg = {
        "_id": str(uuid.uuid4()),
        "room_id": room_id,
        "sender": user_card(current_user),
        "text": body.text,
        "type": "text",
        "gift": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await room_messages_col.insert_one(msg)
    public = _message_public(msg)
    await manager.broadcast(
        list(doc["members"].keys()), {"type": "room_message", "message": public}
    )
    return public


@router.post("/{room_id}/gift", status_code=201)
async def send_gift(room_id: str, body: RoomGiftCreate, current_user: CurrentUser):
    """Send an emoji gift to a member on stage — deducts coins and posts a room message."""
    doc = await get_live_room(room_id)
    if current_user["_id"] not in doc["members"]:
        raise HTTPException(status_code=403, detail="Join the room first")
    gift = GIFT_MAP.get(body.gift_id)
    if not gift:
        raise HTTPException(status_code=404, detail="Gift not found")
    receiver_member = doc["members"].get(body.to_user_id)
    if not receiver_member:
        raise HTTPException(status_code=404, detail="Recipient is not in this room")
    coins = current_user.get("coins", 0)
    if coins < gift["price"]:
        raise HTTPException(status_code=400, detail="Not enough coins for this gift")
    receiver = await users_col.find_one({"_id": body.to_user_id})
    receiver_name = receiver.get("name", "someone") if receiver else "someone"
    new_coins = coins - gift["price"]
    await users_col.update_one(
        {"_id": current_user["_id"]}, {"$set": {"coins": new_coins}}
    )
    current_user["coins"] = new_coins
    await rooms_col.update_one(
        {"_id": room_id},
        # Track gifts by RECIPIENT — powers the room's "most_gifted" leaderboard.
        {"$inc": {f"gift_totals.{body.to_user_id}": gift["price"]}},
    )
    msg = {
        "_id": str(uuid.uuid4()),
        "room_id": room_id,
        "sender": user_card(current_user),
        "text": f"sent a {gift['emoji']} {gift['name']} to {receiver_name}!",
        "type": "gift",
        "gift": {"emoji": gift["emoji"], "name": gift["name"], "to": receiver_name},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await room_messages_col.insert_one(msg)
    public = _message_public(msg)
    fresh_doc = await get_live_room(room_id)
    await manager.broadcast(
        list(fresh_doc["members"].keys()), {"type": "room_message", "message": public}
    )
    await broadcast_room(fresh_doc)
    return {"coins": new_coins, "message": public}
