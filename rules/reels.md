# 릴스 규칙

직접 코드로 영상을 만드는 방식(컷 편집, 모션그래픽, 비트 싱크)을 기본으로 하고,
설치된 스킬로 각 단계를 보강한다.

모션을 만들기 전에 반드시 읽는다:
- `rules/motion/camera-guide.md` — 카메라 움직임 23종 원본 지침 (최우선)
- `rules/motion/motion-system.md` — 이징·길이 토큰, 23종 Remotion 구현표, 화면 디자인 원칙, 장면 레시피, 검수
- `rules/motion/production-reference.md` — 길이별 구성, 글자 노출 시간·자막, 오디오 레벨, 렌더 설정, 데이터 장면, 레퍼런스 분석 형식 (OpenMontage 분석)

## 규격
- 크기: 1080×1920 (9:16), 30fps. 결과물: MP4 (H.264).
- 기본 길이: 15초. 사용자가 길이를 말하면 그에 따른다.

## 구성
- 첫 1~2초 안에 핵심 메시지를 보여준다. 도입부를 길게 끌지 않는다.
- 마지막 2~3초는 마무리 화면: 브랜드·계정 이름과 저장·팔로우 등 행동 유도 문구.
- 한 화면에 문구는 한 덩어리만. 글자는 최소 2초 이상 머물게 한다.

## 데드존 (자막·글자 금지 영역)
- 상단 270px, 하단 480px, 좌우 각 65px, 우측 좋아요·댓글·공유 버튼 영역.
- 자막과 핵심 문구는 이 영역을 뺀 안쪽에만 둔다.

## 제작 엔진
- 엔진 순서는 `CLAUDE.md`의 영상 제작 규칙을 따른다: Remotion(뼈대) → HyperFrames(촬영본 위 자막·그래픽, 촬영본 없으면 생략) → OpenMontage(스톡 영상·배경음악).
- Remotion 단계에서는 Remotion 한 프로젝트 안에서 모든 장면·자막·오디오를 프레임 단위로 맞춘다 (`remotion-create`, `remotion-markup`).
  - 비트 타이밍, 효과음, 자막을 같은 프레임 기준으로 다룰 수 있어 따로 만들어 합칠 때보다 싱크가 정확하다.
- Remotion으로 표현하기 어려운 효과만 프레임 직접 그리기로 만들어 영상 소스로 불러온다.
- 최종 렌더링: `remotion-render`

## 작업 순서
각 단계 결과물을 사용자에게 보여주고 확인받은 뒤 다음 단계로 간다.

### 0. 기획 (콘텐츠 플러그인 `claude-content-skills`)
- 레퍼런스 릴스 분석: `reel-analyzer` — 훅, 비트 구조, 템포, 화면 구성을 뜯어본다. 결과의 효과 이름은 camera-guide 번호로 다시 매핑한다.
- 훅 문구: `viral-hook-writer` (첫 1~3초). 성과 데이터 CSV가 있으면 `hook-mining`.
- 대본·장면 구성: `reel-scripter`(대본) 또는 `reel-builder`(대본 + 장면별 화면 구성). 여기서 나온 장면 구성을 아래 제작 단계의 입력으로 쓴다.
- 화면 자막 문구: `on-screen-text-writer`. 데드존·한 화면 한 덩어리 규칙은 이 문서를 따른다.
- 촬영이 필요하면: `b-roll-shot-list`.
- 플러그인 스킬은 기획·문구까지만 쓴다. 영상 제작·모션·디자인은 이 문서와 `rules/motion/`을 따른다.
- `content-factory`(전체 자동 실행), `comment-responder`(댓글→DM), `agent-reach`(외부 수집·다운로드)는 사용자가 명시적으로 요청할 때만 쓴다.

