# Penalty Shootout 2026

Browser penalty shootout with solo, online multiplayer (room codes), and World Cup mode.

## Getting a link to share (free)

**No one can hand you a working game URL until the app is deployed** on a host (or you use a tunnel while your computer stays on). This project does not include a pre-made public URL.

**Fastest free option — Render (HTTPS, family-friendly hostname you choose):**

1. Push this repository (including `Arjun Experiments/penalty-shootout/`) to **GitHub**.
2. Sign up at [render.com](https://render.com) (free tier).
3. **New → Blueprint**, connect the repo, confirm it picks up **`render.yaml` at the repo root** (it sets `rootDir` to this folder).
4. When the deploy finishes, Render gives you a URL like `https://penalty-shootout-2026.onrender.com` — **that** is what you share. Everyone uses the **same** link; one person taps **Create Room**, the other **Join** with the four-letter code.

Rename the service in the Render dashboard if you want a different subdomain.  
**Note:** Free web services may **sleep** when idle; the first visit after a while can take ~30–60 seconds to wake up.

## Safety (kids & adults)

This game is a **small hobby server**: penalty kicks in the browser, **no user accounts**, **no chat**, **no ads** in the code, and **no personal data** collected by the app. Multiplayer only exchanges **room codes** and **in-game coordinates** with your own deployed server.

- **Supervision:** Anyone with the link can create or join rooms; share the URL only with people you trust (classroom, family group, friends).
- **HTTPS:** Render serves your site over **HTTPS**, which encrypts traffic in transit.
- **Flags:** World Cup flags load from **flagcdn.com** (images only). If you need zero third-party requests, use Solo mode or we could switch to local flag assets later.
- **Hosting:** You control the Render (or other) account; you can delete the service anytime.

## Run locally

From the **penalty-shootout** directory (this folder):

```bash
cd backend
python3 server.py
```

If you cloned the whole **Arjun experiments** repo, use:

```bash
cd "Arjun Experiments/penalty-shootout/backend"
python3 server.py
```

Open the URL printed in the terminal (for example `http://127.0.0.1:8080/`). Solo and World Cup work offline; multiplayer uses the `/api` routes on the same host.

## Deploy without Blueprint (manual)

1. Push this repo to GitHub.
2. [Render](https://render.com) → **New → Web Service** → connect repo → **Docker**.
3. Set **Root Directory** to `Arjun Experiments/penalty-shootout`.
4. Leave start command empty; `Dockerfile` runs `python server.py`.

### Multiplayer reminder

Both players must open the **same** `https://…` origin so `/api` hits one backend.
