# Puzzle Battle ⚡

Real-time multiplayer logic puzzle racing. Race friends in **Wordle**, **Star Battle**, and **Connections**.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| Backend | Node.js + Express + Socket.io |
| Database | SQLite (dev) via Prisma ORM |
| Auth | JWT + bcrypt |
| Real-time | Socket.io WebSockets |

## Project Structure

```
puzzle-battle/
├── client/          # Vite + React frontend
│   └── src/
│       ├── components/
│       │   ├── puzzles/       # Wordle, StarBattle, Connections
│       │   ├── multiplayer/   # Lobby, Sidebar, Results
│       │   └── ui/
│       ├── context/           # AuthContext, SocketContext
│       ├── pages/
│       └── types/
└── server/          # Express + Socket.io backend
    └── src/
        ├── services/
        │   └── puzzleService/ # Puzzle generation + validation
        ├── socket/handlers/   # Room + game Socket.io events
        ├── routes/            # REST API (auth, profile)
        └── middleware/
```

## Setup

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### 1. Server

```bash
cd server
cp .env.example .env
# Edit .env — set JWT_SECRET to a long random string
npm install
npm run db:push      # Create SQLite database
npm run dev          # Starts on :3001
```

### 2. Client

```bash
cd client
npm install
npm run dev          # Starts on :5173
```

Open [http://localhost:5173](http://localhost:5173).

## Features

### Game Modes
- **Solo** — play any puzzle alone
- **Multiplayer race** — 2–8 players, real-time progress sidebar
- **Spectator** — watch live without interacting

### Puzzles
| Puzzle | Description |
|---|---|
| Wordle | Guess the 5-letter word in 6 tries |
| Star Battle | Place stars: 1–2 per row/column/region, no adjacency |
| Connections | Group 16 words into 4 hidden categories |

### Multiplayer
- Create a room → share the 6-char code or link
- 3-second countdown, then all players start simultaneously
- Live progress sidebar updates in real time
- First to finish wins; results screen with rankings

### Auth
- Register with username + password
- Guest mode (no account needed)
- Profile page with win/loss stats per puzzle type

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite path |
| `JWT_SECRET` | — | **Required**: long random secret |
| `PORT` | `3001` | Server port |
| `CLIENT_URL` | `http://localhost:5173` | CORS origin |

## Puzzle Generation

All puzzles are **seed-based** — every player in a race receives the identical puzzle. Seeds are derived from the room code + start timestamp.

- **Wordle**: Curated word lists by difficulty; seeded index selection
- **Star Battle**: BFS region generation + backtracking solver
- **Connections**: Bank of hand-crafted category sets; seeded selection + word shuffle
