#!/usr/bin/env python3
"""src/ 아래 소스 파일을 k8s/*-configmap.yaml 로 변환한다 (표준 라이브러리만 사용).

    python3 scripts/gen_configmaps.py

이미지를 빌드하지 않고 코드를 ConfigMap으로 주입하기 때문에,
src/ 를 수정한 뒤에는 반드시 이 스크립트를 다시 실행하고 k8s/ 를 커밋한다.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIMIT = 900 * 1024  # ConfigMap 최대 1MiB — 메타데이터 여유분을 남긴다

CONFIGMAPS = [
    # (ConfigMap 이름, component 라벨, 소스 디렉터리, 출력 파일)
    ("studyroom-api-code", "api", "src/api", "k8s/api-code-configmap.yaml"),
    ("studyroom-web-files", "web", "src/web", "k8s/web-files-configmap.yaml"),
    ("studyroom-nginx", "web", "src/nginx", "k8s/nginx-configmap.yaml"),
]


def block(content):
    if content and content[0] in " \t\n":
        sys.exit("파일이 공백으로 시작하면 YAML 블록으로 넣을 수 없습니다")
    lines = content.rstrip("\n").split("\n")
    return "|\n" + "".join(f"    {l}\n" if l else "\n" for l in lines)


def build(name, component, src_dir):
    files = sorted(p for p in (ROOT / src_dir).iterdir() if p.is_file() and not p.name.startswith("."))
    out = [
        f"# 자동 생성 파일 — {src_dir}/ 를 수정한 뒤 scripts/gen_configmaps.py 로 다시 생성",
        "apiVersion: v1",
        "kind: ConfigMap",
        "metadata:",
        f"  name: {name}",
        "  labels:",
        "    app: studyroom",
        f"    component: {component}",
        "data:",
    ]
    total = 0
    for p in files:
        if not re.fullmatch(r"[-._a-zA-Z0-9]+", p.name):
            sys.exit(f"ConfigMap 키로 쓸 수 없는 파일명: {p}")
        content = p.read_text(encoding="utf-8")
        total += len(content.encode())
        out.append(f"  {p.name}: {block(content)}".rstrip("\n"))
    if total > LIMIT:
        sys.exit(f"{name}: {total} bytes — ConfigMap 크기 제한 초과")
    return "\n".join(out) + "\n", total, len(files)


if __name__ == "__main__":
    for name, component, src, dest in CONFIGMAPS:
        text, size, count = build(name, component, src)
        (ROOT / dest).write_text(text, encoding="utf-8")
        print(f"{dest}: {count} files, {size / 1024:.1f} KiB")
