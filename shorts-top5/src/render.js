// 4~5단계: ranking.json → Canvas(Playwright) → FFmpeg → output/<날짜>/top5.mp4
// 900장을 파일로 저장하지 않고, 브라우저에서 JPEG로 뽑아 FFmpeg 표준입력으로 바로 흘려보냅니다(스트리밍).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { settings, RUN_DATE, dataDir, outDir, setLogFile, log, readJson, writeJson, fetchRetry, main, ROOT } = require('./lib/common');

const V = settings.video;

async function thumbDataUrl(url, quiet = false) {
  if (!url) return null;
  try {
    const res = await fetchRetry(url, {}, { tries: quiet ? 1 : 3, label: 'thumbnail' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
  } catch (e) { log(`  썸네일 실패(자리표시로 대체): ${e.message}`); return null; }
}

function musicInput() {
  const m = V.music;
  const file = path.join(ROOT, m.file), lic = path.join(ROOT, m.licenseFile);
  if (fs.existsSync(file) && fs.existsSync(lic)) return file;
  if (fs.existsSync(file)) log('⚠️ 배경음악 파일은 있지만 라이선스 파일(LICENSE.txt)이 없어 무음으로 만듭니다.');
  else log('배경음악 없음 → 무음 트랙으로 제작 (assets/music/README.md 참고)');
  return null;
}

async function render({ stills = [] } = {}) {
  setLogFile('render.log');
  const ranking = readJson(path.join(dataDir(), 'ranking.json'));
  if (!ranking) throw new Error('ranking.json이 없습니다. 먼저 npm run rank 를 실행하세요.');
  const od = outDir(); fs.mkdirSync(od, { recursive: true });
  const t0 = Date.now();

  const items = [];
  // 쇼츠 세로 원본 썸네일(1080×1920, oar2)을 먼저 시도 → 없으면 API 썸네일(1280×720)
  for (const t of ranking.top) {
    const vertical = t.videoId && !t.videoId.startsWith('SAMPLE') ? await thumbDataUrl(`https://i.ytimg.com/vi/${t.videoId}/oar2.jpg`, true) : null;
    items.push({ ...t, thumb: vertical || await thumbDataUrl(t.thumbnail) });
  }
  const [y, mo, d] = RUN_DATE.split('-');
  const dowN = new Date(`${RUN_DATE}T12:00:00+09:00`).getDay();
  const en = V.locale === 'en';
  const dateLabel = en
    ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dowN]}, ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+mo - 1]} ${+d}, ${y}`
    : `${y}. ${+mo}. ${+d}. (${'일월화수목금토'[dowN]})`;
  const data = {
    items, fps: V.fps, totalFrames: V.fps * V.durationSec, accent: V.accentColor, accountName: V.accountName, blurThumbBg: V.blurThumbnailBackground !== false,
    dateLabel, labels: V.labels, locale: V.locale || 'ko', isSample: ranking.isSample,
    fontBase: 'file://' + path.join(ROOT, 'node_modules', 'pretendard', 'dist', 'web', 'static', 'woff2'),
  };

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: V.width, height: V.height } });
    page.on('pageerror', e => log('  [page error]', e.message));
    await page.goto('file://' + path.join(ROOT, 'template', 'index.html'));
    const scenes = await page.evaluate(d => window.setup(d), data);
    log('장면 구성:', scenes.map(s => `${s.type}${s.rank ? s.rank : ''}@${(s.start / V.fps).toFixed(1)}s`).join(' '));

    // 확인용 정지 화면 PNG
    for (const sec of stills) {
      await page.evaluate(f => window.drawFrame(f), Math.round(sec * V.fps));
      const p = path.join(od, `still-${String(sec).replace('.', '_')}s.png`);
      await page.locator('#c').screenshot({ path: p });
    }

    const out = path.join(od, 'top5.mp4');
    const music = musicInput();
    const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(V.fps), '-i', 'pipe:0'];
    if (music) args.push('-stream_loop', '-1', '-i', music);
    else args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    const fadeStart = V.durationSec - 1.5;
    args.push('-filter_complex', `[1:a]volume=${music ? V.music.volume : 1},afade=t=in:d=0.5,afade=t=out:st=${fadeStart}:d=1.5,atrim=0:${V.durationSec}[a]`,
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', String(V.crf), '-maxrate', '20M', '-bufsize', '40M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
      '-r', String(V.fps), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(V.durationSec), '-movflags', '+faststart', out);

    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'pipe'] });
    let ffErr = '';
    ff.stderr.on('data', b => { ffErr += b; });
    const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg 실패: ' + ffErr.slice(-800))))));

    const total = data.totalFrames, batch = 15;
    for (let f = 0; f < total; f += batch) {
      const frames = await page.evaluate(([a, b]) => window.renderBatch(a, b, 0.98), [f, Math.min(batch, total - f)]);
      for (const b64 of frames) {
        if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
      }
      if (f % 150 === 0) log(`  프레임 ${f}/${total}`);
    }
    ff.stdin.end();
    await done;

    const sizeMb = (fs.statSync(out).size / 1048576).toFixed(1);
    const info = { date: RUN_DATE, file: path.relative(ROOT, out), sizeMb: +sizeMb, frames: total, music: music ? path.relative(ROOT, music) : null,
      seconds: Math.round((Date.now() - t0) / 1000), isSample: ranking.isSample };
    writeJson(path.join(dataDir(), 'render.json'), info);
    log(`✅ 영상 완성 ${info.file} (${sizeMb}MB, ${info.seconds}초 소요)`);
  } finally { await browser.close(); }
}

if (require.main === module) {
  const stills = process.argv.includes('--stills') ? [1.5, 5, 9, 14, 19, 24, 28.5] : [];
  main('영상 제작', () => render({ stills }));
}
module.exports = { render };
