// "오늘의 터진 쇼츠 TOP 5" 영상 디자인 템플릿 (HTML Canvas)
// 매일 데이터만 바뀌고 이 파일은 그대로 재사용됩니다.
// window.setup(data) 후 window.drawFrame(n) 으로 n번째 프레임을 그립니다.
//
// 안전 영역(릴스/쇼츠/틱톡 UI에 가리지 않는 곳): 위 270px, 아래 480px, 좌우 65px, 오른쪽 버튼 열(x>930) 피함
(() => {
  const W = 1080, H = 1920;
  const SAFE = { l: 90, r: 900, t: 290, b: 1440 };
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  let D = null;           // 데이터
  const imgs = {};        // rank -> Image

  // ── 이징 (rules/motion 토큰) ──────────────────────────────
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = t => ((ax * t + bx) * t + cx) * t;
    const sy = t => ((ay * t + by) * t + cy) * t;
    return x => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 30; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-5) break; v < x ? lo = t : hi = t; t = (lo + hi) / 2; }
      return sy(t);
    };
  }
  const easeOut = bezier(0.23, 1, 0.32, 1);
  const easeInOut = bezier(0.77, 0, 0.175, 1);
  // springPop: 한 번 살짝 넘쳤다가 정착 (감쇠 ~0.8)
  const springPop = t => t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.exp(-6 * t) * Math.cos(7.5 * t);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const prog = (f, start, len) => clamp((f - start) / len);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ── 포맷 ─────────────────────────────────────────────────
  function kNum(n) {
    if (n == null) return '-';
    if (n >= 1e8) return trim(n / 1e8) + '억';
    if (n >= 1e4) return trim(n / 1e4) + '만';
    return n.toLocaleString('ko-KR');
  }
  const trim = v => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString();
  const idxStr = v => (v >= 100 ? Math.round(v).toLocaleString('ko-KR') : v.toFixed(1));
  const FONT = (w, s) => `${w} ${s}px Pretendard`;

  // ── 그리기 도우미 ─────────────────────────────────────────
  function text(str, x, y, { size = 48, weight = 700, color = '#fff', align = 'left', alpha = 1, maxW, base = 'alphabetic', track = 0 } = {}) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    let s = size;
    ctx.font = FONT(weight, s);
    if (maxW) { // 먼저 글자를 줄이고(최대 35%), 그래도 넘치면 말줄임
      const min = Math.round(size * 0.65);
      while (ctx.measureText(str).width > maxW && s > min) { s -= 2; ctx.font = FONT(weight, s); }
      if (ctx.measureText(str).width > maxW) { while (str && ctx.measureText(str + '…').width > maxW) str = [...str].slice(0, -1).join(''); str += '…'; }
    }
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
    if (track) ctx.letterSpacing = track + 'px';
    ctx.fillText(str, x, y);
    ctx.restore();
    return s;
  }
  function wrap(str, maxW, maxLines, font) {
    ctx.save(); ctx.font = font;
    const fits = s => ctx.measureText(s).width <= maxW;
    const words = str.split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    const pushWord = w => {
      const tryS = cur ? cur + ' ' + w : w;
      if (fits(tryS)) { cur = tryS; return; }
      if (cur) { lines.push(cur); cur = ''; }
      if (fits(w)) { cur = w; return; }
      for (const ch of [...w]) { if (fits(cur + ch)) cur += ch; else { lines.push(cur); cur = ch; } }
    };
    words.forEach(pushWord);
    if (cur) lines.push(cur);
    let out = lines;
    if (lines.length > maxLines) {
      out = lines.slice(0, maxLines);
      let last = out[maxLines - 1];
      while (last && !fits(last + '…')) last = [...last].slice(0, -1).join('');
      out[maxLines - 1] = last.trimEnd() + '…';
    }
    ctx.restore();
    return out;
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }
  // 이미지 cover 크롭 (쇼츠 썸네일은 16:9 안에 세로 화면이 가운데 있으므로 가운데를 자름)
  function drawCover(img, x, y, w, h) {
    const ir = img.width / img.height, r = w / h;
    let sw = img.width, sh = img.height, sx = 0, sy = 0, oy = 0;
    // hqdefault(4:3)는 위아래 검은 띠가 있는 16:9 화면 → 띠를 빼고 계산
    if (Math.abs(ir - 4 / 3) < 0.01) { oy = img.height / 8; sh = img.height * 0.75; }
    const ir2 = sw / sh;
    if (ir2 > r) { sw = sh * r; sx = (img.width - sw) / 2; sy = oy; } else { sw = img.width; sh = sw / r; sy = oy + (img.height - 2 * oy - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  function thumbCard(item, x, y, w, h, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
    rrect(x, y, w, h, 32); ctx.fillStyle = '#1c1c24'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    const img = imgs[item.rank];
    if (img) drawCover(img, x, y, w, h);
    else { // 썸네일 없음(샘플) → 자리 표시
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#2a2a36'); g.addColorStop(1, '#16161d');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      text('THUMBNAIL', x + w / 2, y + h / 2, { size: 30, weight: 600, color: 'rgba(255,255,255,.35)', align: 'center' });
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= alpha;
    rrect(x, y, w, h, 32); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  // ── 배경 ─────────────────────────────────────────────────
  function background(f, item) {
    ctx.fillStyle = '#0A0A0F'; ctx.fillRect(0, 0, W, H);
    const img = item && imgs[item.rank];
    if (img && D.blurThumbBg) { // 썸네일을 크게 흐리게 깔아 장면마다 색이 달라지게
      ctx.save();
      ctx.filter = 'blur(60px) saturate(1.3)';
      ctx.globalAlpha = 0.45;
      const s = 1.25 + f * 0.0004; // 계속 흐르는 배경: linear
      drawCover(img, W / 2 - (W * s) / 2, H / 2 - (H * s) / 2, W * s, H * s);
      ctx.restore();
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(10,10,15,.55)'); g.addColorStop(0.5, 'rgba(10,10,15,.35)'); g.addColorStop(1, 'rgba(10,10,15,.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 은은한 강조색 빛
    const rg = ctx.createRadialGradient(W * 0.85, H * 0.2, 0, W * 0.85, H * 0.2, 900);
    rg.addColorStop(0, hexA(D.accent, 0.22)); rg.addColorStop(1, hexA(D.accent, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  // ── 장면 1: 오프닝 (0~3초) ────────────────────────────────
  function intro(f, len) {
    background(f, null);
    const out = easeInOut(prog(f, len - 9, 9));          // 퇴장 0.3초
    ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(-160 * out, 0);
    const words = [['오늘의', 84, 700, '#fff'], ['터진 쇼츠', 150, 900, '#fff']];
    let y = 600;
    words.forEach(([w, s, wt, c], i) => {
      const p = easeOut(prog(f, 2 + i * 3, 12));         // 단어 단위 키네틱 타이포
      text(w, SAFE.l, y + (1 - p) * 60 + s, { size: s, weight: wt, color: c, alpha: p });
      y += s + 24;
    });
    // TOP 5 팝인 (오버슈트)
    const p = springPop(prog(f, 10, 22));
    ctx.save();
    ctx.translate(SAFE.l, y + 40); ctx.scale(lerp(0.7, 1, p), lerp(0.7, 1, p));
    ctx.globalAlpha *= clamp(p * 1.5);
    rrect(0, 0, 560, 230, 40); ctx.fillStyle = D.accent; ctx.fill();
    text('TOP 5', 280, 115, { size: 190, weight: 900, color: '#fff', align: 'center', base: 'middle', track: -4 });
    ctx.restore();
    y += 330;
    const dp = easeOut(prog(f, 22, 14));
    text(D.dateLabel, SAFE.l, y + 60 + (1 - dp) * 30, { size: 54, weight: 600, color: 'rgba(255,255,255,.75)', alpha: dp });
    // 밑줄 막대
    const bp = easeOut(prog(f, 26, 18));
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(SAFE.l, y + 110, 520 * bp, 4);
    ctx.restore();
  }

  // ── 장면 2: 순위 소개 (5위 → 1위) ─────────────────────────
  function rankScene(f, len, item, order) {
    background(f, item);
    const out = easeInOut(prog(f, len - 9, 9));
    const inP = easeOut(prog(f, 0, 14));
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.translate(-180 * out, 0);

    // 상단 머리말 + 진행 점
    text(`오늘의 터진 쇼츠 TOP ${D.items.length}`, SAFE.l, SAFE.t + 30, { size: 36, weight: 700, color: 'rgba(255,255,255,.7)' });
    D.items.forEach((_, i) => {
      const active = i === order;
      ctx.fillStyle = active ? D.accent : 'rgba(255,255,255,.25)';
      rrect(SAFE.r - (D.items.length - i) * 46 + 10, SAFE.t + 8, active ? 36 : 14, 14, 7); ctx.fill();
    });

    // 썸네일 카드 (오른쪽에서 밀려 들어옴)
    const tx = SAFE.l + (1 - inP) * 140, ty = 370, tw = 380, th = 676;
    thumbCard(item, tx, ty, tw, th, inP);
    text('출처: YouTube', tx + 20, ty + th - 22, { size: 24, weight: 600, color: 'rgba(255,255,255,.85)', alpha: inP });

    // 순위 숫자 팝인
    const cx = 520;
    const rp = springPop(prog(f, 4, 20));
    ctx.save();
    ctx.translate(cx, 640); ctx.scale(lerp(0.6, 1, rp), lerp(0.6, 1, rp)); ctx.globalAlpha *= clamp(rp * 1.4);
    ctx.font = FONT(900, 300);
    const rw = ctx.measureText(String(item.rank)).width;
    text(String(item.rank), 0, 0, { size: 300, weight: 900, color: item.rank === 1 ? D.accent : '#fff', track: -8 });
    text('위', rw + 6, -12, { size: 96, weight: 800, color: '#fff' });
    ctx.restore();

    // 인기 지수 (가장 크게, 강조색, 카운트업)
    const ip = easeOut(prog(f, 12, 30));
    const lp = easeOut(prog(f, 10, 12));
    text('인기 지수', cx, 760 + (1 - lp) * 20, { size: 38, weight: 700, color: 'rgba(255,255,255,.7)', alpha: lp });
    const val = item.popularityIndex * ip;
    text(idxStr(val), cx, 900 + (1 - lp) * 20, { size: 140, weight: 900, color: D.accent, alpha: lp, maxW: SAFE.r - cx, track: -4 });
    text('조회수 ÷ 구독자', cx, 960, { size: 28, weight: 500, color: 'rgba(255,255,255,.5)', alpha: lp });

    // 아래: 채널명, 제목, 수치
    const cp = easeOut(prog(f, 14, 14));
    text(item.channelTitle, SAFE.l, 1120 + (1 - cp) * 30, { size: 46, weight: 700, color: 'rgba(255,255,255,.8)', alpha: cp, maxW: SAFE.r - SAFE.l });
    const tf = FONT(800, 64);
    wrap(item.displayTitle, SAFE.r - SAFE.l, 2, tf).forEach((line, i) => {
      const p = easeOut(prog(f, 17 + i * 3, 14));
      text(line, SAFE.l, 1205 + i * 80 + (1 - p) * 30, { size: 64, weight: 800, alpha: p });
    });
    const sp = easeOut(prog(f, 24, 14));
    ctx.save(); ctx.globalAlpha *= sp;
    rrect(SAFE.l, 1320, SAFE.r - SAFE.l, 110, 24); ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.fill();
    ctx.restore();
    const half = (SAFE.r - SAFE.l) / 2;
    [['조회수', kNum(Math.round(item.views * easeOut(prog(f, 24, 24))))], ['구독자', kNum(item.subscribers)]].forEach(([k, v], i) => {
      const x = SAFE.l + 36 + i * half;
      text(k, x, 1388 + (1 - sp) * 20, { size: 32, weight: 600, color: 'rgba(255,255,255,.6)', alpha: sp });
      text(v, x + 112, 1392 + (1 - sp) * 20, { size: 52, weight: 800, alpha: sp });
    });
    ctx.restore();
  }

  // ── 장면 3: 마무리 (27~30초) ──────────────────────────────
  function outro(f, len) {
    const first = D.items[0];
    background(f, first);
    const p1 = easeOut(prog(f, 0, 14));
    text('오늘 가장', SAFE.l, 400 + (1 - p1) * 40, { size: 84, weight: 700, alpha: p1 });
    const p2 = easeOut(prog(f, 3, 14));
    ctx.save(); ctx.globalAlpha = p2;
    ctx.font = FONT(900, 120);
    text('터진 쇼츠는?', SAFE.l, 540 + (1 - p2) * 40, { size: 120, weight: 900, color: D.accent, track: -3 });
    ctx.restore();

    const cp = springPop(prog(f, 12, 22));
    const tw = 300, th = 533, tx = SAFE.l, ty = 620;
    ctx.save();
    ctx.translate(tx + tw / 2, ty + th / 2); ctx.scale(lerp(0.85, 1, cp), lerp(0.85, 1, cp)); ctx.translate(-(tx + tw / 2), -(ty + th / 2));
    thumbCard(first, tx, ty, tw, th, clamp(cp * 1.4));
    ctx.restore();
    const ip = easeOut(prog(f, 18, 14));
    const rx = tx + tw + 44;
    text('1위', rx, ty + 80 + (1 - ip) * 20, { size: 64, weight: 900, color: D.accent, alpha: ip });
    text(first.channelTitle, rx, ty + 160, { size: 44, weight: 800, alpha: ip, maxW: SAFE.r - rx });
    wrap(first.displayTitle, SAFE.r - rx, 3, FONT(600, 36)).forEach((l, i) =>
      text(l, rx, ty + 230 + i * 50, { size: 36, weight: 600, color: 'rgba(255,255,255,.75)', alpha: ip }));
    text(`인기 지수 ${idxStr(first.popularityIndex)}`, rx, ty + 450, { size: 44, weight: 800, color: D.accent, alpha: ip, maxW: SAFE.r - rx });

    const ap = easeOut(prog(f, 28, 14));
    text('저장해두고 내일도 확인하세요', SAFE.l, 1290 + (1 - ap) * 20, { size: 50, weight: 800, alpha: ap });
    text(`${D.accountName}  ·  출처: YouTube 각 채널`, SAFE.l, 1360, { size: 32, weight: 600, color: 'rgba(255,255,255,.6)', alpha: ap, maxW: SAFE.r - SAFE.l });
  }

  // ── 타임라인 ──────────────────────────────────────────────
  function timeline() {
    const fps = D.fps, total = D.totalFrames;
    const introLen = 3 * fps, outroLen = 3 * fps;
    const n = D.items.length, mid = total - introLen - outroLen;
    const seg = Math.floor(mid / n);
    const scenes = [{ type: 'intro', start: 0, len: introLen }];
    // 5위부터 1위까지 (ranking은 1위가 앞이므로 뒤집음)
    const order = [...D.items].sort((a, b) => b.rank - a.rank);
    order.forEach((item, i) => scenes.push({ type: 'rank', item, order: D.items.length - item.rank, start: introLen + i * seg, len: i === n - 1 ? mid - seg * (n - 1) : seg }));
    scenes.push({ type: 'outro', start: total - outroLen, len: outroLen });
    return scenes;
  }

  let scenes = [];
  window.setup = async (data) => {
    D = data;
    const fontBase = data.fontBase;
    for (const [w, file] of [[500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'], [900, 'Black']]) {
      const ff = new FontFace('Pretendard', `url(${fontBase}/Pretendard-${file}.woff2)`, { weight: String(w) });
      document.fonts.add(await ff.load());
    }
    await Promise.all(D.items.map(it => new Promise(res => {
      if (!it.thumb) return res();
      const im = new Image(); im.onload = () => { imgs[it.rank] = im; res(); }; im.onerror = () => res(); im.src = it.thumb;
    })));
    scenes = timeline();
    return scenes.map(s => ({ type: s.type, start: s.start, len: s.len, rank: s.item?.rank }));
  };
  window.drawFrame = (frame) => {
    const s = scenes.find(sc => frame >= sc.start && frame < sc.start + sc.len) || scenes[scenes.length - 1];
    const f = frame - s.start;
    ctx.save();
    if (s.type === 'intro') intro(f, s.len);
    else if (s.type === 'rank') rankScene(f, s.len, s.item, s.order);
    else outro(f, s.len);
    ctx.restore();
    if (D.isSample) text('SAMPLE · 테스트용 가짜 데이터', W / 2, 220, { size: 30, weight: 700, color: '#FFD400', align: 'center' });
  };
  // 여러 프레임을 한 번에 JPEG로 (Playwright 왕복 횟수 줄이기)
  window.renderBatch = (from, count, quality = 0.95) => {
    const out = [];
    for (let i = 0; i < count; i++) { window.drawFrame(from + i); out.push(cv.toDataURL('image/jpeg', quality).split(',')[1]); }
    return out;
  };
})();
