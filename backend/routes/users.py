import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from auth_utils import CurrentUser
from db import follows_col, media_col, profile_visits_col, users_col
from models import AvatarUpload, UserUpdate, apply_privacy, user_card, user_public
from ws_manager import manager

router = APIRouter(prefix="/users", tags=["users"])


@router.put("/me")
async def update_me(body: UserUpdate, current_user: CurrentUser):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    # Country, age and gender are set once at signup and cannot be changed afterwards.
    if current_user.get("country") and "country" in updates:
        updates.pop("country")
    if current_user.get("age") and "age" in updates:
        updates.pop("age")
    if current_user.get("gender") and "gender" in updates:
        updates.pop("gender")
    # Non-VIP users: 1 native + 1 learning language only (no extra teach languages).
    if not current_user.get("is_vip"):
        if updates.get("learning_languages") is not None:
            updates["learning_languages"] = updates["learning_languages"][:1]
            updates["learning_language"] = (
                updates["learning_languages"][0]
                if updates["learning_languages"]
                else None
            )
        if updates.get("teach_languages"):
            updates["teach_languages"] = []
    if updates:
        await users_col.update_one({"_id": current_user["_id"]}, {"$set": updates})
        current_user.update(updates)
    return user_public(current_user)


@router.post("/me/vip")
async def upgrade_vip(current_user: CurrentUser):
    """Free VIP upgrade (payment can be added later)."""
    await users_col.update_one(
        {"_id": current_user["_id"]}, {"$set": {"is_vip": True}}
    )
    current_user["is_vip"] = True
    return user_public(current_user)


