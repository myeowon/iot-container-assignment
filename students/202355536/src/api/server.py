"""StudyPals API 서버 — Python 표준 라이브러리만 사용 (pip 의존성 없음).

nginx(web)가 /api/* 요청을 이 서버(8080)로 프록시한다.
라우팅과 HTTP 처리만 담당하고, 기능은 모듈별로 나뉘어 있다.
  auth.py     가입·로그인·세션        planner.py  과목·할 일·데일리 플래너
  rooms.py    공부방·하트비트         study.py    공부시간 누적
"""
import json
import os
import re
import signal
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlparse

import auth
import planner
import rooms
import schedule
from common import ApiError, db
from redis_client import RedisError


def healthz(req):
    """readiness: Redis까지 연결돼야 트래픽을 받는다."""
    return {"ok": True, "redis": db.execute("PING")}


def livez(req):
    """liveness: 프로세스만 살아 있으면 OK (Redis 장애로 api가 재시작되지 않도록 분리)."""
    return {"ok": True}


# (메서드, 경로, 핸들러, 로그인 필요 여부)
ROUTES = [
    ("GET", r"/api/healthz", healthz, False),
    ("GET", r"/api/livez", livez, False),
    ("POST", r"/api/auth/signup", auth.signup, False),
    ("POST", r"/api/auth/login", auth.login, False),
    ("POST", r"/api/auth/logout", auth.logout, False),
    ("GET", r"/api/me", auth.me, True),
    ("PATCH", r"/api/me", auth.update_me, True),
    ("GET", r"/api/planner", planner.get_planner, True),
    ("GET", r"/api/planner/history", planner.history, True),
    ("POST", r"/api/subjects", planner.create_subject, True),
    ("PATCH", r"/api/subjects/(\w+)", planner.update_subject, True),
    ("DELETE", r"/api/subjects/(\w+)", planner.delete_subject, True),
    ("POST", r"/api/tasks", planner.create_task, True),
    ("PATCH", r"/api/tasks/(\w+)", planner.update_task, True),
    ("DELETE", r"/api/tasks/(\w+)", planner.delete_task, True),
    ("PUT", r"/api/daily", planner.put_daily, True),
    ("PUT", r"/api/timetable", schedule.put_timetable, True),
    ("PUT", r"/api/dday", schedule.put_dday, True),
    ("GET", r"/api/rooms", rooms.list_rooms, True),
    ("POST", r"/api/rooms", rooms.create_room, True),
    ("POST", r"/api/rooms/join-code", rooms.join_by_code, True),
    ("POST", r"/api/rooms/(\w+)/heartbeat", rooms.heartbeat, True),
    ("POST", r"/api/rooms/(\w+)/leave", rooms.leave, True),
]
ROUTES = [(m, re.compile(p), fn, needs_login) for m, p, fn, needs_login in ROUTES]
PROBE_PATHS = ("/api/healthz", "/api/livez")


class Request:
    """핸들러에 넘기는 요청 정보: JSON 본문, 쿼리 문자열, 로그인 사용자, 응답에 붙일 쿠키."""

    def __init__(self, headers, body, query):
        self.body = body
        self.query = query
        self.cookies = []
        self.uid, self.user = None, None
        for part in headers.get("Cookie", "").split(";"):
            name, _, value = part.strip().partition("=")
            uid = auth.verify_session(value) if name == "sid" else None
            user = db.hgetall(f"user:{uid}") if uid else None
            if user:
                self.uid, self.user = uid, user

    def login(self, uid):
        self.cookies.append(auth.session_cookie(auth.sign_session(uid), auth.SESSION_SECONDS))

    def logout(self):
        self.cookies.append(auth.session_cookie("", 0))


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "studypals-api"

    def do_GET(self): self.dispatch("GET")
    def do_POST(self): self.dispatch("POST")
    def do_PUT(self): self.dispatch("PUT")
    def do_PATCH(self): self.dispatch("PATCH")
    def do_DELETE(self): self.dispatch("DELETE")

    def dispatch(self, method):
        url = urlparse(self.path)
        path = url.path
        req = None
        try:
            fn, args, needs_login = self.route(method, path)
            body = self.read_body()
            if path not in PROBE_PATHS:   # 프로브는 쿠키·DB 조회 없이 바로 처리
                req = Request(self.headers, body, dict(parse_qsl(url.query)))
            if needs_login and not req.uid:
                raise ApiError(401, "로그인이 필요해요")
            self.reply(200, fn(req, *args), req)
        except ApiError as e:
            self.reply(e.status, {"error": e.message}, req)
        except (OSError, RedisError) as e:
            self.log_error("db error: %r", e)
            self.reply(503, {"error": "데이터베이스에 연결할 수 없어요"}, req)

    @staticmethod
    def route(method, path):
        for m, pattern, fn, needs_login in ROUTES:
            match = pattern.fullmatch(path)
            if m == method and match:
                return fn, match.groups(), needs_login
        raise ApiError(404, "없는 API예요")

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 64 * 1024:
            raise ApiError(413, "요청이 너무 커요")
        raw = self.rfile.read(length) if length else b""
        if not raw.strip():
            return {}
        try:
            data = json.loads(raw)
        except ValueError:
            raise ApiError(400, "JSON 형식이 아니에요")
        return data if isinstance(data, dict) else {}

    def reply(self, status, data, req=None):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        for cookie in (req.cookies if req else []):
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        if not self.path.startswith(PROBE_PATHS):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    # 컨테이너에서 PID 1로 뜨면 SIGTERM 기본 동작이 무시되므로 직접 종료 처리
    # (없으면 Pod 삭제 시 terminationGracePeriod 30초를 다 채우고 강제 종료된다)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    server.daemon_threads = True
    print(f"studypals api listening on :{port}", flush=True)
    server.serve_forever()
