import http.server
import socketserver
import json
import os
import random
import string
import urllib.parse
from datetime import datetime, timedelta

DEFAULT_PORT = 8080
PORT = int(os.environ.get("PORT", str(DEFAULT_PORT)))

# Serve the static game (HTML, JS, CSS, audio) from ../frontend
FRONTEND_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
)

rooms = {}
# Room structure:
# {
#   "code": "ABCD",
#   "players": {"P1": {"role": "kicker", "last_seen": time}, "P2": {"role": "goalkeeper", "last_seen": time}},
#   "state": "waiting", # waiting, playing, result, game_over
#   "turn_state": "aiming", # aiming, diving, calculating
#   "kicker_aim": None, # {x, y}
#   "goalkeeper_dive": None, # {x, y}
#   "score": {"kicker": 0, "goalkeeper": 0},
#   "shots_taken": 0,
#   "result_message": ""
# }

def generate_code():
    return ''.join(random.choices(string.ascii_uppercase, k=4))

class GameHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/api/room_state':
            query = urllib.parse.parse_qs(parsed_path.query)
            code = query.get('code', [None])[0]
            player = query.get('player', [None])[0]
            if code in rooms:
                # Update last seen
                if player in rooms[code]['players']:
                    rooms[code]['players'][player]['last_seen'] = datetime.now()
                self.send_json(rooms[code])
            else:
                self.send_json({"error": "Room not found"}, 404)
        else:
            super().do_GET()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8')) if post_data else {}

        if parsed_path.path == '/api/create_room':
            code = generate_code()
            rooms[code] = {
                "code": code,
                "players": {"P1": {"role": "kicker", "last_seen": datetime.now()}},
                "state": "waiting",
                "turn_state": "aiming",
                "kicker_aim": None,
                "goalkeeper_dive": None,
                "score": {"P1": 0, "P2": 0},
                "kicks_taken": {"P1": 0, "P2": 0},
                "sudden_death": False,
                "result_message": "",
                "winner": None
            }
            self.send_json({"code": code, "player": "P1", "role": "kicker"})

        elif parsed_path.path == '/api/join_room':
            code = data.get('code', '').upper()
            if code in rooms and len(rooms[code]['players']) < 2:
                rooms[code]['players']['P2'] = {"role": "goalkeeper", "last_seen": datetime.now()}
                rooms[code]['state'] = "playing"
                self.send_json({"code": code, "player": "P2", "role": "goalkeeper"})
            else:
                self.send_json({"error": "Room full or not found"}, 400)

        elif parsed_path.path == '/api/action':
            code = data.get('code')
            player = data.get('player')
            action_type = data.get('type')
            coords = data.get('coords') # {x, y}

            if code not in rooms:
                return self.send_json({"error": "Room not found"}, 404)
            
            room = rooms[code]
            role = room['players'][player]['role']

            if room['state'] != 'playing':
                return self.send_json({"error": "Not playing yet"}, 400)

            if action_type == 'aim' and role == 'kicker' and room['turn_state'] == 'aiming':
                room['kicker_aim'] = coords
                room['turn_state'] = 'diving'
            elif action_type == 'dive' and role == 'goalkeeper' and room['turn_state'] == 'diving':
                room['goalkeeper_dive'] = coords
                room['turn_state'] = 'calculating'
                self.calculate_result(room)
            
            self.send_json(room)
        
        elif parsed_path.path == '/api/next_turn':
            code = data.get('code')
            if code in rooms:
                room = rooms[code]
                if room['state'] == 'result':
                    room['turn_state'] = 'aiming'
                    room['state'] = 'playing'
                    room['kicker_aim'] = None
                    room['goalkeeper_dive'] = None
                    room['result_message'] = ""
                    # Switch roles
                    p1_role = room['players']['P1']['role']
                    room['players']['P1']['role'] = 'goalkeeper' if p1_role == 'kicker' else 'kicker'
                    room['players']['P2']['role'] = 'kicker' if p1_role == 'kicker' else 'goalkeeper'
                self.send_json(room)
            else:
                self.send_json({"error": "Room not found"}, 404)
        else:
            self.send_json({"error": "Not found"}, 404)

    def calculate_result(self, room):
        # Coordinates are 0 to 1 relative to goal width/height
        kx, ky = room['kicker_aim']['x'], room['kicker_aim']['y']
        gx, gy = room['goalkeeper_dive']['x'], room['goalkeeper_dive']['y']
        is_miss = room['kicker_aim'].get('isMiss', False)
        miss_type = room['kicker_aim'].get('missType', 'MISS!')

        # The goalie's center is at diveCoords. Their body extends roughly 0.30 up and down.
        # We create a vertical line segment representing the goalie's torso.
        px, py = kx, ky
        x1, y1 = gx, gy - 0.30
        x2, y2 = gx, gy + 0.30

        l2 = (x1 - x2)**2 + (y1 - y2)**2
        if l2 == 0:
            dist = ((px - x1)**2 + (py - y1)**2)**0.5
        else:
            t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
            t = max(0, min(1, t))
            projX = x1 + t * (x2 - x1)
            projY = y1 + t * (y2 - y1)
            dist = ((px - projX)**2 + (py - projY)**2)**0.5
            
        is_save = dist < 0.15 # If ball is within 15% (120px) of the goalie's body, it's a save!
        
        if is_miss:
             is_save = True # Missed
             
        kicker_id = 'P1' if room['players']['P1']['role'] == 'kicker' else 'P2'
        goalie_id = 'P2' if kicker_id == 'P1' else 'P1'

        if is_miss:
            room['result_message'] = miss_type
        elif is_save:
            room['result_message'] = "SAVE!"
            # Goalie doesn't get a point for a save
        else:
            if 0.075 < ky <= 0.125:
                room['result_message'] = "OFF CROSSBAR AND IN!"
            else:
                room['result_message'] = "SCORE!"
            room['score'][kicker_id] += 1

        room['kicks_taken'][kicker_id] += 1
        room['state'] = 'result'

        # Check win condition
        kp1 = room['kicks_taken']['P1']
        kp2 = room['kicks_taken']['P2']
        sp1 = room['score']['P1']
        sp2 = room['score']['P2']

        # After both have kicked the same amount
        if kp1 == kp2:
            if kp1 >= 5:
                if sp1 != sp2:
                    room['state'] = 'game_over'
                    room['winner'] = 'P1' if sp1 > sp2 else 'P2'
                else:
                    room['sudden_death'] = True
        else:
            # Check early win if someone cannot catch up (optional, but realistic)
            # Let's keep it simple: if kp1 >= 5 and kp2 >= 5, check after each round.
            # But during the first 5 kicks, what if P1 is up by 3 and P2 has 1 kick left?
            # Remaining kicks for P1: max(5 - kp1, 0)
            # Remaining kicks for P2: max(5 - kp2, 0)
            if kp1 <= 5 and kp2 <= 5:
                rem_p1 = 5 - kp1
                rem_p2 = 5 - kp2
                if sp1 > sp2 + rem_p2:
                    room['state'] = 'game_over'
                    room['winner'] = 'P1'
                elif sp2 > sp1 + rem_p1:
                    room['state'] = 'game_over'
                    room['winner'] = 'P2'


Handler = GameHandler

if __name__ == "__main__":
    # Cloud hosts (Render, Railway, etc.) set PORT — bind only to that.
    if os.environ.get("PORT"):
        ports_to_try = (PORT,)
    else:
        ports_to_try = (DEFAULT_PORT, 8765, 9000, 0)
    httpd = None
    for port in ports_to_try:
        try:
            httpd = socketserver.TCPServer(("", port), Handler)
            break
        except OSError:
            if port == 0:
                raise
            continue
    actual_port = httpd.server_address[1]
    print(f"Game UI and API: http://127.0.0.1:{actual_port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