### 1. 디자인 기준 정하기
- 브랜드 홈페이지·상세페이지에서 색상과 이미지를 가져온다.
- 브랜드별 디자인 규칙을 `brands/<브랜드>/DESIGN.md`로 정리해 두고 다음 영상에도 재사용한다 (`stitch-design-taste`).
- 사용자가 사이트 스타일을 지정하면 `design-references/`의 해당 파일을 참고한다.
- 장면 디자인 완성도: `design-taste-frontend`, `high-end-visual-design`, 스타일 지정 시 `minimalist-ui` 등.
- 폰트: Pretendard, Wanted Sans 등 무료 한글 폰트 (`remotion-markup`의 local-fonts / google-fonts).
- 누끼 PNG는 투명 여백을 잘라내고 쓴다.

### 2. 레퍼런스 분석
- 레퍼런스 영상·이미지의 효과를 정확한 용어로 정리한다 (`animation-vocabulary`). 예: "통통 튀며 등장" → 팝인/스프링.
- 정리한 효과 목록과 타이밍을 사용자에게 보여준다.

### 3. 컷 편집
- 원본 영상은 9:16으로 크롭하고 필요한 구간만 잘라 쓴다 (`remotion-markup`의 cropping / video-editing).
- 인물 얼굴 컷은 사용자가 요청하면 눈이 보이지 않게 크롭한다.
- 영상 길이·해상도는 먼저 확인한다 (`remotion-multimedia`).
- 말소리가 있는 원본은 무음 구간을 찾아 잘라낸다 (`remotion-markup`의 silence-detection).
- 컷을 고르기 전에 콘택트 시트와 스토리보드 이미지를 만들어 보여준다.

### 4. 모션그래픽
- 효과 선택·수치·구현은 `rules/motion/motion-system.md`를 따른다. 효과 이름은 camera-guide 번호(01~23)로 부른다.
- 자주 쓰는 기법: 키네틱 타이포(튀어 오름·순차 등장), 원형 와이프 전환, 차오르는 막대 그래프, 깜빡이는 커서 버튼.
- 장면 전환은 TransitionSeries로 만든다 (`remotion-markup`의 transitions). 짧고 일정하게 (0.3~0.5초), 장면마다 다른 효과를 섞지 않는다.
- 움직임 설계: 무엇을 왜 움직일지, 곡선과 길이를 정해서 만든다 (`animate`). 스프링 기반 자연스러운 움직임은 `apple-design` 참고.
- 문구 강조: text-highlights, 글자 넘침 방지: measuring-text (`remotion-markup`).
- 다 만든 뒤 움직임을 점검한다 (`review-animations`): 너무 느리거나, 동시에 너무 많이 움직이거나, 곡선이 어색한 곳을 고친다.
- 긴 문구·큰 숫자를 넣어도 데드존을 침범하거나 깨지지 않는지 확인한다 (`break-ui`).

### 5. 오디오
- 배경음악의 BPM과 킥 타이밍을 분석해 프레임 번호로 변환하고, 컷 전환과 모션 등장을 그 프레임에 맞춘다.
- 필요하면 음악에 반응하는 효과(베이스에 맞춰 커지는 요소 등)를 넣는다 (`remotion-markup`의 audio-visualization).
- 효과음(swoosh, pop, 카메라 플래시, 타이핑 등)을 시점별로 얹는다 (`remotion-markup`의 sfx, audio). 음악보다 튀지 않게 볼륨을 맞춘다.
- 말소리는 받아써서 단어 단위 타이밍이 있는 자막으로 만들고, 말에 맞춰 강조되게 띄운다 (`remotion-captions`). 받아쓴 내용은 사용자에게 확인받는다.
- 음악·효과음은 사용자가 준 것이나 사용 허가가 확인된 것만 쓴다. 없으면 무음으로 만들고 그 사실을 알린다.

### 6. 마무리
- 렌더링 전에 중간 프레임 몇 장을 이미지로 뽑아 확인한다.
- 렌더링 후 MP4를 사용자에게 보내고, 쓴 기법·스킬을 한 줄로 알려준다.
- 마음에 들어 하면 장면 구성과 설정을 템플릿으로 저장해 다음 영상에 재사용한다.
- 캡션·해시태그: `caption-and-hashtags`. 커버 문구: `cover-thumbnail-brief`. 다른 플랫폼용 변환: `content-repurposer`.
