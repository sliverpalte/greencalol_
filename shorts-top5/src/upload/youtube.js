// 유튜브 쇼츠 업로드 (YouTube Data API v3 videos.insert, OAuth 2.0)
// 주의: Google API 감사(Audit)를 받지 않은 프로젝트로 올린 영상은 '비공개'로 잠깁니다.
//       공개 게시하려면 YouTube API Services 감사 신청이 필요합니다(README 참고).
const fs = require('fs');
const { fetchJson, fetchRetry, settings, log } = require('../lib/common');

async function accessToken() {
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) throw new Error('YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN 이 필요합니다');
  const r = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET, refresh_token: YT_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  }, { label: 'youtube.oauth' });
  return r.access_token;
}

async function upload(videoPath, meta) {
  const token = await accessToken();
  const body = {
    snippet: { title: meta.youtube.title, description: meta.youtube.description, tags: meta.youtube.tags, categoryId: '24', defaultLanguage: 'ko' },
    status: { privacyStatus: settings.upload.youtubePrivacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: false },
  };
  const size = fs.statSync(videoPath).size;
  const init = await fetchRetry('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(size) },
    body: JSON.stringify(body),
  }, { label: 'youtube.init' });
  if (!init.ok) throw new Error(`youtube.init HTTP ${init.status}: ${(await init.text()).slice(0, 400)}`);
  const loc = init.headers.get('location');
  const put = await fetchRetry(loc, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(size) }, body: fs.readFileSync(videoPath) }, { label: 'youtube.upload' });
  const j = JSON.parse(await put.text());
  if (!put.ok) throw new Error(`youtube.upload HTTP ${put.status}: ${JSON.stringify(j).slice(0, 400)}`);
  log(`  유튜브 업로드 완료: https://youtube.com/shorts/${j.id} (상태: ${j.status?.privacyStatus})`);
  return { id: j.id, url: `https://youtube.com/shorts/${j.id}`, privacy: j.status?.privacyStatus };
}
module.exports = { upload, name: 'youtube' };
