# 오늘의 터진 쇼츠 TOP 5 — 자동화 시스템

매일 **03:00(KST)** 유튜브 인기 쇼츠를 모아 순위를 매기고 30초 세로 영상을 만든 뒤,
**19:00(KST)** 유튜브 쇼츠·인스타 릴스·틱톡에 게시합니다. 모두 GitHub Actions에서 돌아가며 PC를 켜 둘 필요가 없습니다.

```
[03:00] 수집(YouTube API) → 순위(조회수÷구독자) → 게시 문구 → 영상(Canvas+Playwright→FFmpeg) → Release에 MP4 보관
[19:00] Release에서 MP4 받기 → 플랫폼별 게시(또는 게시 대기 파일) → 기록 커밋
```

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `config/settings.json` | **수정 가능한 설정** (조회수 기준, 검색 기간, 색, 계정명, 해시태그 등) |
| `template/` | 영상 디자인 템플릿 (매일 재사용, 데이터만 바뀜) |
| `src/` | 수집·순위·문구·렌더·게시 코드 |
| `data/<날짜>/` | 날짜별 `candidates.json`(수집), `ranking.json`(순위), `meta.json`(문구), `uploads.json`(게시 결과), 각 단계 `.log`, 실패 시 `error-report.md` |
| `data/featured-videos.json` | 이미 소개한 영상 목록 (중복 방지) |
| `data/api-usage.json`, `data/upload-history.json` | 날짜별 API 사용량, 게시 성공·실패 |
| `output/<날짜>/` | `top5.mp4`, 확인용 정지 화면 PNG, `pending/`(게시 대기 파일) — git에는 안 올라감 |
| `fixtures/` | 테스트용 **가짜** 데이터 (TEST_MODE 전용, 게시 불가) |

## 운영 모드

| 변수 | 기본값 | 의미 |
|---|---|---|
| `DRY_RUN` | `true` | true면 절대 게시하지 않고 게시 대기 파일만 만듦 |
| `UPLOAD_ENABLED` | `false` | true **이고** DRY_RUN=false일 때만 실제 게시 |
| `TEST_MODE` | `false` | true면 API를 부르지 않고 샘플 데이터로 영상만 만듦 (영상에 "SAMPLE" 표시) |

검증이 끝나면 GitHub 저장소 **Settings → Secrets and variables → Actions → Variables** 에서
`DRY_RUN=false`, `UPLOAD_ENABLED=true` 로 바꾸면 실제 운영이 시작됩니다.

---

## 1. 내 PC에서 실행해 보기 (선택)

