// 2단계: 유튜브 인기 쇼츠 후보 수집 → data/<날짜>/candidates.json
//
// 쇼츠 판별에 대해 (공식 문서 기준):
//  - YouTube Data API v3에는 "이 영상이 쇼츠인가"를 알려주는 필드가 없습니다.
//  - search.list의 videoDuration=short 는 "4분 미만"일 뿐이라 일반 짧은 영상도 섞입니다.
//  - 그래서 3단계로 걸러냅니다:
//    1) videos.list contentDetails.duration ≤ 180초 (2024-10부터 쇼츠 최대 3분)
//    2) (선택) https://www.youtube.com/shorts/<id> 요청 시 200이면 쇼츠, /watch로 리다이렉트되면 일반 영상
//       → 비공식 방법이라 유튜브가 바꾸면 깨질 수 있음. 실패하면 1)만으로 판단.
//    3) 세로 영상인지는 API로 알 수 없음(공개 필드 없음) — 한계로 남김.
const { env, settings, RUN_DATE, dataDir, setLogFile, log, readJson, writeJson, fetchJson, main, ROOT } = require('./lib/common');
const path = require('path');

const C = settings.collect;
const API = 'https://www.googleapis.com/youtube/v3';
const quota = { units: 0, calls: {} };
function count(endpoint, units) {
  quota.units += units;
  quota.calls[endpoint] = (quota.calls[endpoint] || 0) + 1;
}

async function yt(endpoint, params, units) {
  const qs = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY });
  count(endpoint, units);
  return fetchJson(`${API}/${endpoint}?${qs}`, {}, { label: `youtube.${endpoint}` });
}

const isoDurSec = iso => {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : Infinity;
};
const hasHangul = s => /[가-힣]/.test(s || '');

async function isShortsUrl(id) {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual' });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) return false;
    return null; // 판단 불가
  } catch { return null; }
}

async function searchIds(hours) {
  const after = new Date(Date.now() - hours * 3600e3).toISOString();
  const ids = new Set();
  let calls = 0;
  for (const q of C.searchQueries) {
    let pageToken;
    for (let p = 0; p < C.pagesPerQuery; p++) {
      if (calls >= C.maxSearchCallsPerRun) { log(`  검색 호출 상한(${C.maxSearchCallsPerRun}) 도달`); return ids; }
      const params = { part: 'id', type: 'video', videoDuration: 'short', order: 'viewCount', maxResults: 50,
        publishedAfter: after, regionCode: C.regionCode, relevanceLanguage: C.relevanceLanguage };
      if (q) params.q = q;
      if (pageToken) params.pageToken = pageToken;
      const r = await yt('search', params, 100);
      calls++;
      r.items.forEach(it => ids.add(it.id.videoId));
      pageToken = r.nextPageToken;
      if (!pageToken) break;
    }
  }
  return ids;
}

async function details(ids) {
  const out = [];
  const list = [...ids];
  for (let i = 0; i < list.length; i += 50) {
    const r = await yt('videos', { part: 'snippet,statistics,contentDetails', id: list.slice(i, i + 50).join(',') }, 1);
    out.push(...r.items);
  }
  return out;
}

async function channels(ids) {
  const map = {};
  const list = [...ids];
  for (let i = 0; i < list.length; i += 50) {
    const r = await yt('channels', { part: 'snippet,statistics', id: list.slice(i, i + 50).join(',') }, 1);
    for (const c of r.items) map[c.id] = c;
  }
  return map;
}

async function collect() {
  setLogFile('collect.log');
  const outPath = path.join(dataDir(), 'candidates.json');

  if (env.TEST_MODE) {
    log('TEST_MODE=true → API 호출 없이 fixtures/sample-candidates.json 사용 (가짜 데이터, 게시 금지)');
    const sample = readJson(path.join(ROOT, 'fixtures', 'sample-candidates.json'));
    writeJson(outPath, { ...sample, date: RUN_DATE, isSample: true });
    return;
  }
  if (!process.env.YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY가 없습니다. README의 "API 키 발급"을 보세요.');

  const seen = new Map(); // videoId -> video
  let usedWindow = null;
  for (const hours of C.searchWindowsHours) {
    log(`최근 ${hours}시간 검색`);
    const ids = [...await searchIds(hours)].filter(id => !seen.has(id));
    const vids = await details(ids);
    for (const v of vids) seen.set(v.id, v);
    const enough = [...seen.values()].filter(v => +v.statistics.viewCount >= C.minViews).length;
    usedWindow = hours;
    log(`  누적 후보 ${seen.size}개, 조회수 ${C.minViews.toLocaleString()}+ ${enough}개`);
    if (enough >= settings.rank.topN * 3) break; // 채널 중복·구독자 필터 여유분 확보
  }

  let videos = [...seen.values()].filter(v => +v.statistics.viewCount >= C.minViews
    && isoDurSec(v.contentDetails.duration) <= C.maxShortDurationSec);
  log(`조회수·길이 필터 후 ${videos.length}개`);

  if (C.verifyShortsUrl) {
    const kept = [];
    for (const v of videos) {
      const s = await isShortsUrl(v.id);
      v._shortsCheck = s === null ? 'unknown' : s ? 'shorts' : 'not-shorts';
      if (s !== false) kept.push(v);
    }
    log(`/shorts/ URL 확인 후 ${kept.length}개 (일반 영상 ${videos.length - kept.length}개 제외)`);
    videos = kept;
  }

  const chMap = await channels(new Set(videos.map(v => v.snippet.channelId)));
  const candidates = videos.map(v => {
    const ch = chMap[v.snippet.channelId];
    const sn = v.snippet;
    const korean = hasHangul(sn.title) || hasHangul(sn.description) ||
      /^ko/.test(sn.defaultAudioLanguage || sn.defaultLanguage || '');
    const th = sn.thumbnails;
    return {
      videoId: v.id,
      url: `https://www.youtube.com/shorts/${v.id}`,
      title: sn.title,
      channelId: sn.channelId,
      channelTitle: sn.channelTitle,
      channelHandle: ch?.snippet?.customUrl || null,
      publishedAt: sn.publishedAt,
      durationSec: isoDurSec(v.contentDetails.duration),
      views: +v.statistics.viewCount,
      likes: v.statistics.likeCount ? +v.statistics.likeCount : null,
      subscribers: ch && !ch.statistics.hiddenSubscriberCount ? +ch.statistics.subscriberCount : null,
      subscribersHidden: !!ch?.statistics?.hiddenSubscriberCount,
      thumbnail: (th.maxres || th.standard || th.high || th.medium || th.default).url,
      korean,
      shortsCheck: v._shortsCheck || 'skipped',
    };
  }).filter(c => !C.koreanOnly || c.korean);

  writeJson(outPath, { date: RUN_DATE, collectedAt: new Date().toISOString(), windowHours: usedWindow,
    isSample: false, quota, candidates });
  log(`✅ 후보 ${candidates.length}개 저장, API 사용량 약 ${quota.units} units (일일 한도 10,000)`, quota.calls);

  const usage = readJson(path.join(ROOT, 'data', 'api-usage.json'), {});
  usage[RUN_DATE] = { youtubeUnits: quota.units, calls: quota.calls };
  writeJson(path.join(ROOT, 'data', 'api-usage.json'), usage);
}

if (require.main === module) main('수집', collect);
module.exports = { collect };
