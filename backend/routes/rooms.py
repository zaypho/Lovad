import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from auth_utils import CurrentUser
from db import room_messages_col, rooms_col, users_col
from models import RoomCreate, RoomMessageCreate, RoomRoleUpdate, RoomUserAction, user_card
from ws_manager import manager

router = APIRouter(prefix="/rooms", tags=["rooms"])


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
    return {
        "id": doc["_id"],
        "title": doc["title"],
        "language": doc["language"],
        "host": user_card(host) if host else None,
        "is_live": doc["is_live"],
        "members": members,
        "member_count": len(members),
        "created_at": doc["created_at"],
    }


def room_summary(doc: dict, host: dict | None) -> dict:
    return {
        "id": doc["_id"],
        "title": doc["title"],
        "language": doc["language"],
        "host": user_card(host) if host else None,
        "member_count": len(doc.get("members", {})),
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
    docs = await rooms_col.find({"is_live": True}).sort("created_at", -1).to_list(50)
    results = []
    for d in docs:
        host = await users_col.find_one({"_id": d["host_id"]})
        results.append(room_summary(d, host))
    return results


@router.post("", status_code=201)
async def create_room(body: RoomCreate, current_user: CurrentUser):
    doc = {
        "_id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "language": body.language,
        "host_id": current_user["_id"],
        "is_live": True,
        "members": {
            current_user["_id"]: {"role": "host", "mic_on": True, "hand_raised": False}
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await rooms_col.insert_one(doc)
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
        await broadcast_room(doc, {"joined": user_card(current_user)})
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


@router.get("/{room_id}/messages")
async def list_room_messages(room_id: str, current_user: CurrentUser):
    docs = (
        await room_messages_col.find({"room_id": room_id})
        .sort("created_at", 1)
        .to_list(200)
    )
    return [
        {
            "id": d["_id"],
            "room_id": d["room_id"],
            "sender": d["sender"],
            "text": d["text"],
            "created_at": d["created_at"],
        }
        for d in docs
    ]


@router.post("/{room_id}/messages", status_code=201)
async def send_room_message(room_id: str, body: RoomMessageCreate, current_user: CurrentUser):
    doc = await get_live_room(room_id)
    if current_user["_id"] not in doc["members"]:
        raise HTTPException(status_code=403, detail="Join the room first")
    msg = {
        "_id": str(uuid.uuid4()),
        "room_id": room_id,
        "sender": user_card(current_user),
        "text": body.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await room_messages_col.insert_one(msg)
    public = {
        "id": msg["_id"],
        "room_id": room_id,
        "sender": msg["sender"],
        "text": msg["text"],
        "created_at": msg["created_at"],
    }
    await manager.broadcast(
        list(doc["members"].keys()), {"type": "room_message", "message": public}
    )
    return public
