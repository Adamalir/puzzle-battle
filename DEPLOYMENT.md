# Deployment Guide — Puzzle Battle

Backend → **Railway** (free tier)  
Frontend → **Vercel** (free tier)

---

## Overview

```
Browser → Vercel (React/Vite static site)
              ↕ REST + WebSocket
          Railway (Express + Socket.io + SQLite)
```

All environment variables are separated: Railway holds backend secrets; Vercel holds the public frontend config.

---

## Prerequisites

- Code committed and pushed to a **GitHub** repository
- A free [GitHub](https://github.com) account
- Node.js ≥ 18 installed locally (for local testing only)

---

## Step 1 — Push your code to GitHub

If you haven't already:

```bash
cd /path/to/filtyr-app   # repo root
git add -A
git commit -m "chore: prepare for deployment"
git remote add origin https://github.com/YOUR_USERNAME/puzzle-battle.git
git push -u origin main
```

> **Important:** make sure `server/.env` and `client/.env` are in `.gitignore` so secrets are never committed.

---

## Step 2 — Deploy the backend to Railway

### 2a. Create a Railway account

1. Go to [railway.app](https://railway.app) and click **Login** → sign in with GitHub.
2. Authorise the Railway GitHub app when prompted.

### 2b. Create a new project

1. On the Railway dashboard click **New Project**.
2. Choose **Deploy from GitHub repo**.
3. Select your `puzzle-battle` repository.
4. Railway will create a new service. **Do not deploy yet** — configure it first.

### 2c. Set the Root Directory

In the service settings (click the service → **Settings** tab):

| Setting | Value |
|---|---|
| **Root Directory** | `server` |

Railway will now treat `server/` as the project root, pick up `railway.toml`, and run the build from there.

### 2d. Add environment variables

Go to the service → **Variables** tab and add each variable:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `JWT_SECRET` | *(generate below)* | **Required** — keep it secret |
| `DATABASE_URL` | `file:./prod.db` | SQLite file on Railway disk |
| `CLIENT_URL` | *(fill in after Vercel deploy)* | Your Vercel frontend URL |

**Generate a secure JWT_SECRET** (run this locally):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output and paste it as the value of `JWT_SECRET`.

> **Note:** Railway sets `PORT` automatically — do **not** add a `PORT` variable.

### 2e. Deploy

Click **Deploy** (or push a new commit). Railway will:
1. Run `npm ci && npx prisma generate && npm run build`
2. Start with `npx prisma db push --accept-data-loss && node dist/index.js`

Watch the build logs until you see:
```
Puzzle Battle server running on port ...
```

### 2f. Get your Railway URL

In the service → **Settings** tab → **Networking** section, click **Generate Domain**.  
Your backend URL will look like: `https://puzzle-battle-server.up.railway.app`

**Save this URL — you need it for Step 3.**

### 2g. (Optional) Persistent database with PostgreSQL

By default SQLite data resets on each new deploy. To persist user accounts and game history:

1. In your Railway project, click **New Service** → **Database** → **PostgreSQL**.
2. Railway auto-sets a `DATABASE_URL` env var on all services in the project with the PostgreSQL connection string.
3. Update the `server/prisma/schema.prisma` provider line:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Commit and redeploy. Railway runs `prisma db push` at start which creates the tables.

---

## Step 3 — Deploy the frontend to Vercel

### 3a. Create a Vercel account

1. Go to [vercel.com](https://vercel.com) and click **Sign Up** → continue with GitHub.

### 3b. Import your project

1. On the Vercel dashboard click **Add New…** → **Project**.
2. Find your `puzzle-battle` repository and click **Import**.

### 3c. Configure the project

In the project configuration screen:

| Setting | Value |
|---|---|
| **Framework Preset** | Vite |
| **Root Directory** | `client` |
| **Build Command** | `npm run build` *(auto-detected)* |
| **Output Directory** | `dist` *(auto-detected)* |

### 3d. Add environment variables

Click **Environment Variables** and add:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://your-service.up.railway.app` (Railway URL from Step 2f) |
| `VITE_SERVER_URL` | `https://your-service.up.railway.app` (same Railway URL) |

### 3e. Deploy

Click **Deploy**. Vercel will run `npm run build` and publish the `dist/` folder to its CDN.

When finished you'll get a URL like: `https://puzzle-battle.vercel.app`

**Save this URL — you need it for Step 4.**

---

## Step 4 — Wire the two services together

### Update Railway's CORS origin

1. Go back to Railway → your service → **Variables**.
2. Set (or update):

| Variable | Value |
|---|---|
| `CLIENT_URL` | `https://puzzle-battle.vercel.app` (your Vercel URL) |

3. Railway will automatically redeploy with the new variable.

---

## Step 5 — Verify end-to-end

1. Open `https://puzzle-battle.vercel.app` in your browser.
2. Register an account (or play as guest).
3. Create a room, share the link with a friend (or open it in a second browser window).
4. Start a game and confirm real-time updates appear on both sides.

**Check if WebSockets are working:**  
Open DevTools → Network → WS tab. You should see a persistent WebSocket connection to `wss://your-service.up.railway.app`.

**Common issues:**

| Symptom | Fix |
|---|---|
| Login returns 401/network error | Check `VITE_API_URL` is set correctly on Vercel |
| "Reconnecting…" banner on frontend | Check `CLIENT_URL` on Railway matches the exact Vercel domain |
| Rooms don't update in real time | Verify `VITE_SERVER_URL` points to Railway; check Railway logs for CORS errors |
| Data resets after each deploy | Add a Railway PostgreSQL service (Step 2g) |

---

## Redeployment

Both platforms auto-deploy when you push to `main`.

```bash
# Make your changes locally, then:
git add -A
git commit -m "feat: my new change"
git push origin main
# Railway and Vercel both pick up the push and redeploy automatically
```

To **trigger a manual redeploy** without a code change:
- **Railway**: service → **Deployments** → **Redeploy**
- **Vercel**: project → **Deployments** → **…** menu → **Redeploy**

To **roll back** to a previous version:
- Both platforms show a deployment history — click any previous build and choose **Promote to Production**.

---

## Local development (unchanged)

```bash
# Terminal 1
cd server && npm run dev        # http://localhost:3001

# Terminal 2
cd client && npm run dev        # http://localhost:5173
```

Both `server/.env` and `client/.env` are already configured for local dev.  
No environment variables need to change for local work.

---

## Summary of environment variables

### Railway (backend)

| Variable | Example value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | `4a7b3c...` (64 hex chars) |
| `DATABASE_URL` | `file:./prod.db` |
| `CLIENT_URL` | `https://puzzle-battle.vercel.app` |

### Vercel (frontend)

| Variable | Example value |
|---|---|
| `VITE_API_URL` | `https://puzzle-battle-server.up.railway.app` |
| `VITE_SERVER_URL` | `https://puzzle-battle-server.up.railway.app` |
