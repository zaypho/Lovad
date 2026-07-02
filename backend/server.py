import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect  # noqa: E402
from jwt import PyJWTError  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from auth_utils import decode_token  # noqa: E402
from db import client, ensure_indexes  # noqa: E402
from routes.ai import router as ai_router  # noqa: E402
from routes.audio import router as audio_router  # noqa: E402
from routes.auth import router as auth_router  # noqa: E402
from routes.chats import router as chats_router  # noqa: E402
from routes.media import router as media_router  # noqa: E402
from routes.moments import router as moments_router  # noqa: E402
from routes.notifications import router as notifications_router  # noqa: E402
from routes.rooms import router as rooms_router  # noqa: E402
from routes.users import router as users_router  # noqa: E402
from ws_manager import manager  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    yield
    client.close()


app = FastAPI(title="LinguaConnect API", lifespan=lifespan)


@app.get("/api/")
async def root():
    return {"message": "LinguaConnect API"}


RELAY_EVENT_TYPES = {
    "call_offer",
    "call_answer",
    "call_ice",
    "call_end",
    "call_decline",
    "rtc_offer",
    "rtc_answer",
    "rtc_ice",
}


@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    import json as _json

    try:
        user_id = decode_token(token)
    except PyJWTError:
        await websocket.close(code=4001)
        return
    await manager.connect(user_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = _json.loads(raw)
            except ValueError:
                continue
            event_type = data.get("type")
            target = data.get("to")
            if event_type in RELAY_EVENT_TYPES and target:
                data["from"] = user_id
                if event_type == "call_offer":
                    from db import users_col

                    caller = await users_col.find_one({"_id": user_id})
                    if caller:
                        from models import user_card

                        data["caller"] = user_card(caller)
                await manager.send_to_user(target, data)
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)


for router in (
    auth_router,
    users_router,
    chats_router,
    moments_router,
    ai_router,
    rooms_router,
    audio_router,
    media_router,
    notifications_router,
):
    app.include_router(router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
