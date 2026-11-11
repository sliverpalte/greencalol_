// 설치·설정 점검: npm run doctor
const { execSync } = require('child_process');
const { env } = require('./lib/common');
const ok = (b, m) => console.log(`${b ? '✅' : '⚠️ '} ${m}`);
const has = c => { try { execSync(c, { stdio: 'ignore' }); return true; } catch { return false; } };
ok(+process.versions.node.split('.')[0] >= 20, `Node.js ${process.version} (20 이상 필요)`);
ok(has('ffmpeg -version'), 'FFmpeg 설치');
try { require('playwright'); ok(true, 'Playwright 설치'); } catch { ok(false, 'Playwright 없음 → npm install'); }
console.log(`\n모드: DRY_RUN=${env.DRY_RUN} UPLOAD_ENABLED=${env.UPLOAD_ENABLED} TEST_MODE=${env.TEST_MODE}`);
for (const k of ['YOUTUBE_API_KEY', 'YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN', 'IG_USER_ID', 'IG_ACCESS_TOKEN', 'TIKTOK_REFRESH_TOKEN', 'ANTHROPIC_API_KEY'])
  ok(!!process.env[k], `${k} ${process.env[k] ? '설정됨' : '없음'}`); // 값은 출력하지 않음
