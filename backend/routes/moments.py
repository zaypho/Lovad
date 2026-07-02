import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from auth_utils import CurrentUser
from db import comments_col, moments_col, users_col
from models import CommentCreate, MomentCreate, user_card
from ws_manager import manager

router = APIRouter(prefix="/moments", tags=["moments"])


def _card_with_presence(author: dict | None) -> dict | None:
    if not author:
        return None
    card = user_card(author)
    card["is_online"] = manager.is_online(author["_id"])
    return card


async def moment_public(doc: dict, viewer_id: str) -> dict:
    author = await users_col.find_one({"_id": doc["user_id"]})
    likes = doc.get("likes", [])
    return {
        "id": doc["_id"],
        "author": _card_with_presence(author),
        "text": doc["text"],
        "like_count": len(likes),
        "liked_by_me": viewer_id in likes,
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
async def list_moments(current_user: CurrentUser):
    docs = await moments_col.find({}).sort("created_at", -1).to_list(100)
    return [await moment_public(d, current_user["_id"]) for d in docs]


@router.post("", status_code=201)
async def create_moment(body: MomentCreate, current_user: CurrentUser):
    doc = {
        "_id": str(uuid.uuid4()),
        "user_id": current_user["_id"],
        "text": body.text,
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
    comments = []
    for c in comment_docs:
        author = await users_col.find_one({"_id": c["user_id"]})
        comments.append(comment_public(c, author))
    moment["comments"] = comments
    return moment


@router.post("/{moment_id}/like")
async def toggle_like(moment_id: str, current_user: CurrentUser):
    doc = await moments_col.find_one({"_id": moment_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Moment not found")
    liked = current_user["_id"] in doc.get("likes", [])
    op = "$pull" if liked else "$addToSet"
    await moments_col.update_one({"_id": moment_id}, {op: {"likes": current_user["_id"]}})
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
    return comment_public(comment, current_user)
