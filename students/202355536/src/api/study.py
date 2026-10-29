"""공부시간 기록. study:{uid}:{YYYYMMDD} 해시에 ms 단위로 누적한다.

필드: total(그날 총합), s:{subjectId}(과목별), m:{slot}(10분 칸별 — 플래너 시간표에 실제 공부 표시)
"""
from common import db, slot_of, today

MAX_GAP_SECONDS = 15   # 하트비트 간격이 이보다 길면 그 구간은 공부시간에 넣지 않는다
KEEP_DAYS = 400


def study_on(uid, day):
    raw = db.hgetall(f"study:{uid}:{day}")
    return {
        "totalSec": int(raw.get("total", 0)) // 1000,
        "bySubject": {k[2:]: int(v) // 1000 for k, v in raw.items() if k.startswith("s:")},
        "bySlot": {k[2:]: int(v) // 1000 for k, v in raw.items() if k.startswith("m:")},
    }


def study_today(uid):
    return study_on(uid, today())


def total_today(uid):
    return int(db.hget(f"study:{uid}:{today()}", "total") or 0) // 1000


def add_study(uid, prev, until):
    """직전 하트비트 상태가 STUDYING이었던 구간(prev.ts ~ until)만 더한다."""
    gap = until - prev["ts"]
    if prev["status"] != "STUDYING" or not 0 < gap <= MAX_GAP_SECONDS:
        return
    key, ms = f"study:{uid}:{today()}", int(gap * 1000)
    db.hincrby(key, "total", ms)
    db.hincrby(key, f"m:{slot_of(prev['ts'])}", ms)
    if prev.get("subjectId"):
        db.hincrby(key, f"s:{prev['subjectId']}", ms)
    db.execute("EXPIRE", key, KEEP_DAYS * 86400)
