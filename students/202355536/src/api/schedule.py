"""플래너 시간표(10분 칸별 공부 계획)·D-DAY·지금 시각의 계획.

daily:{uid}:{날짜}.timetable   {칸 번호(0~143): subjectId}
planner:{uid}.dday             {title, date(YYYYMMDD)}
"""
import re

import planner
from common import ApiError, slot_of, text

SLOTS = 144   # 하루 24시간 × 10분 칸 6개


def put_timetable(req):
    """오늘 시간표 저장. 없는 과목이나 범위 밖 칸은 버린다."""
    cells = req.body.get("timetable")
    if not isinstance(cells, dict):
        raise ApiError(400, "시간표 형식이 올바르지 않아요")
    with planner.lock:
        p, d = planner.load(req.uid), planner.load_daily(req.uid)
        subjects = {s["id"] for s in p["subjects"]}
        d["timetable"] = {str(k): v for k, v in cells.items()
                          if str(k).isdigit() and int(k) < SLOTS and v in subjects}
        planner.save(req.uid, daily=d)
        return planner.view(req.uid, p, d)


def put_dday(req):
    """D-DAY 설정 (제목이 비어 있으면 해제)"""
    title = text(req.body, "title", 0, 20, "D-DAY 이름")
    date = str(req.body.get("date") or "")
    if title and not re.fullmatch(r"\d{8}", date):
        raise ApiError(400, "D-DAY 날짜가 올바르지 않아요")
    with planner.lock:
        p = planner.load(req.uid)
        p["dday"] = {"title": title, "date": date} if title else None
        planner.save(req.uid, p)
        return planner.view(req.uid, p)


def current_plan(uid):
    """지금 시각 칸에 계획된 과목과, 오늘 목록에서 그 과목의 아직 안 끝난 첫 할 일 → 공부방 이름표"""
    p, d = planner.load(uid), planner.load_daily(uid)
    subject = next((s for s in p["subjects"] if s["id"] == d["timetable"].get(str(slot_of()))), None)
    if not subject:
        return None
    tasks = {t["id"]: t for t in p["tasks"]}
    task = next((tasks[i] for i in d["taskIds"]
                 if i in tasks and tasks[i]["subjectId"] == subject["id"] and not tasks[i]["done"]), None)
    return {"subjectId": subject["id"], "name": subject["name"], "color": subject["color"],
            "task": task["title"] if task else None}
