from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import json
import random
import string

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "rsvps.json"
ADMIN_KEY = "ms2026"
PORT = 4173
TICKET_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def load_rsvps():
    if not DATA.exists():
        return []
    try:
        return json.loads(DATA.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def save_rsvps(items):
    DATA.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def make_ticket_id():
    return "MS" + "".join(random.choice(TICKET_CHARS) for _ in range(6))


def ensure_tickets(items):
    changed = False
    for item in items:
        if not item.get("ticketId"):
            item["ticketId"] = make_ticket_id()
            changed = True
        item.setdefault("checkedIn", False)
    if changed:
        save_rsvps(items)
    return items


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def authorized(self, parsed=None):
        key = self.headers.get("X-Admin-Key")
        if not key and parsed:
            key = parse_qs(parsed.query).get("key", [""])[0]
        return key == ADMIN_KEY

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/rsvp":
            try:
                entry = self.read_json()
            except json.JSONDecodeError:
                self.send_json({"ok": False}, 400)
                return
            if not str(entry.get("name", "")).strip():
                self.send_json({"ok": False}, 400)
                return
            entry["ticketId"] = str(entry.get("ticketId") or make_ticket_id())
            entry["status"] = "pending"
            entry["checkedIn"] = False
            items = load_rsvps()
            items.insert(0, entry)
            save_rsvps(items)
            self.send_json({"ok": True, "ticketId": entry["ticketId"], "entry": entry})
            return

        if path == "/api/decide":
            if not self.authorized():
                self.send_json({"ok": False}, 403)
                return
            try:
                payload = self.read_json()
            except json.JSONDecodeError:
                self.send_json({"ok": False}, 400)
                return
            ticket_id = str(payload.get("ticketId", "")).strip().upper()
            status = str(payload.get("status", "")).strip()
            if status not in ("attending", "declined"):
                self.send_json({"ok": False, "message": "حالة غير صالحة"}, 400)
                return
            items = ensure_tickets(load_rsvps())
            match = next((item for item in items if str(item.get("ticketId", "")).upper() == ticket_id), None)
            if not match:
                self.send_json({"ok": False, "message": "هذا الطلب غير موجود"}, 404)
                return
            match["status"] = status
            if status != "attending":
                match["checkedIn"] = False
            save_rsvps(items)
            self.send_json({"ok": True, "entry": match})
            return

        if path == "/api/checkin":
            if not self.authorized():
                self.send_json({"ok": False}, 403)
                return
            try:
                payload = self.read_json()
            except json.JSONDecodeError:
                self.send_json({"ok": False}, 400)
                return
            ticket_id = str(payload.get("ticketId", "")).strip().upper()
            items = ensure_tickets(load_rsvps())
            match = next((item for item in items if str(item.get("ticketId", "")).upper() == ticket_id), None)
            if not match:
                self.send_json({"ok": False, "message": "هذه التذكرة غير موجودة"}, 404)
                return
            if match.get("status") != "attending":
                message = "بانتظار الموافقة" if match.get("status") == "pending" else "رفض الدعوة، لا يُسمح بالدخول"
                self.send_json({"ok": False, "message": f"{match.get('name')}: {message}"}, 409)
                return
            if match.get("checkedIn"):
                self.send_json({"ok": False, "message": f"{match.get('name')}: دخل الصالة مسبقاً"}, 409)
                return
            match["checkedIn"] = True
            save_rsvps(items)
            self.send_json({"ok": True, "entry": match})
            return

        self.send_error(404)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/rsvps":
            if not self.authorized(parsed):
                self.send_json({"ok": False}, 403)
                return
            self.send_json(ensure_tickets(load_rsvps()))
            return
        if parsed.path == "/api/ticket":
            ticket_id = (parse_qs(parsed.query).get("id", [""])[0] or "").strip().upper()
            if not ticket_id:
                self.send_json({"ok": False}, 400)
                return
            items = ensure_tickets(load_rsvps())
            match = next((item for item in items if str(item.get("ticketId", "")).upper() == ticket_id), None)
            if not match:
                self.send_json({"ok": False}, 404)
                return
            self.send_json(match)
            return
        return super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Invitation: http://127.0.0.1:{PORT}/")
    print(f"Guest list: http://127.0.0.1:{PORT}/admin.html")
    print(f"Door scan: http://127.0.0.1:{PORT}/checkin.html")
    server.serve_forever()
