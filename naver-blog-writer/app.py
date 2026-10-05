"""네이버 블로그 글쓰기 도우미 (Streamlit).

실행: streamlit run app.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

import anthropic
import streamlit as st

import ai
import naver_search

ROOT = Path(__file__).parent
CONFIG_FILE = ROOT / "config.json"
DRAFT_DIR = ROOT / "drafts"
DRAFT_DIR.mkdir(exist_ok=True)

st.set_page_config(page_title="네이버 블로그 글쓰기 도우미", page_icon="✍️", layout="wide")
ss = st.session_state


def load_config() -> dict:
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    return {}


def save_config(cfg: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def run_claude(label: str, fn, *args, **kwargs):
    """Claude 호출 공통 처리: 진행 표시와 오류 메시지."""
    try:
        with st.spinner(label):
            return fn(*args, **kwargs)
    except anthropic.AuthenticationError:
        st.error("Claude API 키가 올바르지 않습니다. 왼쪽 설정에서 확인해 주세요.")
    except anthropic.RateLimitError:
        st.error("요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도해 주세요.")
    except anthropic.APIConnectionError:
        st.error("Claude 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.")
    except anthropic.APIStatusError as e:
        st.error(f"Claude API 오류 ({e.status_code}): {e.message}")
    except (RuntimeError, json.JSONDecodeError) as e:
        st.error(str(e))
    return None


def safe_name(text: str) -> str:
    return re.sub(r"[^\w가-힣]+", "_", text).strip("_")[:40]


# ---------------------------------------------------------------- 설정

cfg = load_config()
with st.sidebar:
    st.header("설정")
    api_key = st.text_input("Claude API 키", value=cfg.get("anthropic_api_key", ""), type="password",
                            help="console.anthropic.com 에서 발급. 이 PC의 config.json에만 저장됩니다.")
    blog_id = st.text_input("네이버 블로그 ID", value=cfg.get("blog_id", ""),
                            help="blog.naver.com/여기부분")
    if st.button("설정 저장"):
        cfg.update({"anthropic_api_key": api_key.strip(), "blog_id": blog_id.strip()})
        save_config(cfg)
        st.success("저장했습니다.")
    if cfg.get("anthropic_api_key"):
        os.environ["ANTHROPIC_API_KEY"] = cfg["anthropic_api_key"]

    st.divider()
    st.subheader("네이버 로그인")
    st.caption("처음 한 번, 열리는 브라우저 창에서 직접 로그인하고 창을 닫으세요.")
    if st.button("로그인 창 열기"):
        subprocess.Popen([sys.executable, str(ROOT / "publisher.py"), "login"], cwd=ROOT)
        st.info("브라우저 창이 열립니다.")

    st.divider()
    business = st.text_area(
        "업체·글 정보 (사실로 쓸 내용)",
        value=cfg.get("business", ""),
        height=220,
        placeholder="예) 업체명, 지역, 서비스·상품, 가격과 조건, 운영시간, 실제 사례, 강조할 점, 피할 표현",
    )
    if st.button("업체 정보 저장"):
        cfg["business"] = business
        save_config(cfg)
        st.success("저장했습니다.")

st.title("✍️ 네이버 블로그 글쓰기 도우미")
st.caption("키워드 찾기 → 상위 글 분석 → 원고 작성 → 네이버에 임시저장 → 직접 확인 후 발행")

if not os.environ.get("ANTHROPIC_API_KEY"):
    st.warning("왼쪽 설정에 Claude API 키를 넣고 저장해 주세요.")

# ---------------------------------------------------------------- 1. 키워드

st.header("1. 키워드 찾기")
col1, col2 = st.columns([3, 1])
topic = col1.text_input("주제", placeholder="예) 강아지 슬개골 탈구, 구미 휴대폰 성지, 캠핑 의자")
if col2.button("키워드 찾기", type="primary", disabled=not topic):
    try:
        with st.spinner("네이버 자동완성·연관검색어 수집 중..."):
            ss.signals = naver_search.expand_keywords(topic)
            ss.signals_at = naver_search.checked_at()
    except Exception as e:
        st.error(f"네이버 검색어를 가져오지 못했습니다: {e}")
        ss.signals = {}
    if ss.get("signals") is not None:
        ss.keywords = run_claude("Claude가 키워드 후보를 판단하는 중...", ai.judge_keywords,
                                 topic, ss.signals, business)

if ss.get("signals"):
    with st.expander(f"수집한 네이버 검색어 ({ss.signals_at} 기준)"):
        for name, label in [("autocomplete", "자동완성"), ("autocomplete_extended", "자동완성 확장"),
                            ("related", "연관검색어")]:
            st.write(f"**{label}**: " + (", ".join(ss.signals.get(name, [])) or "(없음)"))

if ss.get("keywords"):
    kw = ss.keywords
    st.dataframe(
        [{"키워드": c["keyword"], "판단": c["judgement"], "확신도": c["confidence"],
          "검색의도": c["intent"], "수요 신호": c["demand_signal"], "채울 정보": c["what_to_cover"],
          "이유": c["reason"]} for c in kw["candidates"]],
        width="stretch", hide_index=True,
    )
    st.caption(f"검색량: 미확인 (네이버 검색광고 API 미사용). {kw['limits']}")

options = [c["keyword"] for c in ss.get("keywords", {}).get("candidates", [])]
default = ss.get("keywords", {}).get("recommended")
choice = st.selectbox("메인 키워드 선택", options + ["직접 입력"],
                      index=options.index(default) if default in options else len(options))
keyword = st.text_input("메인 키워드 직접 입력") if choice == "직접 입력" else choice

# ---------------------------------------------------------------- 2. 상위 글

st.header("2. 상위 글 분석")
n_posts = st.slider("읽을 상위 글 수", 3, 10, 7)
if st.button("상위 글 수집·분석", type="primary", disabled=not keyword):
    try:
        with st.spinner(f"'{keyword}' 블로그 탭 상위 글 읽는 중..."):
            ss.posts = [asdict(p) for p in naver_search.collect_competitors(keyword, n_posts)]
            ss.posts_at = naver_search.checked_at()
            ss.posts_keyword = keyword
    except Exception as e:
        st.error(f"네이버 검색 결과를 가져오지 못했습니다: {e}")
        ss.posts = []
    if not ss.posts:
        st.warning("상위 글을 찾지 못했습니다. 키워드를 바꾸거나 잠시 뒤 다시 시도해 주세요.")
    else:
        ss.analysis = run_claude("Claude가 상위 글을 분석하는 중...", ai.analyze_competitors,
                                 keyword, ss.posts, business)

if ss.get("posts"):
    read_ok = sum(1 for p in ss.posts if p["body"])
    st.caption(f"'{ss.posts_keyword}' 블로그 탭 · {ss.posts_at} · PC 화면 기준 · "
               f"{len(ss.posts)}개 중 본문 {read_ok}개 읽음 (광고 제외)")
    st.dataframe(
        [{"순위": p["rank"], "제목": p["title"], "날짜": p["date"], "글자수": p["body_chars"],
          "사진": p["image_count"], "본문": "읽음" if p["body"] else p["fetch_error"] or "못 읽음",
          "주소": p["url"]} for p in ss.posts],
        width="stretch", hide_index=True,
        column_config={"주소": st.column_config.LinkColumn()},
    )

if ss.get("analysis"):
    a = ss.analysis
    c1, c2 = st.columns(2)
    with c1:
        st.markdown(f"**검색의도**  \n{a['search_intent']}")
        st.markdown("**상위 글 공통 내용**\n" + "\n".join(f"- {t}" for t in a["common_topics"]))
        st.markdown("**빈틈 (우리가 채울 것)**\n" + "\n".join(f"- {t}" for t in a["gaps"]))
    with c2:
        st.markdown(f"**우리 글 방향**  \n{a['our_angle']}")
        st.markdown("**목차 초안**\n" + "\n".join(f"{i}. {t}" for i, t in enumerate(a["outline"], 1)))
        st.markdown(f"**제목 패턴**  \n{a['title_patterns']}")
    with st.expander("글별 분석과 한계"):
        for p in a["posts"]:
            st.markdown(f"**{p['rank']}위** — 답하는 질문: {p['question_answered']}  \n"
                        f"잘한 점: {p['strengths']}  \n빠진 점: {p['missing']}")
        st.markdown(f"**구성 관찰**: {a['structure_observations']}")
        st.caption(a["limits"])

# ---------------------------------------------------------------- 3. 원고

st.header("3. 원고 작성")
c1, c2 = st.columns(2)
tone = c1.selectbox("문체", ["친절한 해요체 (업체 블로그)", "차분한 합니다체 (전문 정보)", "편한 대화체 (개인 블로그)"])
length = c2.selectbox("분량", ["보통 (공백 제외 1,500~2,000자)", "짧게 (1,000자 안팎)", "길게 (2,500~3,500자)"])
extra = st.text_area("추가 요청 (선택)", placeholder="예) 마지막에 예약 방법 안내, 가격표는 빼기, 초보자 눈높이로")

if st.button("원고 쓰기", type="primary", disabled=not ss.get("analysis")):
    progress = st.empty()
    ss.post = run_claude(
        "Claude가 원고를 쓰는 중... (1~3분)", ai.write_post,
        keyword, ss.analysis, business, tone, length, extra,
        on_progress=lambda n: progress.caption(f"작성 중... {n:,}자"),
    )
    progress.empty()
    if ss.post:
        ss.edit_title = ss.post["recommended_title"]
        ss.edit_body = ss.post["body"]

if ss.get("post"):
    p = ss.post
    st.radio("제목 후보", p["titles"], key="title_pick",
             on_change=lambda: ss.update(edit_title=ss.title_pick))
    st.text_input("제목 (수정 가능)", key="edit_title")
    st.text_area("본문 (수정 가능)", key="edit_body", height=520)
    plain = ss.edit_body.replace("**", "").replace("## ", "")
    st.caption(f"본문 {len(plain.replace(' ', '').replace(chr(10), '')):,}자 (공백 제외)")

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("**찍어야 할 사진**\n" + "\n".join(f"- {t}" for t in p["photo_suggestions"]))
        st.markdown("**태그**: " + " ".join("#" + t for t in p["tags"]))
    with c2:
        st.markdown("**발행 전 확인사항**\n" + "\n".join(f"- [ ] {t}" for t in p["pre_publish_checks"]))
        st.markdown(f"**자체 점검**  \n{p['self_review']}")

    # ------------------------------------------------------------ 4. 임시저장

    st.header("4. 네이버에 임시저장")
    st.caption("에디터에 제목·본문을 넣고 '저장'(임시저장)까지만 합니다. 사진을 넣고 확인한 뒤 '발행'은 직접 누르세요.")
    draft = {
        "title": ss.edit_title, "body": ss.edit_body, "tags": p["tags"], "keyword": keyword,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "research": {"keywords": ss.get("keywords"), "analysis": ss.get("analysis"),
                     "posts": [{k: v for k, v in x.items() if k != "body"} for x in ss.get("posts", [])]},
        "checks": p["pre_publish_checks"],
    }
    c1, c2 = st.columns(2)
    if c1.button("원고 파일로 저장"):
        path = DRAFT_DIR / f"{datetime.now():%Y%m%d_%H%M}_{safe_name(keyword)}.json"
        path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
        st.success(f"저장: {path.name}")
    if c2.button("네이버 에디터에 임시저장", type="primary", disabled=not cfg.get("blog_id")):
        path = DRAFT_DIR / f"{datetime.now():%Y%m%d_%H%M}_{safe_name(keyword)}.json"
        path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
        subprocess.Popen([sys.executable, str(ROOT / "publisher.py"), "draft", str(path)], cwd=ROOT)
        st.info("브라우저가 열리고 원고가 입력됩니다. 터미널 창의 안내를 확인하세요.")
    if not cfg.get("blog_id"):
        st.caption("임시저장을 하려면 왼쪽 설정에 블로그 ID를 저장하세요.")
