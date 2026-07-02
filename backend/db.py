import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

users_col = db["users"]
conversations_col = db["conversations"]
messages_col = db["messages"]
moments_col = db["moments"]
comments_col = db["comments"]
rooms_col = db["rooms"]
room_messages_col = db["room_messages"]
audio_col = db["audio_files"]
media_col = db["media_files"]
profile_visits_col = db["profile_visits"]
notifications_col = db["notifications"]
follows_col = db["follows"]


async def ensure_indexes():
    await users_col.create_index("email", unique=True)
    await messages_col.create_index([("conversation_id", 1), ("created_at", 1)])
    await conversations_col.create_index("participant_ids")
    await moments_col.create_index([("created_at", -1)])
    await comments_col.create_index([("moment_id", 1), ("created_at", 1)])
    await rooms_col.create_index([("is_live", 1), ("created_at", -1)])
    await room_messages_col.create_index([("room_id", 1), ("created_at", 1)])
    await profile_visits_col.create_index(
        [("visitor_id", 1), ("visited_user_id", 1)], unique=True
    )
    await profile_visits_col.create_index([("visited_user_id", 1), ("visited_at", -1)])
    await notifications_col.create_index([("user_id", 1), ("created_at", -1)])
    await notifications_col.create_index([("user_id", 1), ("read", 1)])
    await follows_col.create_index(
        [("follower_id", 1), ("following_id", 1)], unique=True
    )
    await follows_col.create_index([("following_id", 1)])
