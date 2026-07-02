import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from auth_utils import CurrentUser
from db import media_col, profile_visits_col, users_col
from models import AvatarUpload, UserUpdate, user_card, user_public
from ws_manager import manager

router = APIRouter(prefix="/users", tags=["users"])


@router.put("/me")
async def update_me(body: UserUpdate, current_user: CurrentUser):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    # Country and age are set once at signup and cannot be changed afterwards.
    if current_user.get("country") and "country" in updates:
        updates.pop("country")
    if current_user.get("age") and "age" in updates:
        updates.pop("age")
    if updates:
        await users_col.update_one({"_id": current_user["_id"]}, {"$set": updates})
        current_user.update(updates)
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
            visitors.append(card)
    return {"count": len(visitors), "visitors": visitors}


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
        cards.append(card)
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
    public["profile_views"] = await profile_visits_col.count_documents(
        {"visited_user_id": user_id}
    )
    return public
