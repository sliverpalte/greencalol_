// 인스타그램 릴스 업로드 (Instagram Graph API, 재개 가능 업로드 → 공개 URL 불필요)
// 조건: 프로페셔널(비즈니스/크리에이터) 계정 + Meta 앱 + instagram_content_publish 권한.
// 본인 계정만 올린다면 앱 관리자/테스터로 등록해 '개발 모드'에서 앱 심사 없이 사용 가능.
const fs = require('fs');
const { fetchJson, fetchRetry, sleep, log } = require('../lib/common');

const HOST = () => process.env.IG_GRAPH_HOST || 'graph.facebook.com';
const VER = () => process.env.IG_GRAPH_VERSION || 'v23.0';

async function upload(videoPath, meta) {
  const { IG_USER_ID, IG_ACCESS_TOKEN } = process.env;
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) throw new Error('IG_USER_ID / IG_ACCESS_TOKEN 이 필요합니다');
  const base = `https://${HOST()}/${VER()}`;
  const auth = { authorization: `Bearer ${IG_ACCESS_TOKEN}` };

  // 1) 컨테이너 생성
  const c = await fetchJson(`${base}/${IG_USER_ID}/media`, {
    method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ media_type: 'REELS', upload_type: 'resumable', caption: meta.instagram.caption, share_to_feed: true }),
  }, { label: 'instagram.container' });

  // 2) 파일 업로드
  const size = fs.statSync(videoPath).size;
  const up = await fetchRetry(c.uri || `https://rupload.facebook.com/ig-api-upload/${VER()}/${c.id}`, {
    method: 'POST', headers: { authorization: `OAuth ${IG_ACCESS_TOKEN}`, offset: '0', file_size: String(size) }, body: fs.readFileSync(videoPath),
  }, { label: 'instagram.upload' });
  if (!up.ok) throw new Error(`instagram.upload HTTP ${up.status}: ${(await up.text()).slice(0, 300)}`);

  // 3) 처리 완료 대기 (최대 약 5분)
  for (let i = 0; i < 30; i++) {
    const s = await fetchJson(`${base}/${c.id}?fields=status_code,status`, { headers: auth }, { label: 'instagram.status' });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`instagram 처리 실패: ${s.status}`);
    await sleep(10000);
  }
  // 4) 게시
  const p = await fetchJson(`${base}/${IG_USER_ID}/media_publish`, {
    method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ creation_id: c.id }),
  }, { label: 'instagram.publish' });
  log(`  인스타그램 게시 완료: media id ${p.id}`);
  return { id: p.id };
}
module.exports = { upload, name: 'instagram' };
