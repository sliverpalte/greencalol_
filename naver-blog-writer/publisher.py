"""네이버 블로그 에디터에 원고를 넣고 임시저장한다. 최종 '발행'은 사람이 누른다.

사용법
  python publisher.py login               # 처음 한 번: 열린 창에서 직접 네이버 로그인
  python publisher.py draft drafts/글.json  # 원고를 에디터에 넣고 임시저장

로그인 정보는 ./.browser-profile 폴더에 브라우저 쿠키로만 남는다. 아이디·비밀번호를 저장하지 않는다.
네이버 에디터 화면이 바뀌면 SELECTORS를 고쳐야 할 수 있다.
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import BrowserContext, Frame, Page, TimeoutError as PWTimeout, sync_playwright

ROOT = Path(__file__).parent
PROFILE_DIR = ROOT / ".browser-profile"
CONFIG_FILE = ROOT / "config.json"

SELECTORS = {
    "title": [".se-documentTitle .se-text-paragraph", ".se-title-text", "[placeholder='제목']"],
    "body": [".se-component.se-text .se-text-paragraph", ".se-section-text .se-text-paragraph"],
    "popup_cancel": [".se-popup-button-cancel", "button:has-text('취소')"],
    "help_close": [".se-help-panel-close-button", "button.se-help-close"],
}


# ---------------------------------------------------------------- 원고 → HTML


def _inline(text: str) -> str:
    escaped = html.escape(text)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)


def body_to_html(body: str) -> str:
    """ai.py의 본문 표기(## 소제목, **굵게**, - 목록, [사진: ...])를 붙여넣기용 HTML로."""
    parts: list[str] = []
    for block in re.split(r"\n\s*\n", body.strip()):
        lines = [ln.rstrip() for ln in block.splitlines() if ln.strip()]
        if not lines:
            continue
        if all(ln.lstrip().startswith("- ") for ln in lines):
            items = "".join(f"<li>{_inline(ln.lstrip()[2:])}</li>" for ln in lines)
            parts.append(f"<ul>{items}</ul>")
            continue
        for ln in lines:
            s = ln.strip()
            if s.startswith("## "):
                parts.append(f"<h3><b>{_inline(s[3:])}</b></h3>")
            elif s.startswith("[사진"):
                parts.append(f"<p style=\"color:#d9480f\">{html.escape(s)}</p>")
            elif s.startswith("- "):
                parts.append(f"<ul><li>{_inline(s[2:])}</li></ul>")
            else:
                parts.append(f"<p>{_inline(s)}</p>")
        parts.append("<p><br></p>")
    return "".join(parts)


def body_to_text(body: str) -> str:
    text = re.sub(r"^## ", "", body, flags=re.M)
    return text.replace("**", "")


# ---------------------------------------------------------------- 브라우저


def open_context(p) -> BrowserContext:
    PROFILE_DIR.mkdir(exist_ok=True)
    kwargs = dict(
        user_data_dir=str(PROFILE_DIR),
        headless=False,
        viewport={"width": 1400, "height": 900},
        locale="ko-KR",
        permissions=["clipboard-read", "clipboard-write"],
    )
    try:  # PC에 설치된 크롬이 있으면 그걸 쓴다
        return p.chromium.launch_persistent_context(channel="chrome", **kwargs)
    except Exception:
        return p.chromium.launch_persistent_context(**kwargs)


def find_editor_frame(page: Page, timeout_s: int = 30) -> Frame:
    """에디터는 페이지 자체 또는 mainFrame iframe 안에 있다."""
    for _ in range(timeout_s * 2):
        for frame in [page.main_frame, *page.frames]:
            try:
                if frame.query_selector(SELECTORS["title"][0]) or frame.query_selector(SELECTORS["title"][1]):
                    return frame
            except Exception:
                pass
        page.wait_for_timeout(500)
    raise RuntimeError("글쓰기 에디터를 찾지 못했습니다. 로그인 상태와 블로그 ID를 확인해 주세요.")


def click_first(frame: Frame, names: list[str], timeout: int = 1500) -> bool:
    for sel in names:
        try:
            frame.locator(sel).first.click(timeout=timeout)
            return True
        except PWTimeout:
            continue
        except Exception:
            continue
    return False


def paste_html(page: Page, frame: Frame, html_body: str, text_body: str) -> None:
    """실제 클립보드에 HTML을 넣고 Ctrl/Cmd+V로 붙여넣는다. 서식이 들어가는 가장 확실한 방법."""
    frame.evaluate(
        """async ([h, t]) => {
            const item = new ClipboardItem({
              'text/html': new Blob([h], {type: 'text/html'}),
              'text/plain': new Blob([t], {type: 'text/plain'}),
            });
            await navigator.clipboard.write([item]);
        }""",
        [html_body, text_body],
    )
    page.keyboard.press("ControlOrMeta+V")
    page.wait_for_timeout(2000)


def body_length(frame: Frame) -> int:
    return frame.evaluate(
        """() => [...document.querySelectorAll('.se-component.se-text, .se-component.se-sectionTitle, .se-component.se-quotation')]
                 .map(e => e.innerText).join('').replace(/\\s/g, '').length"""
    )


# ---------------------------------------------------------------- 명령


def load_blog_id() -> str:
    if CONFIG_FILE.exists():
        blog_id = json.loads(CONFIG_FILE.read_text(encoding="utf-8")).get("blog_id", "")
        if blog_id:
            return blog_id
    raise SystemExit("config.json에 blog_id가 없습니다. 앱의 '설정'에서 블로그 ID를 저장해 주세요.")


def cmd_login() -> None:
    with sync_playwright() as p:
        ctx = open_context(p)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://nid.naver.com/nidlogin.login")
        print("열린 창에서 네이버에 로그인하세요. '로그인 상태 유지'를 켜면 다음부터 편합니다.")
        print("로그인을 마치면 브라우저 창을 닫으세요.")
        page.wait_for_event("close", timeout=0)
        ctx.close()


def cmd_draft(draft_path: str) -> None:
    draft = json.loads(Path(draft_path).read_text(encoding="utf-8"))
    title, body = draft["title"], draft["body"]
    blog_id = load_blog_id()

    with sync_playwright() as p:
        ctx = open_context(p)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(f"https://blog.naver.com/{blog_id}/postwrite")
        if "nidlogin" in page.url:
            print("로그인이 필요합니다. 먼저 'python publisher.py login'을 실행하세요.")
            ctx.close()
            sys.exit(2)

        frame = find_editor_frame(page)
        page.wait_for_timeout(1500)
        # '작성 중인 글이 있습니다' 팝업과 도움말 패널 닫기
        click_first(frame, SELECTORS["popup_cancel"])
        click_first(frame, SELECTORS["help_close"])

        # 제목
        if not click_first(frame, SELECTORS["title"], timeout=5000):
            raise RuntimeError("제목 칸을 찾지 못했습니다.")
        page.keyboard.insert_text(title)

        # 본문
        if not click_first(frame, SELECTORS["body"], timeout=5000):
            page.keyboard.press("Enter")  # 제목에서 엔터로 본문으로 이동
        try:
            paste_html(page, frame, body_to_html(body), body_to_text(body))
        except Exception as e:
            print(f"서식 붙여넣기 실패, 일반 텍스트로 입력합니다: {e}")
        if body_length(frame) < len(body_to_text(body).replace(" ", "").replace("\n", "")) * 0.5:
            print("붙여넣기가 제대로 안 돼 일반 텍스트로 입력합니다.")
            click_first(frame, SELECTORS["body"], timeout=3000)
            page.keyboard.insert_text(body_to_text(body))

        # 임시저장 (발행 버튼은 누르지 않는다)
        saved = False
        try:
            frame.get_by_role("button", name="저장", exact=True).first.click(timeout=5000)
            saved = True
        except Exception:
            saved = click_first(frame, ["button[class*='save_btn']", "button:has-text('저장')"])
        page.wait_for_timeout(2000)

        print("임시저장 완료." if saved else "저장 버튼을 못 찾았습니다. 화면에서 직접 '저장'을 눌러 주세요.")
        print("사진 자리([사진: ...])에 실제 사진을 넣고, 태그를 입력한 뒤 직접 '발행'을 누르세요.")
        if draft.get("tags"):
            print("추천 태그: " + " ".join("#" + t for t in draft["tags"]))
        print("작업이 끝나면 브라우저 창을 닫으세요.")
        page.wait_for_event("close", timeout=0)
        ctx.close()


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "login":
        cmd_login()
    elif len(sys.argv) >= 3 and sys.argv[1] == "draft":
        cmd_draft(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)
