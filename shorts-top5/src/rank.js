// 3단계: 인기 지수 = 조회수 ÷ 구독자 수 → data/<날짜>/ranking.json
const path = require('path');
const { settings, RUN_DATE, dataDir, setLogFile, log, readJson, writeJson, main, ROOT , dataRoot } = require('./lib/common');

const R = settings.rank;
const USED = path.join(dataRoot, 'featured-videos.json'); // 이미 소개한 영상 기록

// 영상 제목을 화면용으로 정리: 해시태그·이모지·괄호 군더더기 제거 후 길면 단어 단위로 자름
function displayTitle(t, max = 30) {
  let s = (t || '')
    .replace(/#[^\s#]+/g, ' ')
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D]/gu, '')
    .replace(/\s*[\[(【].{0,12}?[\])】]\s*$/u, '')
    .replace(/[|｜].*$/, '')
    .replace(/\s+/g, ' ').trim();
  if (!s) s = (t || '').trim();
  if ([...s].length <= max) return s;
  const cut = [...s].slice(0, max).join('');
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim() + '…';
}

function rank() {
  setLogFile('rank.log');
  const cand = readJson(path.join(dataDir(), 'candidates.json'));
  if (!cand) throw new Error('candidates.json이 없습니다. 먼저 npm run collect 를 실행하세요.');

  const used = readJson(USED, {});
  const usedIds = new Set(Object.entries(used).filter(([, v]) => v.date !== RUN_DATE).map(([id]) => id));

  const excluded = [];
  const scored = [];
  for (const c of cand.candidates) {
    let reason = null;
    if (R.skipPreviouslyFeatured && usedIds.has(c.videoId)) reason = '이미 소개한 영상';
    else if (c.subscribersHidden && R.excludeHiddenSubscribers) reason = '구독자 수 비공개';
    else if (!c.subscribers) reason = '구독자 수 0 또는 없음';
    else if (c.subscribers < R.minSubscribers) reason = `구독자 ${R.minSubscribers}명 미만(지수 왜곡 방지)`;
    if (reason) { excluded.push({ videoId: c.videoId, channelTitle: c.channelTitle, reason }); continue; }
    scored.push({ ...c, popularityIndex: Math.round((c.views / c.subscribers) * 10) / 10 });
  }

  // 한국어 우선 → 인기 지수 → 조회수 순
  const pk = R.preferKorean === false ? 0 : 1;
  scored.sort((a, b) => pk * (b.korean - a.korean) || (b.popularityIndex - a.popularityIndex) || (b.views - a.views));

  const picked = [];
  const channels = new Set();
  for (const s of scored) {
    if (channels.has(s.channelId)) { excluded.push({ videoId: s.videoId, channelTitle: s.channelTitle, reason: '같은 채널 중복' }); continue; }
    channels.add(s.channelId);
    picked.push(s);
    if (picked.length === R.topN) break;
  }
  // 최종 순위는 인기 지수로만 다시 정렬 (한국어 우선은 '후보 선발'에만 적용)
  picked.sort((a, b) => (b.popularityIndex - a.popularityIndex) || (b.views - a.views));
  const top = picked.map((p, i) => ({ rank: i + 1, ...p, displayTitle: displayTitle(p.title) }));

  if (top.length < R.topN) log(`⚠️ 조건을 만족하는 영상이 ${top.length}개뿐입니다. 없는 데이터는 만들지 않고 ${top.length}개로 진행합니다.`);
  if (top.length === 0) throw new Error('순위에 넣을 영상이 0개입니다. 오늘은 영상을 만들지 않습니다.');

  writeJson(path.join(dataDir(), 'ranking.json'), {
    date: RUN_DATE, isSample: !!cand.isSample, windowHours: cand.windowHours,
    formula: '인기 지수 = 조회수 ÷ 구독자 수', count: top.length, top, excluded,
  });
  if (!cand.isSample) {
    for (const t of top) used[t.videoId] = { date: RUN_DATE, rank: t.rank, channelTitle: t.channelTitle };
    writeJson(USED, used);
  }
  log(`✅ TOP ${top.length}:`, top.map(t => `${t.rank}위 ${t.channelTitle} (${t.popularityIndex})`).join(' / '));
}

if (require.main === module) main('순위 계산', async () => rank());
module.exports = { rank, displayTitle };
