"""네이버 검색 결과 수집: 자동완성·연관검색어, 블로그 탭 상위 글, 블로그 본문.

공식 API 키 없이 사용자 PC에서 공개 검색 페이지를 읽는다.
네이버 화면 구조가 바뀌면 선택자(selector)를 고쳐야 할 수 있다.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from urllib.parse import parse_qs, quote, urlparse

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
}
TIMEOUT = 15
REQUEST_GAP = 1.0  # 요청 사이 간격(초). 너무 빠르게 반복 요청하지 않는다.


@dataclass
class BlogResult:
    rank: int
    title: str
    url: str
    blogger: str = ""
    date: str = ""
    snippet: str = ""
    body: str = ""
    body_chars: int = 0
    image_count: int = 0
    headings: list[str] = field(default_factory=list)
    fetch_error: str = ""


def _get(url: str, **kwargs) -> requests.Response:
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT, **kwargs)
    resp.raise_for_status()
    time.sleep(REQUEST_GAP)
    return resp


# ---------------------------------------------------------------- 키워드


def autocomplete(query: str) -> list[str]:
    """네이버 검색창 자동완성 단어."""
    url = (
        "https://ac.search.naver.com/nx/ac?q="
        + quote(query)
        + "&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0"
        "&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100"
    )
    try:
        data = _get(url).json()
    except (requests.RequestException, ValueError):
        return []
    words: list[str] = []
    for group in data.get("items", []):
        for item in group:
            word = item[0] if isinstance(item, list) else item
            if isinstance(word, str) and word not in words:
                words.append(word)
    return words


def related_keywords(query: str) -> list[str]:
    """통합검색 결과의 연관검색어."""
    url = "https://search.naver.com/search.naver?where=nexearch&query=" + quote(query)
    try:
        soup = BeautifulSoup(_get(url).text, "html.parser")
    except requests.RequestException:
        return []
    words: list[str] = []
    selectors = [
        "#nx_right_related_keywords .tit",
        ".related_srch .tit",
        "div.related_srch a",
        "[data-template-id='relatedKeywords'] a",
    ]
    for sel in selectors:
        for el in soup.select(sel):
            text = el.get_text(" ", strip=True)
            if text and text != query and text not in words and len(text) < 40:
                words.append(text)
    return words


def expand_keywords(topic: str) -> dict[str, list[str]]:
    """주제 하나로 자동완성·연관검색어 후보를 모은다.

    자동완성은 주제 뒤에 흔한 질문 꼬리말을 붙여 한 번 더 넓힌다.
    """
    result = {"autocomplete": autocomplete(topic), "related": related_keywords(topic)}
    extra: list[str] = []
    for suffix in ["추천", "방법", "비용", "후기", "차이"]:
        for word in autocomplete(f"{topic} {suffix}")[:5]:
            if word not in result["autocomplete"] and word not in extra:
                extra.append(word)
    result["autocomplete_extended"] = extra
    return result


# ---------------------------------------------------------------- 상위 글


def _is_blog_post_url(url: str) -> bool:
    host = urlparse(url).netloc
    return host.endswith("blog.naver.com") and bool(_post_id(url))


def _post_id(url: str) -> tuple[str, str] | None:
    """블로그 글 주소에서 (블로그ID, 글번호)를 꺼낸다."""
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    if "blogId" in qs and "logNo" in qs:
        return qs["blogId"][0], qs["logNo"][0]
    m = re.match(r"^/([A-Za-z0-9_\-]+)/(\d+)", parsed.path)
    if m:
        return m.group(1), m.group(2)
    return None


def top_blog_posts(query: str, limit: int = 10) -> list[BlogResult]:
    """네이버 블로그 탭 검색 결과 상위 글 (광고·카페·인플루언서 외부 글 제외)."""
    url = "https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=" + quote(query)
    soup = BeautifulSoup(_get(url).text, "html.parser")

    results: list[BlogResult] = []
    seen: set[str] = set()
    # 결과 카드 안의 제목 링크를 찾는다. 클래스 이름이 자주 바뀌어 여러 후보를 둔다.
    link_selectors = [
        "a.title_link",
        "a.api_txt_lines.total_tit",
        "a[data-heatmap-target='.link']",
        "div.title_area a",
    ]
    links = []
    for sel in link_selectors:
        links.extend(soup.select(sel))
    if not links:  # 최후의 방법: 블로그 글 주소인 모든 링크
        links = [a for a in soup.find_all("a", href=True) if _is_blog_post_url(a["href"])]

    for a in links:
        href = a.get("href", "")
        title = a.get_text(" ", strip=True)
        if not _is_blog_post_url(href) or not title or len(title) < 4:
            continue
        key = "/".join(_post_id(href) or ())
        if key in seen:
            continue
        seen.add(key)

        card = a.find_parent("li") or a.find_parent("div")
        blogger = date = snippet = ""
        if card is not None:
            name_el = card.select_one(".user_info .name, .sub_txt.sub_name, a.name")
            date_el = card.select_one(".user_info .sub, .sub_time, span.date")
            snip_el = card.select_one(".dsc_link, .api_txt_lines.dsc_txt, .text_area .dsc")
            blogger = name_el.get_text(strip=True) if name_el else ""
            date = date_el.get_text(strip=True) if date_el else ""
            snippet = snip_el.get_text(" ", strip=True) if snip_el else ""

        results.append(
            BlogResult(rank=len(results) + 1, title=title, url=href,
                       blogger=blogger, date=date, snippet=snippet)
        )
        if len(results) >= limit:
            break
    return results


def fetch_post(result: BlogResult, max_chars: int = 6000) -> BlogResult:
    """블로그 글 본문을 모바일 페이지에서 읽어 채운다."""
    ids = _post_id(result.url)
    if not ids:
        result.fetch_error = "블로그 글 주소가 아님"
        return result
    blog_id, log_no = ids
    url = f"https://m.blog.naver.com/PostView.naver?blogId={blog_id}&logNo={log_no}"
    try:
        soup = BeautifulSoup(_get(url).text, "html.parser")
    except requests.RequestException as e:
        result.fetch_error = f"본문을 못 읽음: {e}"
        return result

    container = soup.select_one(".se-main-container") or soup.select_one("#postViewArea") \
        or soup.select_one("#viewTypeSelector")
    if container is None:
        result.fetch_error = "본문 영역을 찾지 못함 (비공개 글이거나 화면 구조 변경)"
        return result

    result.image_count = len(container.select("img.se-image-resource, .se-image img, img"))
    result.headings = [
        h.get_text(" ", strip=True)
        for h in container.select(".se-section-sectionTitle, .se-text-paragraph-align-center b, h2, h3")
        if h.get_text(strip=True)
    ][:20]

    paragraphs = [
        p.get_text(" ", strip=True)
        for p in container.select(".se-text-paragraph, p")
    ]
    text = "\n".join(p for p in paragraphs if p) or container.get_text("\n", strip=True)
    result.body_chars = len(text.replace("\n", "").replace(" ", ""))
    result.body = text[:max_chars]
    if not result.date:
        date_el = soup.select_one(".se_publishDate, .blog_date, p.date")
        result.date = date_el.get_text(strip=True) if date_el else ""
    return result


def collect_competitors(query: str, limit: int = 7) -> list[BlogResult]:
    posts = top_blog_posts(query, limit=limit)
    return [fetch_post(p) for p in posts]


def checked_at() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")
