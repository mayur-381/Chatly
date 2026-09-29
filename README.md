# 💬 Chatly — Real-time Team Chat App

A full-stack real-time messaging platform built from scratch — similar to Slack/Discord.

🌐 **Live Demo:** [chatly-frontend-okc5.onrender.com](https://chatly-frontend-okc5.onrender.com)

![Chatly](https://img.shields.io/badge/Status-Live-brightgreen) ![Python](https://img.shields.io/badge/Python-3.11-blue) ![React](https://img.shields.io/badge/React-18-61DAFB) ![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688)

---

## ✨ Features

- 🏢 **Multiple Workspaces** — like Discord servers
- 📢 **Public Channels** — open to all workspace members
- 🔒 **Private Groups** — invite specific members only
- 💬 **Direct Messages** — private 1-on-1 chats
- ⚡ **Real-time Messaging** — via WebSockets
- 👑 **Roles & Permissions** — Owner / Admin / Member
- 😀 **Emoji Reactions** — react to any message
- 🟢 **Online Presence** — see who's online
- 📎 **File & Image Sharing** — attach files to messages
- 📌 **Pin Messages** — admins can pin important messages
- 🔇 **Mute Members** — admins can mute disruptive members
- 🔔 **Browser Notifications** — get notified when away
- 📅 **Date Labels** — Today / Yesterday / date dividers
- 🔗 **Invite Codes** — share a code to join workspace

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Real-time | WebSocket API |
| Backend | FastAPI + Python 3.11 |
| Database | PostgreSQL + SQLAlchemy ORM |
| Cache | Redis 7 |
| Auth | JWT + bcrypt |
| Server | Nginx + Uvicorn |
| Deploy | Docker + Docker Compose |
| Cloud DB | Neon PostgreSQL |
| Hosting | Render |

---

## 🏗️ Architecture

```
React (Nginx) ←→ REST + WebSocket ←→ FastAPI ←→ PostgreSQL + Redis
```

---

## 🚀 Run Locally

### Prerequisites
- Docker Desktop
- Git

### Steps

```bash
# Clone the repo
git clone https://github.com/mayur-381/Chatly.git
cd Chatly

# Copy env file
copy backend\.env.example backend\.env

# Start everything
docker compose up --build
```

Open `http://localhost:3000` and sign up!

---

## 📁 Project Structure

```
chatly/
├── backend/          # FastAPI Python backend
│   ├── app/
│   │   ├── routers/  # API endpoints
│   │   ├── models/   # Database models
│   │   ├── schemas/  # Pydantic schemas
│   │   └── core/     # Config, DB, Auth, WebSocket
│   └── requirements.txt
├── frontend/         # React frontend
│   └── src/
│       ├── pages/    # ChatPage, AuthPage
│       ├── hooks/    # useWebSocket
│       ├── store/    # AuthContext
│       └── utils/    # API client
└── docker-compose.yml
```

---

## 👤 Author

**Mayur Salunkhe**
- GitHub: [@mayur-381](https://github.com/mayur-381)

---

## 📄 License

MIT License