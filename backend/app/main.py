from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .core.config import settings
from .core.database import engine, Base
from .models import user, room, message, reaction

from .routers import auth, rooms, messages, users, websocket, workspaces, groups, reactions

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Chatly API", version="1.0.0")

origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(rooms.router)
app.include_router(messages.router)
app.include_router(users.router)
app.include_router(websocket.router)
app.include_router(groups.router)
app.include_router(reactions.router)

@app.get("/")
def root():
    return {"message": "Chatly API is running", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "ok"}