# Penalty Shootout 2026

Browser penalty shootout game with **Solo**, **online Multiplayer**, and **World Cup** tournament modes. Built with HTML/CSS/JavaScript on the frontend and a small Python server for multiplayer and static file hosting.

**Live demo (Render):** [https://penalty-shootout-2026.onrender.com/](https://penalty-shootout-2026.onrender.com/)

---

## Game modes

### Solo Mode
- Play alternating **kicker** and **goalkeeper** against the AI.
- Choose difficulty before each game: **Easy**, **Medium**, or **Hard**.
  - **Easy** — AI keeper dives randomly; AI kicker misses often.
  - **Medium** — balanced challenge (default).
  - **Hard** — AI reads your shot and aims corners accurately.

### Multiplayer
- One player **Create Room**, the other **Join** with the 4-letter code.
- Both players must use the **same URL** (local or deployed).
- Roles swap each round (kicker ↔ goalkeeper).
- Standard penalty shootout rules with sudden death if tied after 5 kicks each.

### World Cup Mode
- Pick your team from 12 groups, then choose **Easy / Medium / Hard** for the whole tournament.
- **Group stage** — 3 matches; need **2 wins** to reach the knockouts.
- **Knockout rounds** — Round of 32 → R16 → Quarter Final → Semi Final → Final.
- After the group stage, the screen shows **only the upcoming knockout match** (your team vs next opponent with flag badges), not the full bracket through the final.

---

## Gameplay features

- Click the goal to **aim** (kicker) or **dive** (goalkeeper).
- Outcomes: **SCORE!**, **SAVE!**, **MISS!**, **POST!**, **CROSSBAR!**, **OFF CROSSBAR AND IN!**
- **Realistic goalkeeper dive** — crouch, launch, body rotation toward the ball.
- **Save hitboxes** match the keeper sprite size (ellipse + ball radius), not a thin line.
- **Transparent goalkeeper sprites** — no white box around the keeper.
- **Sound effects**
  - `cheer1.mp3` — goals (`SCORE!`, `OFF CROSSBAR AND IN!`)
  - `boo1.mp3` — saves, misses, post/crossbar out (not for goals off the crossbar)

---

## Project structure

```
penalty-shootout/
├── backend/
│   └── server.py          # API + serves frontend; room persistence
├── frontend/
│   ├── index.html
│   ├── script.js          # Game logic, AI, animations
│   ├── worldcup.js        # Tournament bracket & teams
│   ├── hitbox.js          # Shared save-detection hitbox
│   ├── audio.js           # Cheer / boo / post sounds
│   ├── style.css
│   ├── *.png, *.mp3       # Stadium, ball, keeper, audio
├── Dockerfile             # For Render / Docker deploy
└── README.md
```

The repo root also has **`render.yaml`** (Blueprint) with `rootDir: "Arjun Experiments/penalty-shootout"`.

---

## Run locally

```bash
cd "Arjun Experiments/penalty-shootout/backend"
python3 server.py
```

Open the URL printed in the terminal (e.g. `http://127.0.0.1:8080/`). If 8080 is busy, the server tries 8765, 9000, then another free port.

- **Solo** and **World Cup** work fully offline.
- **Multiplayer** on the same machine: open two browser tabs at the same local URL.

Press **Ctrl + C** in the terminal to stop the server.

---

## Deploy on Render (free HTTPS link)

1. Push this repo to GitHub.
2. [Render](https://render.com) → **New → Blueprint** → connect repo → apply `render.yaml`.

   **Or manually:** **New → Web Service** → Docker → **Root Directory** `Arjun Experiments/penalty-shootout`.

3. Share the Render URL (e.g. `https://penalty-shootout-2026.onrender.com/`). Everyone uses the **same link** for multiplayer.

**After pushing updates:** Render → your service → **Manual Deploy → Deploy latest commit** (or wait for auto-deploy).

**Free tier notes**
- Service may **sleep** after ~15 minutes idle; first load can take 30–60 seconds.
- Room data is stored in `backend/rooms.json` on the container disk; rooms are cleared if the server restarts or sleeps.

---

## Multiplayer API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/create_room` | POST | Host creates room, gets code |
| `/api/join_room` | POST | Guest joins with `{ "code": "ABCD" }` |
| `/api/room_state` | GET | Poll game state (`?code=…&player=P1`) |
| `/api/action` | POST | Kicker aim or goalkeeper dive |
| `/api/next_turn` | POST | Host advances to next kick |

Room codes are normalised to uppercase. Rooms persist to disk so hosted games stay in sync across polls.

---

## Safety (kids & adults)

- **No accounts**, **no chat**, **no ads** in the app code.
- Multiplayer only sends room codes and in-game coordinates to your server.
- Share the link only with people you trust.
- World Cup **flags** load from [flagcdn.com](https://flagcdn.com) (images only). Solo mode avoids third-party requests except fonts.

---

## Recent changes (changelog)

- Solo & World Cup **difficulty levels** (Easy / Medium / Hard)
- **Multiplayer fix** — rooms saved to disk, threaded server, clearer “room not found” errors
- **HTML fix** — solo mode game screen no longer hidden after picking difficulty
- **Goalkeeper** — transparent PNG, realistic dive animation, ellipse hitboxes for saves
- **World Cup knockouts** — show upcoming match only, not full bracket to the final
- **Sound** — cheer for goals; boo for saves, misses, and woodwork out
