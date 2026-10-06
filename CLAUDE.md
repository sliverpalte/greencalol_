# 콘텐츠 제작

인스타그램용 뉴스카드와 릴스를 만드는 프로젝트.

## 작업 방식
1. 사용자가 레퍼런스 이미지를 주면 레이아웃, 색, 글자 크기·굵기, 여백, 강조 방식을 먼저 정리해서 짧게 알려준다.
2. 그 구조를 따라 코드로 다시 만든다 (Remotion, 프레임 직접 그리기, HTML 캡처 중 맞는 방식). 문구·사진은 사용자가 준 내용으로 바꾼다.
3. 결과물(PNG/MP4)을 사용자에게 파일로 보낸다.
4. 수정 요청을 받아 고친다. 마음에 들어 하면 템플릿으로 저장할지 묻는다.

- 사이트 스타일을 지정받으면("애플 느낌", "버지 스타일") `design-references/`의 해당 파일을 읽고 그 규칙을 따른다.
- 결과물을 보낼 때 어떤 스킬과 레퍼런스를 썼는지 한 줄로 알려준다.

## 공통 규칙
- 레퍼런스는 구조와 분위기만 따른다. 다른 브랜드의 로고, 사진, 캐릭터, 문구는 그대로 쓰지 않는다.
- 사진·제품 이미지는 사용자가 준 것만 쓴다. 필요한데 없으면 자리만 비워 두고 요청한다.
- 한글 폰트: 레퍼런스 폰트를 쓸 수 없으면 가장 비슷한 무료 폰트(Pretendard, 본고딕 등)로 바꾸고 알린다.
- 같은 시리즈는 색·폰트·로고 위치를 통일한다.
- 브랜드 색·폰트·로고: 아직 정하지 않음. 정해지면 여기에 적는다.

## 영상 제작 규칙 ("영상 만들어줘"라고 하면 항상 이 순서)
1. 먼저 물어볼 것: 주제/제품, 길이, 촬영본이나 이미지 위치, 넣을 문구. 이미 말해 준 항목은 다시 묻지 않는다.
2. 장면 구성안(장면별 문구·소스·초)을 표로 먼저 보여주고 확인을 받은 뒤에 만든다.
3. 제작 순서
   - Remotion (`video/`): 글자·모션·타이밍 등 영상 뼈대
   - HyperFrames (`video/overlay/`): 촬영본 위에 자막·그래픽 얹기
   - OpenMontage: 스톡 영상·배경음악 붙여서 마무리
   - 촬영본이 없으면 HyperFrames 단계는 건너뛴다.
4. 기본 규격: 9:16 세로, 1080×1920, 30fps. 자막은 크게(72px 이상), 한 줄 12자 이내. 데드존은 `rules/reels.md`를 따른다.
5. 식품·건강 제품은 효능을 직접 말하거나 암시하는 표현(예: 면역력, 다이어트, 피로 회복, 혈당, 해독, "○○에 좋은")을 쓰지 않는다. 사용자가 준 문구에 걸리는 표현이 있으면 만들기 전에 해당 문구와 이유를 알리고 대안을 제안한다.
6. 완성되면 MP4 저장 위치(기본 `video/out/`)를 알려주고 파일을 보낸다. 수정은 말로 받아 고친다.

- 스톡 영상·배경음악은 사용 허가(라이선스)가 확인된 것만 쓰고, 출처를 함께 알려준다.
- 이 순서가 `rules/reels.md`의 작업 순서와 겹치면 이 순서를 따르고, 세부 기준(데드존, 모션, 오디오 레벨)은 `rules/`를 따른다.

### 설치 상태
- `video/`: Remotion 4 프로젝트 (`npm run dev` 미리보기, `npx remotion render Reel out/결과.mp4`). 기본 컴포지션 `Reel` = 1080×1920, 30fps, 15초.
- `video/overlay/`: HyperFrames 프로젝트 (세로 1080×1920). GSAP는 CDN 대신 `assets/vendor/gsap.min.js`를 쓴다. 렌더: `cd video/overlay && npx hyperframes render -o ../out/결과.mp4`.
- HyperFrames 스킬: `/hyperframes`(입구), `hyperframes-core`, `hyperframes-animation`, `embedded-captions`, `talking-head-recut`, `media-use` 등이 `.claude/skills/`에 설치돼 있다.
- 새 환경에서는 `cd video && npm install` 후 `npx hyperframes browser ensure`를 먼저 실행한다.

## 상세 규칙
- 영상·모션 작업 전에는 `rules/motion/camera-guide.md`, `rules/motion/motion-system.md`, `rules/motion/production-reference.md`를 읽는다.
@rules/news-card.md
@rules/reels.md
