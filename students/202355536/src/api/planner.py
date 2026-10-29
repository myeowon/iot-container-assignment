"""플래너: 과목 → 할 일(과목별 백로그) → 데일리 플래너(그날 할 일 선택). 지난 날짜는 조회만 한다.

planner:{uid}            JSON {subjects: [...], tasks: [...]}
daily:{uid}:{YYYYMMDD}   JSON {goalMin, taskIds, memo, timetable}
시간표·D-DAY는 schedule.py
"""
import json
import threading

from common import ApiError, color, days_ago, db, new_id, past_day, text, today
from study import study_on

MAX_SUBJECTS = 20
MAX_TASKS = 300
HISTORY_DAYS = 7
lock = threading.Lock()   # 같은 사용자의 동시 수정이 서로 덮어쓰지 않도록


def load(uid):
    raw = db.get(f"planner:{uid}")
    return json.loads(raw) if raw else {"subjects": [], "tasks": []}


def new_daily():
    return {"goalMin": 120, "taskIds": [], "memo": "", "timetable": {}}


def load_daily(uid, day=None):
    """예전 데이터에 없는 필드는 기본값으로 채운다"""
    raw = db.get(f"daily:{uid}:{day or today()}")
    return {**new_daily(), **(json.loads(raw) if raw else {})}


def save(uid, planner=None, daily=None):
    if planner is not None:
        db.set(f"planner:{uid}", json.dumps(planner, ensure_ascii=False))
    if daily is not None:
        db.set(f"daily:{uid}:{today()}", json.dumps(daily))


def view(uid, planner=None, daily=None, day=None):
    """day의 플래너 (기본: 오늘). editable은 오늘일 때만 True"""
    day = day or today()
    p = planner or load(uid)
    d = daily or load_daily(uid, day)
    return {"subjects": p["subjects"], "tasks": p["tasks"], "dday": p.get("dday"), "editable": day == today(),
            "day": {"date": day, **d}, "study": study_on(uid, day)}


def find(items, item_id, label):
    for it in items:
        if it["id"] == item_id:
            return it
    raise ApiError(404, f"{label}을(를) 찾을 수 없어요")


def desk_books(uid):
    """오늘 남은 할 일의 과목 색 목록 → 3D 책상 위 책 더미."""
    p, d = load(uid), load_daily(uid)
    colors = {s["id"]: s["color"] for s in p["subjects"]}
    tasks = {t["id"]: t for t in p["tasks"]}
    left = [tasks[i] for i in d["taskIds"] if i in tasks and not tasks[i]["done"]]
    return [colors.get(t["subjectId"], "#c8a27a") for t in left][:6]


# ---------- 핸들러 ----------

def get_planner(req):
    """?date=YYYYMMDD 로 지난 날짜도 볼 수 있다"""
    return view(req.uid, day=past_day(req.query.get("date")))


def history(req):
    """최근 7일 요약: 공부시간, 목표, 그날 담은 할 일 수, 그날 완료한 할 일 수"""
    tasks = load(req.uid)["tasks"]
    days = []
    for n in range(HISTORY_DAYS - 1, -1, -1):
        day = days_ago(n)
        d = load_daily(req.uid, day)
        days.append({"date": day, "goalMin": d["goalMin"], "totalSec": study_on(req.uid, day)["totalSec"],
                     "planned": len(d["taskIds"]), "done": sum(t["doneAt"] == day for t in tasks)})
    return {"days": days}


def create_subject(req):
    with lock:
        p = load(req.uid)
        if len(p["subjects"]) >= MAX_SUBJECTS:
            raise ApiError(400, f"과목은 {MAX_SUBJECTS}개까지 만들 수 있어요")
        p["subjects"].append({"id": new_id(4), "color": color(req.body),
                              "name": text(req.body, "name", 1, 20, "과목 이름")})
        save(req.uid, p)
        return view(req.uid, p)


def update_subject(req, sid):
    with lock:
        p = load(req.uid)
        s = find(p["subjects"], sid, "과목")
        if "name" in req.body:
            s["name"] = text(req.body, "name", 1, 20, "과목 이름")
        if "color" in req.body:
            s["color"] = color(req.body)
        save(req.uid, p)
        return view(req.uid, p)


def delete_subject(req, sid):
    """과목을 지우면 그 과목의 할 일과 오늘 목록의 항목도 함께 지운다."""
    with lock:
        p, d = load(req.uid), load_daily(req.uid)
        find(p["subjects"], sid, "과목")
        gone = {t["id"] for t in p["tasks"] if t["subjectId"] == sid}
        p["subjects"] = [s for s in p["subjects"] if s["id"] != sid]
        p["tasks"] = [t for t in p["tasks"] if t["id"] not in gone]
        d["taskIds"] = [t for t in d["taskIds"] if t not in gone]
        save(req.uid, p, d)
        return view(req.uid, p, d)


def create_task(req):
    with lock:
        p = load(req.uid)
        sid = req.body.get("subjectId")
        find(p["subjects"], sid, "과목")
        if len(p["tasks"]) >= MAX_TASKS:
            raise ApiError(400, f"할 일은 {MAX_TASKS}개까지 만들 수 있어요")
        task = {"id": new_id(4), "subjectId": sid, "done": False, "doneAt": None,
                "title": text(req.body, "title", 1, 50, "할 일")}
        p["tasks"].append(task)
        d = None
        if req.body.get("addToday"):
            d = load_daily(req.uid)
            d["taskIds"].append(task["id"])
        save(req.uid, p, d)
        return view(req.uid, p, d)


def update_task(req, tid):
    with lock:
        p = load(req.uid)
        t = find(p["tasks"], tid, "할 일")
        if "title" in req.body:
            t["title"] = text(req.body, "title", 1, 50, "할 일")
        if "done" in req.body:
            t["done"] = bool(req.body["done"])
            t["doneAt"] = today() if t["done"] else None
        save(req.uid, p)
        return view(req.uid, p)


def delete_task(req, tid):
    with lock:
        p, d = load(req.uid), load_daily(req.uid)
        find(p["tasks"], tid, "할 일")
        p["tasks"] = [t for t in p["tasks"] if t["id"] != tid]
        d["taskIds"] = [t for t in d["taskIds"] if t != tid]
        save(req.uid, p, d)
        return view(req.uid, p, d)


def put_daily(req):
    """오늘 목표 시간, 오늘 할 일 목록(과목 백로그에서 고른 task id), 오늘의 한마디를 저장."""
    with lock:
        p, d = load(req.uid), load_daily(req.uid)
        if "goalMin" in req.body:
            try:
                d["goalMin"] = max(0, min(1440, int(req.body["goalMin"])))
            except (TypeError, ValueError):
                raise ApiError(400, "목표 시간이 올바르지 않아요")
        if isinstance(req.body.get("taskIds"), list):
            valid = {t["id"] for t in p["tasks"]}
            d["taskIds"] = list(dict.fromkeys(i for i in req.body["taskIds"] if i in valid))
        if "memo" in req.body:
            d["memo"] = text(req.body, "memo", 0, 200, "한마디")
        save(req.uid, daily=d)
        return view(req.uid, p, d)
