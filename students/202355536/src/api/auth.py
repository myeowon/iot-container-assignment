"""아이디+비밀번호 가입/로그인과 서명 쿠키 세션."""
import hashlib
import hmac
import os
import re
import secrets

from common import ApiError, db, new_id, now, rate_limited, text
from study import study_today

SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-only-secret").encode()
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") == "1"
SESSION_SECONDS = 30 * 24 * 3600
PBKDF2_ROUNDS = 200_000
CHARACTERS = ("bear", "rabbit", "cat-black", "cat-white", "dog")


def hash_password(password, salt_hex):
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt_hex), PBKDF2_ROUNDS
    ).hex()


def _sign(payload):
    return hmac.new(SESSION_SECRET, payload.encode(), hashlib.sha256).hexdigest()


def sign_session(uid):
    payload = f"{uid}.{int(now()) + SESSION_SECONDS}"
    return f"{payload}.{_sign(payload)}"


def verify_session(token):
    """쿠키 값 → uid. 서명이 틀리거나 만료됐으면 None."""
    try:
        payload, sig = token.rsplit(".", 1)
        uid, exp = payload.split(".")
        if hmac.compare_digest(sig, _sign(payload)) and int(exp) >= now():
            return uid
    except ValueError:
        pass
    return None


def session_cookie(value, max_age):
    cookie = f"sid={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}"
    return cookie + ("; Secure" if COOKIE_SECURE else "")


def character_of(u):
    """사용자의 캐릭터 id. 캐릭터 필드가 생기기 전 계정(animal 필드)도 비슷한 캐릭터로 바꿔 준다."""
    if u.get("character") in CHARACTERS:
        return u["character"]
    old = u.get("animal")
    return "cat-black" if old == "cat" else old if old in CHARACTERS else "bear"


def public_user(uid, u):
    return {"id": uid, "username": u["username"], "name": u["name"], "character": character_of(u)}


def signup(req):
    b = req.body
    username = str(b.get("username") or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9]{3,20}", username):
        raise ApiError(400, "아이디는 영문 소문자·숫자 3~20자예요")
    password = str(b.get("password") or "")
    if not 6 <= len(password) <= 72:
        raise ApiError(400, "비밀번호는 6~72자로 입력해 주세요")
    name = text(b, "name", 1, 12, "닉네임")

    uid = "u" + new_id()
    # SET NX: 같은 아이디가 동시에 가입되는 것을 막는다
    if not db.set(f"username:{username}", uid, "NX"):
        raise ApiError(409, "이미 사용 중인 아이디예요")
    salt = secrets.token_hex(16)
    # 캐릭터는 가입할 때 랜덤으로 주고, 로그인 후 닉네임 옆에서 바꿀 수 있다
    user = {"username": username, "name": name, "character": secrets.choice(CHARACTERS),
            "pw_salt": salt, "pw_hash": hash_password(password, salt), "created": int(now())}
    db.hset(f"user:{uid}", user)
    req.login(uid)
    return {"user": public_user(uid, user)}


def login(req):
    username = str(req.body.get("username") or "").strip().lower()
    password = str(req.body.get("password") or "")
    if rate_limited(f"rl:login:{username}", 10):
        raise ApiError(429, "로그인 시도가 너무 많아요. 1분 뒤 다시 시도해 주세요")
    uid = db.get(f"username:{username}") if username else None
    u = db.hgetall(f"user:{uid}") if uid else {}
    if not u or not hmac.compare_digest(hash_password(password, u["pw_salt"]), u["pw_hash"]):
        raise ApiError(401, "아이디 또는 비밀번호가 맞지 않아요")
    req.login(uid)
    return {"user": public_user(uid, u)}


def logout(req):
    req.logout()
    return {"ok": True}


def me(req):
    return {"user": public_user(req.uid, req.user), "today": study_today(req.uid)}


def update_me(req):
    """캐릭터 바꾸기"""
    character = req.body.get("character")
    if character not in CHARACTERS:
        raise ApiError(400, "없는 캐릭터예요")
    db.hset(f"user:{req.uid}", {"character": character})
    req.user["character"] = character
    return {"user": public_user(req.uid, req.user)}
