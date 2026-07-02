from fastapi import APIRouter

from auth_utils import CurrentUser
from db import notifications_col, users_col
from models import user_card

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(current_user: CurrentUser):
    uid = current_user["_id"]
    docs = (
        await notifications_col.find({"user_id": uid})
        .sort("created_at", -1)
        .to_list(50)
    )
    actor_ids = list({d["actor_id"] for d in docs})
    actors = await users_col.find({"_id": {"$in": actor_ids}}).to_list(100)
    amap = {a["_id"]: a for a in actors}
    items = []
    for d in docs:
        actor = amap.get(d["actor_id"])
        items.append(
            {
                "id": d["_id"],
                "type": d["type"],
                "moment_id": d.get("moment_id"),
                "text": d.get("text"),
                "read": d.get("read", False),
                "created_at": d["created_at"],
                "actor": user_card(actor) if actor else None,
            }
        )
    unread = await notifications_col.count_documents({"user_id": uid, "read": False})
    return {"unread": unread, "notifications": items}


@router.post("/read")
async def mark_all_read(current_user: CurrentUser):
    await notifications_col.update_many(
        {"user_id": current_user["_id"], "read": False}, {"$set": {"read": True}}
    )
    return {"ok": True}
