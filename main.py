import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from bcrypt import hashpw, gensalt, checkpw
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
from bson import ObjectId


# =========================================================
# CONFIG
# =========================================================

MONGODB_URI = os.getenv("MONGODB_URI")
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret")

if not MONGODB_URI:
    print("WARNING: MONGODB_URI environment variable is not set.")


# =========================================================
# DATABASE
# =========================================================

client = MongoClient(MONGODB_URI) if MONGODB_URI else None
db = client["palm_messenger"] if client else None

users_collection = db["users"] if db is not None else None
messages_collection = db["messages"] if db is not None else None
avatars_collection = db["avatars"] if db is not None else None


# =========================================================
# FASTAPI
# =========================================================

app = FastAPI(title="Palm Messenger")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")


# =========================================================
# WEBSOCKET CONNECTION MANAGER
# =========================================================

class ConnectionManager:
    def __init__(self):
        self.connections = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.connections[username] = websocket

    def disconnect(self, username: str):
        self.connections.pop(username, None)

    async def send_to_all(self, data: dict):
        disconnected = []

        for username, websocket in self.connections.items():
            try:
                await websocket.send_json(data)
            except Exception:
                disconnected.append(username)

        for username in disconnected:
            self.disconnect(username)


manager = ConnectionManager()


# =========================================================
# MODELS
# =========================================================

class RegisterRequest(BaseModel):
    username: str
    display_name: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class MessageRequest(BaseModel):
    text: str


# =========================================================
# JWT
# =========================================================

def create_token(username: str):
    payload = {
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }

    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str):
    try:
        return jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"]
        )
    except jwt.InvalidTokenError:
        return None


# =========================================================
# PASSWORDS
# =========================================================

def hash_password(password: str):
    return hashpw(
        password.encode("utf-8"),
        gensalt()
    ).decode("utf-8")


def verify_password(password: str, hashed_password: str):
    return checkpw(
        password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )


# =========================================================
# HOME PAGE
# =========================================================

@app.get("/", response_class=HTMLResponse)
async def home():
    with open("templates/index.html", "r", encoding="utf-8") as file:
        return file.read()


# =========================================================
# REGISTER
# =========================================================

@app.post("/api/register")
async def register(data: RegisterRequest):

    username = data.username.strip().lower()
    display_name = data.display_name.strip()

    if len(username) < 3:
        raise HTTPException(
            status_code=400,
            detail="Username must contain at least 3 characters."
        )

    if len(data.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 6 characters."
        )

    existing_user = users_collection.find_one({
        "username": username
    })

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already exists."
        )

    user = {
        "username": username,
        "display_name": display_name or username,
        "password_hash": hash_password(data.password),
        "avatar_id": None,
        "bio": "",
        "created_at": datetime.now(timezone.utc)
    }

    result = users_collection.insert_one(user)

    token = create_token(username)

    return {
        "success": True,
        "token": token,
        "user": {
            "id": str(result.inserted_id),
            "username": username,
            "display_name": display_name or username,
            "avatar": None,
            "bio": ""
        }
    }


# =========================================================
# LOGIN
# =========================================================

@app.post("/api/login")
async def login(data: LoginRequest):

    username = data.username.strip().lower()

    user = users_collection.find_one({
        "username": username
    })

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password."
        )

    if not verify_password(
        data.password,
        user["password_hash"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password."
        )

    token = create_token(username)

    return {
        "success": True,
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "username": user["username"],
            "display_name": user["display_name"],
            "avatar": (
                f"/api/avatar/{user['username']}"
                if user.get("avatar_id")
                else None
            ),
            "bio": user.get("bio", "")
        }
    }


# =========================================================
# CURRENT USER
# =========================================================

@app.get("/api/me")
async def get_me(token: Optional[str] = None):

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required."
        )

    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token."
        )

    user = users_collection.find_one({
        "username": payload["username"]
    })

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "display_name": user["display_name"],
        "avatar": (
            f"/api/avatar/{user['username']}"
            if user.get("avatar_id")
            else None
        ),
        "bio": user.get("bio", "")
    }


# =========================================================
# PROFILE
# =========================================================

@app.get("/api/profile/{username}")
async def get_profile(username: str):

    user = users_collection.find_one({
        "username": username.lower()
    })

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    return {
        "username": user["username"],
        "display_name": user["display_name"],
        "bio": user.get("bio", ""),
        "avatar": (
            f"/api/avatar/{user['username']}"
            if user.get("avatar_id")
            else None
        ),
        "created_at": user.get("created_at")
    }


# =========================================================
# AVATAR UPLOAD
# =========================================================