1. [Node.js 22 LTS](https://nodejs.org) 설치, FFmpeg 설치 (Windows: `winget install ffmpeg`, Mac: `brew install ffmpeg`)
2. 터미널에서:
   ```bash
   cd shorts-top5
   npm install
   npx playwright install chromium
   npm run doctor        # 설치·설정 점검
   npm test              # 샘플 데이터로 영상 제작 + 게시 대기 파일 생성 (게시 안 함)
   ```
3. 실제 데이터: `.env.example`을 `.env`로 복사해 `YOUTUBE_API_KEY`를 넣고 `npm run daily`

## 2. API 키 발급 및 계정 연동 — 사장님이 직접 해야 하는 일

### ① YouTube Data API 키 (필수, 무료)
1. https://console.cloud.google.com → 새 프로젝트 만들기
2. "API 및 서비스 → 라이브러리" → **YouTube Data API v3** 사용 설정
3. "사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키" → 생성된 키를 복사
4. (권장) 키 제한: API 제한 → YouTube Data API v3만
5. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret** → 이름 `YOUTUBE_API_KEY`

### ② 유튜브 자동 업로드 (OAuth)
1. 같은 프로젝트에서 "OAuth 동의 화면" 설정 (외부, 테스트 사용자에 본인 Gmail 추가)
2. "사용자 인증 정보 → OAuth 클라이언트 ID → 데스크톱 앱" 생성 → 클라이언트 ID/보안 비밀 복사
3. 리프레시 토큰 받기: https://developers.google.com/oauthplayground → 오른쪽 위 톱니 → "Use your own OAuth credentials"에 ①의 ID/비밀 입력 → 범위 `https://www.googleapis.com/auth/youtube.upload` 선택 → Authorize → "Exchange authorization code for tokens" → **Refresh token** 복사
   (OAuth Playground를 쓰려면 클라이언트를 "웹 애플리케이션"으로 만들고 리디렉션 URI에 `https://developers.google.com/oauthplayground` 추가)
4. Secrets: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`
5. ⚠️ **중요**: OAuth 동의 화면이 "테스트" 상태면 리프레시 토큰이 7일 뒤 만료됩니다 → "앱 게시(프로덕션)"로 전환하세요.
6. ⚠️ **중요**: Google의 **API 감사(YouTube API Services Audit)** 를 통과하지 않은 프로젝트로 올린 영상은 **비공개로 잠깁니다**.
   감사 신청: https://support.google.com/youtube/contact/yt_api_form → 승인 전에는 업로드는 되지만 공개는 직접 바꿔야 합니다.

### ③ 인스타그램 릴스 (Instagram Graph API)
조건: 인스타 계정을 **프로페셔널(비즈니스 또는 크리에이터)** 로 전환.
1. https://developers.facebook.com → 앱 만들기 → "Instagram" 제품 추가 (Instagram 로그인 방식)
2. 앱 역할에 본인 인스타 계정을 **Instagram 테스터**로 추가하고 인스타 앱에서 수락
3. 권한 `instagram_business_basic`, `instagram_business_content_publish` 로 액세스 토큰 생성 → **장기 토큰(60일)** 으로 교환
4. Secrets: `IG_USER_ID`(인스타 사용자 ID), `IG_ACCESS_TOKEN`
5. Instagram 로그인 방식 토큰이면 Variables에 `IG_GRAPH_HOST=graph.instagram.com` (페이스북 페이지 연결 방식이면 비워 둠)
- 본인 계정에만 올리는 경우 앱 심사(App Review) 없이 개발 모드로 사용 가능합니다.
- 장기 토큰은 60일마다 갱신해야 합니다 (만료 전 갱신 API 호출 또는 재발급).
- 하루 API 게시 한도 50개 → 충분.

### ④ 틱톡 — 현재는 자동 공개 게시 불가 → "게시 대기 파일" 방식
- TikTok Content Posting API는 **감사(audit)를 통과하지 않은 앱**으로 올린 영상을 **"나만 보기"로만** 게시하고, 계정도 비공개여야 합니다.
- 그래서 기본 설정은 매일 `pending/tiktok/` 에 영상 + 캡션을 만들어 두는 방식입니다. (Actions 실행 화면 하단 Artifacts에서 다운로드 → 틱톡 앱에서 업로드)
- 자동화하려면: https://developers.tiktok.com 앱 생성 → Content Posting API + `video.publish` 범위 신청 → 감사 신청(서비스 설명, 화면 녹화 제출 필요) → 승인 후
  Secrets `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`, Variables `TIKTOK_AUDITED=true`.
- 중간 단계: Variables `TIKTOK_MODE=inbox` 로 두면 틱톡 앱 **받은편지함에 초안**으로 보내 주고, 앱에서 확인 버튼만 누르면 됩니다 (`video.upload` 범위).

### ⑤ (선택) Claude API
`settings.json`의 `meta.useClaudeApi`를 `true`로 하고 Secret `ANTHROPIC_API_KEY`를 넣으면 제목 훅 한 줄을 생성합니다. 꺼 두면 무료 템플릿 문구를 씁니다.

## 3. GitHub에서 자동 실행

1. 위 Secrets 등록 (Variables는 처음엔 안 넣어도 기본값이 DRY_RUN=true)
2. 저장소 **Actions** 탭 → "shorts-top5 · 1) 수집·영상 제작" → **Run workflow** (먼저 `test_mode` 체크로 한 번, 다음엔 체크 없이)
3. 완료 후 실행 화면 아래 **Artifacts** 에서 MP4·정지 화면·로그를 내려받아 확인
4. "shorts-top5 · 2) 게시" → Run workflow → DRY_RUN이면 Artifacts에 `pending-<날짜>` (플랫폼별 영상+캡션)가 생김
5. 모두 괜찮으면 Variables에 `DRY_RUN=false`, `UPLOAD_ENABLED=true`

이후 매일 자동으로 돌아갑니다. 게시 실패 시 같은 워크플로를 다시 실행하면 **실패한 플랫폼만** 재시도합니다 (`only` 입력으로 플랫폼 지정 가능).

## 4. 오류 확인 방법
- 실패하면 GitHub가 저장소 주인에게 메일을 보냅니다 (Actions 기본 알림).
- Actions 탭 → 빨간 X 실행 → 로그 확인. 같은 내용이 `data/<날짜>/*.log`, 원인 요약은 `data/<날짜>/error-report.md`.
- 게시 결과: `data/<날짜>/uploads.json` (`success` / `failed` / `dry-run` / `pending-manual`)
- 로그에는 API 키·토큰이 `***`로 가려져 출력됩니다.

## 5. 쇼츠 판별 방법과 한계
- YouTube Data API에는 **"쇼츠 여부" 필드가 없습니다** (공식 문서 확인). `videoDuration=short`도 "4분 미만"일 뿐입니다.
- 이 시스템은 ① 길이 ≤ 180초, ② `youtube.com/shorts/<ID>` 주소가 리디렉션 없이 열리는지(쇼츠면 200, 일반 영상이면 /watch로 303) 두 단계로 거릅니다.
- ②는 비공식 방법이라 유튜브가 바꾸면 판별이 안 될 수 있고, 그때는 ①만 적용됩니다(`settings.json`의 `verifyShortsUrl`).
- "한국어 우선"은 제목·설명의 한글 포함 여부와 채널 언어 설정으로 판단합니다. 한국 지역 인기 영상 위주로 검색합니다.
- 검색 API는 YouTube가 고른 상위 결과만 주므로 "모든 쇼츠"를 다 훑는 것은 불가능합니다. 검색어(`searchQueries`)를 늘리면 범위가 넓어지지만 할당량을 더 씁니다.

## 6. 순위 규칙
- 인기 지수 = 조회수 ÷ 구독자 수 (소수 1자리)
- 제외: 구독자 수 비공개, 0, 1,000명 미만(작은 채널은 지수가 비정상적으로 커짐 — `minSubscribers`로 조절), 이미 소개한 영상, 같은 채널 두 번째 영상
- 조회수 20만+ 영상이 부족하면 48시간 → 72시간으로 확대. 그래도 5개가 안 되면 **있는 만큼만**(예: TOP 3) 만들고, 0개면 그날은 영상을 만들지 않습니다.

## 7. 저작권·출처
- 쇼츠 영상 자체는 내려받거나 편집하지 않습니다. API가 제공하는 제목·채널명·통계·썸네일만 사용합니다.
- 화면에 "출처: YouTube", 설명란에 각 영상 링크와 채널명을 넣습니다.
- ⚠️ YouTube API 개발자 정책은 썸네일을 **원본 영상으로 연결되는 표시** 용도로 허용합니다. 다른 플랫폼(인스타·틱톡) 영상에 썸네일을 넣는 것은 정책상 회색 지대이며, 채널 측 요청이 오면 즉시 내려야 합니다. 걱정되면 `blurThumbnailBackground: false`로 썸네일 변형(흐림 배경)을 끄거나, 썸네일 없이 텍스트만 쓰는 방식으로 바꿀 수 있습니다.
- 배경음악은 `assets/music/README.md` 참고 (라이선스 파일이 없으면 무음).

## 8. 예상 월 운영비

| 항목 | 사용량 | 비용 |
|---|---|---|
| GitHub Actions | 하루 약 5~8분 → 월 약 200분 | 공개 저장소 무료 / 비공개도 월 2,000분 무료 범위 |
| YouTube Data API (수집) | 하루 약 800~1,000 units (검색 100 × 최대 8회 + 상세 조회) | 무료 (일일 10,000 units) |
| YouTube 업로드 | 1회 약 1,600 units | 무료 (같은 한도 안) |
| Instagram / TikTok API | 하루 1회 게시 | 무료 |
| Claude API (선택) | 하루 1회 짧은 호출 | 월 100원 미만 |
| **합계** | | **0원** (Claude 사용 시 월 100원 미만) |

## 9. 설정 바꾸기 (`config/settings.json`)
- `collect.minViews`: 조회수 기준 (기본 200000)
- `collect.searchWindowsHours`: 검색 기간 단계 (기본 [48, 72])
- `collect.koreanOnly`: true면 한국어 영상만
- `rank.minSubscribers`: 구독자 최소 기준
- `video.accentColor`, `video.accountName`: 강조색, 화면에 표시할 계정명
- `meta.hashtags`: 플랫폼별 해시태그
- 실행 시각: `.github/workflows/shorts-daily-*.yml`의 `cron` (UTC 기준, 한국시간 −9시간)
