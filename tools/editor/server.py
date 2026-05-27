#!/usr/bin/env python3
"""GGOResume HTML 편집기 - 로컬 브라우저 기반 정적 사이트 편집기.

3컬럼 UI:
  | 파일 트리 | HTML 소스 편집 | iframe 실시간 미리보기 |

기능:
  - 루트 + projects/ 의 모든 .html 파일 편집
  - 실시간 미리보기 (실제 CSS·JS·이미지 포함 iframe)
  - 새 페이지 추가 (projects/ 또는 루트에 빈 HTML 생성)
  - git add+commit+push 원클릭 배포

사용:
    python tools/editor/server.py
    또는 tools/launch_editor.cmd (Windows)
"""
from __future__ import annotations

import http.server
import json
import mimetypes
import re
import socketserver
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

ROOT = Path(__file__).resolve().parent.parent.parent
STATIC = Path(__file__).resolve().parent / "static"
HOST = "127.0.0.1"
PORT = 7701

# ============================================================
# 보안: ROOT 하위만 허용 (tools/ 자체와 .git/ 제외)
# ============================================================

def safe_repo_path(rel_path: str) -> Path | None:
    try:
        rel = Path(rel_path)
        if rel.is_absolute() or ".." in rel.parts:
            return None
        full = (ROOT / rel).resolve()
        root_resolved = ROOT.resolve()
        full.relative_to(root_resolved)
        # 일부 경로 금지
        parts = full.relative_to(root_resolved).parts
        if parts and parts[0] in (".git", "tools"):
            return None
        return full
    except Exception:
        return None


# ============================================================
# 파일 목록
# ============================================================

def list_html_files() -> dict:
    root_files = sorted([p.name for p in ROOT.glob("*.html")])
    projects_dir = ROOT / "projects"
    project_files = []
    if projects_dir.exists():
        project_files = sorted([p.name for p in projects_dir.glob("*.html")])

    groups = [
        {
            "name": "메인 페이지",
            "files": [{"name": n, "path": n} for n in root_files],
        }
    ]
    if project_files:
        groups.append({
            "name": "프로젝트",
            "files": [{"name": n, "path": f"projects/{n}"} for n in project_files],
        })
    return {"groups": groups}


# ============================================================
# 새 페이지 템플릿
# ============================================================

NEW_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <link rel="stylesheet" href="{asset_base}assets/css/tokens.css">
  <link rel="stylesheet" href="{asset_base}assets/css/main.css">
</head>
<body>
  <header>
    <a href="{home_path}" class="brand">곽근오 · Game Programmer</a>
  </header>
  <main>
    <h1>{title}</h1>
    <p>여기에 내용을 작성하세요.</p>
  </main>