@app.post("/api/avatar")
async def upload_avatar(
    username: str,
    file: UploadFile = File(...)
):

    if not file.content_type:
        raise HTTPException(
            status_code=400,
            detail="Invalid file."
        )

    allowed_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG, WEBP and GIF images are allowed."
        )

    data = await file.read()

    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Avatar is too large. Maximum size is 5 MB."
        )

    result = avatars_collection.insert_one({
        "username": username.lower(),
        "content_type": file.content_type,
        "data": data,
        "created_at": datetime.now(timezone.utc)
    })

    users_collection.update_one(
        {"username": username.lower()},
        {"$set": {"avatar_id": result.inserted_id}}
    )

    return {
        "success": True,
        "avatar": f"/api/avatar/{username.lower()}"
    }


# =========================================================
# AVATAR
# =========================================================

@app.get("/api/avatar/{username}")
async def get_avatar(username: str):

    user = users_collection.find_one({
        "username": username.lower()
    })

    if not user or not user.get("avatar_id"):
        raise HTTPException(
            status_code=404,
            detail="Avatar not found."
        )

    avatar = avatars_collection.find_one({
        "_id": user["avatar_id"]
    })

    if not avatar:
        raise HTTPException(
            status_code=404,
            detail="Avatar not found."
        )

    return Response(
        content=avatar["data"],
        media_type=avatar["content_type"]
    )


# =========================================================
# MESSAGE HISTORY
# =========================================================

@app.get("/api/messages")
async def get_messages():

    messages = list(
        messages_collection
        .find({})
        .sort("created_at", 1)
        .limit(200)
    )

    result = []

    for message in messages:
        result.append({
            "id": str(message["_id"]),
            "username": message["username"],
            "display_name": message["display_name"],
            "text": message["text"],
            "edited": message.get("edited", False),
            "created_at": message["created_at"].isoformat()
        })

    return result


# =========================================================
# WEBSOCKET CHAT
# =========================================================

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str
):

    payload = decode_token(token)

    if not payload:
        await websocket.close(code=1008)
        return

    username = payload["username"]

    user = users_collection.find_one({
        "username": username
    })

    if not user:
        await websocket.close(code=1008)
        return

    await manager.connect(
        websocket,
        username
    )

    await manager.send_to_all({
        "type": "online",
        "username": username
    })

    try:

        while True:

            data = await websocket.receive_json()

            event_type = data.get("type")

            # -----------------------------------------
            # NEW MESSAGE
            # -----------------------------------------

            if event_type == "message":

                text = data.get("text", "").strip()

                if not text:
                    continue

                if len(text) > 5000:
                    continue

                message = {
                    "username": username,
                    "display_name": user["display_name"],
                    "text": text,
                    "edited": False,
                    "created_at": datetime.now(timezone.utc)
                }

                result = messages_collection.insert_one(message)

                await manager.send_to_all({
                    "type": "message",
                    "id": str(result.inserted_id),
                    "username": username,
                    "display_name": user["display_name"],
                    "text": text,
                    "edited": False,
                    "created_at": message["created_at"].isoformat()
                })

            # -----------------------------------------
            # TYPING
            # -----------------------------------------

            elif event_type == "typing":

                await manager.send_to_all({
                    "type": "typing",
                    "username": username,
                    "is_typing": bool(
                        data.get("is_typing", False)
                    )
                })

            # -----------------------------------------
            # EDIT MESSAGE
            # -----------------------------------------

            elif event_type == "edit":

                message_id = data.get("id")
                new_text = data.get("text", "").strip()

                if not message_id or not new_text:
                    continue

                try:
                    object_id = ObjectId(message_id)
                except Exception:
                    continue

                message = messages_collection.find_one({
                    "_id": object_id
                })

                if not message:
                    continue

                if message["username"] != username:
                    continue

                messages_collection.update_one(
                    {"_id": object_id},
                    {
                        "$set": {
                            "text": new_text,
                            "edited": True,
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )

                await manager.send_to_all({
                    "type": "edit",
                    "id": message_id,
                    "text": new_text
                })

            # -----------------------------------------
            # DELETE MESSAGE
            # -----------------------------------------

            elif event_type == "delete":

                message_id = data.get("id")

                if not message_id:
                    continue

                try:
                    object_id = ObjectId(message_id)
                except Exception:
                    continue

                message = messages_collection.find_one({
                    "_id": object_id
                })

                if not message:
                    continue

                if message["username"] != username:
                    continue

                messages_collection.delete_one({
                    "_id": object_id
                })

                await manager.send_to_all({
                    "type": "delete",
                    "id": message_id
                })

    except WebSocketDisconnect:

        manager.disconnect(username)

        await manager.send_to_all({
            "type": "offline",
            "username": username
        })


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
async def health():

    try:
        if client:
            client.admin.command("ping")

        return {
            "status": "ok",
            "database": "connected"
        }

    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "database": "disconnected"
            }
        )
