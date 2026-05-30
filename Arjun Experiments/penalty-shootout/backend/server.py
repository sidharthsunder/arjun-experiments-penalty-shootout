import http.server
import socketserver
import json
import os
import random
import string
import threading
import urllib.parse
from datetime import datetime, timedelta

DEFAULT_PORT = 8080
PORT = int(os.environ.get("PORT", str(DEFAULT_PORT)))

# Serve the static game (HTML, JS, CSS, audio) from ../frontend
FRONTEND_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
)

# Persist rooms on disk so Render/restarts don't always lose state mid-session.
# (Free Render still clears disk when the container is replaced after long sleep.)
ROOMS_FILE = os.environ.get(
    "ROOMS_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "rooms.json"),
)

rooms = {}
rooms_lock = threading.Lock()


def normalize_code(code):
    if not code:
        return None
    return str(code).strip().upper()


def _serialize_room(room):
    out = json.loads(json.dumps(room, default=str))
    return out


def load_rooms():
    global rooms
    if not os.path.exists(ROOMS_FILE):
        rooms = {}
        return
    try:
        with open(ROOMS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            rooms = data
        else:
            rooms = {}
    except (json.JSONDecodeError, OSError):
        rooms = {}


def save_rooms():
    os.makedirs(os.path.dirname(ROOMS_FILE) or ".", exist_ok=True)
    tmp_path = ROOMS_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(rooms, f)
    os.replace(tmp_path, ROOMS_FILE)


def get_room(code):
    code = normalize_code(code)
    if not code:
        return None, code
    with rooms_lock:
        room = rooms.get(code)
        if room:
            return room, code
    return None, code


def mutate_room(code, mutator):
    """Run mutator(room) under lock and persist. Returns room or None."""
    code = normalize_code(code)
    if not code:
        return None
    with rooms_lock:
        room = rooms.get(code)
        if not room:
            return None
        mutator(room)
        save_rooms()
        return room


def create_room_entry(code):
    code = normalize_code(code)
    with rooms_lock:
        rooms[code] = {
            "code": code,
            "players": {"P1": {"role": "kicker", "last_seen": datetime.now().isoformat()}},
            "state": "waiting",
            "turn_state": "aiming",
            "kicker_aim": None,
            "goalkeeper_dive": None,
            "score": {"P1": 0, "P2": 0},
            "kicks_taken": {"P1": 0, "P2": 0},
            "sudden_death": False,
            "result_message": "",
            "winner": None,
        }
        save_rooms()
        return rooms[code]


load_rooms()


def generate_code():
    with rooms_lock:
        for _ in range(100):
            code = "".join(random.choices(string.ascii_uppercase, k=4))
            if code not in rooms:
                return code
    raise RuntimeError("Could not allocate room code")


class GameHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == "/api/room_state":
            query = urllib.parse.parse_qs(parsed_path.query)
            code = normalize_code(query.get("code", [None])[0])
            player = query.get("player", [None])[0]
            room, _ = get_room(code)
            if room:
                def touch_player(r):
                    if player in r.get("players", {}):
                        r["players"][player]["last_seen"] = datetime.now().isoformat()

                mutate_room(code, touch_player)
                room, _ = get_room(code)
                self.send_json(_serialize_room(room))
            else:
                self.send_json({"error": "Room not found"}, 404)
        else:
            super().do_GET()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get("Content-Length") or 0)
        post_data = self.rfile.read(content_length) if content_length else b""
        data = json.loads(post_data.decode("utf-8")) if post_data else {}

        if parsed_path.path == "/api/create_room":
            code = generate_code()
            create_room_entry(code)
            self.send_json({"code": code, "player": "P1", "role": "kicker"})

        elif parsed_path.path == "/api/join_room":
            code = normalize_code(data.get("code"))
            room, code = get_room(code)
            if room and len(room.get("players", {})) < 2:
                def join(r):
                    r["players"]["P2"] = {
                        "role": "goalkeeper",
                        "last_seen": datetime.now().isoformat(),
                    }
                    r["state"] = "playing"

                mutate_room(code, join)
                self.send_json({"code": code, "player": "P2", "role": "goalkeeper"})
            else:
                self.send_json({"error": "Room full or not found"}, 400)

        elif parsed_path.path == "/api/action":
            code = normalize_code(data.get("code"))
            player = data.get("player")
            action_type = data.get("type")
            coords = data.get("coords")

            room, code = get_room(code)
            if not room:
                return self.send_json({"error": "Room not found"}, 404)

            role = room["players"][player]["role"]

            if room["state"] != "playing":
                return self.send_json({"error": "Not playing yet"}, 400)

            def apply_action(r):
                if action_type == "aim" and role == "kicker" and r["turn_state"] == "aiming":
                    r["kicker_aim"] = coords
                    r["turn_state"] = "diving"
                elif action_type == "dive" and role == "goalkeeper" and r["turn_state"] == "diving":
                    r["goalkeeper_dive"] = coords
                    r["turn_state"] = "calculating"
                    self.calculate_result(r)

            room = mutate_room(code, apply_action)
            self.send_json(_serialize_room(room))

        elif parsed_path.path == "/api/next_turn":
            code = normalize_code(data.get("code"))
            room, code = get_room(code)
            if room:
                def next_turn(r):
                    if r["state"] == "result":
                        r["turn_state"] = "aiming"
                        r["state"] = "playing"
                        r["kicker_aim"] = None
                        r["goalkeeper_dive"] = None
                        r["result_message"] = ""
                        p1_role = r["players"]["P1"]["role"]
                        r["players"]["P1"]["role"] = (
                            "goalkeeper" if p1_role == "kicker" else "kicker"
                        )
                        r["players"]["P2"]["role"] = (
                            "kicker" if p1_role == "kicker" else "goalkeeper"
                        )

                room = mutate_room(code, next_turn)
                self.send_json(_serialize_room(room))
            else:
                self.send_json({"error": "Room not found"}, 404)
        else:
            self.send_json({"error": "Not found"}, 404)

    def calculate_result(self, room):
        kx, ky = room["kicker_aim"]["x"], room["kicker_aim"]["y"]
        gx, gy = room["goalkeeper_dive"]["x"], room["goalkeeper_dive"]["y"]
        is_miss = room["kicker_aim"].get("isMiss", False)
        miss_type = room["kicker_aim"].get("missType", "MISS!")

        px, py = kx, ky
        x1, y1 = gx, gy - 0.30
        x2, y2 = gx, gy + 0.30

        l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2
        if l2 == 0:
            dist = ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
        else:
            t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
            t = max(0, min(1, t))
            projX = x1 + t * (x2 - x1)
            projY = y1 + t * (y2 - y1)
            dist = ((px - projX) ** 2 + (py - projY) ** 2) ** 0.5

        is_save = dist < 0.15

        if is_miss:
            is_save = True

        kicker_id = "P1" if room["players"]["P1"]["role"] == "kicker" else "P2"

        if is_miss:
            room["result_message"] = miss_type
        elif is_save:
            room["result_message"] = "SAVE!"
        else:
            if 0.075 < ky <= 0.125:
                room["result_message"] = "OFF CROSSBAR AND IN!"
            else:
                room["result_message"] = "SCORE!"
            room["score"][kicker_id] += 1

        room["kicks_taken"][kicker_id] += 1
        room["state"] = "result"

        kp1 = room["kicks_taken"]["P1"]
        kp2 = room["kicks_taken"]["P2"]
        sp1 = room["score"]["P1"]
        sp2 = room["score"]["P2"]

        if kp1 == kp2:
            if kp1 >= 5:
                if sp1 != sp2:
                    room["state"] = "game_over"
                    room["winner"] = "P1" if sp1 > sp2 else "P2"
                else:
                    room["sudden_death"] = True
        else:
            if kp1 <= 5 and kp2 <= 5:
                rem_p1 = 5 - kp1
                rem_p2 = 5 - kp2
                if sp1 > sp2 + rem_p2:
                    room["state"] = "game_over"
                    room["winner"] = "P1"
                elif sp2 > sp1 + rem_p1:
                    room["state"] = "game_over"
                    room["winner"] = "P2"


class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


Handler = GameHandler

if __name__ == "__main__":
    if os.environ.get("PORT"):
        ports_to_try = (PORT,)
    else:
        ports_to_try = (DEFAULT_PORT, 8765, 9000, 0)
    httpd = None
    for port in ports_to_try:
        try:
            httpd = ThreadingHTTPServer(("", port), Handler)
            break
        except OSError:
            if port == 0:
                raise
            continue
    actual_port = httpd.server_address[1]
    print(f"Game UI and API: http://127.0.0.1:{actual_port}/")
    print(f"Rooms file: {ROOMS_FILE}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