</body>
</html>
"""


def create_new_page(slug: str, title: str, in_projects: bool) -> dict:
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$", slug):
        return {"error": "슬러그는 영숫자·하이픈·언더스코어만 가능합니다."}

    if in_projects:
        folder = ROOT / "projects"
        folder.mkdir(exist_ok=True)
        path = folder / f"{slug}.html"
        rel = f"projects/{slug}.html"
        asset_base = "../"
        home_path = "../index.html"
    else:
        path = ROOT / f"{slug}.html"
        rel = f"{slug}.html"
        asset_base = ""
        home_path = "index.html"

    if path.exists():
        return {"error": f"파일이 이미 존재합니다: {rel}"}

    content = NEW_PAGE_TEMPLATE.format(
        title=title or slug,
        asset_base=asset_base,
        home_path=home_path,
    )
    path.write_text(content, encoding="utf-8")
    return {"ok": True, "path": rel}


# ============================================================
# Git 헬퍼
# ============================================================

def git_run(args: list[str], timeout: int = 60) -> tuple[int, str, str]:
    try:
        p = subprocess.run(
            ["git"] + args,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        return p.returncode, p.stdout or "", p.stderr or ""
    except FileNotFoundError:
        return -1, "", "git 실행 파일을 찾을 수 없습니다."
    except subprocess.TimeoutExpired:
        return -1, "", f"git 명령 타임아웃 ({timeout}s)"


def git_status() -> dict:
    if not (ROOT / ".git").exists():
        return {"git_repo": False, "error": "git 저장소가 아닙니다."}
    rc, out, err = git_run(["status", "--porcelain", "-b"])
    if rc != 0:
        return {"git_repo": True, "error": err or out}

    lines = out.split("\n")
    branch_line = lines[0] if lines else ""
    m = re.match(r"##\s+(\S+?)(?:\.\.\.\S+(?:\s+\[(.+?)\])?)?\s*$", branch_line)
    branch = m.group(1) if m else "?"
    info = m.group(2) if (m and m.group(2)) else ""

    changed, untracked = [], []
    for ln in lines[1:]:
        if not ln.strip():
            continue
        st = ln[:2]
        path = ln[3:].strip()
        if st == "??":
            untracked.append(path)
        else:
            changed.append({"status": st.strip(), "path": path})

    ahead_m = re.search(r"ahead\s+(\d+)", info)
    ahead = int(ahead_m.group(1)) if ahead_m else 0

    return {
        "git_repo": True,
        "branch": branch,
        "changed": changed,
        "untracked": untracked,
        "ahead": ahead,
        "dirty": (len(changed) + len(untracked)) > 0,
    }


def git_deploy(message: str) -> dict:
    if not (ROOT / ".git").exists():
        return {"error": "git 저장소가 아닙니다."}

    rc, out, err = git_run(["add", "-A"])
    if rc != 0:
        return {"error": "git add 실패", "log": err or out}

    committed = False
    rc, out, err = git_run(["commit", "-m", message])
    combined = out + err
    if rc == 0:
        committed = True
    elif "nothing to commit" not in combined and "no changes added" not in combined:
        return {"error": "git commit 실패", "log": combined}

    rc, out, err = git_run(["push"], timeout=120)
    if rc != 0:
        return {"error": "git push 실패", "log": err or out, "committed": committed}

    return {"ok": True, "committed": committed, "log": (out or "") + (err or "")}


# ============================================================
# HTTP 핸들러
# ============================================================

class EditorHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        return

    def _send_json(self, data, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, body: bytes, content_type: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, content_type: str | None = None) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(404, f"not found: {path.name}")
            return
        ctype = content_type
        if ctype is None:
            ctype, _ = mimetypes.guess_type(str(path))
            if ctype is None:
                ctype = "application/octet-stream"
            # 한글 텍스트 파일 charset 보강
            if ctype.startswith("text/") or ctype.endswith("javascript") or ctype.endswith("json"):
                ctype = ctype.split(";")[0] + "; charset=utf-8"
        body = path.read_bytes()
        self._send_bytes(body, ctype)

    def _read_json(self) -> dict:
        n = int(self.headers.get("Content-Length", "0") or "0")
        if n <= 0:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def do_GET(self) -> None:
        try:
            url = urlparse(self.path)
            path = unquote(url.path)

            # 편집기 정적 파일
            if path in ("/", "/index.html"):
                return self._send_file(STATIC / "index.html", "text/html; charset=utf-8")
            if path == "/app.js":
                return self._send_file(STATIC / "app.js", "application/javascript; charset=utf-8")
            if path == "/style.css":
                return self._send_file(STATIC / "style.css", "text/css; charset=utf-8")

            # 미리보기용 정적 자원 (assets, 이미지 등)
            if path.startswith("/raw/"):
                rel = path[len("/raw/"):]
                full = safe_repo_path(rel)
                if full is None:
                    return self.send_error(403)
                return self._send_file(full)

            # API
            if path == "/api/files":
                return self._send_json(list_html_files())

            if path == "/api/file":
                qs = parse_qs(url.query)
                rel = qs.get("path", [""])[0]
                full = safe_repo_path(rel)
                if full is None or not full.exists():
                    return self._send_json({"error": f"not found: {rel}"}, 404)
                return self._send_json({"path": rel, "content": full.read_text(encoding="utf-8")})

            if path == "/api/git/status":
                return self._send_json(git_status())

            self.send_error(404)
        except Exception as e:
            self._send_json({"error": str(e), "trace": traceback.format_exc()}, 500)

    def do_POST(self) -> None:
        try:
            url = urlparse(self.path)
            path = url.path

            if path == "/api/file":
                body = self._read_json()
                rel = body.get("path", "")
                content = body.get("content", "")
                full = safe_repo_path(rel)
                if full is None:
                    return self._send_json({"error": "invalid path"}, 400)
                full.parent.mkdir(parents=True, exist_ok=True)
                full.write_text(content, encoding="utf-8")
                return self._send_json({"ok": True, "bytes": len(content.encode("utf-8"))})

            if path == "/api/page":
                body = self._read_json()
                slug = (body.get("slug") or "").strip()
                title = (body.get("title") or "").strip()
                in_projects = bool(body.get("in_projects", True))
                result = create_new_page(slug, title, in_projects)
                return self._send_json(result, 200 if result.get("ok") else 400)

            if path == "/api/git/deploy":
                body = self._read_json()
                msg = (body.get("message") or "").strip() or "docs: update via editor"
                result = git_deploy(msg)
                return self._send_json(result, 200 if result.get("ok") else 500)

            self.send_error(404)
        except Exception as e:
            self._send_json({"error": str(e), "trace": traceback.format_exc()}, 500)


# ============================================================
# 서버 실행
# ============================================================

class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def open_browser() -> None:
    time.sleep(0.4)
    webbrowser.open(f"http://{HOST}:{PORT}/")


def main() -> int:
    print()
    print("  +---------------------------------------+")
    print("  |  GGOResume HTML Editor                |")
    print(f"  |  http://{HOST}:{PORT}/            |")
    print("  |  Ctrl+C to stop                       |")
    print("  +---------------------------------------+")
    print()

    threading.Thread(target=open_browser, daemon=True).start()
    try:
        with ThreadingServer((HOST, PORT), EditorHandler) as httpd:
            httpd.serve_forever()
    except OSError as e:
        print(f"  [error] 서버 시작 실패: {e}")
        return 1
    except KeyboardInterrupt:
        print("\n  종료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