@router.post("/me/avatar")
async def upload_avatar(body: AvatarUpload, current_user: CurrentUser):
    try:
        image_bytes = base64.b64decode(body.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")
    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")
    media_id = str(uuid.uuid4())
    await media_col.insert_one({"_id": media_id, "data": image_bytes, "mime": body.mime})
    avatar_url = f"/api/media/{media_id}"
    await users_col.update_one(
        {"_id": current_user["_id"]}, {"$set": {"avatar_url": avatar_url}}
    )
    current_user["avatar_url"] = avatar_url
    return user_public(current_user)


@router.get("/me/visitors")
async def my_visitors(current_user: CurrentUser):
    """Who visited my profile, most recent first (unique visitors)."""
    docs = (
        await profile_visits_col.find({"visited_user_id": current_user["_id"]})
        .sort("visited_at", -1)
        .to_list(100)
    )
    visitor_ids = [d["visitor_id"] for d in docs]
    users = await users_col.find({"_id": {"$in": visitor_ids}}).to_list(200)
    umap = {u["_id"]: u for u in users}
    visitors = []
    for d in docs:
        u = umap.get(d["visitor_id"])
        if u:
            card = user_card(u)
            card["visited_at"] = d["visited_at"]
            card["is_online"] = manager.is_online(u["_id"])
            visitors.append(apply_privacy(card, u))
    return {"count": len(visitors), "visitors": visitors}


@router.get("/me/visited")
async def my_visited(current_user: CurrentUser):
    """Profiles I have visited, most recent first."""
    docs = (
        await profile_visits_col.find({"visitor_id": current_user["_id"]})
        .sort("visited_at", -1)
        .to_list(100)
    )
    ids = [d["visited_user_id"] for d in docs]
    users = await users_col.find({"_id": {"$in": ids}}).to_list(200)
    umap = {u["_id"]: u for u in users}
    visited = []
    for d in docs:
        u = umap.get(d["visited_user_id"])
        if u:
            card = user_card(u)
            card["visited_at"] = d["visited_at"]
            card["is_online"] = manager.is_online(u["_id"])
            visited.append(apply_privacy(card, u))
    return {"count": len(visited), "visitors": visited}


async def _follow_cards(ids: list) -> list:
    users = await users_col.find({"_id": {"$in": ids}}).to_list(200)
    umap = {u["_id"]: u for u in users}
    cards = []
    for uid in ids:
        u = umap.get(uid)
        if u:
            card = user_card(u)
            card["is_online"] = manager.is_online(uid)
            cards.append(apply_privacy(card, u))
    return cards


@router.get("/me/followers")
async def my_followers(current_user: CurrentUser):
    docs = (
        await follows_col.find({"following_id": current_user["_id"]})
        .sort("created_at", -1)
        .to_list(200)
    )
    return await _follow_cards([d["follower_id"] for d in docs])


@router.get("/me/following")
async def my_following(current_user: CurrentUser):
    docs = (
        await follows_col.find({"follower_id": current_user["_id"]})
        .sort("created_at", -1)
        .to_list(200)
    )
    return await _follow_cards([d["following_id"] for d in docs])


@router.post("/{user_id}/follow")
async def toggle_follow(user_id: str, current_user: CurrentUser):
    if user_id == current_user["_id"]:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    target = await users_col.find_one({"_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    key = {"follower_id": current_user["_id"], "following_id": user_id}
    existing = await follows_col.find_one(key)
    if existing:
        await follows_col.delete_one(key)
        following = False
    else:
        await follows_col.insert_one(
            {
                "_id": str(uuid.uuid4()),
                **key,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        following = True
    followers_count = await follows_col.count_documents({"following_id": user_id})
    return {"following": following, "followers_count": followers_count}


@router.get("/partners")
async def list_partners(
    current_user: CurrentUser,
    language: str | None = None,
    search: str | None = None,
):
    """Partners list. Default: users whose native language matches my learning
    language, or who are learning my native language. `language=all` shows everyone."""
    query: dict = {
        "_id": {"$ne": current_user["_id"]},
        "native_language": {"$ne": None},
    }
    if language and language != "all":
        query["$or"] = [
            {"native_language": language},
            {"teach_languages": language},
        ]
    elif language != "all":
        my_learning = current_user.get("learning_languages") or (
            [current_user["learning_language"]]
            if current_user.get("learning_language")
            else []
        )
        my_teach = [
            l
            for l in [
                current_user.get("native_language"),
                *(current_user.get("teach_languages") or []),
            ]
            if l
        ]
        ors = []
        if my_learning:
            ors.append({"native_language": {"$in": my_learning}})
            ors.append({"teach_languages": {"$in": my_learning}})
        if my_teach:
            ors.append({"learning_language": {"$in": my_teach}})
            ors.append({"learning_languages": {"$in": my_teach}})
        if ors:
            query["$or"] = ors
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    docs = await users_col.find(query).sort("created_at", -1).to_list(100)
    online_ids = manager.online_user_ids()
    cards = []
    for d in docs:
        card = user_card(d)
        card["is_online"] = d["_id"] in online_ids
        cards.append(apply_privacy(card, d))
    return cards


@router.get("/{user_id}")
async def get_user(user_id: str, current_user: CurrentUser):
    doc = await users_col.find_one({"_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id != current_user["_id"]:
        await profile_visits_col.update_one(
            {"visitor_id": current_user["_id"], "visited_user_id": user_id},
            {
                "$set": {"visited_at": datetime.now(timezone.utc).isoformat()},
                "$setOnInsert": {"_id": str(uuid.uuid4())},
            },
            upsert=True,
        )
    public = user_public(doc)
    public.pop("email", None)
    public["is_online"] = manager.is_online(user_id)
    public.pop("privacy", None)
    if user_id != current_user["_id"]:
        apply_privacy(public, doc)
    public["followers_count"] = await follows_col.count_documents(
        {"following_id": user_id}
    )
    public["following_count"] = await follows_col.count_documents(
        {"follower_id": user_id}
    )
    public["is_following"] = bool(
        await follows_col.find_one(
            {"follower_id": current_user["_id"], "following_id": user_id}
        )
    )
    public["follows_me"] = bool(
        await follows_col.find_one(
            {"follower_id": user_id, "following_id": current_user["_id"]}
        )
    )
    return public
