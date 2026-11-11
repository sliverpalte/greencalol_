// 플랫폼별 제목·설명·해시태그 생성 → data/<날짜>/meta.json
// 기본은 템플릿(무료). settings.meta.useClaudeApi=true 이고 ANTHROPIC_API_KEY가 있으면 한 줄 훅만 Claude로 생성(하루 1회, 약 $0.001).
const path = require('path');
const { settings, RUN_DATE, dataDir, setLogFile, log, readJson, writeJson, fetchJson, main } = require('./lib/common');

const M = settings.meta;
const kNum = n => (n >= 1e8 ? +(n / 1e8).toFixed(1) + '억' : n >= 1e4 ? +(n / 1e4).toFixed(1) + '만' : String(n));

async function claudeHook(top) {
  if (!M.useClaudeApi || !process.env.ANTHROPIC_API_KEY) return null;
  try {
    const r = await fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: M.claudeModel, max_tokens: 100, messages: [{ role: 'user', content:
        `오늘 인기 쇼츠 TOP5 영상의 제목에 붙일 25자 이내 한국어 훅 한 줄만 출력해. 과장·허위 금지. 1위: ${top[0].channelTitle} "${top[0].displayTitle}"` }] }),
    }, { label: 'claude', tries: 2 });
    return r.content?.[0]?.text?.trim().replace(/^["']|["']$/g, '').slice(0, 40) || null;
  } catch (e) { log('Claude 훅 생성 실패 → 템플릿 사용:', e.message); return null; }
}

async function buildMeta() {
  setLogFile('meta.log');
  const ranking = readJson(path.join(dataDir(), 'ranking.json'));
  if (!ranking) throw new Error('ranking.json 없음');
  const top = ranking.top;
  const [, m, d] = RUN_DATE.split('-');
  const dateKo = `${+m}월 ${+d}일`;
  const hook = (await claudeHook(top)) || `1위 인기 지수 ${top[0].popularityIndex}`;

  const list = top.map(t => `${t.rank}위 ${t.channelTitle} — ${t.displayTitle}\n   조회수 ${kNum(t.views)} · 구독자 ${kNum(t.subscribers)} · 인기 지수 ${t.popularityIndex}\n   ${t.url}`).join('\n');
  const credit = '※ 영상 썸네일과 정보의 저작권은 각 채널에 있습니다. 인기 지수 = 조회수 ÷ 구독자 수 (YouTube Data API 기준, 집계 시점 수치)';
  const listShort = top.map(t => `${t.rank}위 ${t.channelTitle}${t.channelHandle ? ` (${t.channelHandle})` : ''}`).join('\n');

  const meta = {
    date: RUN_DATE,
    youtube: {
      title: `오늘의 터진 쇼츠 TOP ${top.length} (${dateKo}) | ${hook}`.slice(0, 100),
      description: `${dateKo} 구독자 대비 조회수가 가장 터진 쇼츠 TOP ${top.length}\n\n${list}\n\n${credit}\n\n${M.hashtags.youtube.join(' ')}`,
      tags: ['쇼츠', '인기쇼츠', 'TOP5', '오늘의쇼츠'],
    },
    instagram: {
      caption: `오늘의 터진 쇼츠 TOP ${top.length} 🔥 ${dateKo}\n${hook}\n\n${listShort}\n\n출처: YouTube 각 채널\n저장해두고 내일도 확인하세요!\n\n${M.hashtags.instagram.join(' ')}`.slice(0, 2200),
    },
    tiktok: {
      title: `오늘의 터진 쇼츠 TOP ${top.length} ${dateKo} | ${hook}\n${listShort}\n출처: YouTube 각 채널 ${M.hashtags.tiktok.join(' ')}`.slice(0, 2200),
    },
  };
  writeJson(path.join(dataDir(), 'meta.json'), meta);
  log('✅ 게시 문구 생성:', meta.youtube.title);
}

if (require.main === module) main('게시 문구 생성', buildMeta);
module.exports = { buildMeta };
