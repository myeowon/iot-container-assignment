"""공부방: 생성·목록·코드 입장, 하트비트로 상태 동기화.

room:{rid}           hash  name, max, private, code, owner, created, last_active
rooms                zset  생성 시각순 방 목록
code:{CODE}          str   비공개 방 코드 → rid
room:{rid}:allowed   set   비공개 방에 들어갈 수 있는 uid
presence:{rid}       hash  uid → JSON(seat, status, ts, ...) / STALE_SECONDS 지나면 정리
"""
import json
import re
import secrets
import threading

from auth import character_of
from common import ApiError, db, new_id, now, optional, rate_limited, text
from planner import desk_books
from schedule import current_plan
from study import add_study, study_today, total_today

STATUSES = ("STUDYING", "AWAY", "BREAK", "IDLE")
STALE_SECONDS = 20
ROOM_IDLE_DAYS = 3
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 헷갈리는 0/O, 1/I 제외
_lock = threading.Lock()   # 좌석 배정·인원 체크를 직렬화 (api replicas=1 전제)


def room_view(rid, r):
    return {"id": rid, "name": r["name"], "max": int(r["max"]), "private": r["private"] == "1"}


def is_allowed(rid, uid):
    return bool(db.execute("SISMEMBER", f"room:{rid}:allowed", uid))


def load_room(rid, uid):
    r = db.hgetall(f"room:{rid}")
    if not r:
        raise ApiError(404, "방을 찾을 수 없어요")
    if r["private"] == "1" and not is_allowed(rid, uid):
        raise ApiError(403, "비공개 방이에요. 방 코드로 입장해 주세요")
    return r


def active_members(rid):
    """presence 해시에서 오래된 항목을 정리하고 현재 인원을 돌려준다."""
    members, stale = {}, []
    for uid, raw in db.hgetall(f"presence:{rid}").items():
        m = json.loads(raw)
        if now() - m["ts"] > STALE_SECONDS:
            stale.append(uid)
        else:
            members[uid] = m
    if stale:
        db.hdel(f"presence:{rid}", *stale)
    return members


def delete_room(rid, r):
    db.delete(f"room:{rid}", f"room:{rid}:allowed", f"presence:{rid}")
    if r.get("code"):
        db.delete(f"code:{r['code']}")
    db.execute("ZREM", "rooms", rid)


def new_code(rid):
    """영문+숫자가 섞인 6자리 코드. SET NX로 중복을 막는다."""
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if re.search(r"[A-Z]", code) and re.search(r"\d", code) and \
                db.set(f"code:{code}", rid, "NX"):
            return code


# ---------- 핸들러 ----------

def list_rooms(req):
    """공개 방 + 내가 들어갈 수 있는 비공개 방. 오래 비어 있던 방은 정리한다."""
    out = []
    for rid in db.execute("ZREVRANGE", "rooms", 0, 199):
        r = db.hgetall(f"room:{rid}")
        if not r:
            db.execute("ZREM", "rooms", rid)
            continue
        count = len(active_members(rid))
        idle = now() - float(r.get("last_active") or r["created"])
        if count == 0 and idle > ROOM_IDLE_DAYS * 86400:
            delete_room(rid, r)
            continue
        mine = r["private"] == "1" and is_allowed(rid, req.uid)
        if r["private"] == "1" and not mine:
            continue
        out.append({**room_view(rid, r), "count": count, "code": r["code"] if mine else None})
    out.sort(key=lambda x: -x["count"])
    return {"rooms": out[:50]}


def create_room(req):
    name = text(req.body, "name", 1, 20, "방 이름")
    max_members = req.body.get("max")
    if max_members not in (4, 6, 8):
        raise ApiError(400, "인원은 4, 6, 8명 중에서 골라 주세요")
    private = bool(req.body.get("private"))
    rid = new_id(4)
    code = new_code(rid) if private else ""
    r = {"name": name, "max": max_members, "private": int(private), "code": code,
         "owner": req.uid, "created": now(), "last_active": now()}
    db.hset(f"room:{rid}", r)
    db.execute("ZADD", "rooms", now(), rid)
    db.execute("SADD", f"room:{rid}:allowed", req.uid)
    return {"room": {"id": rid, "name": name, "max": max_members, "private": private,
                     "code": code or None}}


def join_by_code(req):
    if rate_limited(f"rl:code:{req.uid}", 10):
        raise ApiError(429, "코드 입력이 너무 많아요. 1분 뒤 다시 시도해 주세요")
    code = str(req.body.get("code") or "").strip().upper()
    rid = db.get(f"code:{code}") if re.fullmatch(r"[A-Z0-9]{6}", code) else None
    if not rid:
        raise ApiError(404, "해당 코드의 방이 없어요")
    db.execute("SADD", f"room:{rid}:allowed", req.uid)
    return {"roomId": rid}


def heartbeat(req, rid):
    """3초마다 호출: 내 좌석·상태를 보내고 방 전체 상태를 받는다."""
    b = req.body
    with _lock:
        r = load_room(rid, req.uid)
        capacity = int(r["max"])
        members = active_members(rid)
        prev = members.get(req.uid)
        if prev is None and len(members) >= capacity:
            raise ApiError(409, "방이 가득 찼어요")

        seat = optional(b.get("seat"), int)
        if seat is not None and not 0 <= seat < capacity:
            seat = None
        taken = seat is not None and any(
            m["seat"] == seat for uid, m in members.items() if uid != req.uid)
        if taken:
            seat = None
        status = b.get("status") if b.get("status") in STATUSES else "IDLE"
        if seat is None:
            status = "IDLE"   # 자리에 앉아야 공부를 시작할 수 있다

        t = now()
        plan = current_plan(req.uid)
        # 과목을 따로 고르지 않았으면 시간표의 지금 계획 과목으로 공부시간을 쌓는다
        subject_id = optional(b.get("subjectId"), str) or (plan and plan["subjectId"])
        if prev:
            add_study(req.uid, prev, t)
        members[req.uid] = {
            "seat": seat, "status": status, "ts": t,
            "subjectId": subject_id,
            "subjectColor": optional(b.get("subjectColor"), "color") or (plan and plan["color"]),
            "name": req.user["name"], "character": character_of(req.user),
            "plan": plan,   # 지금 시각의 계획 → 이름표 아래에 표시
            "books": desk_books(req.uid),
        }
        db.hset(f"presence:{rid}", {req.uid: json.dumps(members[req.uid], ensure_ascii=False)})
        db.hset(f"room:{rid}", {"last_active": t})

    out = [{"id": uid, **{k: v for k, v in m.items() if k != "ts"}, "todaySec": total_today(uid)}
           for uid, m in members.items()]
    return {"room": {**room_view(rid, r), "code": r["code"] or None},
            "members": out, "seatTaken": taken, "me": study_today(req.uid)}


def leave(req, rid):
    with _lock:
        raw = db.hget(f"presence:{rid}", req.uid)
        if raw:
            add_study(req.uid, json.loads(raw), now())
            db.hdel(f"presence:{rid}", req.uid)
    return {"ok": True}
