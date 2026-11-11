// 7단계: 플랫폼별 게시. 상태는 data/<날짜>/uploads.json 에 기록.
// - 이미 성공한 플랫폼은 건너뜀(같은 날 중복 업로드 방지) → 다시 실행하면 실패한 곳만 재시도
// - DRY_RUN=true 또는 UPLOAD_ENABLED=false 이면 실제 게시 대신 '게시 대기 파일'만 만듦
// - 사용: node src/publish.js [--only=youtube,instagram]
const fs = require('fs');
const path = require('path');
const { env, settings, RUN_DATE, dataDir, outDir, setLogFile, log, readJson, writeJson, main, mask, ROOT } = require('./lib/common');

const uploaders = { youtube: require('./upload/youtube'), instagram: require('./upload/instagram'), tiktok: require('./upload/tiktok') };

// 플랫폼별로 자동 게시가 가능한 상태인지 (인증정보·승인 여부)
function readiness(p) {
  const e = process.env;
  if (p === 'youtube') return e.YT_CLIENT_ID && e.YT_CLIENT_SECRET && e.YT_REFRESH_TOKEN ? null : 'YT_* 인증정보 없음';
  if (p === 'instagram') return e.IG_USER_ID && e.IG_ACCESS_TOKEN ? null : 'IG_* 인증정보 없음';
  if (p === 'tiktok') {
    if (!/^true$/i.test(e.TIKTOK_AUDITED || '') && e.TIKTOK_MODE !== 'inbox') return '틱톡 앱 감사(audit) 미통과 → 자동 공개 게시 불가';
    return (e.TIKTOK_REFRESH_TOKEN || e.TIKTOK_ACCESS_TOKEN) ? null : 'TIKTOK_* 인증정보 없음';
  }
  return '알 수 없는 플랫폼';
}

function writePending(p, video, meta, reason) {
  const dir = path.join(outDir(), 'pending', p);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(video, path.join(dir, `top5-${RUN_DATE}.mp4`));
  const text = p === 'youtube' ? `제목:\n${meta.youtube.title}\n\n설명:\n${meta.youtube.description}`
    : p === 'instagram' ? meta.instagram.caption : meta.tiktok.title;
  fs.writeFileSync(path.join(dir, 'caption.txt'), `# 게시 대기 (${reason})\n# 이 영상과 아래 문구를 앱에서 직접 올리면 됩니다.\n\n${text}\n`);
  return path.relative(ROOT, dir);
}

async function publish() {
  setLogFile('publish.log');
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
  const platforms = only.length ? only : settings.upload.platforms;
  const video = path.join(outDir(), 'top5.mp4');
  const meta = readJson(path.join(dataDir(), 'meta.json'));
  const ranking = readJson(path.join(dataDir(), 'ranking.json'));
  if (!fs.existsSync(video) || !meta) throw new Error(`영상(${path.relative(ROOT, video)}) 또는 meta.json이 없습니다.`);

  const statePath = path.join(dataDir(), 'uploads.json');
  const state = readJson(statePath, {});
  const live = env.UPLOAD_ENABLED && !env.DRY_RUN;
  if (live && ranking?.isSample) throw new Error('샘플(가짜) 데이터 영상은 게시할 수 없습니다. TEST_MODE를 끄세요.');
  log(`게시 모드: ${live ? '🔴 실제 게시' : '🟢 DRY RUN (게시 안 함)'} / 대상: ${platforms.join(', ')}`);

  let failed = 0;
  for (const p of platforms) {
    const prev = state[p] || { attempts: 0 };
    if (prev.status === 'success') { log(`- ${p}: 이미 게시됨(${prev.at}) → 건너뜀`); continue; }
    const notReady = readiness(p);
    if (!live || notReady) {
      const reason = !live ? 'DRY_RUN' : notReady;
      const dir = writePending(p, video, meta, reason);
      state[p] = { ...prev, status: live ? 'pending-manual' : 'dry-run', reason, pendingDir: dir, at: new Date().toISOString() };
      log(`- ${p}: 게시 대기 파일 생성 → ${dir} (${reason})`);
      continue;
    }
    if (prev.attempts >= settings.upload.maxAttempts) { log(`- ${p}: 최대 시도 ${settings.upload.maxAttempts}회 초과 → 수동 확인 필요`); failed++; continue; }
    try {
      log(`- ${p}: 업로드 시작 (시도 ${prev.attempts + 1})`);
      const result = await uploaders[p].upload(video, meta);
      state[p] = { status: 'success', attempts: prev.attempts + 1, at: new Date().toISOString(), result };
    } catch (e) {
      failed++;
      state[p] = { status: 'failed', attempts: prev.attempts + 1, at: new Date().toISOString(), error: mask(e.message).slice(0, 500) };
      log(`- ${p}: ❌ 실패 ${e.message}`);
    }
    writeJson(statePath, state);
  }
  writeJson(statePath, state);
  const hist = readJson(path.join(ROOT, 'data', 'upload-history.json'), {});
  hist[RUN_DATE] = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.status]));
  writeJson(path.join(ROOT, 'data', 'upload-history.json'), hist);
  if (failed) throw new Error(`${failed}개 플랫폼 게시 실패. 다음 실행 때 실패한 곳만 재시도합니다.`);
  log('✅ 게시 단계 완료');
}

if (require.main === module) main('게시', publish);
module.exports = { publish };
