import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from auth_utils import CurrentUser
from db import users_col
from models import user_public

router = APIRouter(prefix="/market", tags=["market"])

# Static marketplace catalog — prices in coins.
CATALOG = [
    {"id": "vip_weekly", "type": "vip", "name": "VIP — 7 Days", "emoji": "✨", "price": 150, "duration_days": 7, "color": "#F59E0B", "desc": "Try VIP: badge, 3 learning languages & unlimited chats for a week"},
    {"id": "vip_monthly", "type": "vip", "name": "VIP — 1 Month", "emoji": "💎", "price": 500, "duration_days": 30, "color": "#F59E0B", "desc": "Gold VIP badge, 3 learning languages, unlimited chats"},
    {"id": "vip_lifetime", "type": "vip", "name": "VIP — Lifetime", "emoji": "👑", "price": 2000, "duration_days": None, "color": "#8B5CF6", "desc": "Purple lifetime VIP badge & all VIP perks forever"},
    {"id": "badge_star", "type": "badge", "name": "Star Badge", "emoji": "⭐", "price": 100, "duration_days": 7, "desc": "Shine next to your name for 7 days"},
    {"id": "badge_fire", "type": "badge", "name": "Fire Badge", "emoji": "🔥", "price": 100, "duration_days": 7, "desc": "Show you're on fire for 7 days"},
    {"id": "badge_crown", "type": "badge", "name": "Crown Badge", "emoji": "👑", "price": 150, "duration_days": 7, "desc": "Royal look for 7 days"},
    {"id": "badge_heart", "type": "badge", "name": "Heart Badge", "emoji": "💖", "price": 80, "duration_days": 7, "desc": "Spread the love for 7 days"},
    {"id": "frame_gold", "type": "frame", "name": "Gold Ring", "emoji": "🟡", "price": 150, "duration_days": 7, "color": "#F59E0B", "desc": "Golden ring around your avatar for 7 days"},
    {"id": "frame_blue", "type": "frame", "name": "Sky Ring", "emoji": "🔵", "price": 120, "duration_days": 7, "color": "#0EA5E9", "desc": "Sky-blue avatar ring for 7 days"},
    {"id": "frame_pink", "type": "frame", "name": "Rose Ring", "emoji": "🌸", "price": 120, "duration_days": 7, "color": "#EC4899", "desc": "Rose avatar ring for 7 days"},
    {"id": "frame_green", "type": "frame", "name": "Emerald Ring", "emoji": "🟢", "price": 120, "duration_days": 7, "color": "#22C55E", "desc": "Emerald avatar ring for 7 days"},
    {"id": "frame_rainbow", "type": "frame", "name": "Rainbow Pulse", "emoji": "🌈", "price": 300, "duration_days": 7, "color": "#F59E0B", "colors": ["#F59E0B", "#EC4899", "#8B5CF6", "#0EA5E9"], "animated": True, "desc": "Animated rainbow ring cycling colors — 7 days"},
    {"id": "frame_neon", "type": "frame", "name": "Neon Glow", "emoji": "💫", "price": 250, "duration_days": 7, "color": "#22D3EE", "colors": ["#22D3EE", "#22C55E", "#22D3EE"], "animated": True, "desc": "Glowing animated neon ring — 7 days"},
]
ITEM_MAP = {i["id"]: i for i in CATALOG}
VIP_TIERS = {"vip_weekly": "weekly", "vip_monthly": "monthly", "vip_lifetime": "lifetime"}


class BuyRequest(BaseModel):
    item_id: str


TOPUP_AMOUNTS = {100, 500, 1000, 2000}


class TopupRequest(BaseModel):
    amount: int


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("")
async def get_market(current_user: CurrentUser):
    now = _now().isoformat()
    active_badge = current_user.get("active_badge") or {}
    active_frame = current_user.get("active_frame") or {}
    items = []
    for item in CATALOG:
        entry = dict(item)
        if item["type"] == "vip":
            entry["active"] = bool(
                current_user.get("is_vip")
                and current_user.get("vip_tier") == VIP_TIERS[item["id"]]
                and (not current_user.get("vip_expires_at") or current_user["vip_expires_at"] > now)
            )
        elif item["type"] == "badge":
            entry["active"] = active_badge.get("id") == item["id"] and (
                not active_badge.get("expires_at") or active_badge["expires_at"] > now
            )
        else:
            entry["active"] = active_frame.get("id") == item["id"] and (
                not active_frame.get("expires_at") or active_frame["expires_at"] > now
            )
        items.append(entry)
    return {"coins": current_user.get("coins", 0), "items": items}


@router.post("/buy")
async def buy_item(body: BuyRequest, current_user: CurrentUser):
    item = ITEM_MAP.get(body.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    coins = current_user.get("coins", 0)
    if coins < item["price"]:
        raise HTTPException(status_code=400, detail="Not enough coins")
    updates: dict = {"coins": coins - item["price"]}
    expires = (
        (_now() + timedelta(days=item["duration_days"])).isoformat()
        if item.get("duration_days")
        else None
    )
    if item["type"] == "vip":
        updates["is_vip"] = True
        updates["vip_tier"] = VIP_TIERS[item["id"]]
        updates["vip_expires_at"] = expires
    elif item["type"] == "badge":
        updates["active_badge"] = {
            "id": item["id"],
            "emoji": item["emoji"],
            "expires_at": expires,
        }
    else:
        updates["active_frame"] = {
            "id": item["id"],
            "color": item["color"],
            "colors": item.get("colors"),
            "animated": item.get("animated", False),
            "expires_at": expires,
        }
    await users_col.update_one({"_id": current_user["_id"]}, {"$set": updates})
    current_user.update(updates)
    return {"coins": updates["coins"], "user": user_public(current_user)}


@router.post("/topup")
async def topup(body: TopupRequest, current_user: CurrentUser):
    """Demo top-up — adds coins instantly (real payments come later)."""
    if body.amount not in TOPUP_AMOUNTS:
        raise HTTPException(status_code=400, detail="Invalid top-up amount")
    coins = current_user.get("coins", 0) + body.amount
    await users_col.update_one({"_id": current_user["_id"]}, {"$set": {"coins": coins}})
    return {"coins": coins}
