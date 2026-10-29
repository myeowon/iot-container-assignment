"""모듈 공통: 설정값, Redis 연결, 에러 타입, 입력 검증 유틸."""
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

from redis_client import Redis

KST = timezone(timedelta(hours=9))
HEX_COLOR = re.compile(r"#[0-9a-fA-F]{6}")

db = Redis(
    os.environ.get("REDIS_HOST", "localhost"),
    os.environ.get("REDIS_PORT", "6379"),
    os.environ.get("REDIS_PASSWORD") or None,
)


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def now():
    return time.time()


def today():
    """공부시간·데일리 플래너의 날짜 기준 (서버 TZ와 무관하게 KST)."""
    return days_ago(0)


def days_ago(n):
    return (datetime.now(KST) - timedelta(days=n)).strftime("%Y%m%d")


def past_day(value):
    """YYYYMMDD 형식이고 오늘 이전(오늘 포함)인 날짜만 받는다. 아니면 오늘."""
    value = str(value or "")
    return value if re.fullmatch(r"\d{8}", value) and value <= today() else today()


def slot_of(ts=None):
    """시각 → 10분 칸 번호 (0:00~0:09 → 0, 23:50~23:59 → 143). 플래너 시간표 단위."""
    t = datetime.fromtimestamp(ts if ts is not None else time.time(), KST)
    return (t.hour * 60 + t.minute) // 10


def new_id(n=6):
    return secrets.token_hex(n)


def rate_limited(key, limit, window=60):
    n = db.execute("INCR", key)
    if n == 1:
        db.execute("EXPIRE", key, window)
    return n > limit


def text(body, field, lo, hi, label):
    v = str(body.get(field) or "").strip()
    if not lo <= len(v) <= hi:
        raise ApiError(400, f"{label}은(는) {lo}~{hi}자로 입력해 주세요")
    return v


def color(body, field="color"):
    v = str(body.get(field) or "")
    if not HEX_COLOR.fullmatch(v):
        raise ApiError(400, "색상 값이 올바르지 않아요")
    return v.lower()


def optional(value, kind):
    """선택 입력값: 형식이 맞으면 그대로, 아니면 None."""
    if kind == "color":
        return value.lower() if isinstance(value, str) and HEX_COLOR.fullmatch(value) else None
    return value if isinstance(value, kind) else None
