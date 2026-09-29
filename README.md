# Chatly — Full Stack Real-Time Chat App

Built with **FastAPI** + **React** + **WebSockets** + **PostgreSQL** + **Redis**

## Features
- Real-time messaging via WebSockets
- Public rooms + Private rooms + Direct Messages (DMs)
- File & image sharing (drag and drop or attach)
- Reply to messages
- Delete messages
- Online presence indicators (green dot)
- Typing indicators
- Push notifications (in-app)
- Unread message counts
- JWT authentication
- User search & profiles

## Tech Stack
| Layer | Tech |
|-------|------|
| Backend | FastAPI, Python 3.11 |
| Real-time | WebSockets (native FastAPI) |
| Database | PostgreSQL 16 + SQLAlchemy |
| Cache/Presence | Redis 7 |
| Auth | JWT (python-jose) + bcrypt |
| Frontend | React 18 + Vite |
| Routing | React Router v6 |
| HTTP client | Axios |
| File uploads | FastAPI UploadFile + aiofiles |
| Deploy | Docker + Docker Compose + Nginx |

## Quick Start (Docker)

```bash
git clone <your-repo>
cd chatly
docker compose up --build
```

Open http://localhost:3000

## Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your local DB/Redis URLs
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 — API proxied to localhost:8000 automatically.

## API Docs
Visit http://localhost:8000/docs for the interactive Swagger UI.

## Project Structure
```
chatly/
├── backend/
│   ├── app/
│   │   ├── core/          # Config, DB, security, Redis, WebSocket manager
│   │   ├── models/        # SQLAlchemy models (User, Room, Message, Notification)
│   │   ├── routers/       # FastAPI routes (auth, rooms, messages, users, ws)
│   │   └── schemas/       # Pydantic schemas
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/         # ChatPage, AuthPage
│   │   ├── hooks/         # useWebSocket
│   │   ├── store/         # AuthContext
│   │   └── utils/         # api.js (axios client)
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml
```
