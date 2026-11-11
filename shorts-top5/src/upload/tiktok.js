// 틱톡 업로드 (TikTok Content Posting API)
// 현실: 감사(audit)를 통과하지 않은 앱은 '나만 보기(SELF_ONLY)'로만 게시되고 계정도 비공개여야 합니다.
// 그래서 기본값은 '게시 대기 파일 생성'(publish.js가 처리)이고, 아래 코드는 감사 통과 후
// TIKTOK_AUDITED=true 일 때만 실행됩니다. (TIKTOK_MODE=inbox 면 앱의 '받은편지함'에 초안으로 보냄)
const fs = require('fs');
const { fetchJson, fetchRetry, sleep, log } = require('../lib/common');

const API = 'https://open.tiktokapis.com/v2';

async function token() {
  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN, TIKTOK_ACCESS_TOKEN } = process.env;
  if (TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET && TIKTOK_REFRESH_TOKEN) { // 액세스 토큰은 24시간 만료 → 갱신
    const r = await fetchJson(`${API}/oauth/token/`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: TIKTOK_REFRESH_TOKEN }) }, { label: 'tiktok.oauth' });
    return r.access_token;
  }
  if (TIKTOK_ACCESS_TOKEN) return TIKTOK_ACCESS_TOKEN;
  throw new Error('TIKTOK_CLIENT_KEY/SECRET/REFRESH_TOKEN 이 필요합니다');
}

async function upload(videoPath, meta) {
  const t = await token();
  const h = { authorization: `Bearer ${t}`, 'content-type': 'application/json; charset=UTF-8' };
  const size = fs.statSync(videoPath).size;
  const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 };
  const inbox = process.env.TIKTOK_MODE === 'inbox';
  let body;
  if (inbox) body = { source_info };
  else {
    const info = await fetchJson(`${API}/post/publish/creator_info/query/`, { method: 'POST', headers: h }, { label: 'tiktok.creator' });
    const levels = info.data?.privacy_level_options || [];
    body = { source_info, post_info: { title: meta.tiktok.title, privacy_level: levels.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : levels[0],
      disable_comment: false, disable_duet: false, disable_stitch: false } };
  }
  const init = await fetchJson(`${API}/post/publish/${inbox ? 'inbox/' : ''}video/init/`, { method: 'POST', headers: h, body: JSON.stringify(body) }, { label: 'tiktok.init' });
  const { publish_id, upload_url } = init.data;
  const put = await fetchRetry(upload_url, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-range': `bytes 0-${size - 1}/${size}` }, body: fs.readFileSync(videoPath) }, { label: 'tiktok.upload' });
  if (!put.ok) throw new Error(`tiktok.upload HTTP ${put.status}`);
  for (let i = 0; i < 30; i++) {
    const s = await fetchJson(`${API}/post/publish/status/fetch/`, { method: 'POST', headers: h, body: JSON.stringify({ publish_id }) }, { label: 'tiktok.status' });
    const st = s.data?.status;
    if (st === 'PUBLISH_COMPLETE' || st === 'SEND_TO_USER_INBOX') { log(`  틱톡 ${st}`); return { publishId: publish_id, status: st }; }
    if (st === 'FAILED') throw new Error(`tiktok 실패: ${s.data?.fail_reason}`);
    await sleep(10000);
  }
  return { publishId: publish_id, status: 'PROCESSING' };
}
module.exports = { upload, name: 'tiktok' };
