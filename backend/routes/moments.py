import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from auth_utils import CurrentUser
from db import comments_col, media_col, moments_col, notifications_col, users_col
from models import CommentCreate, MomentCreate, apply_privacy, user_card
from ws_manager import manager

router = APIRouter(prefix="/moments", tags=["moments"])


async def _notify(
    recipient_id: str,
    actor_id: str,
    ntype: str,
    moment_id: str,
    text: str | None = None,
):
    """Store an in-app notification (like / comment / reply)."""
    if recipient_id == actor_id:
        return
    await notifications_col.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "user_id": recipient_id,
            "actor_id": actor_id,
            "type": ntype,
            "moment_id": moment_id,
            "text": text,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )


def _card_with_presence(author: dict | None) -> dict | None:
    if not author:
        return None
    card = user_card(author)
    card["is_online"] = manager.is_online(author["_id"])
    return apply_privacy(card, author)


async def moment_public(doc: dict, viewer_id: str, author: dict | None = None) -> dict:
    if author is None:
        author = await users_col.find_one({"_id": doc["user_id"]})
    likes = doc.get("likes", [])
    likers = []
    if likes:
        liker_docs = await users_col.find({"_id": {"$in": likes[:6]}}).to_list(6)
        likers = [
            {
                "id": u["_id"],
                "name": u.get("name"),
                "avatar_url": u.get("avatar_url"),
                "country": u.get("country"),
            }
            for u in liker_docs
        ]
    return {
        "id": doc["_id"],
        "author": _card_with_presence(author),
        "text": doc["text"],
        "image_url": f"/api/media/{doc['image_id']}" if doc.get("image_id") else None,
        "like_count": len(likes),
        "liked_by_me": viewer_id in likes,
        "likers": likers,
        "comment_count": doc.get("comment_count", 0),
        "created_at": doc["created_at"],
    }


def comment_public(doc: dict, author: dict | None) -> dict:
    return {
        "id": doc["_id"],
        "author": _card_with_presence(author),
        "text": doc["text"],
        "reply_to": doc.get("reply_to"),
        "reply_to_author": doc.get("reply_to_author"),
        "created_at": doc["created_at"],
    }


@router.get("")
async def list_moments(current_user: CurrentUser, user_id: str | None = None):
    query = {"user_id": user_id} if user_id else {}
    docs = (
        await moments_col.find(
            query,
            {"user_id": 1, "text": 1, "image_id": 1, "likes": 1, "comment_count": 1, "created_at": 1},
        )
        .sort("created_at", -1)
        .to_list(100)
    )
    hidden = set(current_user.get("hidden_moment_users") or []) | set(
        current_user.get("blocked_users") or []
    )
    docs = [d for d in docs if d["user_id"] not in hidden]
    author_ids = list({d["user_id"] for d in docs})
    authors = (
        await users_col.find({"_id": {"$in": author_ids}}).to_list(len(author_ids))
        if author_ids
        else []
    )
    author_map = {u["_id"]: u for u in authors}
    return [
        await moment_public(d, current_user["_id"], author_map.get(d["user_id"]))
        for d in docs
    ]


@router.get("/mine/count")
async def my_moments_count(current_user: CurrentUser):
    count = await moments_col.count_documents({"user_id": current_user["_id"]})
    return {"count": count}


@router.get("/user/{user_id}/count")
async def user_moments_count(user_id: str, current_user: CurrentUser):
    count = await moments_col.count_documents({"user_id": user_id})
    return {"count": count}


@router.post("", status_code=201)
async def create_moment(body: MomentCreate, current_user: CurrentUser):
    if current_user.get("restricted"):
        raise HTTPException(status_code=403, detail="Your account is restricted from posting.")
    if not body.text.strip() and not body.image_base64:
        raise HTTPException(status_code=400, detail="Add some text or a photo")
    image_id = None
    if body.image_base64:
        try:
            image_bytes = base64.b64decode(body.image_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image data")
        if len(image_bytes) > 8 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image too large (max 8MB)")
        image_id = str(uuid.uuid4())
        await media_col.insert_one(
            {"_id": image_id, "data": image_bytes, "mime": body.mime}
        )
    doc = {
        "_id": str(uuid.uuid4()),
        "user_id": current_user["_id"],
        "text": body.text.strip(),
        "image_id": image_id,
        "likes": [],
        "comment_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await moments_col.insert_one(doc)
    return await moment_public(doc, current_user["_id"])


@router.get("/{moment_id}")
async def get_moment(moment_id: str, current_user: CurrentUser):
    doc = await moments_col.find_one({"_id": moment_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Moment not found")
    moment = await moment_public(doc, current_user["_id"])
    comment_docs = (
        await comments_col.find({"moment_id": moment_id}).sort("created_at", 1).to_list(200)
    )
    author_ids = list({c["user_id"] for c in comment_docs})
    authors = (
        await users_col.find({"_id": {"$in": author_ids}}).to_list(len(author_ids))
        if author_ids
        else []
    )
    author_map = {u["_id"]: u for u in authors}
    moment["comments"] = [
        comment_public(c, author_map.get(c["user_id"])) for c in comment_docs
    ]
    return moment


@router.get("/{moment_id}/likes")
async def list_likers(moment_id: str, current_user: CurrentUser):
    doc = await moments_col.find_one({"_id": moment_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Moment not found")
    likes = doc.get("likes", [])
    if not likes:
        return []
    users = await users_col.find({"_id": {"$in": likes}}).to_list(500)
    order = {uid: i for i, uid in enumerate(likes)}
    users.sort(key=lambda u: order.get(u["_id"], 0))
    return [_card_with_presence(u) for u in users]


@router.post("/{moment_id}/like")
async def toggle_like(moment_id: str, current_user: CurrentUser):
    doc = await moments_col.find_one({"_id": moment_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Moment not found")
    liked = current_user["_id"] in doc.get("likes", [])
    op = "$pull" if liked else "$addToSet"
    await moments_col.update_one({"_id": moment_id}, {op: {"likes": current_user["_id"]}})
    if not liked:
        await _notify(doc["user_id"], current_user["_id"], "like", moment_id)
    return {"liked": not liked, "like_count": len(doc.get("likes", [])) + (-1 if liked else 1)}


@router.post("/{moment_id}/comments", status_code=201)
async def add_comment(moment_id: str, body: CommentCreate, current_user: CurrentUser):
    doc = await moments_col.find_one({"_id": moment_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Moment not found")
    comment = {
        "_id": str(uuid.uuid4()),
        "moment_id": moment_id,
        "user_id": current_user["_id"],
        "text": body.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    parent = None
    if body.reply_to:
        parent = await comments_col.find_one(
            {"_id": body.reply_to, "moment_id": moment_id}
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Comment to reply to not found")
        parent_author = await users_col.find_one({"_id": parent["user_id"]})
        comment["reply_to"] = body.reply_to
        comment["reply_to_author"] = parent_author.get("name") if parent_author else None
    await comments_col.insert_one(comment)
    await moments_col.update_one({"_id": moment_id}, {"$inc": {"comment_count": 1}})
    if parent:
        await _notify(
            parent["user_id"], current_user["_id"], "reply", moment_id, body.text
        )
        if doc["user_id"] != parent["user_id"]:
            await _notify(
                doc["user_id"], current_user["_id"], "comment", moment_id, body.text
            )
    else:
        await _notify(
            doc["user_id"], current_user["_id"], "comment", moment_id, body.text
        )
    return comment_public(comment, current_user)
